/**
 * Shared PayClear program loader.
 *
 * Imports the Anchor IDL from the SDK package and constructs
 * a fully-typed Program instance that can call on-chain instructions
 * and deserialize account data.
 */

import { Connection, Keypair } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { readFileSync } from "fs";
import { config } from "../config.js";
import { payclearIdl } from "@payclear/sdk";

/**
 * Create an Anchor Program instance connected to the deployed PayClear program.
 */
export function createPayClearProgram(
  connection: Connection,
  wallet: Wallet
): Program {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  return new Program(
    payclearIdl as any,
    provider
  );
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
