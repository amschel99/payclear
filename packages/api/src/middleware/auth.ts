import { FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
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

  // Look up all active institutions and verify against hashed keys
  // In production, use a key prefix lookup for efficiency
  const allInstitutions = await db
    .select()
    .from(institutions)
    .where(eq(institutions.active, true));

  for (const inst of allInstitutions) {
    const valid = await bcrypt.compare(apiKey, inst.apiKeyHash);
    if (valid) {
      request.institution = {
        id: inst.id,
        institutionId: inst.institutionId,
        name: inst.name,
        onchainPubkey: inst.onchainPubkey,
        authorityPubkey: inst.authorityPubkey,
      };
      return;
    }
  }

  return reply.status(401).send({ error: "Invalid API key" });
}
