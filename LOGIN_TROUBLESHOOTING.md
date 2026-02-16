# 🔐 Guía de Troubleshooting - Problema de Login en VPS

## Problema
- ✅ Login funciona en **local**
- ❌ Login falla en **VPS** con error: "contraseña incorrecta"

---

## ✅ Soluciones Aplicadas

### 1. **Búsqueda por Email o Teléfono**
Anteriormente, `validateCredentials()` solo buscaba por teléfono. Ahora:
- ✅ Detecta si el username contiene `@` (es email)
- ✅ Busca por email si es email
- ✅ Busca por teléfono si es teléfono
- ✅ Valida la contraseña contra el hash

**Cambio de código:**
```typescript
// ❌ ANTES: Solo buscaba por teléfono
const result = await this.usersService.findByPhone(username);

// ✅ AHORA: Detecta email vs teléfono
const isEmail = username.includes('@');
if (isEmail) {
  result = await this.usersService.findByEmail(username);
} else {
  result = await this.usersService.findByPhone(username);
}
```

### 2. **Limpieza de Variables de Entorno**
El bootstrap ahora trimea espacios en blanco de `SA_EMAIL` y `SA_PWD`:

```typescript
// ✅ Limpia espacios en blanco
const cleanEmail = saEmail.trim();
const cleanPwd = saPwd.trim();

if (!cleanEmail || !cleanPwd) {
  this.logger.warn('SA_EMAIL or SA_PWD are empty after trimming');
  return;
}
```

---

## 🔍 Cómo Debuggear en la VPS

### Paso 1: Verificar la Contraseña en Variables de Entorno

```bash
# En tu VPS (en la aplicación o logs)
echo $SA_EMAIL
echo $SA_PWD
echo ${#SA_PWD}  # Ver longitud de contraseña (detectar espacios)
```

**Problema potencial:** La contraseña puede tener:
- ✗ Espacios al inicio o final
- ✗ Caracteres especiales mal encoded
- ✗ Diferentes valores entre local y VPS

---

### Paso 2: Verificar la Base de Datos

Conectarse a MongoDB en la VPS:

```bash
# Buscar el usuario super admin
db.users.findOne({ email: "tu_email_sa@example.com" })
```

**Verificar:**
```json
{
  "_id": "...",
  "email": "sa@example.com",
  "phone": "+1-000-0000",        // ✅ Debe tener formato válido
  "phoneConfirmed": true,        // ✅ Debe ser true
  "passwordHash": "...",         // ✅ Debe existir y no ser null
  "roleKey": "super_admin",      // ✅ Debe ser super_admin
  "status": "active"             // ✅ Debe ser active
}
```

---

### Paso 3: Limpiar y Recrear el Usuario Super Admin

Si el usuario está corrupto:

```bash
# 1. Conectar a MongoDB
mongo
use tu_db

# 2. Eliminar usuario super admin
db.users.deleteOne({ roleKey: "super_admin" })

# 3. Eliminar el índice único de teléfono si es necesario
db.users.deleteIndex({ phone: 1 })

# 4. IMPORTANTE: Reiniciar la aplicación
# El SystemBootstrapService recreará automáticamente el usuario
```

**O manualmente desde shell de aplicación:**

```bash
# En tu servidor VPS, detener la app
systemctl stop tu-app

# Limpiar usuarios
# (Si tienes script específico)

# Reiniciar
systemctl start tu-app

# Ver logs del bootstrap
journalctl -u tu-app -n 100 -f
```

---

### Paso 4: Probar Login con Email

Ahora que `validateCredentials()` soporta email:

```bash
# ✅ Probar con EMAIL (antes fallaba)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "sa@example.com",
    "password": "tu_contraseña_exacta"
  }'

# ✅ También funciona con TELÉFONO
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "+1-000-0000",
    "password": "tu_contraseña_exacta"
  }'
```

---

### Paso 5: Revisar Logs de la Aplicación

Buscar logs de login exitoso o fallido:

```bash
# Logs de bootstrap
[SystemBootstrapService] 👨‍💼 PHASE 3: Bootstrap super admin user...
[SystemBootstrapService] ✅ PHASE 3 completed: Super admin user created successfully

# Logs de login
[AuthService] [Login] Attempting login with email: sa@example.com
[AuthService] [Login] Credentials validated successfully
[AuthService] User XXX logged in successfully
```

**Si falla:**
```bash
[AuthService] [Login] User not found: sa@example.com
[AuthService] [Login] Invalid password for user: sa@example.com
[AuthService] [Login] Phone not confirmed for user: XXX
```

---

## 🛠️ Checklist de Deployment en VPS

- [ ] **SA_EMAIL**: Variable sin espacios, email válido
  ```bash
  SA_EMAIL="admin@myapp.com"  # ✅ Correcto
  SA_EMAIL=" admin@myapp.com "  # ❌ Incorrecto (espacios)
  ```

- [ ] **SA_PWD**: Variable sin espacios
  ```bash
  SA_PWD="MySecurePass123!"  # ✅ Correcto
  SA_PWD="MySecurePass123! "  # ❌ Incorrecto (espacio final)
  ```

- [ ] **Primer reinicio**: La aplicación debe crear el usuario en bootstrap
  - Ver logs: "PHASE 3 completed"
  - Verificar en MongoDB que el usuario existe

- [ ] **Teléfono confirmado**: Debe ser `true` en el documento
  ```json
  { "phoneConfirmed": true }
  ```

---

## 📝 Comandos Útiles

### Ver usuario creado (MongoDB)
```javascript
db.users.findOne({ email: "admin@myapp.com" }, { _id: 1, email: 1, phone: 1, phoneConfirmed: 1, roleKey: 1 })
```

### Contar usuarios
```javascript
db.users.countDocuments()
```

### Ver último error guardar usuario
```javascript
db.users.find({ roleKey: "super_admin" }).pretty()
```

---

## 🚀 Flujo de Login Actualizado

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Client envía: username + password                            │
│    (username puede ser email O teléfono)                        │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. validateCredentials() detecta tipo                           │
│    ✅ Si contiene @  → buscar por email                        │
│    ✅ Si sin @       → buscar por teléfono                     │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Buscar usuario en BD                                        │
│    ✅ findByEmail() o findByPhone()                            │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Validaciones                                                 │
│    ✅ Usuario existe                                           │
│    ✅ Teléfono confirmado (phoneConfirmed: true)             │
│    ✅ Tiene contraseña (passwordHash existe)                 │
│    ✅ Contraseña válida (Argon2.verify)                      │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Generar JWT y retornar tokens                               │
│    ✅ access_token + refresh_token                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Cambios de Código Realizados

### archivo: `src/modules/auth/application/auth.service.ts`

**Método:** `validateCredentials()`
- ✅ Ahora detecta email vs teléfono con `username.includes('@')`
- ✅ Llama a `findByEmail()` o `findByPhone()` según corresponda
- ✅ Mejor logging para debugging
- ✅ Validación obligatoria de phoneConfirmed

### archivo: `src/common/bootstrap/system-bootstrap.service.ts`

**Método:** `bootstrapSuperAdmin()`
- ✅ Trimea `SA_EMAIL` y `SA_PWD` para remover espacios
- ✅ Valida que no estén vacíos después de trimear
- ✅ Teléfono ahora tiene formato válido: `"+1-000-0000"`
- ✅ Mejor logging con email siendo creado

---

## ❓ Preguntas Frecuentes

### P: ¿Qué contraseña usar para loguearse?
**R:** La del ambiente variable `SA_PWD` en la VPS. Exactamente como está (sin espacios).

### P: ¿Qué email usar?
**R:** El valor de `SA_EMAIL` en la VPS.

### P: ¿Se puede loguear con teléfono ahora?
**R:** ✅ Sí, se puede usar `"+1-000-0000"` (el teléfono del bootstrap) o cualquier teléfono de otro usuario registrado.

### P: ¿Por qué no funciona local pero sí VPS después de cambios?
**R:** Probablemente la contraseña es diferente en cada environment. Verifica que `SA_PWD` sea idéntica en ambos.

### P: ¿Se resetea al usuario super admin si reinicio la app?
**R:** ❌ No. El bootstrap solo crea si la colección `users` está vacía. Es idempotente.

---

## 📞 Siguiente Paso

Si aún falla después de esto, necesitamos:
1. Ver los **logs exactos** de error en la VPS
2. Verificar el **documento del usuario** en MongoDB
3. Confirmar que **SA_PWD** es la correcta en la VPS
