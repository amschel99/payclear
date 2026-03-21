import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { readFileSync } from "fs";
import { config } from "../config.js";

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
 * Query on-chain attestation data by looking up memo transactions.
 * For hackathon: returns null — full implementation would index memo txs
 * or query the Anchor program's PDA accounts.
 */
export async function getOnChainAttestation(
  _nonce: string
): Promise<AttestationRecord | null> {
  // TODO: Implement on-chain attestation lookup.
  // With the full Anchor program, this would derive the PDA from the nonce
  // and fetch the account data. For now, attestation records are tracked
  // in the database after submitAttestation succeeds.
  return null;
}
