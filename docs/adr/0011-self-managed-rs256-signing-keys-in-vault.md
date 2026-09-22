# JWTs are signed with self-managed RS256 keys kept in Vault

All access tokens (Users, Tenant Services and Terminals) are RS256 JWTs signed with RSA keys the platform creates and rotates itself (`JwksAdapter`). Public key metadata lives in Vault KV at `jwks` and private keys at `jwks-private/{kid}`. This keeps key custody in our own secrets store instead of a shared HMAC secret (the `JWT_SECRET` env var is required by config but unused) or an external identity provider. No public JWKS endpoint is published; only this server verifies its own tokens.

## Decisions within this scheme

- **A sealed Vault at boot does not crash the app** (#40, #49). The API starts, signing stays fail-closed (no key means no tokens), and a retry every 10 seconds recovers. Auto-unseal was explicitly rejected by the maintainer. The previous fail-fast startup kept production down for about 10 days.

## Known problems

- Each instance runs its own rotation timer, keeps its own key cache, and overwrites the shared `jwks` record.
- A key's expiry equals its rotation interval (24 hours by default), so 7-day refresh tokens stop verifying after the first rotation.
