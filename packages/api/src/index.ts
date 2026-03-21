import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { config } from "./config.js";
import { institutionRoutes } from "./routes/institutions.js";
import { entityRoutes } from "./routes/entities.js";
import { policyRoutes } from "./routes/policies.js";
import { transferRoutes } from "./routes/transfers.js";
import { auditRoutes } from "./routes/audit.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { trustRoutes } from "./routes/trust.js";
import { sumsubWebhookRoutes } from "./routes/sumsub-webhook.js";
import { chainalysisRoutes } from "./routes/chainalysis.js";
import { complianceRoutes } from "./routes/compliance.js";

const app = Fastify({ logger: true });

async function start() {
  // Plugins
  await app.register(cors, { origin: true });
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "PayClear API",
        description:
          "Native Compliance Layer for Institutional Stablecoin Payments on Solana",
        version: "0.1.0",
      },
      servers: [
        { url: `http://localhost:${config.port}`, description: "Local" },
      ],
      components: {
        securitySchemes: {
          apiKey: {
            type: "apiKey",
            name: "X-API-Key",
            in: "header",
          },
        },
      },
    },
  });
  await app.register(swaggerUi, {
    routePrefix: "/docs",
  });

  // Routes — compliance endpoints first (public /api/* routes)
  await app.register(complianceRoutes);
  await app.register(institutionRoutes);
  await app.register(entityRoutes);
  await app.register(policyRoutes);
  await app.register(transferRoutes);
  await app.register(auditRoutes);
  await app.register(webhookRoutes);
  await app.register(trustRoutes);
  await app.register(sumsubWebhookRoutes);
  await app.register(chainalysisRoutes);

  // Health check
  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  // Start
  await app.listen({ port: config.port, host: config.host });
  console.log(`PayClear API running on http://${config.host}:${config.port}`);
  console.log(`Swagger docs at http://${config.host}:${config.port}/docs`);
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

export { app };
