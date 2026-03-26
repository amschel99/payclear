import { FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config.js";

export async function adminAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (!config.admin.apiKey) {
    return reply
      .status(503)
      .send({ error: "Admin API not configured" });
  }

  const adminKey = request.headers["x-admin-key"] as string | undefined;

  if (!adminKey) {
    return reply
      .status(401)
      .send({ error: "Missing X-Admin-Key header" });
  }

  if (adminKey !== config.admin.apiKey) {
    return reply.status(401).send({ error: "Invalid admin key" });
  }
}
