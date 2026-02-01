# Diagnóstico: Error de Issuer en Token de Refresco

## Problema Identificado

```
jwt issuer invalid. expected: classical-api
```

El servidor rechaza el refresh token porque el **issuer (iss)** del token no coincide con el issuer esperado (`classical-api`).

## Causas Posibles

1. **Token generado con configuración anterior**: El refresh token fue generado cuando `JWT_ISSUER` era diferente
2. **Cambio de configuración**: La variable `JWT_ISSUER` cambió después de que se emitió el token
3. **Inconsistencia en múltiples instancias**: Si hay varios servidores, uno genera tokens con issuer A y otro valida con issuer B
4. **Token corrupto o manipulado**: El token fue alterado manualmente

## Solución Inmediata

**El cliente DEBE hacer login nuevamente** para obtener un nuevo refresh token con la configuración correcta:

```bash
# 1. Hacer login
POST /api_053/auth/login
{
  "username": "+569XXXXXXXX",
  "password": "YourPassword!123"
}

# Respuesta incluirá:
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "eyJ..."  # Nuevo token con issuer correcto
}

# 2. Guardar el nuevo refresh_token
# 3. Usar ese token para renovaciones futuras

# 4. Renovar token
POST /api_053/auth/refresh
{
  "refresh_token": "eyJ..."  # El nuevo token del login
}
```

## Verificación del Token

Para verificar qué issuer tiene el token que estás usando:

```bash
# Decodificar el refresh token (sin validar firma - solo para diagnóstico)
# Usa jwt.io o ejecuta:
node -e "console.log(JSON.parse(Buffer.from('REFRESH_TOKEN_HERE'.split('.')[1], 'base64').toString()))"

# Busca el campo "iss" que debe ser "classical-api"
```

## Configuración en el Servidor

Verifica que la variable de entorno esté correctamente configurada:

```bash
# En tu .env o variables de entorno:
JWT_ISSUER=classical-api
JWT_AUDIENCE=classical-service
```

## Código Afectado

**Generación de tokens** (`src/modules/auth/application/auth.service.ts`):
- Login: Crea access token y refresh token con `iss: this.jwtIssuer`
- Refresh: Verifica el token comparando con `iss: this.jwtIssuer`

**Verificación de tokens** (`src/modules/auth/infrastructure/adapters/jwt-token.adapter.ts`):
```typescript
const verified = jwt.verify(token, jwksKey.publicKey, {
  algorithms: ['RS256'],
  issuer: this.jwtIssuer,  // Debe ser 'classical-api'
  audience: this.jwtAudience,
  clockTimestamp: Math.floor(Date.now() / 1000),
  clockTolerance: this.clockSkewSec,
});
```

## Recomendaciones

1. ✅ **Hacer login nuevamente** (solución inmediata)
2. ✅ **Validar configuración de JWT_ISSUER** en entorno
3. ✅ **No guardar refresh tokens indefinidamente** (válidos 7 días)
4. ✅ **Implementar rotación de tokens** si cambias JWT_ISSUER
5. ✅ **Considerar agregar versionado a tokens** si necesitas cambiar issuer frecuentemente

## Flujo de Renovación Correcto

```
Cliente: POST /api_053/auth/login
         ↓
Servidor: Genera access_token (exp: 3600s) + refresh_token (exp: 604800s)
         ↓
Cliente: Guarda ambos tokens
         ↓
         [Usuario usa app con access_token]
         ↓
         [Después de 3600s, access_token expira]
         ↓
Cliente: POST /api_053/auth/refresh con refresh_token válido
         ↓
Servidor: Valida refresh_token, genera nuevo access_token
         Actualiza sesión en caché
         ↓
Cliente: Recibe nuevo access_token (exp: 3600s)
         Sesión extendida por 7 días más
         ↓
         [Repite indefinidamente hasta que refresh_token expire]
         ↓
         [Después de 604800s, refresh_token expira]
         ↓
Cliente: POST /api_053/auth/refresh falla
         Usuario debe hacer login nuevamente
```

## Estado Actual de Sesión en Caché

Cuando hagas login correctamente, se guardará en Redis:

```
Key: session:${userId}
Value: {
  "userId": "...",
  "user": { /* datos completos */ },
  "loginTimestamp": "2026-02-01T...",
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "tokenType": "Bearer",
  "accessTokenExpiresIn": 3600
}
TTL: 604800 segundos (7 días)
```

Cada renovación actualiza el `accessToken` y reinicia el TTL de la sesión.
