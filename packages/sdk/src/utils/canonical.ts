/**
 * Canonical JSON serialization for deterministic hashing (SDK edition).
 *
 * This module mirrors the implementation in `@payclear/api` so that both
 * the server-side API and the client-side SDK produce byte-identical
 * canonical JSON for the same input data. The resulting SHA-256 digests
 * must match exactly — the on-chain Solana program stores the hash as
 * `[u8; 32]` in the `KycAttestation` account, and both sides must agree.
 *
 * Implements RFC 8785 (JSON Canonicalization Scheme — JCS).
 * Reference: https://www.rfc-editor.org/rfc/rfc8785
 *
 * @module
 */

import { createHash } from "crypto";

/**
 * The current hash schema version. Must match the API's HASH_VERSION.
 * Embedded in the hash input so that future field-set changes produce
 * a distinct digest without silently breaking existing attestations.
 */
export const HASH_VERSION = 1;

/**
 * The ordered set of KYC fields included in the canonical hash.
 * Alphabetically sorted. Must match the API's KYC_HASH_FIELDS_V1.
 */
export const KYC_HASH_FIELDS_V1: readonly string[] = [
  "addressCity",
  "addressCountry",
  "addressLine1",
  "dateOfBirth",
  "fullName",
  "governmentIdHash",
  "governmentIdType",
  "nationality",
] as const;

// ─── RFC 8785 Canonical Serialization ───────────────────────────

/**
 * Serialize a value to its RFC 8785 canonical JSON form.
 *
 * @param value - Any JSON-serializable value.
 * @returns The canonical JSON string.
 * @throws {TypeError} If the value contains a `BigInt` or non-finite number.
 */
export function serializeCanonical(value: unknown): string {
  return _serialize(value);
}

function _serialize(value: unknown): string {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";

    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(
          `Non-finite number ${value} cannot be canonically serialized`
        );
      }
      return JSON.stringify(value);

    case "string":
      return _serializeString(value);

    case "bigint":
      throw new TypeError(
        "BigInt values cannot be serialized to canonical JSON"
      );

    case "undefined":
    case "function":
    case "symbol":
      return "null";

    default:
      break;
  }

  if (value instanceof Date) {
    return _serializeString(value.toISOString());
  }

  if (Array.isArray(value)) {
    const items = value.map((element) => _serialize(element));
    return "[" + items.join(",") + "]";
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs: string[] = [];

  for (const key of keys) {
    const v = obj[key];
    if (v === undefined || typeof v === "function" || typeof v === "symbol") {
      continue;
    }
    pairs.push(_serializeString(key) + ":" + _serialize(v));
  }

  return "{" + pairs.join(",") + "}";
}

/**
 * Serialize a string with RFC 8785 escaping.
 *
 * - `"` and `\` are escaped.
 * - Control characters U+0000–U+001F use `\uXXXX` (lowercase hex) or
 *   the short forms `\b`, `\t`, `\n`, `\f`, `\r`.
 * - All other characters pass through verbatim.
 */
function _serializeString(s: string): string {
  let result = '"';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);

    if (code === 0x08) {
      result += "\\b";
    } else if (code === 0x09) {
      result += "\\t";
    } else if (code === 0x0a) {
      result += "\\n";
    } else if (code === 0x0c) {
      result += "\\f";
    } else if (code === 0x0d) {
      result += "\\r";
    } else if (code === 0x22) {
      result += '\\"';
    } else if (code === 0x5c) {
      result += "\\\\";
    } else if (code < 0x20) {
      result += "\\u" + code.toString(16).padStart(4, "0");
    } else {
      result += s[i];
    }
  }
  result += '"';
  return result;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Produce the RFC 8785 canonical JSON representation of a plain object.
 *
 * Keys are sorted lexicographically (by UTF-16 code units), nested
 * objects are sorted recursively, and no whitespace is emitted.
 *
 * @param data - A plain JSON-serializable object.
 * @returns The canonical JSON string.
 */
export function canonicalize(data: Record<string, unknown>): string {
  return serializeCanonical(data);
}

/**
 * Compute the SHA-256 hash of the canonical JSON representation.
 *
 * @param data - A plain JSON-serializable object.
 * @returns A 32-byte Buffer containing the SHA-256 digest.
 */
export function canonicalHash(data: Record<string, unknown>): Buffer {
  const canonical = canonicalize(data);
  return createHash("sha256").update(canonical, "utf8").digest();
}

/**
 * Extract versioned KYC fields, canonicalize, and return SHA-256.
 *
 * Hash input structure: `{"v":1,"data":{...sorted KYC fields...}}`
 *
 * @param data - An object containing some or all KYC fields.
 * @returns A 32-byte Buffer containing the SHA-256 digest.
 */
export function hashKycCanonical(data: Record<string, unknown>): Buffer {
  const extracted: Record<string, unknown> = {};
  for (const field of KYC_HASH_FIELDS_V1) {
    if (data[field] !== undefined) {
      extracted[field] = data[field];
    }
  }

  const envelope: Record<string, unknown> = {
    v: HASH_VERSION,
    data: extracted,
  };

  return canonicalHash(envelope);
}

/**
 * Convenience wrapper returning hex-encoded SHA-256 of canonical KYC hash.
 *
 * @param data - An object containing some or all KYC fields.
 * @returns A 64-character lowercase hex string.
 */
export function hashKycCanonicalHex(data: Record<string, unknown>): string {
  return hashKycCanonical(data).toString("hex");
}
