# PayClear

**Native Compliance Layer for Institutional Stablecoin Payments on Solana**

PayClear wraps every stablecoin transfer on Solana with native compliance metadata — KYC attestations, KYT risk scores, and Travel Rule data are embedded in the transaction itself.

## The Problem

Institutions want to use stablecoins for cross-border B2B payments but can't because:
- KYC/AML is bolted on after the transaction, not built into it
- Travel Rule compliance (VASP-to-VASP data sharing) is manual and broken
- Regulators can't audit on-chain flows because compliance data lives off-chain
- There's no programmable "compliance gate" — payments either go through or don't

## The Solution

PayClear provides two integration modes:

**Mode A — Direct Compliance Transfer**: Call `execute_compliant_transfer` to perform compliance checks then execute a token transfer via CPI. Works with any SPL token.

**Mode B — Transfer Hook (Token-2022)**: Register PayClear as the transfer hook for a Token-2022 mint. Every `transfer_checked` call is automatically gated by compliance checks — invisible to the end user.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Institutions                       │
│              (Banks, Fintechs, VASPs)                │
└──────────┬──────────────────────┬───────────────────┘
           │                      │
    ┌──────▼──────┐       ┌──────▼──────┐
    │  REST API   │       │  SDK        │
    │  (Fastify)  │       │  (TypeScript)│
    └──────┬──────┘       └──────┬──────┘
           │                      │
    ┌──────▼──────────────────────▼──────┐
    │         Solana Program (Anchor)     │
    │                                     │
    │  ┌─────────┐  ┌──────────────────┐ │
    │  │Registry │  │  KYC Attestations│ │
    │  └─────────┘  └──────────────────┘ │
    │  ┌─────────────┐  ┌─────────────┐  │
    │  │  Compliance  │  │Travel Rule  │  │
    │  │  Policies    │  │Records      │  │
    │  └─────────────┘  └─────────────┘  │
    │  ┌──────────────────────────────┐   │
    │  │ Compliance Gate (Transfer)   │   │
    │  │ + Token-2022 Transfer Hook   │   │
    │  └──────────────────────────────┘   │
    └─────────────────────────────────────┘
```

## Packages

| Package | Description |
|---------|-------------|
| `packages/program` | Anchor Solana program — on-chain compliance logic |
| `packages/api` | Fastify REST API — institutional interface |
| `packages/sdk` | TypeScript SDK — `@payclear/sdk` |
| `packages/docs` | Documentation |

## Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) (1.75+)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) (1.18+)
- [Anchor](https://www.anchor-lang.com/docs/installation) (0.30+)
- [Node.js](https://nodejs.org/) (20+)
- [pnpm](https://pnpm.io/) (9+)
- PostgreSQL (16+)
- Redis (7+)

### Install

```bash
git clone https://github.com/your-org/paystable.git
cd paystable
pnpm install
```

### Build the Solana Program

```bash
cd packages/program
anchor build
anchor test
```

### Run the API

```bash
cp .env.example .env
# Edit .env with your database and Solana RPC settings

cd packages/api
pnpm db:migrate
pnpm dev
```

API docs available at `http://localhost:3000/docs`

### Use the SDK

```typescript
import { PayClearClient, toInstitutionId } from "@payclear/sdk";
import { Connection, Keypair } from "@solana/web3.js";

const client = new PayClearClient({
  connection: new Connection("http://localhost:8899"),
  wallet: yourWallet,
  programId: PROGRAM_ID,
});

// Register an institution
await client.registerInstitution({
  name: "Acme Bank",
  vaspCode: "ACMEBANK",
  jurisdiction: "US",
  institutionAuthority: bankKeypair.publicKey,
});

// Create KYC attestation for a wallet
await client.createKycAttestation({
  institutionId: toInstitutionId("Acme Bank"),
  wallet: customerWallet,
  kycData: { fullName: "John Doe", nationality: "US" },
  kycLevel: 2, // Enhanced
  riskScore: 15,
});

// Execute a compliant transfer
const result = await client.executeCompliantTransfer({
  senderTokenAccount,
  receiverTokenAccount,
  receiverWallet,
  mint: USDC_MINT,
  amount: 1000000n, // 1 USDC
  policyInstitution: institutionPda,
  policyId: policyIdBuffer,
  senderInstitution: institutionPda,
  receiverInstitution: institutionPda,
});
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/institutions` | Register institution |
| GET | `/v1/institutions/:id` | Get institution |
| POST | `/v1/entities` | Register KYC entity |
| GET | `/v1/entities/:wallet` | Get entity status |
| PATCH | `/v1/entities/:wallet` | Update entity |
| DELETE | `/v1/entities/:wallet` | Revoke attestation |
| POST | `/v1/policies` | Create compliance policy |
| GET | `/v1/policies` | List policies |
| POST | `/v1/transfers` | Submit compliant transfer |
| GET | `/v1/transfers/:nonce` | Get transfer status |
| POST | `/v1/travel-rule` | Submit Travel Rule data |
| GET | `/v1/audit/transfers` | Audit trail |
| POST | `/v1/webhooks` | Register webhook |

## On-Chain Accounts

All accounts are PDAs derived deterministically:

| Account | Seeds | Purpose |
|---------|-------|---------|
| Registry | `["registry"]` | Global state |
| Institution | `["institution", id]` | VASP registration |
| KycAttestation | `["kyc", institution, wallet]` | KYC status |
| CompliancePolicy | `["policy", institution, policy_id]` | Compliance rules |
| TravelRuleRecord | `["travel_rule", nonce]` | FATF Travel Rule |
| TransferRecord | `["transfer", nonce]` | Transfer receipt |

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Follow the modular structure — each instruction is in its own file
4. Add tests for new instructions in `packages/program/tests/`
5. Run `anchor test` before submitting
6. Submit a PR with a clear description

## License

MIT
