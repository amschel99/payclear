# PayClear Protocol — Technical Implementation Plan
### StableHacks 2026 | Team Submission Document

---

## Overview

PayClear is a native compliance layer for institutional stablecoin payments on Solana. Every USDC transfer is wrapped with KYC attestations, KYT risk scores, and Travel Rule data — embedded directly into the transaction — before settlement is released. This document outlines the full technical implementation plan for the hackathon sprint.

**Hackathon deadline:** 22 March 2026
**Track:** Programmable Stablecoin Payments
**Chain:** Solana (devnet for demo, mainnet-ready architecture)

---

## Team Roles Needed

| Role | Responsibilities |
|---|---|
| Solana / Anchor Developer | Smart contract (programs), on-chain logic, devnet deployment |
| Full-Stack Developer | Next.js frontend, wallet integration, API connections |
| Backend / Node.js Developer | Compliance API server, Sumsub integration, oracle signing |
| Product Lead | Demo flow, Loom video, submission writeup, slide deck |

> **Note:** A minimum of 2 engineers is required. The Solana and backend roles can be combined by one strong engineer if needed. Solo submissions are disqualified by the hackathon rules.

---

## System Architecture Summary

The system has three layers that work together in sequence for every payment:

**Layer 1 — Frontend (Next.js)**
The user-facing application where a sender initiates a USDC payment. It connects to the user's Solana wallet, collects KYC applicant data, and displays real-time compliance and transaction status.

**Layer 2 — Compliance Engine (Node.js Backend)**
A backend API server that acts as the compliance oracle. It calls Sumsub for KYC verification, runs a KYT risk scoring engine against the transaction, and packages Travel Rule data as an encrypted payload. Once all three checks pass, the oracle signs an on-chain attestation to unlock the payment.

**Layer 3 — On-Chain Program (Anchor / Solana)**
Three on-chain instructions handle the full payment lifecycle. The first locks USDC into an escrow PDA (program-derived account) and stores compliance metadata hashes. The second records the oracle's compliance attestation on-chain. The third releases funds to the receiver only after attestation is confirmed.

---

## Day-by-Day Sprint Plan

### Day 1–2 | Solana Smart Contract

**Goal:** Deploy a working Anchor program to Solana devnet with all three core instructions.

**What to build:**
- `create_payment` instruction — locks USDC into an escrow vault PDA, stores sender, receiver, amount, Travel Rule hash, and KYC expiry on-chain
- `attest_compliance` instruction — called by the oracle backend; records KYT score and AML clearance; updates payment status to "cleared"
- `settle_payment` instruction — releases escrowed USDC to the receiver wallet; only succeeds if status is "cleared"
- `AttestationRegistry` account — stores per-wallet KYC verification status and KYT score history
- Custom error codes for high-risk transactions, AML failures, and invalid state transitions

**Tools & dependencies required:**
- Rust (stable toolchain)
- Solana CLI (configured to devnet)
- Anchor CLI (latest version via AVM)
- `anchor-spl` crate for SPL token (USDC) operations
- Devnet USDC token mint address
- Funded devnet keypair for deployment (use `solana airdrop`)

**Deliverable:** Program deployed to devnet with a public program ID logged and saved.

---

### Day 3–4 | Compliance Backend API

**Goal:** A running Node.js server that handles KYC, KYT, Travel Rule, and oracle attestation signing.

**What to build:**

`POST /api/kyc/verify`
Accepts a wallet address and Sumsub applicant ID. Calls the Sumsub sandbox API to retrieve the applicant's review result. Stores the KYC status and expiry in the database. Returns verified true/false to the frontend.

`POST /api/kyt/score`
Accepts sender wallet, receiver wallet, amount, and currency. Runs a risk scoring model against the transaction. Scoring factors include: transfer amount thresholds, wallet age (checked via Solana RPC), transaction history volume, and counterparty flags. Returns a numeric risk score (0–100, lower is safer) and a pass/fail result.

`POST /api/travel-rule/package`
Accepts originator and beneficiary details (name, wallet, VASP ID). Packages this into a signed, encrypted JSON payload. Returns a SHA-256 hash of the payload to be stored on-chain, and optionally the full payload for VASP-to-VASP transmission.

`POST /api/oracle/attest`
The final compliance step. Called internally after all three checks pass. Uses the oracle keypair to sign and submit the `attest_compliance` Solana transaction. Broadcasts the result to the frontend via a status update.

**Tools & dependencies required:**
- Node.js 18+
- Express.js
- `@solana/web3.js` and `@coral-xyz/anchor` for on-chain calls
- Sumsub sandbox account and API keys (free tier, sign up at sumsub.com)
- Oracle keypair (a Solana keypair whose public key is hardcoded as the trusted oracle in the smart contract)
- Supabase or any simple Postgres instance for off-chain KYC record storage
- `dotenv` for secrets management
- `cors` for frontend communication

**Environment variables needed:**
- `ORACLE_PRIVATE_KEY` — the oracle Solana keypair JSON array
- `SUMSUB_APP_TOKEN` — Sumsub API token
- `SUMSUB_APP_SECRET` — Sumsub secret for request signing
- `DATABASE_URL` — Supabase or Postgres connection string
- `PROGRAM_ID` — your deployed Anchor program ID

**Deliverable:** Local server running on port 3001, all four endpoints returning correct responses in Postman.

---

### Day 5–6 | Next.js Frontend

**Goal:** A working web UI connected to both the backend and Solana devnet.

**What to build:**

**Send Payment Flow (4 steps)**
1. Connect wallet via Phantom or Backpack
2. Enter receiver wallet address and USDC amount
3. Complete KYC — enter personal details, trigger Sumsub verification
4. Submit — backend runs KYT + Travel Rule in the background; show a compliance status spinner; on clearance, trigger the `settle_payment` instruction

**Compliance Dashboard**
- Table showing all transactions with columns: amount, receiver, KYT score, Travel Rule status, settlement time
- Status badges: Pending / Cleared / Rejected / Settled
- Links to Solana Explorer for each transaction signature

**Admin / Oracle Panel** (for demo purposes)
- List of pending payments awaiting attestation
- Manual "Attest" button that triggers the oracle API endpoint
- Useful for judges to see the compliance gate in action during the demo

**Tools & dependencies required:**
- Next.js 14 (App Router)
- Tailwind CSS
- `@solana/wallet-adapter-react` and `@solana/wallet-adapter-wallets`
- `@coral-xyz/anchor` for frontend program calls
- Axios for backend API calls
- Sumsub Web SDK (embed the KYC flow directly in the browser)
- Vercel account for deployment

**Deliverable:** Deployed Vercel URL with a working send flow on Solana devnet.

---

### Day 7 | Integration, Polish & Demo Recording

**Goal:** End-to-end working demo from wallet connection through to settled USDC.

**Integration checklist:**
- Frontend send flow calls backend KYC endpoint correctly
- Backend KYT and Travel Rule run in sequence with no blocking errors
- Oracle attests on-chain after all checks pass
- Frontend polls for compliance status update and triggers settlement
- Dashboard shows the full audit trail post-settlement
- All Solana Explorer links resolve on devnet

**Demo script for Loom video (3 minutes max):**
1. (0:00–0:30) Problem statement — why institutional stablecoin payments are blocked by compliance gaps
2. (0:30–1:15) Live walkthrough — initiate a $500 USDC payment, complete KYC, watch compliance gate run
3. (1:15–2:00) Show compliance dashboard — KYT score, Travel Rule hash, on-chain attestation, settlement signature
4. (2:00–2:30) Architecture overview — briefly explain the three-layer system
5. (2:30–3:00) Vision — African trade corridors as the first market, path to institutional adoption

**Deliverable:** Loom video link, public GitHub repo, Vercel demo URL.

---

### Day 8 | Submission

**DoraHacks submission checklist:**
- [ ] Project name: PayClear Protocol
- [ ] All team member names and countries
- [ ] Loom video link (max 3 minutes)
- [ ] GitHub public repository link
- [ ] Testnet demo URL (Vercel)
- [ ] Track selected: Programmable Stablecoin Payments
- [ ] Submission description written (see section below)

---

## Submission Description (Draft)

**Problem**
Institutions and fintechs cannot use stablecoins for cross-border B2B payments because compliance — KYC, KYT, AML, and Travel Rule — is treated as an afterthought. It is checked manually, stored off-chain, and never verifiably tied to the on-chain transfer itself. Regulators cannot audit the trail. Banks cannot trust the flow.

**Solution**
PayClear makes compliance the transaction. Every USDC payment on Solana is wrapped with on-chain compliance metadata before settlement is released. KYC attestations, KYT risk scores, and Travel Rule hashes are embedded in the transaction structure itself via an Anchor escrow program. Funds are locked in a PDA until a trusted oracle confirms that all compliance conditions are met — then and only then does settlement execute.

**Why Solana**
Sub-second finality and sub-cent fees make Solana the only viable chain for real-time institutional payment settlement at scale. Account-based architecture also maps cleanly to the per-wallet attestation model PayClear requires.

**Market**
Starting with African cross-border trade corridors — Kenya, Nigeria, Uganda, Ghana — where $50B+ in annual B2B payments still move on slow, expensive SWIFT rails. No CEX dependency. Direct integration with local payout rails (M-Pesa, bank transfers) in the full product roadmap.

**Compliance Coverage**
KYC via Sumsub, KYT via on-chain risk scoring engine, Travel Rule via encrypted VASP-to-VASP payload with on-chain hash anchor, AML clearance via oracle attestation before settlement.

---

## Judging Criteria Alignment

| Criteria | How PayClear addresses it |
|---|---|
| Team Execution & Technical Readiness | Working Anchor program on devnet, live Vercel demo, full end-to-end flow |
| Institutional Fit & Compliance Awareness | KYC + KYT + AML + Travel Rule all implemented, not just mentioned |
| Stablecoin Infrastructure Innovativeness | Compliance embedded in the transaction itself — not a bolt-on layer |
| Scalability & Adoption Potential | Stateless oracle design scales horizontally; African corridor is a proven high-volume market |
| Submission Clarity & Completeness | 3-min Loom, public GitHub, live demo, clear writeup |

---

## Key External Services & Accounts to Set Up

| Service | Purpose | How to get access |
|---|---|---|
| Sumsub | KYC verification (sandbox) | sumsub.com — free sandbox account, instant approval |
| Solana devnet | Chain environment | Built into Solana CLI, no signup needed |
| Circle devnet USDC | Test stablecoin | faucet.circle.com — devnet USDC faucet |
| Vercel | Frontend hosting | vercel.com — free tier, deploy with GitHub |
| Supabase | Off-chain KYC records DB | supabase.com — free tier, instant Postgres |
| Phantom Wallet | Wallet for testing | phantom.app — browser extension, free |
| Loom | Demo video recording | loom.com — free tier, 5-min limit (sufficient) |

---

## Risk Log

| Risk | Mitigation |
|---|---|
| Sumsub sandbox API takes time to approve | Sign up immediately on Day 1; use mock KYC responses for early testing |
| Anchor devnet deployment fails | Keep program simple; test locally with `anchor test` before deploying |
| Solo submission disqualification | Recruit at least one teammate from Superteam Germany Discord or hackathon Telegram immediately |
| Travel Rule integration complexity | Use a static structured JSON payload for demo; real TRISA integration is a post-hackathon milestone |
| Time overrun on frontend | Prioritise the send flow and compliance dashboard; skip the admin panel if needed |

---

*Document prepared for internal team use. All team members should review and claim their role by Day 1.*