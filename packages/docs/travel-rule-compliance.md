# Travel Rule Compliance

## Background

The **FATF Travel Rule** (Recommendation 16) requires Virtual Asset Service Providers (VASPs) to share originator and beneficiary information for transfers above a threshold (typically $1,000 USD or equivalent).

PayClear implements Travel Rule compliance by:
1. Storing full IVMS101 data off-chain (PostgreSQL)
2. Storing SHA-256 hashes of originator/beneficiary data on-chain
3. Requiring beneficiary VASP approval before the transfer executes
4. Creating an immutable, auditable on-chain record

## IVMS101 Data Fields

PayClear captures the following IVMS101 fields:

### Originator
| Field | Required | Description |
|-------|----------|-------------|
| `originatorName` | Yes | Full legal name |
| `originatorAccount` | Yes | Wallet address or account identifier |
| `originatorAddressStreet` | No | Street address |
| `originatorAddressCity` | No | City |
| `originatorAddressCountry` | No | ISO 3166-1 alpha-2 country code |
| `originatorNationalId` | No | National ID number |
| `originatorDob` | No | Date of birth |
| `originatorPlaceOfBirth` | No | Place of birth |

### Beneficiary
| Field | Required | Description |
|-------|----------|-------------|
| `beneficiaryName` | Yes | Full legal name |
| `beneficiaryAccount` | Yes | Wallet address or account identifier |
| `beneficiaryAddressStreet` | No | Street address |
| `beneficiaryAddressCity` | No | City |
| `beneficiaryAddressCountry` | No | ISO 3166-1 alpha-2 country code |
| `beneficiaryInstitutionName` | No | Name of the beneficiary VASP |

## Flow

```
Originator VASP                    Beneficiary VASP
      │                                  │
      │  1. record_travel_rule           │
      │     (hashes on-chain)            │
      ├──────────────────────────────────►│
      │                                  │
      │  2. Off-chain: share full        │
      │     IVMS101 data via API         │
      ├──────────────────────────────────►│
      │                                  │
      │  3. approve_travel_rule          │
      │◄──────────────────────────────────┤
      │                                  │
      │  4. execute_compliant_transfer   │
      │     (checks travel rule status)  │
      ├──────────────────────────────────►│
      │                                  │
```

## Threshold Configuration

Each `CompliancePolicy` has a `travel_rule_threshold` field:
- Amount is in the token's smallest unit (e.g., 1000 USDC = 1,000,000,000 with 6 decimals)
- Transfers at or above this amount require an approved `TravelRuleRecord`
- Set to `0` to disable Travel Rule requirement

## Hashing

Travel Rule data is hashed using SHA-256 before on-chain storage:

```typescript
import { hashTravelRuleData } from "@payclear/sdk";

const originatorHash = hashTravelRuleData({
  name: "Alice Smith",
  account: "AbC123...",
  addressCountry: "US",
});
// → 32-byte Buffer stored on-chain
```

The hash function normalizes data by sorting keys before hashing, ensuring consistent hashes regardless of field ordering.

## Verification

Auditors and regulators can verify compliance by:
1. Reading the `TravelRuleRecord` PDA on-chain (hashes + status)
2. Requesting full IVMS101 data from the API
3. Independently hashing the data and comparing against on-chain hashes
4. Verifying the approval chain (originator submitted, beneficiary approved)

## Mode B (Transfer Hook) Limitation

Travel Rule compliance cannot be enforced in Transfer Hook mode because the hook doesn't have access to the `TravelRuleRecord` PDA. For transfers that may exceed the Travel Rule threshold, institutions should use **Mode A** (`execute_compliant_transfer`).
