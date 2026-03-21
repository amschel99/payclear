/**
 * Canonical KYC Field Schema for Merkle-based Selective Disclosure.
 *
 * Fields are divided into two categories:
 *   - **Public**: low-sensitivity metadata that counterparties typically need
 *     for compliance checks (level, jurisdiction, entity type, attesting institution).
 *   - **Private**: personally identifiable information (PII) that should only be
 *     disclosed when legally or contractually required.
 *
 * The field names defined here are the canonical keys used in the Merkle tree.
 * Leaf ordering is always lexicographic by field name, ensuring deterministic
 * tree construction regardless of the order in which fields are supplied.
 *
 * @module kyc-fields
 */

// ─── Field Categories ────────────────────────────────────────────

export const KYC_FIELD_CATEGORY = {
  PUBLIC: "public",
  PRIVATE: "private",
} as const;

export type KycFieldCategory =
  (typeof KYC_FIELD_CATEGORY)[keyof typeof KYC_FIELD_CATEGORY];

// ─── Canonical Field Definitions ─────────────────────────────────

export interface KycFieldDefinition {
  /** Canonical field name (used as the key in the Merkle leaf). */
  name: string;
  /** Human-readable description for documentation and audit trails. */
  description: string;
  /** Whether this field is public or private. */
  category: KycFieldCategory;
}

/**
 * The ordered, canonical set of KYC fields.
 *
 * This array is the single source of truth for which fields may appear in a
 * KYC Merkle tree. Adding a new field here is sufficient to make it available
 * throughout the SDK.
 */
export const KYC_FIELD_DEFINITIONS: readonly KycFieldDefinition[] = [
  // Public fields
  {
    name: "attestingInstitution",
    description: "Identifier of the institution that performed KYC verification",
    category: KYC_FIELD_CATEGORY.PUBLIC,
  },
  {
    name: "entityType",
    description: "Type of entity (individual, corporate, trust, etc.)",
    category: KYC_FIELD_CATEGORY.PUBLIC,
  },
  {
    name: "jurisdiction",
    description: "ISO 3166-1 alpha-2 country code of the entity's jurisdiction",
    category: KYC_FIELD_CATEGORY.PUBLIC,
  },
  {
    name: "kycLevel",
    description: "KYC verification tier (0=none, 1=basic, 2=enhanced, 3=institutional)",
    category: KYC_FIELD_CATEGORY.PUBLIC,
  },

  // Private fields
  {
    name: "addressCity",
    description: "City of the entity's registered or residential address",
    category: KYC_FIELD_CATEGORY.PRIVATE,
  },
  {
    name: "addressCountry",
    description: "ISO 3166-1 alpha-2 country code of the entity's address",
    category: KYC_FIELD_CATEGORY.PRIVATE,
  },
  {
    name: "addressLine1",
    description: "Street address line 1",
    category: KYC_FIELD_CATEGORY.PRIVATE,
  },
  {
    name: "dateOfBirth",
    description: "Date of birth (ISO 8601 date string)",
    category: KYC_FIELD_CATEGORY.PRIVATE,
  },
  {
    name: "fullName",
    description: "Full legal name of the entity or individual",
    category: KYC_FIELD_CATEGORY.PRIVATE,
  },
  {
    name: "governmentIdHash",
    description: "SHA-256 hash of the government-issued ID document number",
    category: KYC_FIELD_CATEGORY.PRIVATE,
  },
  {
    name: "governmentIdType",
    description: "Type of government-issued ID (passport, national_id, drivers_license, etc.)",
    category: KYC_FIELD_CATEGORY.PRIVATE,
  },
  {
    name: "nationality",
    description: "ISO 3166-1 alpha-2 country code of the entity's nationality",
    category: KYC_FIELD_CATEGORY.PRIVATE,
  },
] as const;

// ─── Derived Lookups ─────────────────────────────────────────────

/** Set of all valid KYC field names. */
export const VALID_KYC_FIELD_NAMES: ReadonlySet<string> = new Set(
  KYC_FIELD_DEFINITIONS.map((f) => f.name)
);

/** Sorted array of all valid KYC field names (the canonical leaf order). */
export const SORTED_KYC_FIELD_NAMES: readonly string[] = [
  ...VALID_KYC_FIELD_NAMES,
].sort();

/** Map from field name to its category. */
export const FIELD_CATEGORY_MAP: ReadonlyMap<string, KycFieldCategory> = new Map(
  KYC_FIELD_DEFINITIONS.map((f) => [f.name, f.category])
);

/** Public field names. */
export const PUBLIC_FIELD_NAMES: readonly string[] = KYC_FIELD_DEFINITIONS.filter(
  (f) => f.category === KYC_FIELD_CATEGORY.PUBLIC
).map((f) => f.name);

/** Private field names. */
export const PRIVATE_FIELD_NAMES: readonly string[] = KYC_FIELD_DEFINITIONS.filter(
  (f) => f.category === KYC_FIELD_CATEGORY.PRIVATE
).map((f) => f.name);

/**
 * Validate that a set of field names are all recognized KYC fields.
 * Throws if any field name is not in the canonical schema.
 */
export function validateFieldNames(fieldNames: string[]): void {
  for (const name of fieldNames) {
    if (!VALID_KYC_FIELD_NAMES.has(name)) {
      throw new Error(
        `Unknown KYC field "${name}". Valid fields: ${[...VALID_KYC_FIELD_NAMES].join(", ")}`
      );
    }
  }
}
