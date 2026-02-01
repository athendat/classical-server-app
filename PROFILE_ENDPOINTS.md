# Endpoints de Perfil de Usuario

Estos endpoints permiten que un usuario autenticado actualice su perfil y contraseña sin necesidad de administrador.

## 1. Actualizar Perfil del Usuario

**Endpoint:** `PATCH /users/me`

**Autenticación:** Requerida (JWT Bearer token)

**Permisos:** `users.update`

**Descripción:** Permite que el usuario autenticado actualice sus datos personales (email, fullname, phone). Todos los campos son opcionales.

### Request Body

```json
{
  "email": "john.updated@example.com",
  "fullname": "John Doe Updated",
  "phone": "51999888777"
}
```

### Response (200 OK)

```json
{
  "ok": true,
  "statusCode": 200,
  "message": "Datos de usuario actualizados exitosamente",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "john.updated@example.com",
    "fullname": "John Doe Updated",
    "phone": "51999888777",
    "roleKey": "user",
    "status": "active",
    "createdAt": "2025-01-05T10:00:00Z",
    "updatedAt": "2025-02-01T10:00:00Z"
  },
  "meta": {
    "requestId": "uuid-xxx"
  }
}
```

### Error Responses

- **400 Bad Request:** Datos inválidos
- **401 Unauthorized:** No autorizado
- **500 Internal Server Error:** Error interno del servidor

---

## 2. Cambiar Contraseña

**Endpoint:** `POST /users/me/password`

**Autenticación:** Requerida (JWT Bearer token)

**Permisos:** `users.update`

**Descripción:** Permite que el usuario autenticado cambie su contraseña. La nueva contraseña se proporciona en texto plano y se hashea con Argon2.

### Request Body

```json
{
  "password": "NewSecurePassword123!"
}
```

### Response (200 OK)

```json
{
  "ok": true,
  "statusCode": 200,
  "message": "Contraseña actualizada exitosamente",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "john@example.com",
    "fullname": "John Doe",
    "roleKey": "user",
    "status": "active",
    "createdAt": "2025-01-05T10:00:00Z",
    "updatedAt": "2025-02-01T10:00:00Z"
  },
  "meta": {
    "requestId": "uuid-xxx"
  }
}
```

### Error Responses

- **400 Bad Request:** Contraseña inválida
- **401 Unauthorized:** No autorizado
- **500 Internal Server Error:** Error interno del servidor

---

## Ejemplos de Uso

### Actualizar Perfil con cURL

```bash
curl -X PATCH http://localhost:3000/users/me \
  -H "Authorization: Bearer <tu_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.updated@example.com",
    "fullname": "John Doe Updated"
  }'
```

### Cambiar Contraseña con cURL

```bash
curl -X POST http://localhost:3000/users/me/password \
  -H "Authorization: Bearer <tu_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "password": "NewSecurePassword123!"
  }'
```

### Con JavaScript/Fetch

```javascript
// Actualizar perfil
const updateProfile = async (token, data) => {
  const response = await fetch('http://localhost:3000/users/me', {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return response.json();
};

// Cambiar contraseña
const updatePassword = async (token, newPassword) => {
  const response = await fetch('http://localhost:3000/users/me/password', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: newPassword }),
  });
  return response.json();
};

// Uso
const token = 'tu_jwt_token';

// Actualizar perfil
await updateProfile(token, {
  email: 'john.updated@example.com',
  fullname: 'John Doe Updated',
});

// Cambiar contraseña
await updatePassword(token, 'NewSecurePassword123!');
```

---

## Notas de Implementación

### Seguridad

- Ambos endpoints requieren autenticación JWT
- El `userId` se extrae automáticamente del contexto de la solicitud (JWT)
- No es posible actualizar datos de otro usuario
- Las contraseñas se hashean con **Argon2**
- Se registra auditoría para todas las operaciones

### Auditoría

- **Actualizar Perfil:** Se registra como `USER_UPDATE` con severidad `MEDIUM`
- **Cambiar Contraseña:** Se registra como `USER_PASSWORD_CHANGED` con severidad `CRITICAL`
- Todos los cambios se guardan en la tabla de auditoría con `before` y `after`

### Eventos de Dominio

- Cuando se cambia la contraseña, se emite el evento `user.password_changed`
- Este evento se puede usar para enviar notificaciones, logs, etc.

---

## Validaciones

### Actualizar Perfil

- **Email:** Debe ser un email válido (si se proporciona)
- **Fullname:** Puede contener caracteres alfanuméricos y espacios
- **Phone:** Debe cumplir con el formato de validación de teléfono (si se proporciona)

### Cambiar Contraseña

- **Password:** Debe cumplir con la política de contraseñas del sistema
  - Mínimo 8 caracteres
  - Al menos una mayúscula
  - Al menos una minúscula
  - Al menos un número
  - Al menos un carácter especial (!@#$%^&*)
