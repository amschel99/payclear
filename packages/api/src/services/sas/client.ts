import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

// ─── PayClear KYC Attestation Schema ──────────────────────────

export interface KycAttestationData {
  /** PayClear KYC level (0-3) */
  kycLevel: number;
  /** Risk score (0-100) */
  riskScore: number;
  /** KYC provider identifier */
  kycProvider: "sumsub" | "self";
  /** Sumsub applicant / verification ID */
  verificationId: string;
  /** Jurisdiction (ISO 3166-1 alpha-2) */
  jurisdiction: string;
  /** Unix timestamp when this attestation expires */
  expiresAt: number;
}

export interface SasAttestation {
  /** On-chain address of the attestation account */
  address: string;
  /** Schema UID used */
  schemaUid: string;
  /** Wallet the attestation is about */
  wallet: string;
  /** Attester (institution authority) */
  attester: string;
  /** Attestation data */
  data: KycAttestationData;
  /** Whether the attestation has been revoked */
  revoked: boolean;
  /** Creation timestamp */
  createdAt: number;
}

// ─── SAS Program Seeds & Helpers ──────────────────────────────

const SAS_SCHEMA_SEED = Buffer.from("sas_schema");
const SAS_ATTESTATION_SEED = Buffer.from("sas_attestation");

function deriveSchemaAddress(
  schemaUid: Buffer,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SAS_SCHEMA_SEED, schemaUid],
    programId,
  );
}

function deriveAttestationAddress(
  schemaAddress: PublicKey,
  wallet: PublicKey,
  attester: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SAS_ATTESTATION_SEED, schemaAddress.toBuffer(), wallet.toBuffer(), attester.toBuffer()],
    programId,
  );
}

// ─── Serialization ──────────────────────────────────────────

function serializeAttestationData(data: KycAttestationData): Buffer {
  // Borsh-compatible manual serialization:
  //   kycLevel: u8
  //   riskScore: u8
  //   kycProvider: string (4-byte len + utf8)
  //   verificationId: string (4-byte len + utf8)
  //   jurisdiction: string (4-byte len + utf8)
  //   expiresAt: i64 (8 bytes LE)

  const kycProviderBuf = Buffer.from(data.kycProvider, "utf8");
  const verificationIdBuf = Buffer.from(data.verificationId, "utf8");
  const jurisdictionBuf = Buffer.from(data.jurisdiction, "utf8");

  const totalLen =
    1 + // kycLevel
    1 + // riskScore
    4 + kycProviderBuf.length +
    4 + verificationIdBuf.length +
    4 + jurisdictionBuf.length +
    8; // expiresAt

  const buf = Buffer.alloc(totalLen);
  let offset = 0;

  buf.writeUInt8(data.kycLevel, offset);
  offset += 1;

  buf.writeUInt8(data.riskScore, offset);
  offset += 1;

  buf.writeUInt32LE(kycProviderBuf.length, offset);
  offset += 4;
  kycProviderBuf.copy(buf, offset);
  offset += kycProviderBuf.length;

  buf.writeUInt32LE(verificationIdBuf.length, offset);
  offset += 4;
  verificationIdBuf.copy(buf, offset);
  offset += verificationIdBuf.length;

  buf.writeUInt32LE(jurisdictionBuf.length, offset);
  offset += 4;
  jurisdictionBuf.copy(buf, offset);
  offset += jurisdictionBuf.length;

  buf.writeBigInt64LE(BigInt(data.expiresAt), offset);

  return buf;
}

// ─── SAS Client ──────────────────────────────────────────────

export class SasClient {
  private readonly connection: Connection;
  private readonly authority: Keypair;
  private readonly programId: PublicKey;

  /** PayClear KYC schema UID (deterministic from schema definition) */
  readonly schemaUid: Buffer;

  constructor(
    connection: Connection,
    authority: Keypair,
    programId: string | PublicKey,
  ) {
    this.connection = connection;
    this.authority = authority;
    this.programId = typeof programId === "string" ? new PublicKey(programId) : programId;

    // Deterministic schema UID derived from the canonical schema definition
    this.schemaUid = Buffer.from(
      "payclear_kyc_v1_kycLevel_u8_riskScore_u8_kycProvider_string_verificationId_string_jurisdiction_string_expiresAt_i64",
    ).subarray(0, 32);
  }

  /**
   * Create an SAS attestation for a verified wallet.
   */
  async createAttestation(
    wallet: PublicKey,
    data: KycAttestationData,
  ): Promise<string> {
    const [schemaAddress] = deriveSchemaAddress(this.schemaUid, this.programId);
    const [attestationAddress] = deriveAttestationAddress(
      schemaAddress,
      wallet,
      this.authority.publicKey,
      this.programId,
    );

    const serializedData = serializeAttestationData(data);

    // Build the SAS attest instruction
    // Discriminator: SHA256("global:attest")[0..8]
    const discriminator = Buffer.from([0xf0, 0x56, 0x27, 0x8e, 0x5a, 0x1c, 0x3d, 0x9b]);
    const instructionData = Buffer.concat([discriminator, serializedData]);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: schemaAddress, isSigner: false, isWritable: false },
        { pubkey: attestationAddress, isSigner: false, isWritable: true },
        { pubkey: wallet, isSigner: false, isWritable: false },
        { pubkey: this.authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: instructionData,
    });

    const { blockhash } = await this.connection.getLatestBlockhash();
    const messageV0 = new TransactionMessage({
      payerKey: this.authority.publicKey,
      recentBlockhash: blockhash,
      instructions: [instruction],
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([this.authority]);

    const signature = await this.connection.sendTransaction(tx);
    await this.connection.confirmTransaction(signature, "confirmed");

    return attestationAddress.toBase58();
  }

  /**
   * Revoke an existing SAS attestation.
   */
  async revokeAttestation(attestationAddress: string): Promise<string> {
    const attestationPubkey = new PublicKey(attestationAddress);

    // Build the SAS revoke instruction
    const discriminator = Buffer.from([0xa1, 0xc2, 0x3e, 0x7f, 0x4b, 0x0d, 0x6a, 0x88]);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: attestationPubkey, isSigner: false, isWritable: true },
        { pubkey: this.authority.publicKey, isSigner: true, isWritable: false },
      ],
      programId: this.programId,
      data: discriminator,
    });

    const { blockhash } = await this.connection.getLatestBlockhash();
    const messageV0 = new TransactionMessage({
      payerKey: this.authority.publicKey,
      recentBlockhash: blockhash,
      instructions: [instruction],
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([this.authority]);

    const signature = await this.connection.sendTransaction(tx);
    await this.connection.confirmTransaction(signature, "confirmed");

    return signature;
  }

  /**
   * Fetch attestation data from an on-chain account.
   */
  async getAttestation(attestationAddress: string): Promise<SasAttestation | null> {
    const pubkey = new PublicKey(attestationAddress);
    const accountInfo = await this.connection.getAccountInfo(pubkey);

    if (!accountInfo || !accountInfo.data) {
      return null;
    }

    // Parse the account data (skip 8-byte discriminator)
    const data = accountInfo.data;
    if (data.length < 8) {
      return null;
    }

    try {
      let offset = 8; // skip discriminator

      // schema (32 bytes)
      const schemaKey = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      // wallet (32 bytes)
      const wallet = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      // attester (32 bytes)
      const attester = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      // revoked (1 byte)
      const revoked = data[offset] === 1;
      offset += 1;

      // createdAt (8 bytes i64 LE)
      const createdAt = Number(data.readBigInt64LE(offset));
      offset += 8;

      // attestation data
      const kycLevel = data.readUInt8(offset);
      offset += 1;

      const riskScore = data.readUInt8(offset);
      offset += 1;

      const kycProviderLen = data.readUInt32LE(offset);
      offset += 4;
      const kycProvider = data.subarray(offset, offset + kycProviderLen).toString("utf8") as "sumsub" | "self";
      offset += kycProviderLen;

      const verificationIdLen = data.readUInt32LE(offset);
      offset += 4;
      const verificationId = data.subarray(offset, offset + verificationIdLen).toString("utf8");
      offset += verificationIdLen;

      const jurisdictionLen = data.readUInt32LE(offset);
      offset += 4;
      const jurisdiction = data.subarray(offset, offset + jurisdictionLen).toString("utf8");
      offset += jurisdictionLen;

      const expiresAt = Number(data.readBigInt64LE(offset));

      return {
        address: attestationAddress,
        schemaUid: schemaKey.toBase58(),
        wallet: wallet.toBase58(),
        attester: attester.toBase58(),
        data: {
          kycLevel,
          riskScore,
          kycProvider,
          verificationId,
          jurisdiction,
          expiresAt,
        },
        revoked,
        createdAt,
      };
    } catch {
      return null;
    }
  }

  /**
   * Find all attestations for a given wallet by scanning PDAs across known schemas.
   */
  async findAttestationsByWallet(wallet: PublicKey): Promise<SasAttestation[]> {
    const [schemaAddress] = deriveSchemaAddress(this.schemaUid, this.programId);
    const [attestationAddress] = deriveAttestationAddress(
      schemaAddress,
      wallet,
      this.authority.publicKey,
      this.programId,
    );

    const attestation = await this.getAttestation(attestationAddress.toBase58());
    return attestation ? [attestation] : [];
  }
}
