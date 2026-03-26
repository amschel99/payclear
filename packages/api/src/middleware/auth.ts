import { FastifyRequest, FastifyReply } from "fastify";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../db/client.js";
import { institutions } from "../db/schema.js";

declare module "fastify" {
  interface FastifyRequest {
    institution?: {
      id: string;
      institutionId: string;
      name: string;
      onchainPubkey: string;
      authorityPubkey: string;
    };
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const apiKey = request.headers["x-api-key"] as string | undefined;

  if (!apiKey) {
    return reply.status(401).send({ error: "Missing X-API-Key header" });
  }

  // Use key prefix for O(1) lookup instead of scanning all institutions
  const prefix = apiKey.substring(0, 12);

  const [inst] = await db
    .select()
    .from(institutions)
    .where(
      and(
        eq(institutions.apiKeyPrefix, prefix),
        eq(institutions.active, true)
      )
    );

  if (inst && (await bcrypt.compare(apiKey, inst.apiKeyHash))) {
    request.institution = {
      id: inst.id,
      institutionId: inst.institutionId,
      name: inst.name,
      onchainPubkey: inst.onchainPubkey,
      authorityPubkey: inst.authorityPubkey,
    };
    return;
  }

  return reply.status(401).send({ error: "Invalid API key" });
}
