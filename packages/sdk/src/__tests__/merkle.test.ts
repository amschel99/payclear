import { describe, it, expect } from "vitest";
import {
  buildKycMerkleTree,
  getMerkleRoot,
  generateProof,
  verifyProof,
  hashLeaf,
  type KycFieldMap,
} from "../utils/merkle.js";

// ─── Fixtures ──────────────────────────────────────────────────────

/**
 * A representative KYC field map with both public and private fields.
 */
const FULL_FIELDS: KycFieldMap = {
  kycLevel: "2",
  jurisdiction: "US",
  entityType: "individual",
  attestingInstitution: "acme-bank-001",
  fullName: "Alice Nakamoto",
  dateOfBirth: "1990-01-15",
  nationality: "US",
  governmentIdType: "passport",
  governmentIdHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  addressLine1: "123 Blockchain Ave",
  addressCity: "San Francisco",
  addressCountry: "US",
};

/**
 * A minimal field map (two fields).
 */
const MINIMAL_FIELDS: KycFieldMap = {
  kycLevel: "1",
  jurisdiction: "GB",
};

/**
 * A field map with three fields (odd count, tests promotion).
 */
const ODD_FIELDS: KycFieldMap = {
  kycLevel: "3",
  jurisdiction: "DE",
  entityType: "corporate",
};

// ─── Tree Construction ─────────────────────────────────────────────

describe("buildKycMerkleTree", () => {
  it("builds a tree from a full set of KYC fields", () => {
    const tree = buildKycMerkleTree(FULL_FIELDS);
    expect(tree.root).toBeDefined();
    expect(tree.root.hash).toBeInstanceOf(Buffer);
    expect(tree.root.hash.length).toBe(32);
    expect(tree.leaves.length).toBe(Object.keys(FULL_FIELDS).length);
  });

  it("builds a tree from a minimal field set", () => {
    const tree = buildKycMerkleTree(MINIMAL_FIELDS);
    expect(tree.leaves.length).toBe(2);
    expect(tree.root.hash.length).toBe(32);
  });

  it("handles odd number of leaves via promotion", () => {
    const tree = buildKycMerkleTree(ODD_FIELDS);
    expect(tree.leaves.length).toBe(3);
    expect(tree.root.hash.length).toBe(32);
  });

  it("sorts leaves lexicographically by field name", () => {
    const tree = buildKycMerkleTree(FULL_FIELDS);
    const leafNames = tree.leaves.map((l) => l.fieldName);
    const sorted = [...leafNames].sort();
    expect(leafNames).toEqual(sorted);
  });

  it("throws on an empty field map", () => {
    expect(() => buildKycMerkleTree({})).toThrow("empty field map");
  });

  it("throws on invalid field names", () => {
    expect(() =>
      buildKycMerkleTree({ invalidField: "value" })
    ).toThrow("Unknown KYC field");
  });
});

// ─── Determinism ───────────────────────────────────────────────────

describe("deterministic tree construction", () => {
  it("produces the same root for the same fields regardless of insertion order", () => {
    // Build with fields in one order
    const tree1 = buildKycMerkleTree({
      fullName: "Alice",
      kycLevel: "2",
      jurisdiction: "US",
    });

    // Build with fields in a different order
    const tree2 = buildKycMerkleTree({
      jurisdiction: "US",
      fullName: "Alice",
      kycLevel: "2",
    });

    expect(getMerkleRoot(tree1).equals(getMerkleRoot(tree2))).toBe(true);
  });

  it("produces different roots for different field values", () => {
    const tree1 = buildKycMerkleTree({ kycLevel: "1", jurisdiction: "US" });
    const tree2 = buildKycMerkleTree({ kycLevel: "2", jurisdiction: "US" });
    expect(getMerkleRoot(tree1).equals(getMerkleRoot(tree2))).toBe(false);
  });

  it("produces different roots for different field sets", () => {
    const tree1 = buildKycMerkleTree({ kycLevel: "2", jurisdiction: "US" });
    const tree2 = buildKycMerkleTree({
      kycLevel: "2",
      jurisdiction: "US",
      fullName: "Alice",
    });
    expect(getMerkleRoot(tree1).equals(getMerkleRoot(tree2))).toBe(false);
  });
});

// ─── getMerkleRoot ──────────────────────────────────────────────────

describe("getMerkleRoot", () => {
  it("returns a 32-byte Buffer", () => {
    const tree = buildKycMerkleTree(FULL_FIELDS);
    const root = getMerkleRoot(tree);
    expect(root).toBeInstanceOf(Buffer);
    expect(root.length).toBe(32);
  });

  it("returns a new Buffer each time (not a reference to internal state)", () => {
    const tree = buildKycMerkleTree(FULL_FIELDS);
    const root1 = getMerkleRoot(tree);
    const root2 = getMerkleRoot(tree);
    expect(root1.equals(root2)).toBe(true);
    expect(root1).not.toBe(root2); // different object references
  });
});

// ─── hashLeaf ───────────────────────────────────────────────────────

describe("hashLeaf", () => {
  it("produces a 32-byte hash", () => {
    const h = hashLeaf("kycLevel", "2");
    expect(h).toBeInstanceOf(Buffer);
    expect(h.length).toBe(32);
  });

  it("is deterministic", () => {
    const h1 = hashLeaf("kycLevel", "2");
    const h2 = hashLeaf("kycLevel", "2");
    expect(h1.equals(h2)).toBe(true);
  });

  it("produces different hashes for different field names", () => {
    const h1 = hashLeaf("kycLevel", "2");
    const h2 = hashLeaf("jurisdiction", "2");
    expect(h1.equals(h2)).toBe(false);
  });

  it("produces different hashes for different values", () => {
    const h1 = hashLeaf("kycLevel", "1");
    const h2 = hashLeaf("kycLevel", "2");
    expect(h1.equals(h2)).toBe(false);
  });
});

// ─── Single-Field Proofs ────────────────────────────────────────────

describe("single-field proof", () => {
  it("generates and verifies a proof for one public field", () => {
    const tree = buildKycMerkleTree(FULL_FIELDS);
    const root = getMerkleRoot(tree);
    const proof = generateProof(tree, ["kycLevel"]);

    expect(proof.items.length).toBe(1);
    expect(proof.items[0].fieldName).toBe("kycLevel");
    expect(proof.items[0].fieldValue).toBe("2");

    const valid = verifyProof(root, proof, { kycLevel: "2" });
    expect(valid).toBe(true);
  });

  it("generates and verifies a proof for one private field", () => {
    const tree = buildKycMerkleTree(FULL_FIELDS);
    const root = getMerkleRoot(tree);
    const proof = generateProof(tree, ["fullName"]);

    expect(proof.items.length).toBe(1);
    expect(proof.items[0].fieldValue).toBe("Alice Nakamoto");

    const valid = verifyProof(root, proof, { fullName: "Alice Nakamoto" });
    expect(valid).toBe(true);
  });

  it("works for a two-leaf tree", () => {
    const tree = buildKycMerkleTree(MINIMAL_FIELDS);
    const root = getMerkleRoot(tree);

    const proof1 = generateProof(tree, ["kycLevel"]);
    expect(verifyProof(root, proof1, { kycLevel: "1" })).toBe(true);

    const proof2 = generateProof(tree, ["jurisdiction"]);
    expect(verifyProof(root, proof2, { jurisdiction: "GB" })).toBe(true);
  });

  it("works for an odd-count tree", () => {
    const tree = buildKycMerkleTree(ODD_FIELDS);
    const root = getMerkleRoot(tree);

    // Verify each field individually
    for (const [name, value] of Object.entries(ODD_FIELDS)) {
      const proof = generateProof(tree, [name]);
      expect(verifyProof(root, proof, { [name]: value })).toBe(true);
    }
  });
});

// ─── Multi-Field Proofs ─────────────────────────────────────────────

describe("multi-field proof", () => {
  it("generates and verifies a proof for multiple fields", () => {
    const tree = buildKycMerkleTree(FULL_FIELDS);
    const root = getMerkleRoot(tree);
    const disclosed = ["kycLevel", "jurisdiction", "entityType"];
    const proof = generateProof(tree, disclosed);

    expect(proof.items.length).toBe(3);

    const fields: KycFieldMap = {
      kycLevel: "2",
      jurisdiction: "US",
      entityType: "individual",
    };
    expect(verifyProof(root, proof, fields)).toBe(true);
  });

  it("generates and verifies proof for a mix of public and private fields", () => {
    const tree = buildKycMerkleTree(FULL_FIELDS);
    const root = getMerkleRoot(tree);
    const proof = generateProof(tree, ["kycLevel", "fullName", "nationality"]);

    const fields: KycFieldMap = {
      kycLevel: "2",
      fullName: "Alice Nakamoto",
      nationality: "US",
    };
    expect(verifyProof(root, proof, fields)).toBe(true);
  });
});

// ─── All-Fields Proof ───────────────────────────────────────────────

describe("all-fields proof", () => {
  it("generates and verifies a proof disclosing every field", () => {
    const tree = buildKycMerkleTree(FULL_FIELDS);
    const root = getMerkleRoot(tree);
    const allNames = Object.keys(FULL_FIELDS);
    const proof = generateProof(tree, allNames);

    expect(proof.items.length).toBe(allNames.length);
    expect(verifyProof(root, proof, FULL_FIELDS)).toBe(true);
  });
});

// ─── Tampered Proofs ────────────────────────────────────────────────

describe("tampered proof rejection", () => {
  it("rejects a proof with a tampered field value", () => {
    const tree = buildKycMerkleTree(FULL_FIELDS);
    const root = getMerkleRoot(tree);
    const proof = generateProof(tree, ["kycLevel"]);

    // Verify with the wrong value
    const valid = verifyProof(root, proof, { kycLevel: "3" });
    expect(valid).toBe(false);
  });

  it("rejects a proof verified against a different root", () => {
    const tree1 = buildKycMerkleTree(FULL_FIELDS);
    const tree2 = buildKycMerkleTree({ ...FULL_FIELDS, kycLevel: "0" });
    const wrongRoot = getMerkleRoot(tree2);
    const proof = generateProof(tree1, ["kycLevel"]);

    const valid = verifyProof(wrongRoot, proof, { kycLevel: "2" });
    expect(valid).toBe(false);
  });

  it("rejects a proof with a tampered sibling hash", () => {
    const tree = buildKycMerkleTree(FULL_FIELDS);
    const root = getMerkleRoot(tree);
    const proof = generateProof(tree, ["kycLevel"]);

    // Tamper with a sibling hash
    const tamperedProof = structuredClone(proof) as typeof proof;
    if (tamperedProof.items[0].siblings.length > 0) {
      const sibling = tamperedProof.items[0].siblings[0];
      // Flip a byte
      sibling.hash = Buffer.from(sibling.hash);
      sibling.hash[0] ^= 0xff;
    }

    const valid = verifyProof(root, tamperedProof, { kycLevel: "2" });
    expect(valid).toBe(false);
  });

  it("rejects a proof with a tampered leaf hash", () => {
    const tree = buildKycMerkleTree(FULL_FIELDS);
    const root = getMerkleRoot(tree);
    const proof = generateProof(tree, ["kycLevel"]);

    // Tamper with the leaf hash (the verifier recomputes, so mismatch is caught)
    const tamperedProof = structuredClone(proof) as typeof proof;
    tamperedProof.items[0].leafHash = Buffer.from(tamperedProof.items[0].leafHash);
    tamperedProof.items[0].leafHash[0] ^= 0xff;

    const valid = verifyProof(root, tamperedProof, { kycLevel: "2" });
    expect(valid).toBe(false);
  });

  it("rejects when disclosed fields are missing from the verification call", () => {
    const tree = buildKycMerkleTree(FULL_FIELDS);
    const root = getMerkleRoot(tree);
    const proof = generateProof(tree, ["kycLevel", "jurisdiction"]);

    // Only provide one of the two required fields
    const valid = verifyProof(root, proof, { kycLevel: "2" });
    expect(valid).toBe(false);
  });

  it("rejects an empty proof", () => {
    const tree = buildKycMerkleTree(FULL_FIELDS);
    const root = getMerkleRoot(tree);
    const emptyProof = { root, items: [] };

    const valid = verifyProof(root, emptyProof, {});
    expect(valid).toBe(false);
  });
});

// ─── Error Cases ────────────────────────────────────────────────────

describe("proof generation error cases", () => {
  it("throws when requesting a field not in the tree", () => {
    const tree = buildKycMerkleTree(MINIMAL_FIELDS);
    expect(() => generateProof(tree, ["fullName"])).toThrow("not present");
  });

  it("throws when no field names are provided", () => {
    const tree = buildKycMerkleTree(MINIMAL_FIELDS);
    expect(() => generateProof(tree, [])).toThrow("at least one field");
  });
});

// ─── Domain Separation ──────────────────────────────────────────────

describe("domain separation", () => {
  it("leaf hashes differ from raw SHA-256 of the same data", () => {
    const { createHash } = require("crypto");
    const data = "kycLevel:2";
    const rawHash = createHash("sha256").update(data).digest();
    const leafHash = hashLeaf("kycLevel", "2");

    // Due to the 0x00 prefix, these must differ
    expect(rawHash.equals(leafHash)).toBe(false);
  });
});

// ─── Serialization Round-Trip ────────────────────────────────────────

describe("proof serialization round-trip", () => {
  it("proof survives JSON serialization and deserialization via hex encoding", () => {
    const tree = buildKycMerkleTree(FULL_FIELDS);
    const root = getMerkleRoot(tree);
    const proof = generateProof(tree, ["kycLevel", "jurisdiction"]);

    // Serialize to JSON-safe format (hex-encode Buffers)
    const serialized = {
      root: proof.root.toString("hex"),
      items: proof.items.map((item) => ({
        fieldName: item.fieldName,
        fieldValue: item.fieldValue,
        leafHash: item.leafHash.toString("hex"),
        siblings: item.siblings.map((s) => ({
          hash: s.hash.toString("hex"),
          position: s.position,
        })),
      })),
    };

    const json = JSON.stringify(serialized);
    const parsed = JSON.parse(json);

    // Deserialize back to Buffers
    const deserialized = {
      root: Buffer.from(parsed.root, "hex"),
      items: parsed.items.map((item: any) => ({
        fieldName: item.fieldName,
        fieldValue: item.fieldValue,
        leafHash: Buffer.from(item.leafHash, "hex"),
        siblings: item.siblings.map((s: any) => ({
          hash: Buffer.from(s.hash, "hex"),
          position: s.position,
        })),
      })),
    };

    // Verify the deserialized proof works
    const valid = verifyProof(root, deserialized, {
      kycLevel: "2",
      jurisdiction: "US",
    });
    expect(valid).toBe(true);
  });
});

// ─── Single-Leaf Tree ───────────────────────────────────────────────

describe("single-leaf tree", () => {
  it("works correctly with exactly one field", () => {
    const fields: KycFieldMap = { kycLevel: "1" };
    const tree = buildKycMerkleTree(fields);
    const root = getMerkleRoot(tree);

    expect(tree.leaves.length).toBe(1);

    const proof = generateProof(tree, ["kycLevel"]);
    expect(proof.items.length).toBe(1);
    expect(proof.items[0].siblings.length).toBe(0);

    expect(verifyProof(root, proof, { kycLevel: "1" })).toBe(true);
    expect(verifyProof(root, proof, { kycLevel: "2" })).toBe(false);
  });
});

// ─── Power-of-Two and Non-Power-of-Two Leaf Counts ──────────────────

describe("tree shape edge cases", () => {
  it("handles exactly 2 leaves (power of two)", () => {
    const tree = buildKycMerkleTree(MINIMAL_FIELDS);
    const root = getMerkleRoot(tree);

    for (const [name, value] of Object.entries(MINIMAL_FIELDS)) {
      const proof = generateProof(tree, [name]);
      expect(verifyProof(root, proof, { [name]: value })).toBe(true);
    }
  });

  it("handles 4 leaves (power of two)", () => {
    const fields: KycFieldMap = {
      kycLevel: "2",
      jurisdiction: "US",
      entityType: "individual",
      attestingInstitution: "bank-001",
    };
    const tree = buildKycMerkleTree(fields);
    const root = getMerkleRoot(tree);

    for (const [name, value] of Object.entries(fields)) {
      const proof = generateProof(tree, [name]);
      expect(verifyProof(root, proof, { [name]: value })).toBe(true);
    }
  });

  it("handles 5 leaves (non-power of two)", () => {
    const fields: KycFieldMap = {
      kycLevel: "2",
      jurisdiction: "US",
      entityType: "individual",
      attestingInstitution: "bank-001",
      fullName: "Bob",
    };
    const tree = buildKycMerkleTree(fields);
    const root = getMerkleRoot(tree);

    for (const [name, value] of Object.entries(fields)) {
      const proof = generateProof(tree, [name]);
      expect(verifyProof(root, proof, { [name]: value })).toBe(true);
    }
  });

  it("handles 7 leaves (non-power of two)", () => {
    const fields: KycFieldMap = {
      kycLevel: "2",
      jurisdiction: "US",
      entityType: "individual",
      attestingInstitution: "bank-001",
      fullName: "Carol",
      dateOfBirth: "1985-03-22",
      nationality: "CA",
    };
    const tree = buildKycMerkleTree(fields);
    const root = getMerkleRoot(tree);

    for (const [name, value] of Object.entries(fields)) {
      const proof = generateProof(tree, [name]);
      expect(verifyProof(root, proof, { [name]: value })).toBe(true);
    }
  });
});
