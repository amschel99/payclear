import { FastifyInstance } from "fastify";
import { createInstitutionSchema, updateInstitutionSchema } from "../schemas/institution.schema.js";
import * as institutionService from "../services/institution.service.js";

export async function institutionRoutes(app: FastifyInstance) {
  // Create institution (registry admin only)
  app.post("/v1/institutions", async (request, reply) => {
    const body = createInstitutionSchema.parse(request.body);

    const { institution, apiKey } = await institutionService.createInstitution(
      body,
      "registry-admin" // In production, derive from auth context
    );

    return reply.status(201).send({
      institution: {
        id: institution.id,
        name: institution.name,
        vaspCode: institution.vaspCode,
        jurisdiction: institution.jurisdiction,
        createdAt: institution.createdAt,
      },
      // Only returned once at creation
      apiKey,
    });
  });

  // Get institution
  app.get<{ Params: { id: string } }>("/v1/institutions/:id", async (request, reply) => {
    const institution = await institutionService.getInstitution(request.params.id);
    if (!institution) {
      return reply.status(404).send({ error: "Institution not found" });
    }
    return {
      id: institution.id,
      name: institution.name,
      vaspCode: institution.vaspCode,
      jurisdiction: institution.jurisdiction,
      active: institution.active,
      createdAt: institution.createdAt,
    };
  });

  // Update institution
  app.patch<{ Params: { id: string } }>("/v1/institutions/:id", async (request, reply) => {
    const body = updateInstitutionSchema.parse(request.body);
    const updated = await institutionService.updateInstitution(request.params.id, body);
    if (!updated) {
      return reply.status(404).send({ error: "Institution not found" });
    }
    return updated;
  });
}
