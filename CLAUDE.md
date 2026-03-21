# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PayClear is an institutional compliance layer for Solana stablecoins. It's a pnpm monorepo with four packages:
- **packages/program** — Rust/Anchor 0.30.1 smart contract (on-chain compliance state, KYC attestations, Travel Rule records, transfer hooks)
- **packages/api** — Fastify 4 REST API with PostgreSQL (Drizzle ORM), Redis (BullMQ webhooks), Zod validation, Swagger docs
- **packages/sdk** — TypeScript SDK (`@payclear/sdk`) wrapping on-chain interactions via `PayClearClient`
- **packages/web** — Next.js 14 frontend with Solana wallet adapter, Tailwind CSS, 4-step compliant payment flow

## Build & Development Commands

```bash
# Root (Turborepo orchestrates dependencies)
pnpm install          # Install all workspace dependencies
pnpm build            # Build all packages
pnpm test             # Test all packages
pnpm lint             # Lint all packages
pnpm clean            # Clean all packages

# Solana Program
cd packages/program
anchor build           # Compile program
anchor test --skip-local-validator  # Run integration tests
anchor clean

# API (port 3000)
cd packages/api
pnpm dev               # Dev server with hot reload
pnpm build             # Build with tsup
pnpm test              # Vitest
pnpm lint              # ESLint
pnpm db:generate       # Generate Drizzle migration files
pnpm db:migrate        # Run database migrations

# Frontend (port 3001)
cd packages/web
pnpm dev               # Next.js dev server
pnpm build             # Production build
pnpm lint              # ESLint via next lint

# SDK
cd packages/sdk
pnpm build             # Build CJS + ESM + types via tsup
pnpm test              # Vitest
pnpm lint              # ESLint
```

## Architecture

### Data Flow

Users interact via Next.js frontend (wallet connect → send payment) → frontend calls compliance API endpoints → API runs KYC/KYT/Travel Rule checks → oracle signs on-chain attestation via Solana Memo program → settlement confirmed.

Institutional users interact via REST API (`/v1/*`) or SDK → on-chain Solana program manages compliance state as PDAs → PostgreSQL stores full off-chain data → Redis/BullMQ dispatches webhook events.

### Two API Surface Areas

1. **Public compliance endpoints** (`/api/*`) — called by the frontend, no auth required:
   - `POST /api/kyc/verify` — KYC verification (mock Sumsub, structured for real integration)
   - `POST /api/kyt/score` — KYT risk scoring engine (amount, wallet age, volume, counterparty)
   - `POST /api/travel-rule/package` — IVMS101 travel rule data packaging with SHA-256 hash
   - `POST /api/oracle/attest` — Oracle signs on-chain Memo transaction as compliance attestation

2. **Institutional endpoints** (`/v1/*`) — API key auth required:
   - Institutions, entities, policies, transfers, audit, webhooks CRUD

### Key Design Decisions

- **Hash-only on-chain**: Full PII/IVMS101 data stays in PostgreSQL; only SHA-256 hashes stored on-chain
- **Nonce-based linking**: Unique 32-byte nonce links on-chain records to off-chain database entries
- **Dual transfer modes**: Mode A uses explicit `execute_compliant_transfer` CPI call; Mode B uses Token-2022 transfer hook to auto-gate every transfer
- **PDAs throughout**: All on-chain accounts derived deterministically from seeds (registry, institution, kyc_attestation, compliance_policy, travel_rule_record, transfer_record)
- **Oracle attestation via Memo**: For the hackathon demo, on-chain attestations use Solana Memo program (verifiable on Explorer) rather than full Anchor program CPI

### Solana Program Structure (packages/program/programs/payclear/src/)

10 instruction handlers in `instructions/` map to the compliance workflow: initialize registry → register institution → create KYC attestations → set compliance policies → record/approve travel rules → execute compliant transfers. The `transfer_hook` handler implements Token-2022 transfer hook interface.

6 PDA account types in `state/` define on-chain data. Custom errors in `errors.rs` (20+ codes). Seeds and status codes in `constants.rs`.

### API Structure (packages/api/src/)

Routes in `routes/` delegate to services in `services/`. Compliance routes (`routes/compliance.ts`) handle the 4 public endpoints using `kyc.service.ts`, `kyt.service.ts`, and `solana.service.ts`. Database schema defined in `db/schema.ts` (7 tables: institutions, entities, compliancePolicies, travelRuleData, transfers, auditLog, webhooks). Auth middleware validates API keys for `/v1/` routes. Swagger docs served at `/docs`, health check at `/health`.

### Frontend Structure (packages/web/src/)

Next.js 14 App Router with three pages: Send (`/`), Dashboard (`/dashboard`), Admin (`/admin`). Solana wallet adapter via `components/providers.tsx`. API client in `lib/api.ts`. The send flow is a 4-step process: connect wallet → enter payment details → KYC verification → automated compliance pipeline (KYT → Travel Rule → Oracle attestation).

### SDK Structure (packages/sdk/src/)

`PayClearClient` class in `client.ts` provides methods for all on-chain operations. PDA derivation helpers in `accounts/pda.ts`. SHA-256 hashing utilities in `utils/hash.ts`.

## Environment Setup

Requires: Node.js 20+, pnpm 9+, Rust/Anchor 0.30.1, Solana CLI, PostgreSQL 16+, Redis 7+

Copy `.env.example` → `.env` and configure `DATABASE_URL`, `REDIS_URL`, `SOLANA_RPC_URL`, `ORACLE_PRIVATE_KEY`, `WEBHOOK_SIGNING_SECRET`.

For the frontend, copy `packages/web/.env.local.example` → `packages/web/.env.local`.

## CI/CD

Four GitHub Actions workflows trigger on relevant `packages/` path changes:
- `ci-program.yml`: Installs Rust + Solana + Anchor, builds and tests program
- `ci-api.yml`: Spins up PostgreSQL + Redis services, builds and tests API
- `ci-sdk.yml`: Builds and tests SDK
- `ci-web.yml`: Builds and lints frontend
