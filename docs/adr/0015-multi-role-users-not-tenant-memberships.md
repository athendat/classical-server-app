# Users hold one primary role plus additional roles, not per-tenant memberships

A User has one `roleKey` and a list of `additionalRoleKeys`; their Permissions are the union of all of them. Self-registering as a Merchant gives `user` plus `merchant`. [IMPLEMENTATION_SUMMARY.md](../project/IMPLEMENTATION_SUMMARY.md) calls this "Option B". Its "Option A", role assignments scoped per Tenant, was deferred as too heavy for the case of one person operating one business.

## Consequences

- A User belongs to at most one Tenant, and roles are not scoped per Tenant.
- Tenant admins can only assign the tenant-assignable roles (user, developer, merchant). This whitelist is enforced on the server (it used to be UI-only, which allowed privilege escalation).
- Role-combination rules (`validateRoleCombination`) are currently enforced only during Merchant self-registration.
