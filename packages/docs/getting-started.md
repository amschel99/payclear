# Getting Started with PayClear

## Prerequisites

- **Rust** 1.75+ via [rustup](https://rustup.rs/)
- **Solana CLI** 1.18+ — `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`
- **Anchor** 0.30+ — `cargo install --git https://github.com/coral-xyz/anchor avm --force && avm install 0.30.1 && avm use 0.30.1`
- **Node.js** 20+ via [nvm](https://github.com/nvm-sh/nvm)
- **pnpm** 9+ — `npm install -g pnpm`
- **PostgreSQL** 16+ (for the API)
- **Redis** 7+ (for webhook dispatch)

## Setup

```bash
# Clone the repo
git clone https://github.com/your-org/paystable.git
cd paystable

# Install all dependencies
pnpm install

# Set up environment
cp .env.example .env
```

## Build & Test the Solana Program

```bash
cd packages/program

# Build
anchor build

# Run tests against localnet
anchor test
```

## Run the API

```bash
# Create the database
createdb payclear

# Run migrations
cd packages/api
pnpm db:migrate

# Start development server
pnpm dev
# → http://localhost:3000
# → Swagger UI at http://localhost:3000/docs
```

## First Steps

### 1. Initialize the Registry

The registry is the global singleton that manages all institutions. This is done once per deployment.

```typescript
import { PayClearClient } from "@payclear/sdk";

const client = new PayClearClient({ connection, wallet, programId });
await client.initializeRegistry();
```

### 2. Register an Institution

Only the registry authority can register institutions.

```typescript
await client.registerInstitution({
  name: "Acme Bank",
  vaspCode: "ACMEBANK",
  jurisdiction: "US",
  institutionAuthority: bankAdminKeypair.publicKey,
});
```

### 3. Create KYC Attestations

The institution authority attests wallet addresses after off-chain KYC.

```typescript
import { toInstitutionId } from "@payclear/sdk";

await client.createKycAttestation({
  institutionId: toInstitutionId("Acme Bank"),
  wallet: customerWalletPubkey,
  kycData: { fullName: "Alice Smith", nationality: "US" },
  kycLevel: 2,     // Enhanced
  riskScore: 15,   // Low risk
  expiresAt: 0,    // No expiry
});
```

### 4. Set a Compliance Policy

```typescript
await client.setCompliancePolicy({
  institutionId: toInstitutionId("Acme Bank"),
  minKycLevel: 1,
  maxRiskScore: 70,
  travelRuleThreshold: 1000000000n, // 1000 USDC (6 decimals)
  requireBothAttested: true,
  maxTransferAmount: 0n,            // Unlimited
  dailyLimit: 0n,                   // Unlimited
});
```

### 5. Execute a Compliant Transfer

```typescript
const result = await client.executeCompliantTransfer({
  senderTokenAccount,
  receiverTokenAccount,
  receiverWallet,
  mint: USDC_MINT,
  amount: 500000000n, // 500 USDC
  policyInstitution: institutionPda,
  policyId,
  senderInstitution: institutionPda,
  receiverInstitution: institutionPda,
});

console.log("Transfer signature:", result.signature);
```

### 6. (Optional) Set Up Transfer Hook for Token-2022

If you're creating a new Token-2022 mint that should enforce compliance on every transfer:

```typescript
// After creating the mint with PayClear as transfer hook program:
await client.initializeTransferHook(
  mintPubkey,
  institutionPda,
  policyId
);
// Now every transfer_checked on this mint is auto-gated by PayClear
```

## API Usage

### Register an Entity via REST API

```bash
curl -X POST http://localhost:3000/v1/entities \
  -H "Content-Type: application/json" \
  -H "X-API-Key: pclr_your_api_key_here" \
  -d '{
    "walletAddress": "AbC123...",
    "kycLevel": 2,
    "riskScore": 15,
    "fullName": "Alice Smith",
    "nationality": "US"
  }'
```

### Submit a Transfer

```bash
curl -X POST http://localhost:3000/v1/transfers \
  -H "Content-Type: application/json" \
  -H "X-API-Key: pclr_your_api_key_here" \
  -d '{
    "senderWallet": "sender_pubkey",
    "receiverWallet": "receiver_pubkey",
    "mint": "USDC_mint_pubkey",
    "amount": "500000000",
    "policyId": "hex_policy_id"
  }'
```

## Project Structure

```
paystable/
├── packages/
│   ├── program/              # Solana program (Anchor/Rust)
│   │   ├── programs/payclear/src/
│   │   │   ├── lib.rs                    # Program entrypoint
│   │   │   ├── instructions/             # One file per instruction
│   │   │   ├── state/                    # Account structs
│   │   │   ├── errors.rs                 # Custom error codes
│   │   │   └── constants.rs              # Seeds, status values
│   │   └── tests/                        # Anchor integration tests
│   ├── api/                  # REST API (Fastify/TypeScript)
│   │   └── src/
│   │       ├── routes/                   # HTTP route handlers
│   │       ├── services/                 # Business logic
│   │       ├── middleware/               # Auth, validation
│   │       ├── db/                       # Drizzle schema + migrations
│   │       └── schemas/                  # Zod validation schemas
│   ├── sdk/                  # TypeScript SDK
│   │   └── src/
│   │       ├── client.ts                 # PayClearClient class
│   │       ├── accounts/                 # PDA helpers, types
│   │       └── utils/                    # Hash functions
│   └── docs/                 # Documentation
```
