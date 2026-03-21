import { describe, it, expect } from "vitest";
import { PublicKey, Keypair } from "@solana/web3.js";
import { deriveCivicGatewayTokenPDA } from "../accounts/pda.js";
import { PayClearClient } from "../client.js";
import { CivicGatewayState } from "../accounts/types.js";

// Well-known Civic Gateway program ID (mainnet)
const CIVIC_GATEWAY_PROGRAM_ID = new PublicKey(
  "gatem74V238djXdzWnJf94Wo1DcnuGkfijbf3AuBhfs"
);

// Civic Ignite (uniqueness) gatekeeper network
const IGNITE_GATEKEEPER_NETWORK = new PublicKey(
  "ignREusXmGrscGNUesoU9mxfds9AiYqSGGY9CPQZ1Fo"
);

describe("Civic Gateway Token PDA derivation", () => {
  it("should derive a deterministic PDA for a given wallet and network", () => {
    const wallet = Keypair.generate().publicKey;

    const [pda1, bump1] = deriveCivicGatewayTokenPDA(
      wallet,
      IGNITE_GATEKEEPER_NETWORK,
      CIVIC_GATEWAY_PROGRAM_ID
    );

    const [pda2, bump2] = deriveCivicGatewayTokenPDA(
      wallet,
      IGNITE_GATEKEEPER_NETWORK,
      CIVIC_GATEWAY_PROGRAM_ID
    );

    expect(pda1.equals(pda2)).toBe(true);
    expect(bump1).toBe(bump2);
  });

  it("should derive different PDAs for different wallets", () => {
    const wallet1 = Keypair.generate().publicKey;
    const wallet2 = Keypair.generate().publicKey;

    const [pda1] = deriveCivicGatewayTokenPDA(
      wallet1,
      IGNITE_GATEKEEPER_NETWORK,
      CIVIC_GATEWAY_PROGRAM_ID
    );

    const [pda2] = deriveCivicGatewayTokenPDA(
      wallet2,
      IGNITE_GATEKEEPER_NETWORK,
      CIVIC_GATEWAY_PROGRAM_ID
    );

    expect(pda1.equals(pda2)).toBe(false);
  });

  it("should derive different PDAs for different gatekeeper networks", () => {
    const wallet = Keypair.generate().publicKey;
    const otherNetwork = Keypair.generate().publicKey;

    const [pda1] = deriveCivicGatewayTokenPDA(
      wallet,
      IGNITE_GATEKEEPER_NETWORK,
      CIVIC_GATEWAY_PROGRAM_ID
    );

    const [pda2] = deriveCivicGatewayTokenPDA(
      wallet,
      otherNetwork,
      CIVIC_GATEWAY_PROGRAM_ID
    );

    expect(pda1.equals(pda2)).toBe(false);
  });

  it("should produce a valid PublicKey (on the ed25519 curve exclusion)", () => {
    const wallet = Keypair.generate().publicKey;

    const [pda] = deriveCivicGatewayTokenPDA(
      wallet,
      IGNITE_GATEKEEPER_NETWORK,
      CIVIC_GATEWAY_PROGRAM_ID
    );

    // PDAs must NOT be on the ed25519 curve
    expect(PublicKey.isOnCurve(pda.toBytes())).toBe(false);
  });
});

describe("Gateway Token account data parsing", () => {
  function buildGatewayTokenData(opts: {
    features?: number;
    state?: number;
    gatekeeperNetwork?: PublicKey;
    issuingGatekeeper?: PublicKey;
    expireTime?: bigint;
  }): Buffer {
    const features = opts.features ?? 0;
    const state = opts.state ?? CivicGatewayState.Active;
    const network = opts.gatekeeperNetwork ?? IGNITE_GATEKEEPER_NETWORK;
    const gatekeeper = opts.issuingGatekeeper ?? Keypair.generate().publicKey;
    const expireTime = opts.expireTime;

    const hasExpiry = expireTime !== undefined;
    const buf = Buffer.alloc(hasExpiry ? 74 : 66);

    buf.writeUInt8(features, 0);
    buf.writeUInt8(state, 1);
    network.toBuffer().copy(buf, 2);
    gatekeeper.toBuffer().copy(buf, 34);

    if (hasExpiry) {
      buf.writeBigInt64LE(expireTime, 66);
    }

    return buf;
  }

  it("should parse an active Gateway Token with no expiry", () => {
    const network = IGNITE_GATEKEEPER_NETWORK;
    const gatekeeper = Keypair.generate().publicKey;

    const data = buildGatewayTokenData({
      state: CivicGatewayState.Active,
      gatekeeperNetwork: network,
      issuingGatekeeper: gatekeeper,
    });

    const parsed = PayClearClient.parseCivicGatewayToken(data);

    expect(parsed.features).toBe(0);
    expect(parsed.state).toBe(CivicGatewayState.Active);
    expect(parsed.gatekeeperNetwork.equals(network)).toBe(true);
    expect(parsed.issuingGatekeeper.equals(gatekeeper)).toBe(true);
    expect(parsed.expireTime).toBe(BigInt(0));
  });

  it("should parse a revoked Gateway Token", () => {
    const data = buildGatewayTokenData({
      state: CivicGatewayState.Revoked,
    });

    const parsed = PayClearClient.parseCivicGatewayToken(data);
    expect(parsed.state).toBe(CivicGatewayState.Revoked);
  });

  it("should parse a frozen Gateway Token", () => {
    const data = buildGatewayTokenData({
      state: CivicGatewayState.Frozen,
    });

    const parsed = PayClearClient.parseCivicGatewayToken(data);
    expect(parsed.state).toBe(CivicGatewayState.Frozen);
  });

  it("should parse expiry time when present", () => {
    const futureTimestamp = BigInt(Math.floor(Date.now() / 1000) + 86400); // +1 day
    const data = buildGatewayTokenData({
      expireTime: futureTimestamp,
    });

    const parsed = PayClearClient.parseCivicGatewayToken(data);
    expect(parsed.expireTime).toBe(futureTimestamp);
  });

  it("should handle zero expiry as no expiry", () => {
    const data = buildGatewayTokenData({
      expireTime: BigInt(0),
    });

    const parsed = PayClearClient.parseCivicGatewayToken(data);
    expect(parsed.expireTime).toBe(BigInt(0));
  });

  it("should correctly extract the gatekeeper network pubkey", () => {
    const customNetwork = Keypair.generate().publicKey;
    const data = buildGatewayTokenData({
      gatekeeperNetwork: customNetwork,
    });

    const parsed = PayClearClient.parseCivicGatewayToken(data);
    expect(parsed.gatekeeperNetwork.equals(customNetwork)).toBe(true);
  });

  it("should handle data with features byte set", () => {
    const data = buildGatewayTokenData({
      features: 0x03,
    });

    const parsed = PayClearClient.parseCivicGatewayToken(data);
    expect(parsed.features).toBe(3);
  });
});
