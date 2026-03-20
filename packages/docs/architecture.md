# PayClear Architecture

## Overview

PayClear is a native compliance layer for institutional stablecoin payments on Solana. It operates as a protocol that any SPL token or Token-2022 mint can integrate with.

## Design Principles

### 1. On-Chain Minimalism
Only hashes, flags, and scores live on-chain. Full PII and IVMS101 data stays in PostgreSQL. This:
- Keeps account sizes small (132-282 bytes), minimizing rent costs
- Avoids putting sensitive data on a public ledger
- Still provides cryptographic proof of compliance via SHA-256 hashes

### 2. Dual Integration Modes
- **Mode A (Direct)**: `execute_compliant_transfer` — explicit compliance check + CPI token transfer. Works with any SPL token.
- **Mode B (Transfer Hook)**: Token-2022 transfer hook — passive compliance gate. Every `transfer_checked` is auto-gated. Works only with Token-2022 mints.

### 3. Per-Institution Policies
Each institution configures its own compliance policies rather than a one-size-fits-all standard. Different jurisdictions have different thresholds, KYC requirements, and restricted territories.

### 4. Nonce-Based Identification
Each transfer gets a unique 32-byte nonce that links the on-chain record to the off-chain database entry. This provides a stable identifier across both systems.

## Account Architecture

All on-chain accounts are PDAs (Program Derived Addresses) derived deterministically from seeds.

### Registry (Singleton)
- Seeds: `["registry"]`
- Global state: authority, counts, kill switch
- One per deployment

### Institution
- Seeds: `["institution", institution_id]`
- Represents a registered VASP/bank/fintech
- Has its own authority keypair
- Tracks attestation counts

### KycAttestation
- Seeds: `["kyc", institution_pubkey, wallet_pubkey]`
- One attestation per (institution, wallet) pair
- Stores: KYC level, risk score, status, expiry, hash of off-chain data
- Lifecycle: pending → active → suspended/revoked

### CompliancePolicy
- Seeds: `["policy", institution_pubkey, policy_id]`
- Configurable rules: min KYC level, max risk score, transfer limits
- Travel Rule threshold: amount above which FATF Travel Rule applies
- Jurisdiction allow/block lists

### TravelRuleRecord
- Seeds: `["travel_rule", nonce]`
- Links originator and beneficiary VASPs
- Stores hashes of IVMS101 data
- Lifecycle: pending → approved/rejected → settled

### TransferRecord
- Seeds: `["transfer", nonce]`
- Receipt of a completed compliant transfer
- Links to compliance policy and travel rule record used

## Compliance Gate Flow

```
execute_compliant_transfer(nonce, amount)
  │
  ├─ 1. Check sender KYC attestation (active, not expired)
  ├─ 2. Check receiver KYC attestation (active, not expired)
  ├─ 3. Verify KYC levels >= policy.min_kyc_level
  ├─ 4. Verify risk scores <= policy.max_risk_score
  ├─ 5. If amount >= threshold: verify TravelRuleRecord is approved
  ├─ 6. Check amount <= policy.max_transfer_amount
  ├─ 7. CPI: token_program::transfer_checked
  ├─ 8. Create TransferRecord PDA
  └─ 9. Emit ComplianceTransferEvent
```

## Transfer Hook (Mode B)

For Token-2022 mints, PayClear can be registered as the transfer hook program:

1. **Setup**: Call `initialize_extra_account_meta_list` to register extra accounts (attestation PDAs, policy) that the hook needs
2. **Execution**: On every `transfer_checked`, Token-2022 automatically calls PayClear's `transfer_hook` handler
3. **Gate**: The hook performs the same compliance checks as Mode A (except Travel Rule, which requires Mode A)
4. **Result**: Non-compliant transfers are rejected (rolled back)

## API Layer

The REST API bridges institutional systems with the on-chain protocol:

```
Institution → API (auth + validation) → Service Layer → Solana Program
                                           │
                                      PostgreSQL (full data)
```

- **Auth**: API key per institution (bcrypt-hashed)
- **Validation**: Zod schemas → OpenAPI auto-generation
- **Services**: Orchestrate off-chain storage + on-chain transactions
- **Workers**: Background tx monitoring + webhook delivery (BullMQ)

## Data Flow: Compliant Transfer

```
1. Institution calls POST /v1/transfers
2. API validates request, checks entity KYC status in DB
3. If Travel Rule required: store IVMS101 data in PostgreSQL
4. Build on-chain transaction:
   a. record_travel_rule (if needed) — store hashes on-chain
   b. approve_travel_rule (beneficiary VASP)
   c. execute_compliant_transfer — compliance gate + CPI
5. Submit transaction to Solana
6. Confirm transaction
7. Store TransferRecord in DB
8. Dispatch webhook events
9. Return transfer receipt
```
