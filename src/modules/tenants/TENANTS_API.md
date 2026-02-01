# Tenants Module - API Endpoints Documentation

## Overview

El módulo de **Tenants** gestiona los negocios (empresas) que se registran en la plataforma FxWallet. Incluye:

- **CRUD de Tenants**: Crear, leer, actualizar tenants
- **Máquina de Estados**: Ciclo de vida de aprobación (pending_review → more_data_requested/approved/rejected → active)
- **Seguridad de Datos**: Almacenamiento de números de tarjeta (PAN) en Vault con validación Luhn
- **Auditoría**: Historial completo de transiciones de estado con timestamps

## Estados del Tenant

```text
┌────────────────┐
│ pending_review │ (Inicial)
└────────┬───────┘
         │
    ┌────┴─────────────────────┐
    │                          │
    ▼                          ▼
┌──────────────────┐    ┌─────────────┐
│ more_data_       │    │  approved   │
│ requested        │    └──────┬──────┘
└────────┬─────────┘           │
         │                     │
    ┌────┴──────────────────┐  │
    │                       │  │
    ▼                       ▼  ▼
 ┌────────────────────────────────┐
 │ active (Estado Final Operativo) │
 └────────────────────────────────┘
 
 ┌─────────────────────────────┐
 │ rejected (Estado Terminal)  │
 └─────────────────────────────┘
```

## Endpoints

### 1. Crear Tenant

**Endpoint:** `POST /api/tenants`

**Autenticación:** JWT Bearer token requerido  
**Permiso Requerido:** `tenants.create`

**Request Body:**

```json
{
  "businessName": "Mi Empresa S.A.",
  "legalRepresentative": "Juan Pérez García",
  "businessAddress": {
    "address": "Calle Principal 123",
    "city": "San José",
    "state": "San José",
    "zipCode": "10101",
    "country": "Costa Rica"
  },
  "pan": "4532-1234-5678-9010",
  "email": "contacto@miempresa.com",
  "phone": "55551234",
  "notes": "Negocio de importación y exportación"
}
```

**Validaciones:**

- `businessName`: string requerido, máx 255 caracteres
- `legalRepresentative`: string requerido, máx 255 caracteres
- `businessAddress`: objeto requerido con fields: address, city, state, zipCode
- `pan`: string requerido, validado con algoritmo Luhn (13-19 dígitos)
- `email`: email único requerido (validación RFC)
- `phone`: teléfono requerido (8 dígitos, inicia con 5 o 6)
- `notes`: opcional, máx 500 caracteres

**Response (201 Created):**

```json
{
  "statusCode": 201,
  "data": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "businessName": "Mi Empresa S.A.",
    "legalRepresentative": "Juan Pérez García",
    "businessAddress": {
      "address": "Calle Principal 123",
      "city": "San José",
      "state": "San José",
      "zipCode": "10101",
      "country": "Costa Rica"
    },
    "maskedPan": "****-****-****-9010",
    "email": "contacto@miempresa.com",
    "phone": "55551234",
    "status": "pending_review",
    "createdBy": "user-123",
    "createdAt": "2026-02-01T10:30:00Z",
    "updatedAt": "2026-02-01T10:30:00Z"
  },
  "message": "Tenant creado exitosamente"
}
```

**Errores:**

- `400 Bad Request`: Validación fallida (PAN no pasa Luhn, formato inválido)
- `409 Conflict`: Email ya registrado
- `500 Internal Server Error`: Error al guardar en Vault o BD

---

### 2. Listar Tenants

**Endpoint:** `GET /api/tenants`

**Autenticación:** JWT Bearer token requerido  
**Permiso Requerido:** `tenants.read`

**Query Parameters:**

- `page` (number, default: 1): Número de página
- `limit` (number, default: 10): Items por página
- `status` (enum): Filtrar por estado (pending_review, more_data_requested, approved, rejected, active)
- `createdAfter` (ISO 8601): Filtrar tenants creados después de esta fecha
- `createdBefore` (ISO 8601): Filtrar tenants creados antes de esta fecha

**Ejemplo:**

```text
GET /api/tenants?page=1&limit=10&status=pending_review
```

**Response (200 OK):**

```json
{
  "statusCode": 200,
  "data": {
    "data": [
      {
        "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        "businessName": "Mi Empresa S.A.",
        "legalRepresentative": "Juan Pérez García",
        "businessAddress": { ... },
        "maskedPan": "****-****-****-9010",
        "email": "contacto@miempresa.com",
        "phone": "55551234",
        "status": "pending_review",
        "createdBy": "user-123",
        "createdAt": "2026-02-01T10:30:00Z",
        "updatedAt": "2026-02-01T10:30:00Z"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 10,
      "total": 45,
      "totalPages": 5,
      "hasNextPage": true,
      "hasPreviousPage": false
    }
  },
  "message": "Tenants recuperados"
}
```

**Nota:** El PAN siempre se devuelve **enmascarado** en listados. Para ver el PAN completo, ver endpoint GET /tenants/:id con permisos especiales.

---

### 3. Obtener Tenant por ID

**Endpoint:** `GET /api/tenants/:id`

**Autenticación:** JWT Bearer token requerido  
**Permiso Requerido:** `tenants.read`

**Response (200 OK):**

```json
{
  "statusCode": 200,
  "data": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "businessName": "Mi Empresa S.A.",
    "legalRepresentative": "Juan Pérez García",
    "businessAddress": { ... },
    "maskedPan": "****-****-****-9010",
    "unmaskPan": "4532-1234-5678-9010",  // Solo si tiene tenants.view-sensitive
    "email": "contacto@miempresa.com",
    "phone": "55551234",
    "status": "pending_review",
    "createdBy": "user-123",
    "notes": "Negocio de importación...",
    "createdAt": "2026-02-01T10:30:00Z",
    "updatedAt": "2026-02-01T10:30:00Z"
  },
  "message": "Tenant recuperado"
}
```

**Permisos Especiales:**

- Si el usuario tiene `tenants.view-sensitive` (roles: admin, super_admin, security_officer, auditor), el PAN se devuelve **desenmascarado** en el campo `unmaskPan`
- Sin este permiso, solo `maskedPan` estará disponible

**Errores:**

- `404 Not Found`: Tenant no existe

---

### 4. Actualizar Tenant

**Endpoint:** `PATCH /api/tenants/:id`

**Autenticación:** JWT Bearer token requerido  
**Permiso Requerido:** `tenants.write`

**Request Body:** (todos los campos opcionales)

```json
{
  "businessName": "Mi Empresa Actualizada S.A.",
  "legalRepresentative": "María García López",
  "businessAddress": { ... },
  "email": "nuevo@email.com",
  "phone": "65559876",
  "notes": "Actualización de datos"
}
```

**Restricciones:**

- ⚠️ No se puede cambiar el `pan` (actualizar es con endpoint separado si fuera necesario)
- ⚠️ No se puede cambiar el estado aquí (usar endpoint `/transition` para cambios de estado)
- Email debe ser único

**Response (200 OK):**

```json
{
  "statusCode": 200,
  "data": { ... },
  "message": "Tenant actualizado"
}
```

**Errores:**

- `404 Not Found`: Tenant no existe
- `409 Conflict`: Email ya está en uso
- `400 Bad Request`: Datos inválidos

---

### 5. Cambiar Estado del Tenant

**Endpoint:** `POST /api/tenants/:id/transition`

**Autenticación:** JWT Bearer token requerido  
**Permiso Requerido:** `tenants.approve`

**Request Body:**

```json
{
  "targetState": "approved",
  "comment": "Documentación completa y verificada. Empresa autorizada para operar."
}
```

**Estados Válidos y Transiciones:**

| Estado Actual | Estados Destino Válidos |
|---|---|
| `pending_review` | `approved`, `more_data_requested`, `rejected` |
| `more_data_requested` | `approved`, `active`, `rejected` |
| `approved` | `active` |
| `active` | (Ninguno - estado final) |
| `rejected` | (Ninguno - estado terminal) |

**Response (200 OK):**

```json
{
  "statusCode": 200,
  "data": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "status": "approved",
    ...
  },
  "message": "Estado actualizado exitosamente"
}
```

**Evento de Ciclo de Vida Creado:**

```text
tenant_lifecycles collection:
{
  "id": "lifecycle-123",
  "tenantId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "fromState": "pending_review",
  "toState": "approved",
  "triggeredBy": {
    "userId": "user-456",
    "username": "admin@system.com",
    "roleKey": "admin"
  },
  "comment": "Documentación completa...",
  "timestamp": "2026-02-01T10:35:00Z",
  "xstateSnapshot": { ... }
}
```

**Errores:**

- `400 Bad Request`: Transición inválida (ej: intended to go from `active` to `pending_review`)
- `404 Not Found`: Tenant no existe
- `500 Internal Server Error`: Error al registrar transición

---

### 6. Obtener Historial de Ciclo de Vida

**Endpoint:** `GET /api/tenants/:id/lifecycle`

**Autenticación:** JWT Bearer token requerido  
**Permiso Requerido:** `tenants.read`

**Query Parameters:**

- `page` (number, default: 1): Número de página
- `limit` (number, default: 20): Items por página

**Response (200 OK):**

```json
{
  "statusCode": 200,
  "data": {
    "data": [
      {
        "id": "lifecycle-789",
        "tenantId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        "fromState": "pending_review",
        "toState": "approved",
        "triggeredBy": {
          "userId": "user-456",
          "username": "admin@system.com",
          "roleKey": "admin"
        },
        "comment": "Documentación verificada. Empresa activa.",
        "timestamp": "2026-02-01T10:35:00Z"
      },
      {
        "id": "lifecycle-456",
        "tenantId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        "fromState": "approved",
        "toState": "active",
        "triggeredBy": {
          "userId": "user-789",
          "username": "operator@system.com",
          "roleKey": "ops"
        },
        "comment": "Activación completa. Listo para operaciones.",
        "timestamp": "2026-02-01T10:40:00Z"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 2,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPreviousPage": false
    }
  },
  "message": "Historial recuperado"
}
```

---

## Seguridad y Datos Sensibles

### Almacenamiento de PAN (Números de Tarjeta)

1. **Validación Luhn**: Todo PAN se valida contra el algoritmo Luhn antes de almacenarse
2. **Almacenamiento en Vault**: El PAN se envía a HashiCorp Vault con ruta: `tenants/{tenantId}/pan`
3. **Referencia en MongoDB**: Se almacena solo la referencia (`panVaultKeyId`), no el PAN completo
4. **Enmascaramiento**: En responses, el PAN se enmascarara como `****-****-****-XXXX`

### Permisos para Datos Sensibles

- **`tenants.view-sensitive`**: Permite ver el PAN desenmascarado
  - **Asignado a roles:** `admin`, `super_admin`, `security_officer`, `auditor`
  - Sin este permiso, todas las operaciones ven PANs enmascarados

### Auditoría

- Todas las transiciones de estado se registran con:
  - Usuario que disparó la transición
  - Timestamp preciso
  - Comentario (si aplica)
  - Snapshot de la máquina de estados
- Endpoint `/lifecycle` permite auditoría completa de cambios

---

## Eventos de Dominio Emitidos

El módulo emite los siguientes eventos en el EventEmitter:

### 1. `tenant.created`

```typescript
{
  tenantId: string;
  businessName: string;
  email: string;
  createdBy: string;
  timestamp: Date;
}
```

### 2. `tenant.state-transitioned`

```typescript
{
  tenantId: string;
  fromState: TenantStatus;
  toState: TenantStatus;
  triggeredBy: string;
  comment?: string;
  timestamp: Date;
}
```

### 3. `tenant.updated`

```typescript
{
  tenantId: string;
  fieldsChanged: string[];
  updatedBy: string;
  timestamp: Date;
}
```

Estos eventos pueden ser escuchados por otros módulos (ej: AuditService) para registrar acciones.

---

## Casos de Uso

### Flujo de Aprobación de Tenant

1. **Usuario/Sistema crea tenant:**

   ```text
   POST /tenants → status = pending_review
   ```

2. **Admin revisa y solicita más datos:**

   ```text
   POST /tenants/:id/transition
   {
     "targetState": "more_data_requested",
     "comment": "Se requieren certificados de registro"
   }
   ```

3. **Tenant proporciona datos y admin aprueba:**

   ```text
   POST /tenants/:id/transition
   {
     "targetState": "approved",
     "comment": "Documentación completa"
   }
   ```

4. **Finalmente, se activa:**

   ```text
   POST /tenants/:id/transition
   {
     "targetState": "active",
     "comment": "Listo para operaciones"
   }
   ```

5. **Auditor puede ver el historial:**

   ```text
   GET /tenants/:id/lifecycle
   ```

---

## Errores Comunes

| Error | Causa | Solución |
| --- | --- | --- |
| `400 Bad Request` | PAN no pasa validación Luhn | Verificar número de tarjeta |
| `409 Conflict` | Email duplicado | Usar un email único |
| `400 Bad Request` | Transición inválida de estado | Revisar máquina de estados |
| `401 Unauthorized` | JWT token expirado o inválido | Re-autenticar |
| `403 Forbidden` | Permisos insuficientes | Solicitar permisos `tenants.create/write/approve` |
