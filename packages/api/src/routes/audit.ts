import { FastifyInstance } from "fastify";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.js";
import { db } from "../db/client.js";
import { auditLog } from "../db/schema.js";

export async function auditRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authMiddleware);

  // List audit events
  app.get<{
    Querystring: {
      eventType?: string;
      from?: string;
      to?: string;
      limit?: string;
      offset?: string;
    };
  }>("/v1/audit/transfers", async (request) => {
    const inst = request.institution!;
    const limit = parseInt(request.query.limit || "50", 10);
    const offset = parseInt(request.query.offset || "0", 10);

    const conditions = [eq(auditLog.institutionId, inst.id)];

    if (request.query.eventType) {
      conditions.push(eq(auditLog.eventType, request.query.eventType));
    }
    if (request.query.from) {
      conditions.push(gte(auditLog.createdAt, new Date(request.query.from)));
    }
    if (request.query.to) {
      conditions.push(lte(auditLog.createdAt, new Date(request.query.to)));
    }

    return db
      .select()
      .from(auditLog)
      .where(and(...conditions))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
      .offset(offset);
  });

  // Audit attestation changes
  app.get<{
    Querystring: { limit?: string; offset?: string };
  }>("/v1/audit/attestations", async (request) => {
    const inst = request.institution!;
    const limit = parseInt(request.query.limit || "50", 10);
    const offset = parseInt(request.query.offset || "0", 10);

    return db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.institutionId, inst.id),
          eq(auditLog.entityType, "entity")
        )
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
      .offset(offset);
  });
}
