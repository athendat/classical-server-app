# Plan Final: Módulo de Tenants con Máquina de Estados Xstate

**TL;DR:** Crear módulo `tenants` para gestión de negocios con validación Luhn de PAN en CreateTenantDto, almacenamiento seguro en HashiCorp Vault, máquina de estados xstate (pending_review → more_data_requested/approved/rejected → active), colección `tenant_lifecycles` para auditoría, decorador `@UnmaskBankAccount` para verificar permiso `tenants.view-sensitive`, endpoints CRUD documentados con Swagger, paginación con `build-pagination-meta`, y permisos asociados a roles en seeds.

## Steps

1. **Crear validador Luhn personalizado** en `src/common/validators/luhn.validator.ts` usando `@ValidatorConstraint`, exponerlo en `src/common/validators/index.ts`.

2. **Definir DTOs de Tenants** en `src/modules/tenants/dto/`: CreateTenantDto (con @IsLuhnCard() en pan), UpdateTenantDto, TransitionTenantStateDto, TenantResponseDto (con maskedPan), TenantPaginatedResponseDto (data[], meta); todos con @ApiProperty.

3. **Crear servicio TenantVaultService** en `src/modules/tenants/infrastructure/services/tenant-vault.service.ts`: savePan(), getPan(), deletePan(), maskPan() usando IVaultClient inyectado.

4. **Implementar máquina de estados** en `src/modules/tenants/domain/tenant.state-machine.ts` con xstate: estados PENDING_REVIEW, MORE_DATA_REQUESTED, APPROVED, REJECTED, ACTIVE; transiciones abiertas (sin restricción roleKey).

5. **Definir domain entities** en `src/modules/tenants/domain/`: TenantStatus enum, ITenantPort interface, TenantLifecycleEvent interface.

6. **Crear schemas MongoDB** en `src/modules/tenants/infrastructure/schemas/`: TenantSchema (businessName, legalRepresentative, businessAddress, panVaultKeyId, email, phone, status, createdBy, timestamps, índices), TenantLifecycleSchema (tenantId, fromState, toState, triggeredBy, comment, timestamp, xstateSnapshot).

7. **Crear repositorios** en `src/modules/tenants/infrastructure/adapters/`: TenantRepository, TenantLifecycleRepository implementando ITenantPort con métodos CRUD y findAll paginado.

8. **Implementar TenantApplicationService** en `src/modules/tenants/application/tenant.service.ts`: createTenant() (valida Luhn en DTO, guarda PAN en Vault), updateTenant(), transitionTenantState() (valida máquina, registra lifecycle con snapshot), getTenantById(), listTenants(), getTenantLifecycle(); usar Result pattern, emitir eventos.

9. **Crear decorador @UnmaskBankAccount** en `src/modules/tenants/decorators/unmask-bank-account.decorator.ts`: verificar actor.scopes incluye `tenants.view-sensitive`, si sí permitir acceso a PAN desenmascarado, sino retornar solo PAN enmascarado.

10. **Crear TenantController** en `src/modules/tenants/infrastructure/controllers/tenant.controller.ts` con 6 endpoints (POST /tenants, GET /tenants, GET /tenants/:id, PATCH /tenants/:id, POST /tenants/:id/transition, GET /tenants/:id/lifecycle); documentar con @ApiTags('Tenants'), @ApiOperation, @ApiResponse; usar @UseGuards(JwtAuthGuard, PermissionsGuard) y @Permissions('tenants.read/write').

11. **Definir eventos de dominio** en `src/modules/tenants/events/tenant.events.ts`: TenantCreatedEvent, TenantStateTransitionedEvent, TenantUpdatedEvent; escuchadores en AuditService para registrar cambios.

12. **Crear TenantsModule** en `src/modules/tenants/tenants.module.ts`: MongooseModule.forFeature([TenantSchema, TenantLifecycleSchema]), EventEmitterModule, providers (TenantApplicationService, repositorios, TenantStateMachine singleton, TenantVaultService), exports en `src/modules/tenants/index.ts`.

13. **Agregar permisos en seeds** en `src/modules/roles/seeds/system-roles.ts`: crear permisos `tenants.create`, `tenants.read`, `tenants.write`, `tenants.approve`, `tenants.view-sensitive`; asignar `tenants.view-sensitive` a roles admin, super_admin, security_officer, auditor.

14. **Integrar en AppModule** (`src/app.module.ts`) agregando TenantsModule; actualizar `src/modules/modules/backend-endpoint-modules-navigation.md` con rutas; crear `src/modules/tenants/seeds/system-tenants.ts` con tenant demo.

## Requirements Summary

### Security & Vault
- ✅ Almacenar PAN en HashiCorp Vault con ruta `tenants/{tenantId}/pan`
- ✅ Enmascarar PAN en responses: `****-****-****-{last4}`
- ✅ Desenmascara solo si actor.scopes incluye `tenants.view-sensitive`
- ✅ Validar PAN con algoritmo Luhn en CreateTenantDto

### State Machine (xstate)
- ✅ Estados: PENDING_REVIEW, MORE_DATA_REQUESTED, APPROVED, REJECTED, ACTIVE
- ✅ Transiciones: pending_review → {more_data_requested, approved, rejected}, more_data_requested → {approved, rejected, active}, approved → active, rejected → (terminal)
- ✅ Persistir transiciones en colección `tenant_lifecycles` con snapshot xstate
- ✅ Transiciones abiertas: cualquier usuario autorizado (roles admin, super_admin, operator)
- ✅ Comentarios opcionales en transiciones

### Entity Fields
**Tenant:**
- businessName (string, required)
- legalRepresentative (string, required)
- businessAddress (object: address, city, state, zipCode)
- email (string, required, unique, validated)
- phone (string, required, validated)
- panVaultKeyId (string, reference a Vault)
- status (enum: PENDING_REVIEW, MORE_DATA_REQUESTED, APPROVED, REJECTED, ACTIVE)
- createdBy (userId, required)
- createdAt, updatedAt (timestamps)

**TenantLifecycle:**
- tenantId (ObjectId, indexed)
- fromState (enum)
- toState (enum)
- triggeredBy: { userId, username, roleKey }
- comment (string, optional)
- timestamp (Date)
- xstateSnapshot (object, full state machine snapshot)

### API Endpoints
1. `POST /tenants` - Crear (status = PENDING_REVIEW, guarda PAN en Vault)
2. `GET /tenants` - Listar con paginación y filtros (status, createdAt)
3. `GET /tenants/:id` - Obtener único (PAN enmascarado/desenmascarado según permiso)
4. `PATCH /tenants/:id` - Actualizar campos (no cambiar estado)
5. `POST /tenants/:id/transition` - Cambiar estado (valida máquina xstate, registra lifecycle)
6. `GET /tenants/:id/lifecycle` - Historial de transiciones (paginado)

### DTOs
**CreateTenantDto:**
- businessName (string, required)
- legalRepresentative (string, required)
- businessAddress (object, required)
- pan (string, required, @IsLuhnCard())
- email (string, required, @IsEmail())
- phone (string, required, @Matches(phoneRegex))

**UpdateTenantDto:**
- businessName (optional)
- legalRepresentative (optional)
- businessAddress (optional)
- email (optional)
- phone (optional)
- (NO pan)

**TransitionTenantStateDto:**
- targetState (enum, required, @IsEnum(TenantStatus))
- comment (string, optional)

**TenantResponseDto:**
- id, businessName, legalRepresentative, businessAddress
- maskedPan (****-****-****-XXXX)
- unmaskPan (full PAN if actor has `tenants.view-sensitive`)
- email, phone, status, createdBy, createdAt, updatedAt

**TenantPaginatedResponseDto:**
- data (TenantResponseDto[])
- meta (pagination: page, limit, total, totalPages, hasNextPage, hasPreviousPage)

### Decorators & Guards
- `@UnmaskBankAccount()` - Parámetro decorador que verifica `tenants.view-sensitive` en actor.scopes
- `@UseGuards(JwtAuthGuard, PermissionsGuard)` - Proteger endpoints
- `@Permissions('tenants.read', 'tenants.write', etc)` - Validar permisos específicos
- `@CurrentActor()` - Inyectar actor autenticado

### Permissions (Seeds)
- `tenants.create` - Crear tenants
- `tenants.read` - Leer tenants
- `tenants.write` - Actualizar tenants
- `tenants.approve` - Cambiar estados (transitions)
- `tenants.view-sensitive` - Ver PAN desenmascarado (asignar a: admin, super_admin, security_officer, auditor)

### Events
- TenantCreatedEvent (tenantId, businessName, createdBy, timestamp)
- TenantStateTransitionedEvent (tenantId, fromState, toState, triggeredBy, timestamp)
- TenantUpdatedEvent (tenantId, fieldsChanged, updatedBy, timestamp)

### Architecture Patterns Used
- ✅ Hexagonal (domain, application, infrastructure)
- ✅ Dependency injection (puertos/adaptadores)
- ✅ Result pattern (sin excepciones en servicios)
- ✅ Event-driven (EventEmitter)
- ✅ Repository pattern (MongoDB adapters)
- ✅ DTOs con validadores (class-validator)
- ✅ Swagger/OpenAPI (decoradores @Api*)
- ✅ Guards y decoradores personalizados
- ✅ Paginación estándar (build-pagination-meta)

## Further Considerations

✅ **Confirmado:**
- Usar permiso `tenants.view-sensitive` en decorador
- Todos los usuarios autorizados pueden cambiar estados (sin restricción per-roleKey)
- Registrar todas las transiciones en `tenant_lifecycles`

❌ **No implementar (por ahora):**
- Auditoría de intentos fallidos de acceso a datos sensibles
- Rotación automática de secretos en Vault
- Subida de documentos de negocio

## Files to Create

```
src/modules/tenants/
├── tenants.module.ts
├── index.ts
├── application/
│   └── tenant.service.ts
├── domain/
│   ├── enums.ts
│   ├── tenant.state-machine.ts
│   ├── ports/
│   │   └── tenant.port.ts
│   └── interfaces/
│       └── lifecycle-event.interface.ts
├── infrastructure/
│   ├── controllers/
│   │   └── tenant.controller.ts
│   ├── services/
│   │   └── tenant-vault.service.ts
│   ├── adapters/
│   │   ├── tenant.repository.ts
│   │   └── tenant-lifecycle.repository.ts
│   └── schemas/
│       ├── tenant.schema.ts
│       └── tenant-lifecycle.schema.ts
├── dto/
│   ├── create-tenant.dto.ts
│   ├── update-tenant.dto.ts
│   ├── transition-tenant-state.dto.ts
│   ├── tenant-response.dto.ts
│   └── tenant-paginated-response.dto.ts
├── decorators/
│   └── unmask-bank-account.decorator.ts
├── events/
│   └── tenant.events.ts
└── seeds/
    └── system-tenants.ts

src/common/validators/
├── luhn.validator.ts (NEW)
└── index.ts (UPDATE - export IsLuhnCard)
```

## Modified Files

```
src/app.module.ts - Add TenantsModule import
src/modules/roles/seeds/system-roles.ts - Add tenant permissions
src/modules/modules/backend-endpoint-modules-navigation.md - Add tenant routes
package.json - xstate already installed
```
