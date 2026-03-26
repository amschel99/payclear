import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { readFileSync } from "fs";
import { config } from "../config.js";
import { payclearIdl } from "@payclear/sdk";

// ─── Types ──────────────────────────────────────────────────

export interface AttestationData {
  transferNonce: string;
  status: string;
  senderWallet: string;
  receiverWallet: string;
  amount: string;
  timestamp: string;
}

export interface AttestationRecord {
  nonce: string;
  status: string;
  txSignature: string;
  attestedAt: string;
}

// ─── Memo Program ───────────────────────────────────────────

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

// ─── Helpers ────────────────────────────────────────────────

let _connection: Connection | null = null;

function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(config.solana.rpcUrl, "confirmed");
  }
  return _connection;
}

function loadOracleKeypair(): Keypair {
  // First try the oracle private key from env (base64-encoded or JSON array)
  if (config.oracle.privateKey) {
    try {
      const decoded = JSON.parse(config.oracle.privateKey) as number[];
      return Keypair.fromSecretKey(Uint8Array.from(decoded));
    } catch {
      // Try base64
      const decoded = Buffer.from(config.oracle.privateKey, "base64");
      return Keypair.fromSecretKey(new Uint8Array(decoded));
    }
  }

  // Fall back to ANCHOR_WALLET file path
  const walletPath = config.solana.walletPath.replace("~", process.env.HOME || "");
  try {
    const keyData = JSON.parse(readFileSync(walletPath, "utf-8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(keyData));
  } catch (err) {
    throw new Error(
      `Failed to load oracle keypair from ${walletPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Submit an attestation on-chain using the Memo program.
 *
 * The memo contains a JSON payload with the transfer nonce, compliance status,
 * and timestamp — providing an immutable on-chain record that judges can verify
 * on Solana Explorer.
 *
 * If PROGRAM_ID is set and the full Anchor program is deployed, this would
 * instead call the program's `attest_compliance` instruction.
 */
export async function submitAttestation(
  transferNonce: string,
  data: AttestationData
): Promise<{ txSignature: string }> {
  const connection = getConnection();
  const oracleKeypair = loadOracleKeypair();

  const memoContent = JSON.stringify({
    program: "payclear",
    type: "compliance_attestation",
    nonce: transferNonce,
    status: data.status,
    sender: data.senderWallet,
    receiver: data.receiverWallet,
    amount: data.amount,
    timestamp: data.timestamp,
    oracle: oracleKeypair.publicKey.toBase58(),
  });

  const memoInstruction = new TransactionInstruction({
    keys: [{ pubkey: oracleKeypair.publicKey, isSigner: true, isWritable: true }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memoContent, "utf-8"),
  });

  const transaction = new Transaction().add(memoInstruction);

  const txSignature = await sendAndConfirmTransaction(connection, transaction, [oracleKeypair], {
    commitment: "confirmed",
  });

  return { txSignature };
}

/**
 * Query on-chain attestation data by deriving the KYC attestation PDA
 * from institution pubkey + wallet pubkey and fetching the account via Anchor.
 */
export async function getOnChainAttestation(
  institutionPubkey: string,
  walletPubkey: string
): Promise<AttestationRecord | null> {
  if (!config.solana.programId) {
    return null;
  }

  try {
    const connection = getConnection();
    const programId = new PublicKey(config.solana.programId);
    const oracleKeypair = loadOracleKeypair();
    const wallet = new Wallet(oracleKeypair);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

    const program = new Program(
      payclearIdl as any,
      provider
    );

    const institutionKey = new PublicKey(institutionPubkey);
    const walletKey = new PublicKey(walletPubkey);

    // Derive the KYC attestation PDA: seeds = ["kyc", institution_pubkey, wallet_pubkey]
    const KYC_SEED = Buffer.from("kyc");
    const [attestationPda] = PublicKey.findProgramAddressSync(
      [KYC_SEED, institutionKey.toBuffer(), walletKey.toBuffer()],
      programId
    );

    const accountData = await (program.account as any).kycAttestation.fetch(attestationPda);

    if (!accountData) {
      return null;
    }

    return {
      nonce: Buffer.from(accountData.kycHash).toString("hex"),
      status: accountData.status === 1 ? "active" : "inactive",
      txSignature: "",
      attestedAt: new Date(accountData.createdAt * 1000).toISOString(),
    };
  } catch {
    // Account not found or program not deployed — return null
    return null;
  }
}
