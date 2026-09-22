# Implementación de Caché de Sesión de Usuario

## Resumen

Se ha implementado un sistema de caché de sesión para almacenar datos de autenticación del usuario con TTL igual al tiempo de vida del refresh token (7 días = 604800 segundos). El caché se actualiza automáticamente cuando el usuario renueva su token de acceso.

## Archivos Creados

### 1. `src/modules/auth/domain/interfaces/session.interface.ts`

Define las interfaces para la gestión de sesiones:

- **`SessionData`**: Interfaz que contiene los datos almacenados en caché
  - `userId`: ID del usuario
  - `user`: Objeto completo del usuario (UserDTO)
  - `loginTimestamp`: Marca de tiempo de inicio de sesión
  - `accessToken`: Token de acceso actual
  - `refreshToken`: Token de refresco
  - `tokenType`: Tipo de token ("Bearer")
  - `accessTokenExpiresIn`: Tiempo de expiración del access token (3600 segundos)

- **`ISessionPort`**: Puerto/interfaz para la gestión de sesiones
  - `saveSession()`: Guarda nueva sesión en caché
  - `getSession()`: Recupera sesión del caché
  - `updateSession()`: Actualiza sesión parcialmente
  - `clearSession()`: Elimina sesión del caché

### 2. `src/modules/auth/infrastructure/services/session.service.ts`

Implementa el servicio de sesión usando Redis:

- **`SessionService`**: Implementa `ISessionPort`
  - Inyecta `CacheService` para interactuar con Redis
  - Usa clave de sesión: `session:${userId}`
  - Método `saveSession()`: Almacena datos con TTL especificado
  - Método `updateSession()`: Actualiza parcialmente sin perder datos existentes
  - Método `getSession()`: Recupera sesión del caché
  - Método `clearSession()`: Elimina la sesión
  - Logging en cada operación para auditoría

## Cambios en Archivos Existentes

### 3. `src/modules/auth/application/auth.service.ts`

**Cambios realizados:**

1. **Importaciones**: Agregó `SessionService`

2. **Constructor**: Inyectó `SessionService`

3. **Método `login()`** (líneas ~165-193):
   - Después de generar ambos tokens (access y refresh)
   - Calcula TTL = 604800 segundos (7 días, igual al refresh token)
   - Llama a `sessionService.saveSession()` con los datos de sesión:
     ```typescript
     const refreshTokenTtl = 604800; // 7 días
     await this.sessionService.saveSession(
       userId,
       {
         userId,
         user: validation.user!,
         loginTimestamp: new Date().toISOString(),
         accessToken: accessResult.getValue(),
         refreshToken: refreshToken || '',
         tokenType: 'Bearer',
         accessTokenExpiresIn: 3600,
       },
       refreshTokenTtl,
     );
     ```

4. **Método `refreshToken()`** (líneas ~318-390):
   - Extrae el userId del payload del JWT (formato: `user:${userId}`)
   - Después de generar el nuevo access token
   - Calcula TTL = 604800 segundos (mantiene la sesión vigente)
   - Llama a `sessionService.updateSession()` para actualizar solo el access token:
     ```typescript
     const refreshTokenTtl = 604800; // 7 días
     await this.sessionService.updateSession(
       userId,
       {
         accessToken: newTokenResult.getValue(),
       },
       refreshTokenTtl,
     );
     ```

### 4. `src/modules/auth/auth.module.ts`

**Cambios realizados:**

1. **Importación**: Agregó `SessionService`

2. **Providers**: Agregó `SessionService` a la lista de proveedores

3. **Exports**: Agregó `SessionService` a la lista de exportaciones para disponibilidad global

## Flujo de Funcionamiento

### Inicio de Sesión

```
1. Usuario envía credenciales (login)
   ↓
2. AuthService.login() valida credenciales
   ↓
3. Genera access token (3600s) y refresh token (604800s)
   ↓
4. Guarda sesión en Redis con TTL = 604800s
   └─ Clave: session:${userId}
   └─ Datos: {userId, user, tokens, timestamps, etc}
   ↓
5. Retorna tokens al cliente
```

### Renovación de Token

```
1. Cliente envía refresh token
   ↓
2. AuthService.refreshToken() valida refresh token
   ↓
3. Extrae userId del payload
   ↓
4. Genera nuevo access token
   ↓
5. Actualiza sesión en Redis con nuevo access token
   └─ Mantiene TTL = 604800s (reinicia el contador)
   └─ Mantiene otros datos de la sesión intactos
   ↓
6. Retorna nuevo access token
```

### Recuperación de Sesión

```
1. Cliente necesita datos de sesión
   ↓
2. SessionService.getSession(userId)
   ↓
3. Redis retorna datos cachés (si existen y no han expirado)
   └─ Datos incluyen usuario, tokens, timestamps
   ↓
4. Servicio retorna datos o null si no existe
```

## Beneficios

1. **Performance**: Datos de sesión disponibles sin consultar BD en cada request
2. **Consistencia**: TTL sincronizado con refresh token = sesión se cierra automáticamente
3. **Auditoría**: Datos de sesión completos disponibles para análisis
4. **Seguridad**: 
   - Tokens frescos en caché para validación rápida
   - Expiración automática con Redis
   - Token refresh reinicia el contador de inactividad

## Consideraciones de Implementación

1. **TTL**: Se establece explícitamente en 604800 segundos en ambas operaciones para garantizar sincronización

2. **Actualización de Sesión**: 
   - Usa `updateSession()` en refresh para preservar datos existentes
   - Solo actualiza el access token

3. **Recuperación**: Los controladores pueden usar `sessionService.getSession(userId)` si necesitan datos de sesión sin ir a BD

4. **Limpieza**: Cuando refresh token expire (7 días), Redis automáticamente elimina la sesión

## Testing

Para verificar el funcionamiento:

```bash
# Build
yarn build

# Start dev server
yarn start:dev

# Test login
POST /auth/login
Body: { "username": "...", "password": "..." }

# Verificar caché Redis
redis-cli GET session:${userId}

# Test refresh token
POST /auth/refresh
Body: { "refresh_token": "..." }

# Verificar caché se actualiza
redis-cli GET session:${userId}
```
