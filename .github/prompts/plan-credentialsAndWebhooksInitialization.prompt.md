# Plan: Credenciales OAuth2 y Webhooks Creados por Defecto en Tenants

## Resumen Ejecutivo

**Objetivo**: Al crear un tenant, generar automáticamente:
- Un objeto `oauth2ClientCredentials` (clientId y clientSecret como UUIDs sin guiones)
- Un objeto `webhook` (con URL vacía y secret generado)

Ambos se devuelven anidados en la entidad tenant. Crear dos endpoints para regenerar secrets independientemente. Crear endpoint de login de servicio en Auth que valide clientId+clientSecret y genere JWT con actor tipo `service`.

---

## Detalles Técnicos

### 1. DTOs para Regeneración de Secrets

#### `RegenerateOAuth2SecretDto` 
- **Ubicación**: `src/modules/tenants/dto/`
- **Estructura**: DTO vacío (solo acción, sin parámetros adicionales)
- **Propósito**: Validar regeneración de OAuth2 secret

#### `RegenerateWebhookSecretDto`
- **Ubicación**: `src/modules/tenants/dto/`
- **Estructura**: DTO vacío (solo acción, sin parámetros adicionales)
- **Propósito**: Validar regeneración de webhook secret

### 2. Servicios para Generación de Credenciales

#### `TenantOAuth2CredentialsService`
- **Ubicación**: `src/modules/tenants/application/services/`
- **Métodos**:
  - `generateCredentials()`: Retorna `{clientId: uuid_sin_guiones, clientSecret: uuid_sin_guiones}`
  - `regenerateSecret(tenantId)`: Actualiza solo `clientSecret` del tenant y retorna `{id: clientId, secret: clientSecret}`

#### `TenantWebhookService` (Mejorado)
- **Ubicación**: `src/modules/tenants/application/services/`
- **Métodos**:
  - `generateWebhook()`: Retorna `{id: uuid, url: null, events: [], active: true, secret: uuid_sin_guiones, createdAt: Date, updatedAt: Date}`
  - `regenerateSecret(tenantId)`: Actualiza solo `secret` del webhook existente y retorna `{id: webhookId, secret: nuevoSecret}`

### 3. Endpoints en Tenant Controller

#### Regenerar Secret de OAuth2
- **Ruta**: `POST /tenants/oauth2-credentials/regenerate-secret`
- **Guard**: `@UseGuards(JwtAuthGuard)`
- **Validación**: Tenant activo, actor es dueño del tenant
- **Response**: `{id, secret}` (credenciales renovadas)
- **Auditoría**: Registrar con severidad MEDIUM, tags `['oauth2', 'regenerate-secret', 'successful']`

#### Regenerar Secret de Webhook
- **Ruta**: `POST /tenants/webhooks/regenerate-secret`
- **Guard**: `@UseGuards(JwtAuthGuard)`
- **Validación**: Tenant activo, webhook existe, actor es dueño del tenant
- **Response**: `{id, secret}` (webhook renovado)
- **Auditoría**: Registrar con severidad MEDIUM, tags `['webhook', 'regenerate-secret', 'successful']`

### 4. Lógica de Creación de Tenant

#### Modificar servicio de creación de tenant:
- Al crear tenant, **antes de persistir**, llamar a:
  - `tenantOAuth2CredentialsService.generateCredentials()` → obtener `oauth2ClientCredentials`
  - `tenantWebhookService.generateWebhook()` → obtener `webhook`
- Asignar ambos objetos al tenant
- Persistir en MongoDB

### 5. Endpoint de Login de Servicio

#### En `Auth Controller`
- **Ruta**: `POST /auth/service-login`
- **Guard**: `@UseGuards(ApiKeyGuard)` (sin autenticación JWT)
- **DTO**: `ServiceLoginDto` con campos:
  - `clientId` (string, requerido)
  - `clientSecret` (string, requerido)
- **Validación**:
  - Buscar tenant donde `oauth2ClientCredentials.clientId === clientId`
  - Verificar `oauth2ClientCredentials.clientSecret === clientSecret`
  - Retornar 401 si no coinciden o no existe
- **Response**: `{access_token, token_type: 'Bearer', expires_in}`

#### En `AuthService`
- Nuevo método `serviceLogin(dto: ServiceLoginDto)`: Promise<ApiResponse<LoginResponseDto>>
  - Busca tenant por clientId
  - Valida clientSecret
  - Genera JWT con:
    - `sub: "svc:{tenantId}"`
    - `actorType: 'service'`
    - `tenantId: tenantId`
    - `iss`: mismo issuer
    - `aud`: mismo audience
    - `scope: 'read write'`
    - `expiresIn: 3600`
  - Registra en auditoría con severity HIGH, tags `['authentication', 'service-login', 'successful']`

### 6. Actualizaciones a JWT Payload

#### Modificar generación de JWT en `AuthService`:
- Soportar payloads con `actorType: 'service'` además de `'user'`
- Cuando `actorType === 'service'`, el `sub` es `svc:{tenantId}` en lugar de `user:{userId}`

#### Verificar `Actor Interface`:
- Confirmar que `actorType` puede ser `'user' | 'service'`
- Confirmar que `actorId` se puede resolver como `tenantId` cuando es servicio

### 7. Propagación de Contexto para Servicios

#### En `JwtStrategy.validate()`:
- Cuando `sub` comienza con `svc:`, extraer tenantId
- Crear actor con:
  - `actorType: 'service'`
  - `actorId: tenantId`
  - `tenantId: tenantId`
  - Resto de claims del JWT

#### En `AsyncContextService`:
- Asegurar que `getActorId()` retorna `tenantId` cuando es servicio
- Asegurar que `getActor().tenantId` está disponible

### 8. Auditoría

#### Registrar en AuditService:
- **Regeneración de OAuth2 Secret**:
  - Evento: `OAUTH2_SECRET_REGENERATED`
  - Severidad: MEDIUM
  - Tags: `['oauth2', 'regenerate-secret', 'successful', 'tenantId:{tenantId}']`
  - Changes: `{after: {clientId, secret: 'xxxx...last4'}}`

- **Regeneración de Webhook Secret**:
  - Evento: `WEBHOOK_SECRET_REGENERATED`
  - Severidad: MEDIUM
  - Tags: `['webhook', 'regenerate-secret', 'successful', 'tenantId:{tenantId}']`
  - Changes: `{after: {webhookId, secret: 'xxxx...last4'}}`

- **Login de Servicio (exitoso)**:
  - Evento: `SERVICE_LOGIN`
  - Severidad: HIGH
  - Tags: `['authentication', 'service-login', 'successful', 'tenantId:{tenantId}']`
  - Changes: `{after: {clientId, timestamp: Date.toISOString()}}`

- **Login de Servicio (fallido)**:
  - Evento: `SERVICE_LOGIN`
  - Severidad: HIGH
  - Tags: `['authentication', 'service-login', 'failed', 'tenantId:{tenantId}']`
  - Error: Reason (invalid credentials, client not found, etc.)

---

## Flujos de Ejecución

### Flujo 1: Crear Tenant (con credenciales iniciales)

```
POST /tenants (ej: crear negocio)
    ↓
[TenantService.create(dto)]
    ├─ Genera OAuth2 credentials: {clientId: 'uuid_sin_guiones', clientSecret: 'uuid_sin_guiones'}
    ├─ Genera Webhook: {id: 'uuid', url: null, events: [], active: true, secret: 'uuid_sin_guiones', createdAt, updatedAt}
    ├─ Asigna ambos al tenant.oauth2ClientCredentials y tenant.webhook
    └─ Persiste en MongoDB
    ↓
Response: 201 CREATED {
  id: tenant_id,
  businessName: "...",
  oauth2ClientCredentials: {
    clientId: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
    clientSecret: "x9y8z7w6v5u4t3s2r1q0p9o8n7m6l5k4"
  },
  webhook: {
    id: "uuid",
    url: null,
    events: [],
    active: true,
    secret: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
    createdAt: Date,
    updatedAt: Date
  },
  ...
}
```

### Flujo 2: Regenerar OAuth2 Secret

```
POST /tenants/oauth2-credentials/regenerate-secret
    ↓
[JwtAuthGuard] → Valida JWT y extrae actor
    ↓
[TenantController.regenerateOAuth2Secret()]
    ├─ Obtiene tenantId del actor
    ├─ Valida que tenant exista y esté activo
    └─ Llama TenantOAuth2CredentialsService.regenerateSecret(tenantId)
    ↓
[TenantOAuth2CredentialsService.regenerateSecret()]
    ├─ Genera nuevo clientSecret (uuid sin guiones)
    ├─ Actualiza tenant.oauth2ClientCredentials.clientSecret
    ├─ Persiste en MongoDB
    └─ Retorna {id: clientId, secret: nuevoClientSecret}
    ↓
[AuditService.logAllow()] → Registra OAUTH2_SECRET_REGENERATED
    ↓
Response: 200 OK {
  id: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  secret: "newX9y8z7w6v5u4t3s2r1q0p9o8n7m6l5k4"
}
```

### Flujo 3: Regenerar Webhook Secret

```
POST /tenants/webhooks/regenerate-secret
    ↓
[JwtAuthGuard] → Valida JWT y extrae actor
    ↓
[TenantController.regenerateWebhookSecret()]
    ├─ Obtiene tenantId del actor
    ├─ Valida que tenant y webhook existan
    └─ Llama TenantWebhookService.regenerateSecret(tenantId)
    ↓
[TenantWebhookService.regenerateSecret()]
    ├─ Genera nuevo secret (uuid sin guiones)
    ├─ Actualiza tenant.webhook.secret
    ├─ Persiste en MongoDB
    └─ Retorna {id: webhookId, secret: nuevoSecret}
    ↓
[AuditService.logAllow()] → Registra WEBHOOK_SECRET_REGENERATED
    ↓
Response: 200 OK {
  id: "webhook-uuid",
  secret: "newA1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
}
```

### Flujo 4: Login de Servicio

```
POST /auth/service-login
{
  "clientId": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "clientSecret": "x9y8z7w6v5u4t3s2r1q0p9o8n7m6l5k4"
}
    ↓
[ApiKeyGuard] → Valida header x-api-key
    ↓
[AuthController.serviceLogin()]
    └─ Llama AuthService.serviceLogin(dto)
    ↓
[AuthService.serviceLogin()]
    ├─ Busca tenant donde oauth2ClientCredentials.clientId === clientId
    ├─ Si no existe → Retorna 401 Unauthorized
    ├─ Valida oauth2ClientCredentials.clientSecret === clientSecret
    ├─ Si no coinciden → Retorna 401 Unauthorized
    ├─ Extrae tenantId del tenant encontrado
    ├─ Genera JWT payload:
    │   {
    │     sub: "svc:{tenantId}",
    │     iss: "classical-api",
    │     aud: "classical-service",
    │     actorType: "service",
    │     tenantId: tenantId,
    │     scope: "read write",
    │     expiresIn: 3600
    │   }
    ├─ Firma JWT con JwtTokenPort
    ├─ Registra en auditoría (logAllow)
    └─ Retorna {access_token, token_type: "Bearer", expires_in: 3600}
    ↓
[AuditService.logAllow()] → Registra SERVICE_LOGIN exitoso
    ↓
Response: 200 OK {
  access_token: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  token_type: "Bearer",
  expires_in: 3600
}
```

### Flujo 5: Autenticación de Servicio (usando JWT generado)

```
GET /transactions (ej: endpoint protegido)
Header: Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
    ↓
[ContextInterceptor] → Captura requestId
    ↓
[JwtAuthGuard] → ExtractJwt.fromAuthHeaderAsBearerToken()
    ↓
[JwtStrategy.validate()]
    ├─ Decodifica JWT
    ├─ Valida firma con JWKS (public key)
    ├─ Parsea subject "svc:{tenantId}"
    ├─ Crea Actor:
    │   {
    │     actorType: "service",
    │     actorId: tenantId,
    │     tenantId: tenantId,
    │     sub: "svc:{tenantId}",
    │     iss: "classical-api",
    │     aud: "classical-service",
    │     scopes: ["read", "write"]
    │   }
    └─ Retorna actor
    ↓
[AsyncContextService.setActor()] → Almacena actor en nestjs-cls context
    ↓
[TransactionController] → Puede acceder:
    ├─ asyncContext.getActorId() → tenantId
    ├─ asyncContext.getActor().tenantId → tenantId
    ├─ asyncContext.getActor().actorType → "service"
    └─ Todas las operaciones están asociadas al tenant
    ↓
[Interceptor Salida] → Propaga contexto a auditoría
```

---

## Estructura de Cambios por Archivo

### Nuevos Archivos

1. `src/modules/tenants/dto/oauth2-credentials.dto.ts`
2. `src/modules/tenants/application/services/tenant-oauth2-credentials.service.ts`
3. `src/modules/auth/dto/service-login.dto.ts`

### Archivos a Modificar

1. `src/modules/tenants/dto/webhook.dto.ts` → Agregar DTO de regeneración
2. `src/modules/tenants/application/services/tenant-webhooks.service.ts` → Agregar método de regeneración
3. `src/modules/tenants/infrastructure/controllers/tenant.controller.ts` → Agregar endpoints
4. `src/modules/auth/application/auth.service.ts` → Agregar método serviceLogin
5. `src/modules/auth/infrastructure/controllers/auth.controller.ts` → Agregar endpoint POST /auth/service-login
6. `src/modules/tenants/application/services/tenant.service.ts` → Modificar creación de tenant
7. `src/common/interfaces/actor.interface.ts` → Verificar estructura (posible actualización)
8. `src/modules/auth/infrastructure/strategies/jwt.strategy.ts` → Soportar actorType "service"

---

## Consideraciones Especiales

### Formato de UUID sin guiones
- **UUID normal**: `550e8400-e29b-41d4-a716-446655440000`
- **Sin guiones**: `550e8400e29b41d4a716446655440000`
- **Generación**: `uuidv4().replace(/-/g, '')`

### Masking de Secrets en Respuestas
- No se devuelve el secret completo en listas de tenants
- Solo en endpoints de regeneración y login
- Auditoría registra como `xxxx...last4` cuando se muestra

### Validación de Tenant Activo
- Antes de regenerar secrets, verificar `tenant.status === TenantStatus.ACTIVE`
- Retornar 400 BAD_REQUEST si no está activo

### Idempotencia de Creación
- Si tenant se crea múltiples veces, cada instancia tendrá nuevas credenciales
- No hay "reutilización" de credenciales

### Manejo de Errores
- **Credenciales inválidas en service-login**: 401 Unauthorized
- **Tenant no encontrado**: 404 Not Found
- **Tenant inactivo en regeneración**: 400 Bad Request
- **Webhook/OAuth2 no existe**: 404 Not Found
