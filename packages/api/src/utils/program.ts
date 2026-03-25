/**
 * Shared PayClear program loader.
 *
 * Loads the Anchor IDL from the program package and constructs
 * a fully-typed Program instance that can call on-chain instructions
 * and deserialize account data.
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { readFileSync } from "fs";
import { join } from "path";
import { config } from "../config.js";

// Cache the parsed IDL to avoid re-reading from disk on every call
let _idlCache: any = null;

function loadIdl(): any {
  if (_idlCache) return _idlCache;

  // Look for IDL in the program package (committed to repo)
  const idlPath = join(
    process.cwd(),
    "..",
    "program",
    "idl",
    "payclear.json"
  );

  try {
    _idlCache = JSON.parse(readFileSync(idlPath, "utf-8"));
  } catch {
    // Fallback: try from the monorepo root
    const fallbackPath = join(
      process.cwd(),
      "..",
      "..",
      "packages",
      "program",
      "idl",
      "payclear.json"
    );
    _idlCache = JSON.parse(readFileSync(fallbackPath, "utf-8"));
  }

  return _idlCache;
}

/**
 * Create an Anchor Program instance connected to the deployed PayClear program.
 *
 * @param connection - Solana RPC connection
 * @param wallet - Wallet for signing transactions
 * @returns Configured Program instance with full IDL
 */
export function createPayClearProgram(
  connection: Connection,
  wallet: Wallet
): Program {
  const idl = loadIdl();
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  const programId = new PublicKey(
    config.solana.programId || idl.address
  );
  return new Program(idl, programId, provider);
}

/**
 * Load the authority keypair from the configured wallet path.
 */
export function loadAuthorityKeypair(): Keypair {
  const walletPath = config.solana.walletPath.replace(
    "~",
    process.env.HOME || ""
  );
  const keyData = JSON.parse(readFileSync(walletPath, "utf-8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

/**
 * Create a fully configured Program + Keypair from config.
 */
export function getProgram(): { program: Program; authority: Keypair } {
  const authority = loadAuthorityKeypair();
  const connection = new Connection(config.solana.rpcUrl, "confirmed");
  const wallet = new Wallet(authority);
  const program = createPayClearProgram(connection, wallet);
  return { program, authority };
}
