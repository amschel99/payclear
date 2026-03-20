/**
 * Field-level encryption for PII data using AES-256-GCM.
 *
 * Design principles:
 * - Envelope encryption: MEK wraps per-institution DEKs, DEKs encrypt fields
 * - Each encrypt call uses a unique random IV (12 bytes, NIST recommendation for GCM)
 * - AAD (Additional Authenticated Data) binds ciphertext to field name, preventing field-swapping
 * - Auth tag is verified before any plaintext is returned
 * - No key material or plaintext appears in logs or error messages
 */

import { randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from "crypto";

// ─── Constants ───────────────────────────────────────────────

const ALGORITHM = "aes-256-gcm" as const;
const IV_LENGTH = 12; // NIST-recommended IV length for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag
const DEK_LENGTH = 32; // 256-bit DEK

// ─── Types ───────────────────────────────────────────────────

/** Plaintext PII fields on an entity. All optional because KYC level varies. */
export interface PiiFields {
  fullName?: string | null;
  dateOfBirth?: string | null;
  nationality?: string | null;
  governmentIdType?: string | null;
  governmentIdHash?: string | null;
  addressLine1?: string | null;
  addressCity?: string | null;
  addressCountry?: string | null;
}

/** Encrypted PII fields stored in the database. Same shape, encrypted values. */
export interface EncryptedPiiFields {
  fullName?: string | null;
  dateOfBirth?: string | null;
  nationality?: string | null;
  governmentIdType?: string | null;
  governmentIdHash?: string | null;
  addressLine1?: string | null;
  addressCity?: string | null;
  addressCountry?: string | null;
}

// ─── Key generation ──────────────────────────────────────────

/**
 * Generate a cryptographically random 256-bit Data Encryption Key.
 * Uses Node.js crypto.randomBytes which draws from the OS CSPRNG.
 */
export function generateDek(): Buffer {
  return randomBytes(DEK_LENGTH);
}

// ─── Key wrapping (envelope encryption) ──────────────────────

/**
 * Wrap (encrypt) a DEK using the Master Encryption Key.
 *
 * Output format (base64-encoded):
 *   [12-byte IV][16-byte auth tag][ciphertext]
 *
 * The AAD is set to the literal string "dek-wrap" to bind context.
 */
export function wrapKey(dek: Buffer, masterKey: Buffer): string {
  if (dek.length !== DEK_LENGTH) {
    throw new Error("Invalid key length for wrapping");
  }
  if (masterKey.length !== DEK_LENGTH) {
    throw new Error("Invalid master key length");
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  cipher.setAAD(Buffer.from("dek-wrap", "utf8"));

  const encrypted = Buffer.concat([cipher.update(dek), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack: IV + authTag + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString("base64");
}

/**
 * Unwrap (decrypt) a DEK using the Master Encryption Key.
 * Verifies the auth tag before returning any key material.
 */
export function unwrapKey(wrappedDek: string, masterKey: Buffer): Buffer {
  if (masterKey.length !== DEK_LENGTH) {
    throw new Error("Invalid master key length");
  }

  const packed = Buffer.from(wrappedDek, "base64");
  const minLength = IV_LENGTH + AUTH_TAG_LENGTH + DEK_LENGTH;
  if (packed.length < minLength) {
    throw new Error("Encrypted key data is corrupted");
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, masterKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAAD(Buffer.from("dek-wrap", "utf8"));
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted;
  } catch {
    throw new Error("Key unwrap failed: authentication check failed");
  }
}

// ─── Field-level encryption ─────────────────────────────────

/**
 * Encrypt a single plaintext field using AES-256-GCM.
 *
 * @param plaintext - The plaintext value to encrypt
 * @param dek       - The 256-bit Data Encryption Key
 * @param fieldName - Used as AAD to bind ciphertext to the field, preventing field-swapping
 *
 * Output format (base64-encoded):
 *   [12-byte IV][16-byte auth tag][ciphertext]
 */
export function encryptField(plaintext: string, dek: Buffer, fieldName: string = ""): string {
  if (dek.length !== DEK_LENGTH) {
    throw new Error("Invalid encryption key length");
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, dek, iv, { authTagLength: AUTH_TAG_LENGTH });

  // AAD = field name, binds ciphertext to this specific column
  if (fieldName) {
    cipher.setAAD(Buffer.from(fieldName, "utf8"));
  }

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString("base64");
}

/**
 * Decrypt a single field using AES-256-GCM.
 * The auth tag is verified before any plaintext is returned.
 *
 * @param ciphertext - Base64-encoded [IV + authTag + ciphertext]
 * @param dek        - The 256-bit Data Encryption Key
 * @param fieldName  - Must match the fieldName used during encryption (AAD)
 */
export function decryptField(ciphertext: string, dek: Buffer, fieldName: string = ""): string {
  if (dek.length !== DEK_LENGTH) {
    throw new Error("Invalid encryption key length");
  }

  const packed = Buffer.from(ciphertext, "base64");
  const minLength = IV_LENGTH + AUTH_TAG_LENGTH;
  if (packed.length < minLength) {
    throw new Error("Encrypted data is corrupted");
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encryptedData = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, dek, iv, { authTagLength: AUTH_TAG_LENGTH });

  if (fieldName) {
    decipher.setAAD(Buffer.from(fieldName, "utf8"));
  }

  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    throw new Error("Decryption failed: authentication check failed");
  }
}

// ─── Entity PII bulk encrypt/decrypt ────────────────────────

/** PII field names that require encryption. Order matters for consistency. */
const PII_FIELD_NAMES: (keyof PiiFields)[] = [
  "fullName",
  "dateOfBirth",
  "nationality",
  "governmentIdType",
  "governmentIdHash",
  "addressLine1",
  "addressCity",
  "addressCountry",
];

/**
 * Encrypt all PII fields of an entity.
 * Null/undefined fields are left as-is (no encryption needed for absent data).
 * Each field is encrypted with its field name as AAD.
 */
export function encryptEntityPii(entity: PiiFields, dek: Buffer): EncryptedPiiFields {
  const encrypted: EncryptedPiiFields = {};

  for (const field of PII_FIELD_NAMES) {
    const value = entity[field];
    if (value != null) {
      encrypted[field] = encryptField(value, dek, field);
    } else {
      encrypted[field] = value as null | undefined;
    }
  }

  return encrypted;
}

/**
 * Decrypt all PII fields of an entity.
 * Null/undefined fields are left as-is.
 * Each field is decrypted with its field name as AAD for integrity verification.
 */
export function decryptEntityPii(encrypted: EncryptedPiiFields, dek: Buffer): PiiFields {
  const decrypted: PiiFields = {};

  for (const field of PII_FIELD_NAMES) {
    const value = encrypted[field];
    if (value != null) {
      decrypted[field] = decryptField(value, dek, field);
    } else {
      decrypted[field] = value as null | undefined;
    }
  }

  return decrypted;
}

/**
 * Parse and validate a hex-encoded master key from environment.
 * Returns a Buffer of exactly 32 bytes.
 */
export function parseMasterKey(hexKey: string): Buffer {
  if (!hexKey || typeof hexKey !== "string") {
    throw new Error("Master key must be provided");
  }

  // Strip any whitespace
  const cleaned = hexKey.trim();

  if (!/^[0-9a-fA-F]{64}$/.test(cleaned)) {
    throw new Error("Master key must be exactly 64 hex characters (32 bytes)");
  }

  return Buffer.from(cleaned, "hex");
}
