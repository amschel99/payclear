/**
 * Canonical JSON serialization for deterministic hashing.
 *
 * Implements RFC 8785 (JSON Canonicalization Scheme — JCS) to produce
 * byte-identical JSON output regardless of key insertion order, runtime,
 * or platform. This is critical for KYC data hashing: the API and the SDK
 * must derive the same SHA-256 digest for the same logical data, and the
 * resulting 32-byte hash is stored on-chain in the Solana program's
 * `KycAttestation.kyc_hash` field.
 *
 * Algorithm summary (per RFC 8785):
 *   1. Object keys are sorted recursively by their UTF-16 code-unit values
 *      (which matches JavaScript's default `Array.prototype.sort()`).
 *   2. Numbers are formatted using ECMAScript's `JSON.stringify` semantics
 *      (IEEE 754 double → shortest representation, no trailing zeros).
 *   3. Strings are serialized with minimal escaping (only the characters
 *      mandated by RFC 8259 are escaped; code points U+0000–U+001F use
 *      lowercase hex `\uXXXX`).
 *   4. No whitespace is emitted between tokens.
 *   5. `undefined` object values and `undefined` array entries are handled
 *      per standard JSON rules (omitted from objects, converted to `null`
 *      in arrays).
 *
 * Reference: https://www.rfc-editor.org/rfc/rfc8785
 *
 * @module
 */

import { createHash } from "crypto";

/**
 * The current hash schema version. Embedded in the hash input so that
 * future changes to field selection or ordering produce a distinct digest
 * rather than silently breaking verification of existing attestations.
 */
export const HASH_VERSION = 1;

/**
 * The ordered set of KYC fields that are included in the canonical hash.
 * Fields are listed in alphabetical order. Only these fields are extracted
 * from the input data; any extra keys are ignored.
 *
 * Changing this list requires bumping {@link HASH_VERSION}.
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
 * This is the low-level serializer. For most call sites you should use
 * {@link canonicalize} (objects) or {@link canonicalHash} (objects → SHA-256).
 *
 * @param value - Any JSON-serializable value.
 * @returns The canonical JSON string.
 * @throws {TypeError} If the value contains a `BigInt` (not representable
 *   in JSON) or a circular reference.
 */
export function serializeCanonical(value: unknown): string {
  return _serialize(value);
}

/**
 * Internal recursive serializer implementing RFC 8785.
 */
function _serialize(value: unknown): string {
  // null
  if (value === null) {
    return "null";
  }

  // Primitives
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";

    case "number":
      // RFC 8785 §3.2.2.3: Use ECMAScript number-to-string conversion.
      // JSON.stringify already does this correctly for finite numbers.
      // NaN and Infinity are not valid JSON.
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
      // When called at the top level these produce undefined, but in
      // practice they should not appear. Return "null" to match
      // JSON.stringify behavior for array elements.
      return "null";

    default:
      break;
  }

  // Date → string (ISO 8601, matching JSON.stringify)
  if (value instanceof Date) {
    return _serializeString(value.toISOString());
  }

  // Arrays
  if (Array.isArray(value)) {
    const items = value.map((element) => _serialize(element));
    return "[" + items.join(",") + "]";
  }

  // Plain objects
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs: string[] = [];

  for (const key of keys) {
    const v = obj[key];
    // Omit undefined values (standard JSON behavior)
    if (v === undefined || typeof v === "function" || typeof v === "symbol") {
      continue;
    }
    pairs.push(_serializeString(key) + ":" + _serialize(v));
  }

  return "{" + pairs.join(",") + "}";
}

/**
 * Serialize a string with RFC 8785 escaping rules.
 *
 * RFC 8785 §3.2.2.2 requires:
 *   - `"`, `\` are escaped as `\"`, `\\`
 *   - Control characters U+0000–U+001F are escaped as `\uXXXX` (lowercase)
 *   - All other characters (including non-BMP via surrogate pairs) are
 *     passed through verbatim — they must NOT be escaped.
 *
 * This differs from `JSON.stringify`, which may escape characters beyond
 * the required set depending on the engine.
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
      // Other control characters: \u00XX
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
 * objects are sorted recursively, and no whitespace is emitted. The
 * output is deterministic: identical logical data always yields the
 * same byte string.
 *
 * @param data - A plain JSON-serializable object.
 * @returns The canonical JSON string (UTF-8 safe).
 *
 * @example
 * ```ts
 * canonicalize({ b: 2, a: 1 });
 * // '{"a":1,"b":2}'
 * ```
 */
export function canonicalize(data: Record<string, unknown>): string {
  return serializeCanonical(data);
}

/**
 * Compute the SHA-256 hash of the RFC 8785 canonical JSON representation.
 *
 * This is the primary function used by KYC hashing. The returned Buffer
 * is exactly 32 bytes and can be stored directly in the on-chain
 * `kyc_hash: [u8; 32]` field.
 *
 * @param data - A plain JSON-serializable object.
 * @returns A 32-byte Buffer containing the SHA-256 digest.
 *
 * @example
 * ```ts
 * const hash = canonicalHash({ fullName: "Alice", nationality: "US" });
 * console.log(hash.toString("hex"));
 * ```
 */
export function canonicalHash(data: Record<string, unknown>): Buffer {
  const canonical = canonicalize(data);
  return createHash("sha256").update(canonical, "utf8").digest();
}

/**
 * Extract the versioned KYC fields from an input record, canonicalize
 * them, and return the SHA-256 digest.
 *
 * The hash input is structured as:
 * ```json
 * {"v":1,"data":{...sorted KYC fields...}}
 * ```
 *
 * This envelope ensures that:
 *   1. Only the defined KYC fields participate in the hash (extra keys
 *      in the input are ignored).
 *   2. The version tag produces a different digest if the field set
 *      changes in the future.
 *   3. Missing (undefined) fields are omitted rather than hashed as
 *      `null`, so partial KYC records hash consistently.
 *
 * @param data - An object containing some or all of the KYC fields
 *   defined in {@link KYC_HASH_FIELDS_V1}.
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
 * Convenience wrapper that returns the hex-encoded SHA-256 of the
 * canonical KYC hash. Matches the format stored in the database
 * (`entities.kyc_hash` column).
 *
 * @param data - An object containing some or all of the KYC fields.
 * @returns A 64-character lowercase hex string.
 */
export function hashKycCanonicalHex(data: Record<string, unknown>): string {
  return hashKycCanonical(data).toString("hex");
}
