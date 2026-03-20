import { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.js";
import { createPolicySchema, updatePolicySchema } from "../schemas/policy.schema.js";
import * as policyService from "../services/policy.service.js";

export async function policyRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authMiddleware);

  // Create policy
  app.post("/v1/policies", async (request, reply) => {
    const body = createPolicySchema.parse(request.body);
    const inst = request.institution!;

    const policy = await policyService.createPolicy(
      inst.id,
      body,
      inst.authorityPubkey
    );

    return reply.status(201).send(policy);
  });

  // Get policy
  app.get<{ Params: { id: string } }>("/v1/policies/:id", async (request, reply) => {
    const policy = await policyService.getPolicy(request.params.id);
    if (!policy) {
      return reply.status(404).send({ error: "Policy not found" });
    }
    return policy;
  });

  // List policies for institution
  app.get("/v1/policies", async (request) => {
    const inst = request.institution!;
    return policyService.listPolicies(inst.id);
  });

  // Update policy
  app.patch<{ Params: { id: string } }>("/v1/policies/:id", async (request, reply) => {
    const body = updatePolicySchema.parse(request.body);
    const inst = request.institution!;

    const updated = await policyService.updatePolicy(
      request.params.id,
      body,
      inst.id,
      inst.authorityPubkey
    );

    if (!updated) {
      return reply.status(404).send({ error: "Policy not found" });
    }
    return updated;
  });
}
