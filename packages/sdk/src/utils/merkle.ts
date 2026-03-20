/**
 * Merkle Tree for KYC Selective Disclosure.
 *
 * Implements a binary SHA-256 Merkle tree with domain separation:
 *   - Leaf nodes are prefixed with `0x00` before hashing.
 *   - Internal nodes are prefixed with `0x01` before hashing.
 *
 * This separation prevents second-preimage attacks where an internal node
 * could be reinterpreted as a leaf (or vice versa).
 *
 * Tree construction is deterministic: leaves are always sorted lexicographically
 * by field name before building the tree. Given the same field map, the same root
 * is produced every time.
 *
 * @module merkle
 */

import { createHash } from "crypto";
import { validateFieldNames } from "./kyc-fields.js";

// ─── Constants ────────────────────────────────────────────────────

/** Domain separation prefix for leaf nodes. */
const LEAF_PREFIX = Buffer.from([0x00]);

/** Domain separation prefix for internal nodes. */
const INTERNAL_PREFIX = Buffer.from([0x01]);

// ─── Types ────────────────────────────────────────────────────────

/**
 * A map of KYC field names to their string values.
 * Keys must be valid canonical field names from the KYC field schema.
 */
export type KycFieldMap = Record<string, string>;

/**
 * A single node in the Merkle tree.
 *
 * Leaf nodes carry their associated field name and the pre-image data.
 * Internal nodes are computed from their children and have no field name.
 */
export interface MerkleNode {
  /** The SHA-256 hash of this node (with domain-separated prefix). */
  hash: Buffer;
  /** For leaf nodes: the canonical field name. Undefined for internal nodes. */
  fieldName?: string;
  /** Left child (undefined for leaves). */
  left?: MerkleNode;
  /** Right child (undefined for leaves). */
  right?: MerkleNode;
}

/**
 * A complete Merkle tree built from KYC fields.
 */
export interface MerkleTree {
  /** The root node of the tree. */
  root: MerkleNode;
  /** Ordered leaf nodes (sorted by field name). */
  leaves: MerkleNode[];
  /** The original field map used to build the tree. */
  fieldMap: KycFieldMap;
}

/**
 * A sibling entry in a Merkle proof path.
 */
export interface ProofSibling {
  /** The hash of the sibling node. */
  hash: Buffer;
  /** Which side this sibling sits on relative to the path node. */
  position: "left" | "right";
}

/**
 * A Merkle inclusion proof for one or more disclosed fields.
 *
 * For single-field proofs, `items` contains one entry.
 * For multi-field proofs, each disclosed field has its own path from leaf to root.
 * A verifier checks each path independently and confirms they all resolve to
 * the same root.
 */
export interface MerkleProof {
  /** The Merkle root this proof is anchored to. */
  root: Buffer;
  /** Individual inclusion proofs, one per disclosed field. */
  items: MerkleProofItem[];
}

/**
 * An inclusion proof for a single field.
 */
export interface MerkleProofItem {
  /** The canonical field name being disclosed. */
  fieldName: string;
  /** The disclosed field value. */
  fieldValue: string;
  /** The leaf hash (so the verifier can recompute and compare). */
  leafHash: Buffer;
  /** The path of siblings from leaf to root. */
  siblings: ProofSibling[];
}

// ─── Hashing Helpers ──────────────────────────────────────────────

/**
 * Compute the domain-separated hash of a leaf node.
 *
 * `H_leaf = SHA256(0x00 || field_name || ":" || field_value)`
 */
export function hashLeaf(fieldName: string, fieldValue: string): Buffer {
  const data = Buffer.from(`${fieldName}:${fieldValue}`);
  return createHash("sha256")
    .update(Buffer.concat([LEAF_PREFIX, data]))
    .digest();
}

/**
 * Compute the domain-separated hash of an internal node.
 *
 * `H_internal = SHA256(0x01 || left_hash || right_hash)`
 */
function hashInternal(left: Buffer, right: Buffer): Buffer {
  return createHash("sha256")
    .update(Buffer.concat([INTERNAL_PREFIX, left, right]))
    .digest();
}

// ─── Tree Construction ────────────────────────────────────────────

/**
 * Build a binary Merkle tree from a KYC field map.
 *
 * Leaves are ordered lexicographically by field name. If the number of leaves
 * is not a power of two, the last leaf at each level is promoted (carried up)
 * without a sibling — this is the standard "odd node promotion" approach used
 * by Bitcoin and most Merkle tree implementations.
 *
 * @param fields - A map of field names to their string values.
 * @returns A complete `MerkleTree` ready for proof generation.
 * @throws If `fields` is empty or contains invalid field names.
 */
export function buildKycMerkleTree(fields: KycFieldMap): MerkleTree {
  const sortedNames = Object.keys(fields).sort();

  if (sortedNames.length === 0) {
    throw new Error("Cannot build a Merkle tree from an empty field map.");
  }

  validateFieldNames(sortedNames);

  // Build leaf nodes
  const leaves: MerkleNode[] = sortedNames.map((name) => ({
    hash: hashLeaf(name, fields[name]),
    fieldName: name,
  }));

  // Build tree bottom-up
  let currentLevel: MerkleNode[] = leaves;

  while (currentLevel.length > 1) {
    const nextLevel: MerkleNode[] = [];

    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];

      if (i + 1 < currentLevel.length) {
        // Pair exists: combine left and right
        const right = currentLevel[i + 1];
        const parent: MerkleNode = {
          hash: hashInternal(left.hash, right.hash),
          left,
          right,
        };
        nextLevel.push(parent);
      } else {
        // Odd node out: promote it to the next level.
        // We still wrap it in an internal hash so that every non-leaf node
        // uses the internal-node domain. This prevents ambiguity when the
        // tree has an odd number of nodes at any level.
        const promoted: MerkleNode = {
          hash: hashInternal(left.hash, left.hash),
          left,
          right: left,
        };
        nextLevel.push(promoted);
      }
    }

    currentLevel = nextLevel;
  }

  return {
    root: currentLevel[0],
    leaves,
    fieldMap: { ...fields },
  };
}

/**
 * Get the 32-byte Merkle root hash from a tree.
 */
export function getMerkleRoot(tree: MerkleTree): Buffer {
  return Buffer.from(tree.root.hash);
}

// ─── Proof Generation ─────────────────────────────────────────────

/**
 * Collect the sibling path for a single leaf index.
 *
 * Walks from the leaf level up to the root, recording the sibling hash and
 * its position at each level.
 */
function collectSiblings(
  tree: MerkleTree,
  leafIndex: number
): ProofSibling[] {
  const siblings: ProofSibling[] = [];
  const leaves = tree.leaves;

  // Rebuild levels to trace the path (same logic as buildKycMerkleTree)
  let currentLevel: Buffer[] = leaves.map((l) => l.hash);
  let idx = leafIndex;

  while (currentLevel.length > 1) {
    const nextLevel: Buffer[] = [];

    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        nextLevel.push(hashInternal(currentLevel[i], currentLevel[i + 1]));
      } else {
        // Odd promotion: duplicate the last node
        nextLevel.push(hashInternal(currentLevel[i], currentLevel[i]));
      }
    }

    // Determine sibling for the node at `idx`
    const isLeft = idx % 2 === 0;
    const siblingIdx = isLeft ? idx + 1 : idx - 1;

    if (siblingIdx < currentLevel.length) {
      siblings.push({
        hash: Buffer.from(currentLevel[siblingIdx]),
        position: isLeft ? "right" : "left",
      });
    } else {
      // Odd promotion case: sibling is itself (duplicate)
      siblings.push({
        hash: Buffer.from(currentLevel[idx]),
        position: "right",
      });
    }

    // Move up: parent index is floor(idx / 2)
    idx = Math.floor(idx / 2);
    currentLevel = nextLevel;
  }

  return siblings;
}

/**
 * Generate a Merkle inclusion proof for one or more disclosed fields.
 *
 * @param tree - The Merkle tree to generate proofs from.
 * @param fieldNames - The field names to disclose. Each must exist in the tree.
 * @returns A `MerkleProof` that a verifier can use to confirm inclusion.
 * @throws If any requested field is not present in the tree.
 */
export function generateProof(
  tree: MerkleTree,
  fieldNames: string[]
): MerkleProof {
  if (fieldNames.length === 0) {
    throw new Error("Must disclose at least one field.");
  }

  const items: MerkleProofItem[] = fieldNames.map((name) => {
    const leafIndex = tree.leaves.findIndex((l) => l.fieldName === name);
    if (leafIndex === -1) {
      throw new Error(
        `Field "${name}" is not present in the Merkle tree. ` +
          `Available fields: ${tree.leaves.map((l) => l.fieldName).join(", ")}`
      );
    }

    const leaf = tree.leaves[leafIndex];
    const siblings = collectSiblings(tree, leafIndex);

    return {
      fieldName: name,
      fieldValue: tree.fieldMap[name],
      leafHash: Buffer.from(leaf.hash),
      siblings,
    };
  });

  return {
    root: getMerkleRoot(tree),
    items,
  };
}

// ─── Proof Verification ──────────────────────────────────────────

/**
 * Verify a Merkle selective disclosure proof.
 *
 * For each disclosed field, the verifier:
 *   1. Recomputes the leaf hash from the field name and value.
 *   2. Walks the sibling path up to the root.
 *   3. Confirms the computed root matches the expected root.
 *
 * All items must resolve to the same root for the proof to be valid.
 *
 * @param root - The expected 32-byte Merkle root (from on-chain attestation).
 * @param proof - The proof containing one or more disclosed fields with paths.
 * @param fields - The disclosed field name-value pairs to verify.
 * @returns `true` if every disclosed field is proven to be part of the tree.
 */
export function verifyProof(
  root: Buffer,
  proof: MerkleProof,
  fields: KycFieldMap
): boolean {
  if (proof.items.length === 0) {
    return false;
  }

  for (const item of proof.items) {
    // The verifier must have the field in the disclosed set
    const value = fields[item.fieldName];
    if (value === undefined) {
      return false;
    }

    // Recompute leaf hash from disclosed data
    const recomputedLeaf = hashLeaf(item.fieldName, value);

    // Verify the recomputed leaf matches the proof's leaf hash
    if (!recomputedLeaf.equals(item.leafHash)) {
      return false;
    }

    // Walk the sibling path to the root
    let currentHash = recomputedLeaf;

    for (const sibling of item.siblings) {
      if (sibling.position === "left") {
        currentHash = hashInternal(sibling.hash, currentHash);
      } else {
        currentHash = hashInternal(currentHash, sibling.hash);
      }
    }

    // Computed root must match expected root
    if (!currentHash.equals(root)) {
      return false;
    }
  }

  return true;
}
