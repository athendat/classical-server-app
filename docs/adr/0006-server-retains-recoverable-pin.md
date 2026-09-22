---
status: accepted (de facto) — under regulatory review (#53–#57)
---

# The server keeps a recoverable PIN for each Card

SGT expects the Card's PIN on activation and on every transfer, and Customers do not re-enter it when paying (ADR-0003). So at Card registration the server receives the PIN, stores a **reversible** PIN block with the PAN in Vault (`cards/{cardId}`), and decodes it whenever an SGT PIN block is needed. The alternative in [CAPTURA_SEGURA_DEL_PIN.md](../integration-guides/CAPTURA_SEGURA_DEL_PIN.md) was rejected, or at least never built: the PIN encrypted end to end on the device, the server never seeing it, and a fresh PIN per payment. Doing it would need Customer PIN entry at payment time or a different SGT contract.

## Consequences

- The platform is in PCI PIN-security scope. Vault custody of `cards/*` is critical, and PINs and PANs must never be logged.
- The stored block is an 8-byte, format-0-style XOR block, not ISO format 4 as the code and docs call it. It protects nothing without the PAN, which sits in the same Vault secret.
- Reversing this decision is a mobile, backend and SGT change together.
