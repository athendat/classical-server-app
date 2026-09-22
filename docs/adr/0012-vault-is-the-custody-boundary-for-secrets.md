# Vault is where secrets live: PANs, PINs, seeds and private keys

Material that would be catastrophic to leak lives only in Vault KV v2, never in MongoDB:

| Secret | Vault path |
|---|---|
| Card PAN and Stored PIN block | `cards/{id}` |
| Tenant beneficiary PAN | `tenants/{id}/pan` |
| Tenant OAuth2 secret | `tenants/{id}/oauth2-secret` |
| NFC Root seed | `nfc-enrollments/{cardId}/root-seed` |
| Device private key | `devices/keys/{handle}/private` |
| JWT signing keys | `jwks*` |

MongoDB holds only references and masked values such as the last four digits.

The platform signs in to Vault with **AppRole** (#38/#39), and `VAULT_TOKEN` is left empty in production. A real 401 or 403 forces a new login; temporary errors do not. KV paths are checked against an allowlist (CodeQL SSRF finding).

When Vault data is only supplementary (for example, a Tenant PAN shown masked), a Vault failure makes the field degrade rather than failing the request with a 500 (#47).

## Exceptions not yet resolved

- SGT secrets and the API key are in env vars.
- Tenant webhook secrets are stored in plaintext in MongoDB.
- `VAULT_NAMESPACE` is really a KV path prefix (open-source Vault has no namespaces); renaming it was deferred.
