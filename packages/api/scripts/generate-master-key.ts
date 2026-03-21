#!/usr/bin/env node
/**
 * Generate a cryptographically random 32-byte master encryption key for PayClear.
 *
 * Usage:
 *   npx tsx scripts/generate-master-key.ts
 *
 * The output is a 64-character hex string suitable for the PAYCLEAR_MASTER_KEY
 * environment variable.
 */

import { randomBytes } from "crypto";

const key = randomBytes(32).toString("hex");

console.log("=".repeat(72));
console.log("  PayClear Master Encryption Key Generator");
console.log("=".repeat(72));
console.log("");
console.log("  Generated key (hex-encoded, 32 bytes / 256 bits):");
console.log("");
console.log(`  ${key}`);
console.log("");
console.log("  Add to your .env file:");
console.log("");
console.log(`  PAYCLEAR_MASTER_KEY=${key}`);
console.log("");
console.log("  IMPORTANT:");
console.log("  - Store this key securely (e.g., AWS Secrets Manager, Vault, 1Password)");
console.log("  - Back it up in at least two separate secure locations");
console.log("  - Loss of this key means permanent loss of all encrypted PII data");
console.log("  - Never commit this key to version control");
console.log("  - Rotate by re-encrypting all DEKs with the new master key");
console.log("");
console.log("=".repeat(72));
