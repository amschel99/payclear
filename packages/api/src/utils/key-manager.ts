/**
 * Key Manager — manages the lifecycle of institution Data Encryption Keys (DEKs).
 *
 * Responsibilities:
 * - Loads the Master Encryption Key (MEK) from environment on startup
 * - Generates, wraps, and stores per-institution DEKs
 * - Caches unwrapped DEKs in memory with a configurable TTL
 * - Clears cached keys on TTL expiry to limit exposure window
 *
 * Security notes:
 * - DEKs are only held in memory for the TTL duration (default 5 min)
 * - The MEK never leaves this module
 * - No key material is logged or included in error messages
 */

import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { institutions } from "../db/schema.js";
import {
  generateDek,
  wrapKey,
  unwrapKey,
  parseMasterKey,
} from "./encryption.js";

// ─── Types ───────────────────────────────────────────────────

interface CachedKey {
  dek: Buffer;
  timer: ReturnType<typeof setTimeout>;
}

// ─── KeyManager ──────────────────────────────────────────────

export class KeyManager {
  private masterKey: Buffer | null = null;
  private cache: Map<string, CachedKey> = new Map();
  private cacheTtlMs: number;

  /**
   * @param cacheTtlMs - TTL for cached DEKs in milliseconds (default: 5 minutes)
   */
  constructor(cacheTtlMs: number = 5 * 60 * 1000) {
    this.cacheTtlMs = cacheTtlMs;
  }

  /**
   * Initialize the KeyManager by loading the master key from environment.
   * Must be called before any encryption operations.
   * Throws if PAYCLEAR_MASTER_KEY is missing or invalid.
   */
  initialize(): void {
    const hexKey = process.env.PAYCLEAR_MASTER_KEY;
    if (!hexKey) {
      throw new Error(
        "PAYCLEAR_MASTER_KEY environment variable is required. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
    }

    this.masterKey = parseMasterKey(hexKey);
  }

  /**
   * Check if the KeyManager has been initialized with a master key.
   */
  isInitialized(): boolean {
    return this.masterKey !== null;
  }

  /**
   * Ensure the master key is loaded. Throws a generic error if not.
   */
  private requireMasterKey(): Buffer {
    if (!this.masterKey) {
      throw new Error("KeyManager not initialized");
    }
    return this.masterKey;
  }

  /**
   * Get the unwrapped DEK for an institution.
   * Checks the in-memory cache first; on miss, fetches the wrapped DEK from
   * the database, unwraps it, and caches the result.
   *
   * @param institutionId - The UUID of the institution
   * @returns The unwrapped DEK buffer
   */
  async getDek(institutionId: string): Promise<Buffer> {
    const masterKey = this.requireMasterKey();

    // Check cache
    const cached = this.cache.get(institutionId);
    if (cached) {
      return cached.dek;
    }

    // Fetch wrapped DEK from database
    const [institution] = await db
      .select({ encryptedDek: institutions.encryptedDek })
      .from(institutions)
      .where(eq(institutions.id, institutionId));

    if (!institution || !institution.encryptedDek) {
      throw new Error("Encryption key not found for institution");
    }

    // Unwrap and cache
    const dek = unwrapKey(institution.encryptedDek, masterKey);
    this.cacheKey(institutionId, dek);

    return dek;
  }

  /**
   * Generate a new DEK for an institution, wrap it with the MEK, and store
   * the wrapped key in the database.
   *
   * @param institutionId - The UUID of the institution
   * @returns The unwrapped DEK buffer (for immediate use after institution creation)
   */
  async createInstitutionKey(institutionId: string): Promise<Buffer> {
    const masterKey = this.requireMasterKey();

    const dek = generateDek();
    const wrappedDek = wrapKey(dek, masterKey);

    // Store the wrapped DEK in the institution record
    await db
      .update(institutions)
      .set({ encryptedDek: wrappedDek })
      .where(eq(institutions.id, institutionId));

    // Cache the unwrapped DEK
    this.cacheKey(institutionId, dek);

    return dek;
  }

  /**
   * Cache an unwrapped DEK with TTL-based expiry.
   */
  private cacheKey(institutionId: string, dek: Buffer): void {
    // Clear existing cache entry if present
    this.evict(institutionId);

    const timer = setTimeout(() => {
      this.evict(institutionId);
    }, this.cacheTtlMs);

    // Unref the timer so it doesn't prevent process exit
    if (timer.unref) {
      timer.unref();
    }

    this.cache.set(institutionId, { dek, timer });
  }

  /**
   * Evict a DEK from the cache and zero the buffer.
   */
  private evict(institutionId: string): void {
    const cached = this.cache.get(institutionId);
    if (cached) {
      clearTimeout(cached.timer);
      // Zero out the key material in memory
      cached.dek.fill(0);
      this.cache.delete(institutionId);
    }
  }

  /**
   * Clear all cached DEKs. Used during shutdown or key rotation.
   */
  clearCache(): void {
    for (const [institutionId] of this.cache) {
      this.evict(institutionId);
    }
  }

  /**
   * Shut down the KeyManager, clearing all cached keys and the master key.
   */
  destroy(): void {
    this.clearCache();
    if (this.masterKey) {
      this.masterKey.fill(0);
      this.masterKey = null;
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────

export const keyManager = new KeyManager();
