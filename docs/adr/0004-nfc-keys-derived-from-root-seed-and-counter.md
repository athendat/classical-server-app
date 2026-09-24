# NFC signing keys are derived from a per-enrollment Root seed and a Counter

At NFC enrollment, the phone and server run an ECDH P-256 key exchange. The Root seed is derived from the shared secret with HKDF (empty salt, info `nfc-payment`) and the server keeps it in Vault (`nfc-enrollments/{cardId}/root-seed`). For each payment, both sides derive a one-time P-256 signing key from `HKDF(rootSeed, "nfc-payment-key:{counter}")`, in the spirit of DUKPT. This lets the phone sign offline with no key material sent per payment, and the server can check any token from the Root seed alone.

## Decisions within this scheme

- **Empty HKDF salt** (commit 5bff90c). It matches the mobile implementation; the ECDH shared secret is already uniformly random.
- **Counter starts at −1**. The first token carries Counter 0 and the check is strictly greater-than. Redis holds the authoritative last Counter, with MongoDB as a fallback. The server accepts Counters up to 10 ahead; beyond that the Card must be re-enrolled.
- **Cross-platform byte parity is locked by shared test vectors** (`src/modules/nfc-payments/test-vectors/nfc-payment-vectors.json`). Any change to the derivation must regenerate them and ship on both platforms together. `yarn test` only validates them and never rewrites them. Regenerate them with `yarn vectors:nfc`, then copy the JSON into `classical-mobile-app` in the same change.

## Consequences

- No forward secrecy: anyone holding the Root seed can derive every past and future key. No HSM is used. Issue #57 asks to document this as a conscious decision with compensating controls; that is still open.
