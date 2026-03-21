# PayClear — Setup Guide

Step-by-step instructions to get the full PayClear stack running locally.

---

## 1. System Prerequisites

Install these first if you don't have them:

### Rust & Cargo

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
rustc --version  # should be 1.75+
```

### Solana CLI

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/v1.18.17/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
# Add the export line to your ~/.bashrc or ~/.zshrc

solana --version
solana-keygen new  # generate a local keypair if you don't have one
solana config set --url localhost  # point to local validator
```

### Anchor CLI

```bash
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.30.1
avm use 0.30.1
anchor --version  # should show 0.30.1
```

### Node.js & pnpm

```bash
# Node.js 20+ (via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 22
node --version

# pnpm
npm install -g pnpm
pnpm --version  # should be 9+
```

### PostgreSQL

```bash
# Ubuntu/Debian
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql

# macOS (Homebrew)
brew install postgresql@16
brew services start postgresql@16

# Create the database
sudo -u postgres createuser -s payclear 2>/dev/null || true
sudo -u postgres psql -c "ALTER USER payclear PASSWORD 'payclear';"
createdb -U payclear payclear
```

### Redis

```bash
# Ubuntu/Debian
sudo apt install redis-server
sudo systemctl start redis

# macOS (Homebrew)
brew install redis
brew services start redis

redis-cli ping  # should return PONG
```

---

## 2. Clone & Install

```bash
git clone <repo-url> payclear
cd payclear
pnpm install
```

---

## 3. Environment Setup

```bash
cp .env.example .env
```

Edit `.env` with your local settings:

```
SOLANA_RPC_URL=http://localhost:8899
ANCHOR_WALLET=~/.config/solana/id.json
DATABASE_URL=postgresql://payclear:payclear@localhost:5432/payclear
REDIS_URL=redis://localhost:6379
API_PORT=3000
API_HOST=0.0.0.0
```

---

## 4. Build & Test the Solana Program

```bash
cd packages/program

# Build the program
anchor build

# Start local validator + run tests
anchor test

# If you want to run tests against an already-running validator:
# Terminal 1: solana-test-validator
# Terminal 2: anchor test --skip-local-validator
```

After a successful build, the program keypair is at:
`packages/program/target/deploy/payclear-keypair.json`

Get the program ID:
```bash
solana address -k target/deploy/payclear-keypair.json
```

Copy this program ID into:
- `packages/program/Anchor.toml` (under `[programs.localnet]`)
- `packages/program/programs/payclear/src/lib.rs` (the `declare_id!()` macro)
- `.env` as `PROGRAM_ID`

Then rebuild:
```bash
anchor build
```

---

## 5. Run the API

```bash
cd packages/api

# Install API-specific deps (if not already done by root pnpm install)
pnpm install

# Run database migrations
pnpm db:generate
pnpm db:migrate

# Start the dev server
pnpm dev
```

The API will be running at:
- **API**: http://localhost:3000
- **Swagger docs**: http://localhost:3000/docs
- **Health check**: http://localhost:3000/health

### Verify the API is working

```bash
curl http://localhost:3000/health
# → {"status":"ok","timestamp":"..."}
```

---

## 6. Run the Frontend

```bash
cd packages/web

# Set up environment (first time only)
cp .env.local.example .env.local

# Start the dev server
pnpm dev
```

The frontend will be running at:
- **Send Payment**: http://localhost:3001
- **Dashboard**: http://localhost:3001/dashboard
- **Admin Panel**: http://localhost:3001/admin

### Configure Phantom Wallet for Devnet

1. Open Phantom browser extension
2. Go to **Settings** → **Developer Settings**
3. **Change Network** → select **Devnet**
4. You can airdrop devnet SOL from https://faucet.solana.com

### Test the Send Payment Flow

1. Open http://localhost:3001
2. Connect your Phantom wallet (Devnet)
3. Enter a recipient name, wallet address, and amount
4. Complete KYC verification (name, DOB, nationality)
5. Watch the compliance pipeline run:
   - KYT scoring (risk analysis)
   - Travel Rule packaging (IVMS101 hash)
   - Oracle attestation (Solana Memo transaction)
6. Click the Explorer link to verify the on-chain attestation

> **Tip:** The Dashboard and Admin pages work with mock data even without the API. The Send flow needs the API running on port 3000.

---

## 7. Build the SDK

```bash
cd packages/sdk
pnpm build
```

This outputs to `packages/sdk/dist/` and can be imported by other packages.

---

## 8. Deploy to Devnet (optional)

```bash
# Switch to devnet
solana config set --url devnet

# Airdrop some SOL for deployment
solana airdrop 5

# Deploy
cd packages/program
anchor deploy --provider.cluster devnet

# Update .env
# SOLANA_RPC_URL=https://api.devnet.solana.com
```

---

## 9. Project Structure Reference

```
payclear/
├── .env.example              # Environment template
├── .github/workflows/        # CI pipelines (4 workflows)
├── package.json              # Root workspace config
├── pnpm-workspace.yaml       # Workspace packages
├── turbo.json                # Build orchestration
│
├── packages/web/             # Frontend (Next.js 14)
│   ├── src/app/
│   │   ├── page.tsx                 # Send Payment (4-step flow)
│   │   ├── dashboard/page.tsx       # Transaction history
│   │   └── admin/page.tsx           # Oracle attestation panel
│   ├── src/components/
│   │   ├── providers.tsx            # Solana wallet provider
│   │   └── header.tsx               # Navigation header
│   └── src/lib/
│       ├── api.ts                   # Typed API client
│       ├── constants.ts             # Solana config
│       └── types.ts                 # Shared types
│
├── packages/api/             # REST API (Fastify/TypeScript)
│   ├── src/
│   │   ├── index.ts                 # Server entrypoint
│   │   ├── config.ts                # Environment config
│   │   ├── routes/
│   │   │   ├── compliance.ts        # Public /api/* endpoints
│   │   │   ├── institutions.ts      # Institutional /v1/* endpoints
│   │   │   ├── entities.ts
│   │   │   ├── transfers.ts
│   │   │   ├── policies.ts
│   │   │   ├── audit.ts
│   │   │   └── webhooks.ts
│   │   ├── services/
│   │   │   ├── kyc.service.ts       # KYC verification (Sumsub mock)
│   │   │   ├── kyt.service.ts       # KYT risk scoring engine
│   │   │   ├── solana.service.ts    # Oracle keypair + Memo signing
│   │   │   ├── entity.service.ts
│   │   │   ├── transfer.service.ts
│   │   │   └── audit.service.ts
│   │   ├── middleware/              # Auth, validation
│   │   ├── db/                      # Drizzle schema + client
│   │   └── schemas/                 # Zod request validation
│   └── drizzle.config.ts
│
├── packages/program/         # Solana program (Rust/Anchor)
│   ├── programs/payclear/src/
│   │   ├── lib.rs                   # Program entrypoint
│   │   ├── instructions/            # 10 instruction handlers
│   │   ├── state/                   # 6 PDA account types
│   │   ├── errors.rs                # Custom error codes
│   │   └── constants.rs             # Seeds, status values
│   └── tests/                       # Integration tests
│
├── packages/sdk/             # TypeScript SDK (@payclear/sdk)
│   └── src/
│       ├── client.ts                # PayClearClient class
│       ├── accounts/                # PDA helpers + types
│       └── utils/                   # Hash functions
│
└── packages/docs/            # Documentation
```

---

## 10. Common Commands

| Task | Command |
|------|---------|
| Install all deps | `pnpm install` (from root) |
| Build everything | `pnpm build` (from root, uses Turborepo) |
| Run frontend | `cd packages/web && pnpm dev` (port 3001) |
| Run API | `cd packages/api && pnpm dev` (port 3000) |
| Run DB migrations | `cd packages/api && pnpm db:migrate` |
| Build program | `cd packages/program && anchor build` |
| Test program | `cd packages/program && anchor test` |
| Build SDK | `cd packages/sdk && pnpm build` |
| Test SDK | `cd packages/sdk && pnpm test` |
| Lint everything | `pnpm lint` (from root) |

---

## 11. Troubleshooting

### `anchor build` fails with "solana not found"
Make sure Solana CLI is in your PATH:
```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

### `anchor test` fails with "program not found"
Run `anchor build` first, then `anchor test`.

### Database connection refused
Check PostgreSQL is running:
```bash
sudo systemctl status postgresql   # Linux
brew services list                 # macOS
```

### Redis connection refused
Check Redis is running:
```bash
redis-cli ping  # should return PONG
```

### Program ID mismatch
After first `anchor build`, update the program ID in all three places (see Step 4 above) and rebuild.

### Frontend can't connect to API
Make sure the API is running on port 3000 first. Check that `packages/web/.env.local` has:
```
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### Phantom wallet not showing Devnet
Go to Phantom → Settings → Developer Settings → Change Network → select **Devnet**.

### Oracle attestation fails with "Failed to load oracle keypair"
You need a funded Solana keypair. Either:
- Set `ORACLE_PRIVATE_KEY` in `.env` to a JSON array (e.g., `[1,2,3,...]`)
- Or set `ANCHOR_WALLET` to point to a keypair JSON file

Then airdrop SOL: `solana airdrop 2 <address> --url devnet`

---

## Questions?

Check the docs in `packages/docs/` or open an issue.
