import { eq } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "../db/client.js";
import { institutions } from "../db/schema.js";
import { logAuditEvent } from "./audit.service.js";
import { keyManager } from "../utils/key-manager.js";
import type { CreateInstitutionInput } from "../schemas/institution.schema.js";

export async function createInstitution(
  input: CreateInstitutionInput,
  registryAuthority: string
) {
  // Generate institution ID (SHA-256 of name)
  const institutionId = createHash("sha256")
    .update(input.name)
    .digest("hex");

  // Generate API key
  const apiKey = `pclr_${randomBytes(32).toString("hex")}`;
  const apiKeyHash = await bcrypt.hash(apiKey, 12);

  // Placeholder for on-chain pubkey — will be set after on-chain registration
  const onchainPubkey = "pending";

  const [institution] = await db
    .insert(institutions)
    .values({
      institutionId,
      name: input.name,
      vaspCode: input.vaspCode,
      jurisdiction: input.jurisdiction,
      onchainPubkey,
      authorityPubkey: input.authorityPubkey,
      apiKeyHash,
    })
    .returning();

  // Generate and store a wrapped Data Encryption Key for this institution
  await keyManager.createInstitutionKey(institution.id);

  await logAuditEvent({
    institutionId: institution.id,
    eventType: "institution.created",
    entityType: "institution",
    entityId: institution.id,
    actor: registryAuthority,
    details: { name: input.name, jurisdiction: input.jurisdiction },
  });

  return { institution, apiKey };
}

export async function getInstitution(id: string) {
  const [institution] = await db
    .select()
    .from(institutions)
    .where(eq(institutions.id, id));
  return institution ?? null;
}

export async function updateInstitution(
  id: string,
  updates: { name?: string; active?: boolean }
) {
  const [updated] = await db
    .update(institutions)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(institutions.id, id))
    .returning();
  return updated ?? null;
}
