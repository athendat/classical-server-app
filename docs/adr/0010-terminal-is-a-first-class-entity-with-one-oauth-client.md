# A Terminal is a first-class entity with exactly one OAuth client

A Tenant's points of sale are modelled as **Terminals** (PRD #7), each owning exactly one OAuth2 client-credentials client whose Scopes come from a template for its type (physical_pos, web, kiosk). Suspending, reactivating, revoking or rotating a Terminal is applied to its client as well.

- Credential rotation revokes the old client and creates a new one, so the old and new credentials are never both valid.
- Terminals are never hard-deleted; they are revoked, to keep the audit trail.
- Capabilities are deliberately **not** tied to the Terminal type (e.g. Web NFC is possible). The NFC Authorization checks the Capability, not the type.
- The Tenant comes from the Terminal's credentials, never from the request.
- Older OAuth clients without a Terminal still work; migrating them is deferred.

Only NFC uses Terminals. QR payments are created with the Tenant's own Service identity. This leaves two different kinds of Service credentials: Tenant OAuth2 credentials (secret in Vault) and Terminal OAuth clients (argon2-hashed). Merging them is an open question.
