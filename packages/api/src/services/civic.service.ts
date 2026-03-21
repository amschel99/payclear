import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "../config.js";

/** Civic Gateway Token state values */
const CIVIC_STATE_ACTIVE = 0;
const CIVIC_STATE_REVOKED = 1;
const CIVIC_STATE_FROZEN = 2;

const GATEWAY_SEED = Buffer.from("gateway");

export interface CivicPassStatus {
  exists: boolean;
  state: "active" | "revoked" | "frozen" | "unknown";
  gatekeeperNetwork: string;
  issuingGatekeeper: string | null;
  expireTime: number | null;
  isExpired: boolean;
  address: string;
}

/**
 * Derive the Civic Gateway Token PDA for a wallet + gatekeeper network.
 */
function deriveCivicGatewayTokenPDA(
  wallet: PublicKey,
  gatekeeperNetwork: PublicKey,
  gatewayProgramId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      wallet.toBuffer(),
      GATEWAY_SEED,
      Buffer.from([0]),
      gatekeeperNetwork.toBuffer(),
    ],
    gatewayProgramId
  );
}

/**
 * Parse raw Gateway Token account data.
 *
 * Layout:
 *   [0]       features (1 byte)
 *   [1]       state    (1 byte)
 *   [2..34]   gatekeeper_network (32 bytes)
 *   [34..66]  issuing_gatekeeper (32 bytes)
 *   [66..74]  expire_time (i64 LE, optional)
 */
function parseGatewayTokenData(data: Buffer): {
  state: number;
  gatekeeperNetwork: PublicKey;
  issuingGatekeeper: PublicKey;
  expireTime: number;
} {
  const state = data.readUInt8(1);
  const gatekeeperNetwork = new PublicKey(data.subarray(2, 34));
  const issuingGatekeeper = new PublicKey(data.subarray(34, 66));

  let expireTime = 0;
  if (data.length >= 74) {
    const rawExpiry = data.readBigInt64LE(66);
    expireTime = Number(rawExpiry);
  }

  return { state, gatekeeperNetwork, issuingGatekeeper, expireTime };
}

function stateToString(state: number): CivicPassStatus["state"] {
  switch (state) {
    case CIVIC_STATE_ACTIVE:
      return "active";
    case CIVIC_STATE_REVOKED:
      return "revoked";
    case CIVIC_STATE_FROZEN:
      return "frozen";
    default:
      return "unknown";
  }
}

/**
 * Verify if a wallet has an active Civic Pass for the given gatekeeper network.
 *
 * @returns true if the pass exists and is active and not expired
 */
export async function verifyCivicPass(
  walletAddress: string,
  gatekeeperNetwork?: string
): Promise<boolean> {
  const status = await getCivicPassStatus(walletAddress, gatekeeperNetwork);
  return status.exists && status.state === "active" && !status.isExpired;
}

/**
 * Get the full Civic Pass status for a wallet.
 */
export async function getCivicPassStatus(
  walletAddress: string,
  gatekeeperNetwork?: string
): Promise<CivicPassStatus> {
  const connection = new Connection(config.solana.rpcUrl, "confirmed");
  const wallet = new PublicKey(walletAddress);
  const network = new PublicKey(
    gatekeeperNetwork ?? config.civic.defaultGatekeeperNetwork
  );
  const gatewayProgramId = new PublicKey(config.civic.gatewayProgramId);

  const [gatewayTokenPda] = deriveCivicGatewayTokenPDA(
    wallet,
    network,
    gatewayProgramId
  );

  const emptyResult: CivicPassStatus = {
    exists: false,
    state: "unknown",
    gatekeeperNetwork: network.toBase58(),
    issuingGatekeeper: null,
    expireTime: null,
    isExpired: false,
    address: gatewayTokenPda.toBase58(),
  };

  try {
    const accountInfo = await connection.getAccountInfo(gatewayTokenPda);

    if (!accountInfo || !accountInfo.data || accountInfo.data.length < 66) {
      return emptyResult;
    }

    const parsed = parseGatewayTokenData(Buffer.from(accountInfo.data));
    const now = Math.floor(Date.now() / 1000);
    const isExpired = parsed.expireTime > 0 && now > parsed.expireTime;

    return {
      exists: true,
      state: stateToString(parsed.state),
      gatekeeperNetwork: parsed.gatekeeperNetwork.toBase58(),
      issuingGatekeeper: parsed.issuingGatekeeper.toBase58(),
      expireTime: parsed.expireTime > 0 ? parsed.expireTime : null,
      isExpired,
      address: gatewayTokenPda.toBase58(),
    };
  } catch {
    return emptyResult;
  }
}
