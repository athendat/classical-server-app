# The Tenant comes from credentials, never the request; isolation is enforced in application code

The Tenant for a request always comes from the authenticated Actor: the JWT `tenantId` claim for Users, or the credentials themselves for Services and Terminals. It is never read from the body or path. Handlers with no Tenant fail closed. Isolation is enforced inside each service by adding the Tenant to queries (`plan-dashboardStatistics`: "Control en aplicación… no en db query"), not by a database plugin or a separate database per Tenant. We accepted this to keep a single shared schema with no extra machinery.

## Consequences

- Every new tenant-scoped query must filter by Tenant explicitly. Nothing enforces this centrally.
- Two links exist today: `Tenant.userId` (the owner) and `User.tenantId` (membership). The JWT `tenantId` is filled only from the owner link, so members added via `/users/my-tenant` get no `tenantId` in their token. This must be fixed or the model simplified.
- Audit events have no Tenant, so the audit log is for Platform operators only (#48).
