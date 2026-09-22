# Amounts are stored in minor units and exposed as major units inside the domain

Transaction amounts come in from Tenants, and go to SGT, in minor units (cents). They are **stored** in minor units too (commit 03c6eef). The repository mapper converts to major units (× 0.01) for the domain model, and API responses convert back. Integer storage avoids floating-point drift in anything persisted or sent to the Issuer.

## Consequences

- Any code between the repository and the controller works in major units; everything else works in minor units. The conversion has caused real bugs (PR #18, commit 8e6d864), so new code must say which unit it uses.
- The Gateway fee (2.5%) is hard-coded in `TransactionPaymentProcessor`, not configured per Tenant.
- Only currency 840 is ever used in Payment QRs.
