import { describe, it, expect } from "vitest";
import {
  canonicalize,
  canonicalHash,
  serializeCanonical,
  hashKycCanonical,
  hashKycCanonicalHex,
  HASH_VERSION,
  KYC_HASH_FIELDS_V1,
} from "../utils/canonical.js";

// Import the SDK's canonical utilities to verify cross-package parity.
// The SDK module is resolved relative to the monorepo workspace.
import {
  canonicalize as sdkCanonicalize,
  canonicalHash as sdkCanonicalHash,
  hashKycCanonical as sdkHashKycCanonical,
  hashKycCanonicalHex as sdkHashKycCanonicalHex,
  HASH_VERSION as SDK_HASH_VERSION,
  KYC_HASH_FIELDS_V1 as SDK_KYC_HASH_FIELDS_V1,
} from "../../../sdk/src/utils/canonical.js";

// ─── RFC 8785 Canonical Serialization ───────────────────────────

describe("canonicalize (RFC 8785)", () => {
  it("sorts object keys alphabetically", () => {
    const result = canonicalize({ z: 1, a: 2, m: 3 });
    expect(result).toBe('{"a":2,"m":3,"z":1}');
  });

  it("produces identical output for different key insertion orders", () => {
    const a = canonicalize({ fullName: "Alice", nationality: "US", dateOfBirth: "1990-01-01" });
    const b = canonicalize({ dateOfBirth: "1990-01-01", fullName: "Alice", nationality: "US" });
    const c = canonicalize({ nationality: "US", dateOfBirth: "1990-01-01", fullName: "Alice" });
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("sorts nested object keys recursively", () => {
    const result = canonicalize({
      outer: { z: 1, a: 2 },
      inner: { b: { y: 3, x: 4 }, a: 1 },
    });
    expect(result).toBe(
      '{"inner":{"a":1,"b":{"x":4,"y":3}},"outer":{"a":2,"z":1}}'
    );
  });

  it("emits no whitespace", () => {
    const result = canonicalize({ key: "value", nested: { a: [1, 2, 3] } });
    expect(result).not.toMatch(/\s/);
  });

  it("handles empty objects", () => {
    expect(canonicalize({})).toBe("{}");
  });

  it("handles arrays", () => {
    const result = canonicalize({ arr: [3, 1, 2] });
    expect(result).toBe('{"arr":[3,1,2]}');
  });

  it("handles arrays with mixed types", () => {
    const result = canonicalize({ arr: [1, "two", null, true, false] });
    expect(result).toBe('{"arr":[1,"two",null,true,false]}');
  });

  it("handles null values", () => {
    expect(canonicalize({ a: null })).toBe('{"a":null}');
  });

  it("omits undefined values from objects", () => {
    expect(canonicalize({ a: 1, b: undefined, c: 3 })).toBe('{"a":1,"c":3}');
  });

  it("handles boolean values", () => {
    expect(canonicalize({ t: true, f: false })).toBe('{"f":false,"t":true}');
  });

  it("formats numbers correctly", () => {
    expect(canonicalize({ a: 0 })).toBe('{"a":0}');
    expect(canonicalize({ a: -0 })).toBe('{"a":0}');
    expect(canonicalize({ a: 1 })).toBe('{"a":1}');
    expect(canonicalize({ a: -1 })).toBe('{"a":-1}');
    expect(canonicalize({ a: 1.5 })).toBe('{"a":1.5}');
    expect(canonicalize({ a: 1e20 })).toBe('{"a":100000000000000000000}');
    expect(canonicalize({ a: 1e-7 })).toBe('{"a":1e-7}');
  });

  it("throws on non-finite numbers", () => {
    expect(() => canonicalize({ a: NaN })).toThrow(TypeError);
    expect(() => canonicalize({ a: Infinity })).toThrow(TypeError);
    expect(() => canonicalize({ a: -Infinity })).toThrow(TypeError);
  });

  it("throws on BigInt values", () => {
    expect(() => serializeCanonical(BigInt(42))).toThrow(TypeError);
  });
});

// ─── String Escaping ────────────────────────────────────────────

describe("canonical string escaping", () => {
  it("escapes backslash and double-quote", () => {
    expect(canonicalize({ a: 'he said "hi"' })).toBe(
      '{"a":"he said \\"hi\\""}',
    );
    expect(canonicalize({ a: "back\\slash" })).toBe(
      '{"a":"back\\\\slash"}',
    );
  });

  it("escapes control characters with short forms", () => {
    expect(canonicalize({ a: "\b" })).toBe('{"a":"\\b"}');
    expect(canonicalize({ a: "\t" })).toBe('{"a":"\\t"}');
    expect(canonicalize({ a: "\n" })).toBe('{"a":"\\n"}');
    expect(canonicalize({ a: "\f" })).toBe('{"a":"\\f"}');
    expect(canonicalize({ a: "\r" })).toBe('{"a":"\\r"}');
  });

  it("escapes other control characters with \\uXXXX (lowercase)", () => {
    // U+0000 NUL
    expect(canonicalize({ a: "\x00" })).toBe('{"a":"\\u0000"}');
    // U+001F (unit separator)
    expect(canonicalize({ a: "\x1f" })).toBe('{"a":"\\u001f"}');
    // U+0001
    expect(canonicalize({ a: "\x01" })).toBe('{"a":"\\u0001"}');
  });

  it("passes through non-BMP characters (emoji) verbatim", () => {
    const result = canonicalize({ emoji: "\u{1F600}" });
    // The emoji should appear as literal UTF-8 surrogate pair, not escaped
    expect(result).toContain("\u{1F600}");
  });

  it("handles unicode text correctly", () => {
    const result = canonicalize({ name: "\u00e9\u00e8\u00ea" }); // ééê
    expect(result).toBe('{"name":"\u00e9\u00e8\u00ea"}');
  });

  it("handles CJK characters", () => {
    const result = canonicalize({ name: "\u5f20\u4e09" }); // 张三
    expect(result).toBe('{"name":"\u5f20\u4e09"}');
  });

  it("handles mixed ASCII and unicode", () => {
    const result = canonicalize({ name: "Jos\u00e9 Garc\u00eda" });
    expect(result).toBe('{"name":"Jos\u00e9 Garc\u00eda"}');
  });
});

// ─── Canonical Hash ─────────────────────────────────────────────

describe("canonicalHash", () => {
  it("returns a 32-byte Buffer", () => {
    const hash = canonicalHash({ test: "data" });
    expect(Buffer.isBuffer(hash)).toBe(true);
    expect(hash.length).toBe(32);
  });

  it("produces identical hashes for different key orders", () => {
    const a = canonicalHash({ b: 2, a: 1 });
    const b = canonicalHash({ a: 1, b: 2 });
    expect(a.equals(b)).toBe(true);
  });

  it("is deterministic across multiple calls", () => {
    const data = { fullName: "Alice", nationality: "US" };
    const hashes = Array.from({ length: 100 }, () =>
      canonicalHash(data).toString("hex")
    );
    const unique = new Set(hashes);
    expect(unique.size).toBe(1);
  });

  it("produces different hashes for different data", () => {
    const a = canonicalHash({ name: "Alice" });
    const b = canonicalHash({ name: "Bob" });
    expect(a.equals(b)).toBe(false);
  });
});

// ─── KYC Hashing ────────────────────────────────────────────────

describe("hashKycCanonical", () => {
  const sampleKyc = {
    fullName: "Alice Johnson",
    dateOfBirth: "1990-01-15",
    nationality: "US",
    governmentIdType: "passport",
    governmentIdHash: "abc123def456",
    addressLine1: "123 Main St",
    addressCity: "New York",
    addressCountry: "US",
  };

  it("returns a 32-byte Buffer", () => {
    const hash = hashKycCanonical(sampleKyc);
    expect(Buffer.isBuffer(hash)).toBe(true);
    expect(hash.length).toBe(32);
  });

  it("produces identical hashes regardless of key order", () => {
    const reversed = Object.fromEntries(
      Object.entries(sampleKyc).reverse()
    );
    const shuffled = {
      nationality: sampleKyc.nationality,
      fullName: sampleKyc.fullName,
      addressCountry: sampleKyc.addressCountry,
      dateOfBirth: sampleKyc.dateOfBirth,
      governmentIdHash: sampleKyc.governmentIdHash,
      addressLine1: sampleKyc.addressLine1,
      governmentIdType: sampleKyc.governmentIdType,
      addressCity: sampleKyc.addressCity,
    };

    const original = hashKycCanonical(sampleKyc);
    const fromReversed = hashKycCanonical(reversed);
    const fromShuffled = hashKycCanonical(shuffled);

    expect(original.equals(fromReversed)).toBe(true);
    expect(original.equals(fromShuffled)).toBe(true);
  });

  it("ignores extra keys not in KYC_HASH_FIELDS_V1", () => {
    const withExtra = {
      ...sampleKyc,
      extraField: "should be ignored",
      anotherExtra: 42,
    };
    const original = hashKycCanonical(sampleKyc);
    const withExtraHash = hashKycCanonical(withExtra);
    expect(original.equals(withExtraHash)).toBe(true);
  });

  it("handles partial KYC data (missing fields)", () => {
    const partial = { fullName: "Alice Johnson", nationality: "US" };
    const hash = hashKycCanonical(partial);
    expect(Buffer.isBuffer(hash)).toBe(true);
    expect(hash.length).toBe(32);

    // Partial data should hash differently from full data
    const full = hashKycCanonical(sampleKyc);
    expect(hash.equals(full)).toBe(false);
  });

  it("handles null field values", () => {
    const withNull = { ...sampleKyc, fullName: null };
    const hash = hashKycCanonical(withNull);
    expect(Buffer.isBuffer(hash)).toBe(true);
    expect(hash.length).toBe(32);

    // null is not the same as the string value
    const original = hashKycCanonical(sampleKyc);
    expect(hash.equals(original)).toBe(false);
  });

  it("handles undefined field values (treated as missing)", () => {
    const withUndefined = { ...sampleKyc, fullName: undefined };
    const withoutField = { ...sampleKyc };
    delete (withoutField as Record<string, unknown>).fullName;

    const a = hashKycCanonical(withUndefined);
    const b = hashKycCanonical(withoutField);
    expect(a.equals(b)).toBe(true);
  });

  it("handles unicode names correctly", () => {
    const unicodeKyc = {
      ...sampleKyc,
      fullName: "\u5f20\u4e09", // 张三
    };
    const hash = hashKycCanonical(unicodeKyc);
    expect(Buffer.isBuffer(hash)).toBe(true);
    expect(hash.length).toBe(32);
  });

  it("handles special characters in field values", () => {
    const specialKyc = {
      ...sampleKyc,
      addressLine1: '123 "Main" St, Apt #4 & 5',
      fullName: "O'Brien-Smith",
    };
    const hash = hashKycCanonical(specialKyc);
    expect(Buffer.isBuffer(hash)).toBe(true);
    expect(hash.length).toBe(32);
  });
});

describe("hashKycCanonicalHex", () => {
  it("returns a 64-character lowercase hex string", () => {
    const hex = hashKycCanonicalHex({ fullName: "Alice" });
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches the hex encoding of hashKycCanonical", () => {
    const data = { fullName: "Alice", nationality: "US" };
    const fromBuffer = hashKycCanonical(data).toString("hex");
    const fromHex = hashKycCanonicalHex(data);
    expect(fromHex).toBe(fromBuffer);
  });
});

// ─── Version and Field Constants ────────────────────────────────

describe("constants", () => {
  it("HASH_VERSION is 1", () => {
    expect(HASH_VERSION).toBe(1);
  });

  it("KYC_HASH_FIELDS_V1 is alphabetically sorted", () => {
    const sorted = [...KYC_HASH_FIELDS_V1].sort();
    expect(KYC_HASH_FIELDS_V1).toEqual(sorted);
  });

  it("KYC_HASH_FIELDS_V1 contains exactly the expected fields", () => {
    expect(KYC_HASH_FIELDS_V1).toEqual([
      "addressCity",
      "addressCountry",
      "addressLine1",
      "dateOfBirth",
      "fullName",
      "governmentIdHash",
      "governmentIdType",
      "nationality",
    ]);
  });
});

// ─── SDK / API Parity ───────────────────────────────────────────

describe("SDK ↔ API parity", () => {
  it("HASH_VERSION matches between API and SDK", () => {
    expect(HASH_VERSION).toBe(SDK_HASH_VERSION);
  });

  it("KYC_HASH_FIELDS_V1 matches between API and SDK", () => {
    expect(KYC_HASH_FIELDS_V1).toEqual(SDK_KYC_HASH_FIELDS_V1);
  });

  it("canonicalize produces identical output", () => {
    const data = { z: 1, a: "hello", m: [3, 2, 1], nested: { b: 2, a: 1 } };
    expect(canonicalize(data)).toBe(sdkCanonicalize(data));
  });

  it("canonicalHash produces identical digests", () => {
    const data = { fullName: "Alice", nationality: "US" };
    const apiHash = canonicalHash(data);
    const sdkHash = sdkCanonicalHash(data);
    expect(apiHash.equals(sdkHash)).toBe(true);
  });

  it("hashKycCanonical produces identical digests", () => {
    const kycData = {
      fullName: "Alice Johnson",
      dateOfBirth: "1990-01-15",
      nationality: "US",
      governmentIdType: "passport",
      governmentIdHash: "abc123def456",
      addressLine1: "123 Main St",
      addressCity: "New York",
      addressCountry: "US",
    };
    const apiHash = hashKycCanonical(kycData);
    const sdkHash = sdkHashKycCanonical(kycData);
    expect(apiHash.equals(sdkHash)).toBe(true);
  });

  it("hashKycCanonicalHex produces identical hex strings", () => {
    const kycData = {
      fullName: "\u5f20\u4e09",
      nationality: "CN",
      addressCity: "Beijing",
    };
    expect(hashKycCanonicalHex(kycData)).toBe(sdkHashKycCanonicalHex(kycData));
  });

  it("both ignore extra fields identically", () => {
    const base = { fullName: "Alice", nationality: "US" };
    const extra = { ...base, unknownField: "ignored", walletAddress: "xyz" };

    const apiBase = hashKycCanonical(base);
    const apiExtra = hashKycCanonical(extra);
    const sdkBase = sdkHashKycCanonical(base);
    const sdkExtra = sdkHashKycCanonical(extra);

    expect(apiBase.equals(apiExtra)).toBe(true);
    expect(sdkBase.equals(sdkExtra)).toBe(true);
    expect(apiBase.equals(sdkBase)).toBe(true);
  });

  it("both handle different key orders identically", () => {
    const forward = {
      addressCity: "NYC",
      fullName: "Bob",
      nationality: "US",
    };
    const backward = {
      nationality: "US",
      fullName: "Bob",
      addressCity: "NYC",
    };

    const apiForward = hashKycCanonicalHex(forward);
    const apiBackward = hashKycCanonicalHex(backward);
    const sdkForward = sdkHashKycCanonicalHex(forward);
    const sdkBackward = sdkHashKycCanonicalHex(backward);

    expect(apiForward).toBe(apiBackward);
    expect(sdkForward).toBe(sdkBackward);
    expect(apiForward).toBe(sdkForward);
  });
});
