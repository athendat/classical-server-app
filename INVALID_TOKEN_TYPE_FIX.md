# Error: Invalid Token Type en Refresh

## Problema

```
Token refresh attempted with invalid token type
```

El servidor rechaza tu refresh token porque:
- **No tiene el campo `type: 'refresh'`**, O
- **Tiene un `scope` diferente a `refresh'`**

## Causas Posibles

### 1. Token Antiguo (Más Probable)
El token fue generado hace tiempo antes de que se agregara la validación de `type`. 

**Solución**: Hacer login nuevamente.

### 2. Estás Enviando el Access Token en Lugar del Refresh Token
El cliente está confundiendo los dos tokens.

**Acceso token**:
- `type`: `undefined`
- `scope`: `'read write'`
- Válido por: 3600 segundos (1 hora)

**Refresh token**:
- `type`: `'refresh'`
- `scope`: `'refresh'`
- Válido por: 604800 segundos (7 días)

## Cómo Verificar Qué Token Tienes

**Decodificar el token** (sin validar firma, solo para diagnosticar):

```bash
# En Node.js:
node -e "console.log(JSON.parse(Buffer.from('TU_TOKEN_AQUI'.split('.')[1], 'base64').toString()))"
```

**Busca estos campos:**

**Si ves esto = Access Token (INCORRECTO):**
```json
{
  "sub": "user:xyz123",
  "scope": "read write",
  "iat": 1738432529,
  "exp": 1738436129
}
```

**Si ves esto = Refresh Token (CORRECTO):**
```json
{
  "sub": "user:xyz123",
  "scope": "refresh",
  "type": "refresh",
  "iat": 1738432529,
  "exp": 1739037329
}
```

## Solución Recomendada

### Opción 1: Hacer Login Nuevamente (Más Rápido)

```bash
POST /api_053/auth/login
Content-Type: application/json

{
  "username": "+569XXXXXXXX",
  "password": "YourPassword!123"
}
```

Respuesta:
```json
{
  "statusCode": 200,
  "ok": true,
  "data": {
    "access_token": "eyJ...",  // Usa este para requests normales
    "token_type": "Bearer",
    "expires_in": 3600,
    "refresh_token": "eyJ..."  // Usa ESTE para renovar tokens
  },
  "message": "Login exitoso"
}
```

**Guardar correctamente:**
- `access_token` → Para headers `Authorization: Bearer {access_token}`
- `refresh_token` → Para endpoint `/auth/refresh`

### Opción 2: Si Tienes un Refresh Token Válido

```bash
POST /api_053/auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJ..."
}
```

## Flujo Correcto de Tokens

```
1. LOGIN
   ├─ Enviar: username + password
   └─ Recibir: access_token + refresh_token
   
2. USAR ACCESS TOKEN
   ├─ Almacenar ambos tokens
   └─ Usar access_token en headers
   
3. CUANDO EXPIRE ACCESS TOKEN (después de 3600s)
   ├─ Enviar: refresh_token a /auth/refresh
   ├─ Recibir: nuevo access_token
   └─ Continuar usando nuevo access_token
   
4. CUANDO EXPIRE REFRESH TOKEN (después de 604800s)
   └─ Usuario debe hacer LOGIN nuevamente
```

## Código de Ejemplo (Frontend/Client)

```typescript
// 1. Login
const loginResponse = await fetch('/api_053/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: '+569XXXXXXXX',
    password: 'YourPassword!123'
  })
});

const { data } = await loginResponse.json();
const { access_token, refresh_token, expires_in } = data;

// Guardar en storage
localStorage.setItem('accessToken', access_token);
localStorage.setItem('refreshToken', refresh_token);
localStorage.setItem('tokenExpireAt', Date.now() + expires_in * 1000);

// 2. Usar token en requests
const response = await fetch('/api_053/users/me', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
  }
});

// 3. Renovar cuando expire
if (Date.now() > localStorage.getItem('tokenExpireAt')) {
  const refreshResponse = await fetch('/api_053/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: localStorage.getItem('refreshToken')
    })
  });
  
  const { data: newData } = await refreshResponse.json();
  localStorage.setItem('accessToken', newData.access_token);
  localStorage.setItem('tokenExpireAt', Date.now() + 3600 * 1000);
}
```

## Cambios Realizados en AuthService

He mejorado la validación para aceptar:
- Tokens con `type: 'refresh'`, O
- Tokens con `scope: 'refresh'`

Esto permite compatibilidad con tokens generados anteriormente que solo tenían el campo `scope`.

**Error mejorado:**
- Ahora muestra qué tipo de token recibió
- Proporciona mensaje claro: "El token enviado no es un token de refresco válido"
- Mejora en logs de auditoría

## Próximas Renovaciones (Después de Login Correcto)

Una vez que hagas login y obtengas los tokens correctos:

1. **Requests normales**: Usa `access_token` en header
2. **Renovación de token**: Usa `refresh_token` en endpoint `/auth/refresh`
3. **Sesión en caché**: Se actualiza automáticamente en Redis

Cada renovación:
- Genera nuevo `access_token`
- Reinicia TTL del `refresh_token` (7 días)
- Actualiza sesión en caché
