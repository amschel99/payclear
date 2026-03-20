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
git clone <repo-url> paystable
cd paystable
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

## 6. Build the SDK

```bash
cd packages/sdk
pnpm build
```

This outputs to `packages/sdk/dist/` and can be imported by other packages.

---

## 7. Deploy to Devnet (optional)

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

## 8. Project Structure Reference

```
paystable/
├── .env.example              # Environment template
├── .github/workflows/        # CI pipelines
├── package.json              # Root workspace config
├── pnpm-workspace.yaml       # Workspace packages
├── turbo.json                # Build orchestration
│
├── packages/program/         # Solana program (Rust/Anchor)
│   ├── Anchor.toml           # Anchor config
│   ├── Cargo.toml            # Rust workspace
│   ├── programs/payclear/
│   │   └── src/
│   │       ├── lib.rs                # Program entrypoint + all instructions
│   │       ├── instructions/         # One file per instruction handler
│   │       │   ├── initialize_registry.rs
│   │       │   ├── register_institution.rs
│   │       │   ├── create_kyc_attestation.rs
│   │       │   ├── revoke_kyc_attestation.rs
│   │       │   ├── update_risk_score.rs
│   │       │   ├── set_compliance_policy.rs
│   │       │   ├── record_travel_rule.rs
│   │       │   ├── approve_travel_rule.rs
│   │       │   ├── execute_compliant_transfer.rs
│   │       │   └── transfer_hook.rs
│   │       ├── state/                # Account structs (PDAs)
│   │       │   ├── registry.rs
│   │       │   ├── institution.rs
│   │       │   ├── kyc_attestation.rs
│   │       │   ├── compliance_policy.rs
│   │       │   ├── travel_rule_record.rs
│   │       │   └── transfer_record.rs
│   │       ├── errors.rs            # Custom error codes
│   │       └── constants.rs         # Seeds, status values
│   └── tests/                       # Integration tests (TypeScript)
│
├── packages/api/             # REST API (Fastify/TypeScript)
│   ├── src/
│   │   ├── index.ts                 # Server entrypoint
│   │   ├── config.ts                # Environment config
│   │   ├── routes/                  # HTTP handlers
│   │   ├── services/                # Business logic
│   │   ├── middleware/              # Auth, validation
│   │   ├── db/                      # Drizzle schema + client
│   │   └── schemas/                 # Zod request validation
│   └── drizzle.config.ts
│
├── packages/sdk/             # TypeScript SDK (@payclear/sdk)
│   └── src/
│       ├── index.ts                 # Public exports
│       ├── client.ts                # PayClearClient class
│       ├── accounts/                # PDA helpers + types
│       └── utils/                   # Hash functions
│
└── packages/docs/            # Documentation
    ├── architecture.md
    ├── getting-started.md
    └── travel-rule-compliance.md
```

---

## 9. Common Commands

| Task | Command |
|------|---------|
| Install all deps | `pnpm install` (from root) |
| Build everything | `pnpm build` (from root, uses Turborepo) |
| Build program | `cd packages/program && anchor build` |
| Test program | `cd packages/program && anchor test` |
| Run API (dev) | `cd packages/api && pnpm dev` |
| Run DB migrations | `cd packages/api && pnpm db:migrate` |
| Build SDK | `cd packages/sdk && pnpm build` |
| Test SDK | `cd packages/sdk && pnpm test` |

---

## 10. Troubleshooting

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

---

## Questions?

Check the docs in `packages/docs/` or open an issue.
