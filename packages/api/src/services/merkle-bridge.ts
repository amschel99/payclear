/**
 * Merkle tree bridge for the API service layer.
 *
 * This module implements the same Merkle tree construction and proof
 * generation logic used by @payclear/sdk. It exists here so the API
 * package does not need a direct dependency on the SDK — both packages
 * use identical cryptographic primitives and produce interoperable proofs.
 *
 * The canonical implementation lives in packages/sdk/src/utils/merkle.ts.
 * Any changes to the algorithm there must be mirrored here (and vice versa)
 * to maintain proof compatibility.
 *
 * @module merkle-bridge
 */

import { createHash } from "crypto";

// ─── Constants ────────────────────────────────────────────────────

const LEAF_PREFIX = Buffer.from([0x00]);
const INTERNAL_PREFIX = Buffer.from([0x01]);

// ─── Canonical KYC field names (must match sdk/src/utils/kyc-fields.ts) ─────

const VALID_KYC_FIELD_NAMES = new Set([
  "addressCity",
  "addressCountry",
  "addressLine1",
  "attestingInstitution",
  "dateOfBirth",
  "entityType",
  "fullName",
  "governmentIdHash",
  "governmentIdType",
  "jurisdiction",
  "kycLevel",
  "nationality",
]);

// ─── Types ────────────────────────────────────────────────────────

export type KycFieldMap = Record<string, string>;

export interface MerkleNode {
  hash: Buffer;
  fieldName?: string;
  left?: MerkleNode;
  right?: MerkleNode;
}

export interface MerkleTree {
  root: MerkleNode;
  leaves: MerkleNode[];
  fieldMap: KycFieldMap;
}

export interface ProofSibling {
  hash: Buffer;
  position: "left" | "right";
}

export interface MerkleProofItem {
  fieldName: string;
  fieldValue: string;
  leafHash: Buffer;
  siblings: ProofSibling[];
}

export interface MerkleProof {
  root: Buffer;
  items: MerkleProofItem[];
}

// ─── Hashing ──────────────────────────────────────────────────────

export function hashLeaf(fieldName: string, fieldValue: string): Buffer {
  const data = Buffer.from(`${fieldName}:${fieldValue}`);
  return createHash("sha256")
    .update(Buffer.concat([LEAF_PREFIX, data]))
    .digest();
}

function hashInternal(left: Buffer, right: Buffer): Buffer {
  return createHash("sha256")
    .update(Buffer.concat([INTERNAL_PREFIX, left, right]))
    .digest();
}

// ─── Tree Construction ────────────────────────────────────────────

function validateFieldNames(names: string[]): void {
  for (const name of names) {
    if (!VALID_KYC_FIELD_NAMES.has(name)) {
      throw new Error(
        `Unknown KYC field "${name}". Valid fields: ${[...VALID_KYC_FIELD_NAMES].join(", ")}`
      );
    }
  }
}

export function buildKycMerkleTree(fields: KycFieldMap): MerkleTree {
  const sortedNames = Object.keys(fields).sort();

  if (sortedNames.length === 0) {
    throw new Error("Cannot build a Merkle tree from an empty field map.");
  }

  validateFieldNames(sortedNames);

  const leaves: MerkleNode[] = sortedNames.map((name) => ({
    hash: hashLeaf(name, fields[name]),
    fieldName: name,
  }));

  let currentLevel: MerkleNode[] = leaves;

  while (currentLevel.length > 1) {
    const nextLevel: MerkleNode[] = [];

    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];

      if (i + 1 < currentLevel.length) {
        const right = currentLevel[i + 1];
        nextLevel.push({
          hash: hashInternal(left.hash, right.hash),
          left,
          right,
        });
      } else {
        nextLevel.push({
          hash: hashInternal(left.hash, left.hash),
          left,
          right: left,
        });
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

export function getMerkleRoot(tree: MerkleTree): Buffer {
  return Buffer.from(tree.root.hash);
}

// ─── Proof Generation ─────────────────────────────────────────────

function collectSiblings(
  tree: MerkleTree,
  leafIndex: number
): ProofSibling[] {
  const siblings: ProofSibling[] = [];
  let currentLevel: Buffer[] = tree.leaves.map((l) => l.hash);
  let idx = leafIndex;

  while (currentLevel.length > 1) {
    const nextLevel: Buffer[] = [];

    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        nextLevel.push(hashInternal(currentLevel[i], currentLevel[i + 1]));
      } else {
        nextLevel.push(hashInternal(currentLevel[i], currentLevel[i]));
      }
    }

    const isLeft = idx % 2 === 0;
    const siblingIdx = isLeft ? idx + 1 : idx - 1;

    if (siblingIdx < currentLevel.length) {
      siblings.push({
        hash: Buffer.from(currentLevel[siblingIdx]),
        position: isLeft ? "right" : "left",
      });
    } else {
      siblings.push({
        hash: Buffer.from(currentLevel[idx]),
        position: "right",
      });
    }

    idx = Math.floor(idx / 2);
    currentLevel = nextLevel;
  }

  return siblings;
}

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
