import { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { db } from "../db/client.js";
import { webhooks } from "../db/schema.js";
import { logAuditEvent } from "../services/audit.service.js";

const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
});

export async function webhookRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authMiddleware);

  // Register webhook
  app.post("/v1/webhooks", async (request, reply) => {
    const body = createWebhookSchema.parse(request.body);
    const inst = request.institution!;

    const secret = randomBytes(32).toString("hex");

    const [webhook] = await db
      .insert(webhooks)
      .values({
        institutionId: inst.id,
        url: body.url,
        events: body.events,
        secret,
      })
      .returning();

    await logAuditEvent({
      institutionId: inst.id,
      eventType: "webhook.created",
      entityType: "webhook",
      entityId: webhook.id,
      actor: inst.authorityPubkey,
      details: { url: body.url, events: body.events },
    });

    return reply.status(201).send({
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      secret, // Only returned once at creation
      createdAt: webhook.createdAt,
    });
  });

  // List webhooks
  app.get("/v1/webhooks", async (request) => {
    const inst = request.institution!;
    return db
      .select({
        id: webhooks.id,
        url: webhooks.url,
        events: webhooks.events,
        active: webhooks.active,
        createdAt: webhooks.createdAt,
      })
      .from(webhooks)
      .where(eq(webhooks.institutionId, inst.id));
  });

  // Delete webhook
  app.delete<{ Params: { id: string } }>("/v1/webhooks/:id", async (request, reply) => {
    const inst = request.institution!;

    const deleted = await db
      .delete(webhooks)
      .where(
        and(eq(webhooks.id, request.params.id), eq(webhooks.institutionId, inst.id))
      )
      .returning();

    if (deleted.length === 0) {
      return reply.status(404).send({ error: "Webhook not found" });
    }

    await logAuditEvent({
      institutionId: inst.id,
      eventType: "webhook.deleted",
      entityType: "webhook",
      entityId: request.params.id,
      actor: inst.authorityPubkey,
    });

    return { message: "Webhook deleted" };
  });
}
