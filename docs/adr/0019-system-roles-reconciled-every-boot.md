# System roles are reconciled from code on every boot; other seeds run once

The Roles defined in `system-roles.ts` belong to the code. On every startup `SystemBootstrapService` upserts them, updating `permissionKeys`, name and description but keeping `status` as it is, so permission changes shipped in code reach every environment (#42/#44). A seed test guarantees that only admin roles get Tenant listing (#50). System modules and the Super admin are created **only when their collection is empty**. The Super admin comes from `SA_EMAIL`/`SA_PWD`.

## Consequences

- New System modules or new menu permissions never reach existing environments. Open PR #35 would reconcile modules the same way roles are.
- There are three phases (modules, roles, Super admin), not the four some docs describe. `SEED_ENABLED*` is ignored.
