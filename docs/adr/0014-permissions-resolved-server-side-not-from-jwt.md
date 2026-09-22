# User Permissions are resolved on the server for each request, not taken from the JWT

A User's JWT carries role keys for information only. `PermissionsGuard` computes the actor's effective **Permissions** as the union of the permission keys of all their Roles, supporting `area.*` and `*` wildcards. It loads them from MongoDB and caches them in Redis per actor. This means a role change takes effect without reissuing tokens, and tokens stay small.

- Caching: empty results are never cached, a cache failure counts as a miss, and only a database failure denies access (fail-closed).
- `PermissionsModule` is `@Global()` (#33/#34), which breaks the Permissions → Audit → Permissions import cycle. `forwardRef` was rejected because it would leave a declared cycle.
- **System modules** (the menu catalog) control navigation visibility only. They never grant anything.
- **Scopes** authorize Services and Terminals; **Permissions** authorize Users. They are separate systems.

## Known problems

- Three action vocabularies are used (`read`/`update` in roles, `view`/`edit` in modules, `write`/`approve`/`edit` in controllers).
- `invalidateCache` does nothing.
- `requiresSuperAdmin` is not enforced.
- Unmasking a Tenant PAN checks a Scope, which a User never has.
