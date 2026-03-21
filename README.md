# PayClear Protocol

**Native Compliance Layer for Institutional Stablecoin Payments on Solana**

> **StableHacks 2026** | Track: Programmable Stablecoin Payments

PayClear makes compliance the transaction. Every USDC payment on Solana is wrapped with on-chain compliance metadata — KYC attestations, KYT risk scores, and Travel Rule hashes are embedded in the transaction itself. Funds are locked until a trusted oracle confirms all compliance conditions are met.

---

## Quick Start (Demo in 5 minutes)

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+ (`npm install -g pnpm`)
- [PostgreSQL](https://www.postgresql.org/) 16+
- [Redis](https://redis.io/) 7+
- [Phantom Wallet](https://phantom.app/) browser extension (set to **Devnet**)

### 1. Clone & Install

```bash
git clone https://github.com/your-org/payclear.git
cd payclear
pnpm install
```

### 2. Set Up Environment

```bash
cp .env.example .env
```

Edit `.env` — the defaults work for local PostgreSQL/Redis. You **must** set up an oracle keypair for on-chain attestations:

```bash
# Generate a devnet keypair for the oracle
solana-keygen new -o oracle-keypair.json
solana airdrop 2 $(solana address -k oracle-keypair.json) --url devnet

# Add to .env:
# ORACLE_PRIVATE_KEY=<paste the JSON array from oracle-keypair.json>
# SOLANA_RPC_URL=https://api.devnet.solana.com
```

### 3. Set Up the Database

```bash
# macOS
brew install postgresql@16 redis
brew services start postgresql@16
brew services start redis

# Create database
createdb payclear 2>/dev/null || true

# Run migrations
cd packages/api
pnpm db:generate
pnpm db:migrate
cd ../..
```

### 4. Start the Stack

Open **two terminal windows**:

```bash
# Terminal 1 — API (port 3000)
cd packages/api
pnpm dev
```

```bash
# Terminal 2 — Frontend (port 3001)
cd packages/web
cp .env.local.example .env.local   # only needed first time
pnpm dev
```

### 5. Open & Test

| URL | What |
|-----|------|
| http://localhost:3001 | **Send Payment** — 4-step compliance flow |
| http://localhost:3001/dashboard | **Dashboard** — Transaction history & stats |
| http://localhost:3001/admin | **Admin Panel** — Oracle attestation controls |
| http://localhost:3000/docs | **API Docs** — Swagger/OpenAPI |
| http://localhost:3000/health | **Health Check** |

### 6. Test the Full Flow

1. Open http://localhost:3001
2. Click **"Select Wallet"** — connect Phantom (make sure it's on **Devnet**)
3. Enter a recipient name, a valid Solana wallet address, and a USDC amount
4. Fill in KYC details (name, date of birth, nationality) — verification is instant (mocked Sumsub)
5. Watch the compliance pipeline run automatically:
   - **KYT Risk Scoring** — checks amount thresholds, wallet age, counterparty risk
   - **Travel Rule Packaging** — hashes originator/beneficiary data, stores on-chain
   - **Oracle Attestation** — signs a Solana Memo transaction (viewable on Explorer)
6. Click **"View on Solana Explorer"** to verify the on-chain attestation

> **Note:** The Dashboard and Admin pages display demo data and work without the API running. The Send flow requires the API to be running.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Frontend                               │
│               Next.js · Wallet Adapter · Tailwind               │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP
┌───────────────────────────▼─────────────────────────────────────┐
│                     Compliance API                              │
│                                                                 │
│  POST /api/kyc/verify      →  KYC via Sumsub (mock)            │
│  POST /api/kyt/score       →  4-factor risk scoring engine     │
│  POST /api/travel-rule/package → IVMS101 data + SHA-256 hash   │
│  POST /api/oracle/attest   →  Signs Solana Memo tx on-chain   │
│                                                                 │
│  POST /v1/institutions     →  VASP registration (API key auth) │
│  POST /v1/entities         →  KYC entity management            │
│  POST /v1/transfers        →  Institutional transfers          │
│  GET  /v1/audit/*          →  Audit trail                      │
└────────┬───────────────────────────────────┬────────────────────┘
         │                                   │
    ┌────▼────┐                    ┌────────▼──────────┐
    │PostgreSQL│                    │   Solana Devnet   │
    │ Off-chain│                    │                   │
    │ KYC/PII │                    │  Anchor Program   │
    │ Records  │                    │  (KYC PDAs,       │
    │ Audit Log│                    │   Travel Rule,    │
    └─────────┘                    │   Transfer Hook)  │
         │                         │                   │
    ┌────▼────┐                    │  Memo Program     │
    │  Redis  │                    │  (Oracle Attest)  │
    │  Queue  │                    └───────────────────┘
    └─────────┘
```

### Key Design

- **Hash-only on-chain** — Full PII stays in PostgreSQL. Only SHA-256 hashes stored on-chain.
- **Oracle attestation** — A trusted keypair signs a Solana Memo transaction as proof of compliance clearance. Verifiable by anyone on Explorer.
- **KYT risk scoring** — 4-factor engine: amount thresholds, wallet age (Solana RPC), historical volume, counterparty risk. Score 0–100, threshold at 70.
- **Travel Rule (FATF)** — IVMS101 originator/beneficiary data packaged, hashed, and anchored on-chain via nonce linking.
- **Dual transfer modes** — Mode A: explicit `execute_compliant_transfer` via CPI. Mode B: Token-2022 transfer hook auto-gates every transfer.

---

## Packages

| Package | Description | Dev Command |
|---------|-------------|-------------|
| `packages/web` | Next.js 14 frontend — send flow, dashboard, admin panel | `pnpm dev` (port 3001) |
| `packages/api` | Fastify REST API — compliance endpoints + institutional API | `pnpm dev` (port 3000) |
| `packages/program` | Anchor Solana program — on-chain compliance logic | `anchor build && anchor test` |
| `packages/sdk` | TypeScript SDK — `@payclear/sdk` | `pnpm build` |
| `packages/docs` | Architecture & compliance documentation | — |

---

## Compliance Endpoints (Public)

These power the frontend's compliance flow. No API key required.

```bash
# 1. KYC Verification (mock Sumsub)
curl -X POST http://localhost:3000/api/kyc/verify \
  -H "Content-Type: application/json" \
  -d '{"wallet":"7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU","fullName":"John Doe","dateOfBirth":"1990-01-15","nationality":"US"}'

# 2. KYT Risk Scoring
curl -X POST http://localhost:3000/api/kyt/score \
  -H "Content-Type: application/json" \
  -d '{"senderWallet":"7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU","receiverWallet":"DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy","amount":5000,"currency":"USDC"}'

# 3. Travel Rule Packaging
curl -X POST http://localhost:3000/api/travel-rule/package \
  -H "Content-Type: application/json" \
  -d '{"originator":{"name":"John Doe","wallet":"7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU","institution":"Acme VASP"},"beneficiary":{"name":"Jane Smith","wallet":"DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy","institution":"Beta VASP"},"amount":5000,"currency":"USDC"}'

# 4. Oracle Attestation (submits Solana Memo tx)
curl -X POST http://localhost:3000/api/oracle/attest \
  -H "Content-Type: application/json" \
  -d '{"transferNonce":"<nonce from step 3>"}'
```

---

## Institutional API Endpoints (API Key Auth)

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
| GET | `/v1/audit/transfers` | Audit trail |
| POST | `/v1/webhooks` | Register webhook |

Full interactive docs at http://localhost:3000/docs

---

## On-Chain Accounts (PDAs)

| Account | Seeds | Purpose |
|---------|-------|---------|
| Registry | `["registry"]` | Global state |
| Institution | `["institution", id]` | VASP registration |
| KycAttestation | `["kyc", institution, wallet]` | KYC status |
| CompliancePolicy | `["policy", institution, policy_id]` | Compliance rules |
| TravelRuleRecord | `["travel_rule", nonce]` | FATF Travel Rule |
| TransferRecord | `["transfer", nonce]` | Transfer receipt |

---

## Full Development Setup

For building the Solana program and SDK, you'll also need:

- [Rust](https://rustup.rs/) 1.75+
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) 1.18+
- [Anchor](https://www.anchor-lang.com/docs/installation) 0.30+

See [SETUP.md](SETUP.md) for detailed installation instructions for all dependencies.

### Build Everything

```bash
pnpm build          # Build all packages via Turborepo
pnpm test           # Run all tests
pnpm lint           # Lint all packages
```

### Solana Program

```bash
cd packages/program
anchor build
anchor test --skip-local-validator

# Deploy to devnet
solana config set --url devnet
solana airdrop 5
anchor deploy --provider.cluster devnet
```

### SDK

```bash
cd packages/sdk
pnpm build           # Outputs CJS + ESM + types
pnpm test
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `postgresql://payclear:payclear@localhost:5432/payclear` | PostgreSQL connection |
| `REDIS_URL` | Yes | `redis://localhost:6379` | Redis connection |
| `SOLANA_RPC_URL` | Yes | `https://api.devnet.solana.com` | Solana RPC endpoint |
| `ORACLE_PRIVATE_KEY` | For attestations | — | Oracle keypair JSON array |
| `ANCHOR_WALLET` | Fallback for oracle | `~/.config/solana/id.json` | Keypair file path |
| `PROGRAM_ID` | For full program | — | Deployed Anchor program ID |
| `API_PORT` | No | `3000` | API server port |
| `SUMSUB_APP_TOKEN` | For real KYC | — | Sumsub API token |
| `SUMSUB_APP_SECRET` | For real KYC | — | Sumsub API secret |
| `WEBHOOK_SIGNING_SECRET` | No | `dev-secret` | Webhook HMAC secret |
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:3000` | Frontend → API URL |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | No | `https://api.devnet.solana.com` | Frontend Solana RPC |

---

## Troubleshooting

### Frontend won't connect to API
Make sure the API is running on port 3000. Check `packages/web/.env.local` has `NEXT_PUBLIC_API_URL=http://localhost:3000`.

### Oracle attestation fails
You need a funded devnet keypair. Set `ORACLE_PRIVATE_KEY` in `.env` to the JSON array from your keypair file, or set `ANCHOR_WALLET` to the file path. Airdrop SOL: `solana airdrop 2 <address> --url devnet`.

### Database connection refused
```bash
# macOS
brew services start postgresql@16

# Linux
sudo systemctl start postgresql

# Verify
psql -U payclear -d payclear -c "SELECT 1"
```

### Redis connection refused
```bash
# macOS
brew services start redis

# Linux
sudo systemctl start redis

# Verify
redis-cli ping  # → PONG
```

### Phantom wallet not connecting
Make sure Phantom is set to **Devnet**: Settings → Developer Settings → Change Network → Devnet.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, Tailwind CSS, Solana Wallet Adapter |
| API | Fastify 4, Zod, Drizzle ORM, BullMQ |
| Database | PostgreSQL 16, Redis 7 |
| Blockchain | Solana (devnet), Anchor 0.30, SPL Token, Token-2022 |
| Build | pnpm 9, Turborepo 2, tsup, Vitest |
| CI/CD | GitHub Actions (4 workflows) |

---

## Market

Starting with African cross-border trade corridors — Kenya, Nigeria, Uganda, Ghana — where $50B+ in annual B2B payments still move on slow, expensive SWIFT rails.

## License

MIT
