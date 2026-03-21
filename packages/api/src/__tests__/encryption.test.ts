import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomBytes } from "crypto";
import {
  generateDek,
  wrapKey,
  unwrapKey,
  encryptField,
  decryptField,
  encryptEntityPii,
  decryptEntityPii,
  parseMasterKey,
} from "../utils/encryption.js";
import type { PiiFields } from "../utils/encryption.js";
import { KeyManager } from "../utils/key-manager.js";

// ─── Test helpers ────────────────────────────────────────────

function generateTestKey(): Buffer {
  return randomBytes(32);
}

// ─── Encryption roundtrip tests ──────────────────────────────

describe("encryptField / decryptField", () => {
  const dek = generateTestKey();

  it("should encrypt and decrypt a field correctly", () => {
    const plaintext = "John Doe";
    const fieldName = "fullName";

    const ciphertext = encryptField(plaintext, dek, fieldName);
    const decrypted = decryptField(ciphertext, dek, fieldName);

    expect(decrypted).toBe(plaintext);
  });

  it("should handle empty string", () => {
    const plaintext = "";
    const fieldName = "fullName";

    const ciphertext = encryptField(plaintext, dek, fieldName);
    const decrypted = decryptField(ciphertext, dek, fieldName);

    expect(decrypted).toBe(plaintext);
  });

  it("should handle unicode characters", () => {
    const plaintext = "Satoshi Nakamoto";
    const fieldName = "fullName";

    const ciphertext = encryptField(plaintext, dek, fieldName);
    const decrypted = decryptField(ciphertext, dek, fieldName);

    expect(decrypted).toBe(plaintext);
  });

  it("should handle long values", () => {
    const plaintext = "A".repeat(10000);
    const fieldName = "addressLine1";

    const ciphertext = encryptField(plaintext, dek, fieldName);
    const decrypted = decryptField(ciphertext, dek, fieldName);

    expect(decrypted).toBe(plaintext);
  });

  it("should produce base64-encoded output", () => {
    const ciphertext = encryptField("test", dek, "field");
    // Should be valid base64
    expect(() => Buffer.from(ciphertext, "base64")).not.toThrow();
    // And not equal to plaintext
    expect(ciphertext).not.toBe("test");
  });
});

// ─── Unique IV tests ────────────────────────────────────────

describe("IV uniqueness", () => {
  const dek = generateTestKey();

  it("should produce different ciphertexts for the same plaintext", () => {
    const plaintext = "same-data";
    const fieldName = "fullName";

    const ciphertext1 = encryptField(plaintext, dek, fieldName);
    const ciphertext2 = encryptField(plaintext, dek, fieldName);

    // Ciphertexts must differ due to unique IVs
    expect(ciphertext1).not.toBe(ciphertext2);

    // But both must decrypt to the same plaintext
    expect(decryptField(ciphertext1, dek, fieldName)).toBe(plaintext);
    expect(decryptField(ciphertext2, dek, fieldName)).toBe(plaintext);
  });

  it("should use unique IVs (extract and compare)", () => {
    const ciphertexts = Array.from({ length: 50 }, () =>
      encryptField("test", dek, "field")
    );

    // Extract IVs (first 12 bytes of each)
    const ivs = ciphertexts.map((ct) =>
      Buffer.from(ct, "base64").subarray(0, 12).toString("hex")
    );

    // All IVs should be unique
    const uniqueIvs = new Set(ivs);
    expect(uniqueIvs.size).toBe(50);
  });
});

// ─── Wrong key tests ────────────────────────────────────────

describe("wrong key rejection", () => {
  it("should fail to decrypt with a different key", () => {
    const dek1 = generateTestKey();
    const dek2 = generateTestKey();
    const fieldName = "fullName";

    const ciphertext = encryptField("secret", dek1, fieldName);

    expect(() => decryptField(ciphertext, dek2, fieldName)).toThrow(
      "Decryption failed: authentication check failed"
    );
  });

  it("should fail with a truncated key", () => {
    const dek = generateTestKey();
    const shortKey = dek.subarray(0, 16); // 128-bit, not 256-bit

    expect(() => encryptField("test", shortKey, "field")).toThrow(
      "Invalid encryption key length"
    );
  });
});

// ─── AAD / field-swapping prevention ────────────────────────

describe("AAD field-swapping prevention", () => {
  const dek = generateTestKey();

  it("should fail when decrypting with wrong field name", () => {
    const plaintext = "1990-01-01";

    // Encrypt as dateOfBirth
    const ciphertext = encryptField(plaintext, dek, "dateOfBirth");

    // Try to decrypt as a different field (field-swapping attack)
    expect(() => decryptField(ciphertext, dek, "fullName")).toThrow(
      "Decryption failed: authentication check failed"
    );
  });

  it("should fail when decrypting with empty field name if encrypted with one", () => {
    const ciphertext = encryptField("data", dek, "specificField");

    expect(() => decryptField(ciphertext, dek, "")).toThrow(
      "Decryption failed: authentication check failed"
    );
  });

  it("should succeed when field names match exactly", () => {
    const plaintext = "123 Main St";
    const fieldName = "addressLine1";

    const ciphertext = encryptField(plaintext, dek, fieldName);
    const decrypted = decryptField(ciphertext, dek, fieldName);

    expect(decrypted).toBe(plaintext);
  });
});

// ─── Key wrapping/unwrapping ────────────────────────────────

describe("wrapKey / unwrapKey", () => {
  const masterKey = generateTestKey();

  it("should wrap and unwrap a DEK correctly", () => {
    const dek = generateDek();
    const wrapped = wrapKey(dek, masterKey);
    const unwrapped = unwrapKey(wrapped, masterKey);

    expect(Buffer.compare(dek, unwrapped)).toBe(0);
  });

  it("should produce different wrapped outputs for the same DEK (unique IVs)", () => {
    const dek = generateDek();
    const wrapped1 = wrapKey(dek, masterKey);
    const wrapped2 = wrapKey(dek, masterKey);

    expect(wrapped1).not.toBe(wrapped2);

    // Both should unwrap to the same key
    const unwrapped1 = unwrapKey(wrapped1, masterKey);
    const unwrapped2 = unwrapKey(wrapped2, masterKey);
    expect(Buffer.compare(unwrapped1, unwrapped2)).toBe(0);
  });

  it("should fail to unwrap with wrong master key", () => {
    const dek = generateDek();
    const wrongMasterKey = generateTestKey();

    const wrapped = wrapKey(dek, masterKey);

    expect(() => unwrapKey(wrapped, wrongMasterKey)).toThrow(
      "Key unwrap failed: authentication check failed"
    );
  });

  it("should fail with corrupted wrapped key data", () => {
    const dek = generateDek();
    const wrapped = wrapKey(dek, masterKey);

    // Corrupt a byte in the middle
    const buf = Buffer.from(wrapped, "base64");
    buf[20] ^= 0xff;
    const corrupted = buf.toString("base64");

    expect(() => unwrapKey(corrupted, masterKey)).toThrow();
  });

  it("should fail with truncated wrapped key", () => {
    expect(() => unwrapKey("dG9vc2hvcnQ=", masterKey)).toThrow(
      "Encrypted key data is corrupted"
    );
  });

  it("should reject invalid key lengths", () => {
    const shortKey = randomBytes(16);
    const dek = generateDek();

    expect(() => wrapKey(dek, shortKey)).toThrow("Invalid master key length");
    expect(() => unwrapKey("test", shortKey)).toThrow("Invalid master key length");
    expect(() => wrapKey(shortKey, masterKey)).toThrow("Invalid key length for wrapping");
  });
});

// ─── DEK generation ─────────────────────────────────────────

describe("generateDek", () => {
  it("should generate a 32-byte key", () => {
    const dek = generateDek();
    expect(dek.length).toBe(32);
  });

  it("should generate unique keys", () => {
    const keys = Array.from({ length: 100 }, () => generateDek().toString("hex"));
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(100);
  });
});

// ─── Entity PII bulk encryption ─────────────────────────────

describe("encryptEntityPii / decryptEntityPii", () => {
  const dek = generateTestKey();

  it("should encrypt and decrypt all PII fields", () => {
    const pii: PiiFields = {
      fullName: "Jane Smith",
      dateOfBirth: "1985-06-15",
      nationality: "US",
      governmentIdType: "passport",
      governmentIdHash: "abc123hash",
      addressLine1: "456 Oak Avenue",
      addressCity: "San Francisco",
      addressCountry: "US",
    };

    const encrypted = encryptEntityPii(pii, dek);

    // All fields should be encrypted (not plaintext)
    expect(encrypted.fullName).not.toBe(pii.fullName);
    expect(encrypted.dateOfBirth).not.toBe(pii.dateOfBirth);
    expect(encrypted.nationality).not.toBe(pii.nationality);

    const decrypted = decryptEntityPii(encrypted, dek);

    expect(decrypted.fullName).toBe(pii.fullName);
    expect(decrypted.dateOfBirth).toBe(pii.dateOfBirth);
    expect(decrypted.nationality).toBe(pii.nationality);
    expect(decrypted.governmentIdType).toBe(pii.governmentIdType);
    expect(decrypted.governmentIdHash).toBe(pii.governmentIdHash);
    expect(decrypted.addressLine1).toBe(pii.addressLine1);
    expect(decrypted.addressCity).toBe(pii.addressCity);
    expect(decrypted.addressCountry).toBe(pii.addressCountry);
  });

  it("should handle null and undefined fields", () => {
    const pii: PiiFields = {
      fullName: "Only Name",
      dateOfBirth: null,
      nationality: undefined,
    };

    const encrypted = encryptEntityPii(pii, dek);

    expect(encrypted.dateOfBirth).toBeNull();
    expect(encrypted.nationality).toBeUndefined();
    expect(encrypted.fullName).not.toBe("Only Name");

    const decrypted = decryptEntityPii(encrypted, dek);

    expect(decrypted.fullName).toBe("Only Name");
    expect(decrypted.dateOfBirth).toBeNull();
    expect(decrypted.nationality).toBeUndefined();
  });

  it("should fail to decrypt with wrong DEK (cross-institution isolation)", () => {
    const dekInstitution1 = generateTestKey();
    const dekInstitution2 = generateTestKey();

    const pii: PiiFields = {
      fullName: "Cross-Institution Test",
      dateOfBirth: "2000-01-01",
    };

    const encrypted = encryptEntityPii(pii, dekInstitution1);

    // Attempt to decrypt with institution 2's key should fail
    expect(() => decryptEntityPii(encrypted, dekInstitution2)).toThrow(
      "Decryption failed: authentication check failed"
    );
  });
});

// ─── parseMasterKey ─────────────────────────────────────────

describe("parseMasterKey", () => {
  it("should parse a valid 64-char hex string", () => {
    const hex = randomBytes(32).toString("hex");
    const key = parseMasterKey(hex);
    expect(key.length).toBe(32);
    expect(key.toString("hex")).toBe(hex.toLowerCase());
  });

  it("should reject empty input", () => {
    expect(() => parseMasterKey("")).toThrow("Master key must be provided");
  });

  it("should reject wrong length", () => {
    expect(() => parseMasterKey("abcd")).toThrow("Master key must be exactly 64 hex characters");
  });

  it("should reject non-hex characters", () => {
    const badKey = "g".repeat(64);
    expect(() => parseMasterKey(badKey)).toThrow("Master key must be exactly 64 hex characters");
  });

  it("should handle uppercase hex", () => {
    const hex = randomBytes(32).toString("hex").toUpperCase();
    const key = parseMasterKey(hex);
    expect(key.length).toBe(32);
  });

  it("should trim whitespace", () => {
    const hex = randomBytes(32).toString("hex");
    const key = parseMasterKey(`  ${hex}  `);
    expect(key.length).toBe(32);
  });
});

// ─── KeyManager cache TTL behavior ──────────────────────────

describe("KeyManager cache TTL", () => {
  let km: KeyManager;
  const testMasterKeyHex = randomBytes(32).toString("hex");

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.PAYCLEAR_MASTER_KEY = testMasterKeyHex;
    // Use 1000ms TTL for testing
    km = new KeyManager(1000);
    km.initialize();
  });

  afterEach(() => {
    km.destroy();
    vi.useRealTimers();
    delete process.env.PAYCLEAR_MASTER_KEY;
  });

  it("should initialize from env", () => {
    expect(km.isInitialized()).toBe(true);
  });

  it("should throw if not initialized", () => {
    const uninitialized = new KeyManager();
    expect(() => uninitialized["requireMasterKey"]()).toThrow("KeyManager not initialized");
  });

  it("should throw if PAYCLEAR_MASTER_KEY is missing", () => {
    delete process.env.PAYCLEAR_MASTER_KEY;
    const km2 = new KeyManager();
    expect(() => km2.initialize()).toThrow("PAYCLEAR_MASTER_KEY environment variable is required");
  });

  it("should clear cache on destroy", () => {
    // Access internal cache for testing
    const cache = km["cache"];
    const fakeDek = randomBytes(32);
    const timer = setTimeout(() => {}, 10000);
    cache.set("test-id", { dek: fakeDek, timer });

    km.destroy();

    expect(cache.size).toBe(0);
    expect(km.isInitialized()).toBe(false);
  });

  it("should evict cached keys after TTL expires", () => {
    const cache = km["cache"];
    const fakeDek = randomBytes(32);

    // Manually cache a key
    km["cacheKey"]("test-institution", fakeDek);
    expect(cache.has("test-institution")).toBe(true);

    // Advance time past TTL
    vi.advanceTimersByTime(1001);

    // Key should be evicted
    expect(cache.has("test-institution")).toBe(false);
  });

  it("should zero out key material on eviction", () => {
    const fakeDek = Buffer.alloc(32, 0xff);
    km["cacheKey"]("zero-test", fakeDek);

    // Evict
    km["evict"]("zero-test");

    // Buffer should be zeroed
    const allZeros = Buffer.alloc(32, 0x00);
    expect(Buffer.compare(fakeDek, allZeros)).toBe(0);
  });

  it("should replace existing cache entry on re-cache", () => {
    const dek1 = randomBytes(32);
    const dek2 = randomBytes(32);

    km["cacheKey"]("replace-test", dek1);
    km["cacheKey"]("replace-test", dek2);

    const cached = km["cache"].get("replace-test");
    expect(cached).toBeDefined();
    expect(Buffer.compare(cached!.dek, dek2)).toBe(0);
    // Original should be zeroed
    expect(Buffer.compare(dek1, Buffer.alloc(32, 0x00))).toBe(0);
  });
});
