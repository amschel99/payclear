import { Queue, Worker, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import { createHmac } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { webhooks, webhookDeliveries } from "../db/schema.js";
import { config } from "../config.js";

const QUEUE_NAME = "webhook-delivery";

const connection = new IORedis(config.redis.url, {
  maxRetriesPerRequest: null, // required by BullMQ
}) as unknown as ConnectionOptions;

const webhookQueue = new Queue(QUEUE_NAME, { connection });

interface WebhookJobData {
  webhookId: string;
  webhookUrl: string;
  webhookSecret: string;
  eventType: string;
  payload: object;
}

/**
 * Dispatch a webhook event to all active webhooks for the given institution
 * that are subscribed to the given event type.
 */
export async function dispatchWebhookEvent(
  institutionId: string,
  eventType: string,
  payload: object
) {
  // Find all active webhooks for this institution
  const matchingWebhooks = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.institutionId, institutionId), eq(webhooks.active, true)));

  // Filter to those subscribed to this event type (or wildcard "*")
  const subscribedWebhooks = matchingWebhooks.filter(
    (wh) => wh.events.includes(eventType) || wh.events.includes("*")
  );

  for (const wh of subscribedWebhooks) {
    await webhookQueue.add(
      eventType,
      {
        webhookId: wh.id,
        webhookUrl: wh.url,
        webhookSecret: wh.secret,
        eventType,
        payload,
      } satisfies WebhookJobData,
      {
        attempts: config.webhook.maxRetries,
        backoff: {
          type: "exponential",
          delay: 1000, // 1s initial delay, doubles each retry
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      }
    );
  }
}

/**
 * Initialize the BullMQ worker that processes webhook delivery jobs.
 * Call this once at application startup.
 */
export function initWebhookWorker(): Worker {
  const worker = new Worker<WebhookJobData>(
    QUEUE_NAME,
    async (job) => {
      const { webhookId, webhookUrl, webhookSecret, eventType, payload } = job.data;

      const timestamp = Date.now().toString();
      const body = JSON.stringify(payload);

      // HMAC-SHA256 signature: "ts=<timestamp>,v1=<hex_signature>"
      const signature = createHmac("sha256", webhookSecret)
        .update(`${timestamp}.${body}`)
        .digest("hex");

      const signatureHeader = `ts=${timestamp},v1=${signature}`;

      // Create delivery record
      const [delivery] = await db
        .insert(webhookDeliveries)
        .values({
          webhookId,
          eventType,
          payload,
          status: 1, // 1 = pending/in-progress
          attempts: job.attemptsMade + 1,
          lastAttemptAt: new Date(),
        })
        .returning({ id: webhookDeliveries.id });

      let responseCode: number | undefined;

      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-PayClear-Signature": signatureHeader,
            "X-PayClear-Event": eventType,
            "X-PayClear-Delivery": delivery.id.toString(),
          },
          body,
          signal: AbortSignal.timeout(10_000), // 10s timeout
        });

        responseCode = response.status;

        if (response.ok) {
          // Mark as delivered (status 2 = success)
          await db
            .update(webhookDeliveries)
            .set({
              status: 2,
              responseCode,
              attempts: job.attemptsMade + 1,
              lastAttemptAt: new Date(),
            })
            .where(eq(webhookDeliveries.id, delivery.id));
          return;
        }

        // Non-2xx response — update record and throw to trigger retry
        await db
          .update(webhookDeliveries)
          .set({
            status: 3, // 3 = failed
            responseCode,
            attempts: job.attemptsMade + 1,
            lastAttemptAt: new Date(),
          })
          .where(eq(webhookDeliveries.id, delivery.id));

        throw new Error(`Webhook delivery failed with status ${response.status}`);
      } catch (err) {
        // Update delivery record on network/timeout error
        await db
          .update(webhookDeliveries)
          .set({
            status: 3,
            responseCode: responseCode ?? null,
            attempts: job.attemptsMade + 1,
            lastAttemptAt: new Date(),
          })
          .where(eq(webhookDeliveries.id, delivery.id));

        throw err; // re-throw so BullMQ retries
      }
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on("failed", (job, err) => {
    console.error(
      `Webhook delivery failed for job ${job?.id} (attempt ${job?.attemptsMade}/${config.webhook.maxRetries}):`,
      err.message
    );
  });

  worker.on("completed", (job) => {
    console.log(`Webhook delivered: ${job.name} (job ${job.id})`);
  });

  console.log("Webhook delivery worker started");

  return worker;
}
