# 🚀 System Bootstrap Service - Inicialización Centralizada del Sistema

## Resumen Ejecutivo

Se ha implementado un **servicio centralizado y orquestado (`SystemBootstrapService`)** que gestiona la inicialización del sistema en **4 FASES SECUENCIALES**:

1️⃣ **Módulos** → Base para permisos  
2️⃣ **Permisos** → Base para roles  
3️⃣ **Roles** → Base para usuarios  
4️⃣ **Super Admin** → Primer usuario del sistema  

Este enfoque garantiza que **todas las dependencias estén presentes antes de crear los datos que las requieren**.

---

## Archivos Creados

### 1. **SystemBootstrapService** 📄
```
src/common/bootstrap/system-bootstrap.service.ts
```

**Responsabilidades:**
- Orquestar la inicialización en orden correcto
- Verificar si cada colección está vacía
- Seedear datos si es necesario
- Loguear progreso detallado de cada fase
- Manejar errores sin interrumpir startup

**Estrategia:**
- ✅ Auto-seed inteligente: Se ejecuta `onModuleInit` SIEMPRE
- ✅ Verifica si colecciones están vacías
- ✅ Si vacía → seedea datos del sistema
- ✅ Si no vacía → respeta datos preexistentes
- ✅ Permite que la app inicie aunque falle el seed

**Fases:**
```
🚀 Starting system bootstrap initialization...
  📦 PHASE 1: Bootstrap modules...
    ✅ PHASE 1 completed: 17/17 modules seeded
  🔐 PHASE 2: Bootstrap permissions...
    ✅ PHASE 2 completed: 89/89 permissions seeded
  👥 PHASE 3: Bootstrap roles...
    ✅ PHASE 3 completed: 6/6 roles seeded
  👨‍💼 PHASE 4: Bootstrap super admin user...
    ✅ PHASE 4 completed: Super admin created
✅ System bootstrap completed successfully
```

### 2. **BootstrapModule** 📦
```
src/common/bootstrap/bootstrap.module.ts
```

**Características:**
- Registra `SystemBootstrapService` como proveedor
- Configura `MongooseModule.forFeature` con todos los schemas necesarios
- Exporta el servicio para uso global
- Se importa PRIMERO en `AppModule` para garantizar orden de ejecución

### 3. **Barrel Export** 📌
```
src/common/bootstrap/index.ts
```

Simplifica imports:
```typescript
export { BootstrapModule } from './bootstrap.module';
export { SystemBootstrapService } from './system-bootstrap.service';
```

---

## Archivos Modificados

### 1. **app.module.ts** ✅
**Cambios:**
- Importar `BootstrapModule` desde `src/common/bootstrap`
- Posicionar `BootstrapModule` como PRIMER módulo importado
- Garantiza que bootstrap se ejecute antes que cualquier otro módulo

```typescript
@Module({
  imports: [
    // ⭐ BootstrapModule: Importar PRIMERO para inicializar el sistema
    BootstrapModule,
    // ... resto de módulos
  ],
})
```

### 2. **users.service.ts** ✅
**Cambios Realizados:**
- ❌ Removido `OnModuleInit` interface
- ❌ Removido `async onModuleInit()` hook
- ❌ Removido `seedSuperAdminIfEmpty()` método privado
- ❌ Removido `createSuperAdminIfEmpty()` método privado
- ✅ Restaurado método `mapToDTO()` necesario para funcionalidad core
- ✅ Removido import no usado de `SYSTEM_ADMIN_ID`
- ✅ Actualizado docstring indicando que bootstrap es responsabilidad de `SystemBootstrapService`

**Beneficio:** El servicio es más simple y se enfoca en CRUD, no en inicialización.

### 3. **modules-seed.service.ts** ✅
**Cambios Realizados:**
- ❌ Removido `OnModuleInit` interface
- ❌ Removido `async onModuleInit()` hook
- ✅ Convertido a servicio manual con método `seedIfNeeded()` público
- ✅ Actualizado docstring indicando que es heredado

**Beneficio:** Permite re-seedear manualmente si es necesario, pero no interfiere con bootstrap.

---

## Flujo de Inicialización

```
NestJS Application Start
    ↓
AppModule loads
    ↓
BootstrapModule imports (PRIMERO)
    ↓
SystemBootstrapService.onModuleInit() ejecuta
    ↓
    ├─→ PHASE 1: Seed módulos (if colección vacía)
    │   └─→ 17 módulos → BD
    │
    ├─→ PHASE 2: Seed permisos (if colección vacía)
    │   └─→ 89 permisos → BD
    │
    ├─→ PHASE 3: Seed roles (if colección vacía)
    │   └─→ 6 roles → BD
    │
    └─→ PHASE 4: Seed super_admin (if colección vacía AND SA_EMAIL + SA_PWD configurados)
        └─→ 1 usuario → BD
    ↓
Resto de módulos inicializan
    ↓
Aplicación lista (sin datos duplicados)
```

---

## Garantías de Integridad

✅ **Orden Secuencial:** Cada fase depende de la anterior  
✅ **Idempotencia:** No crea datos duplicados en re-inicios  
✅ **Tolerancia a Errores:** No detiene startup si algo falla  
✅ **Trazabilidad:** Logging detallado de cada operación  
✅ **Configurabilidad:** Respeta variables de entorno (`SA_EMAIL`, `SA_PWD`)  

---

## Variábleas de Entorno Requeridas

Para que el bootstrap cree el super_admin:

```env
SA_EMAIL=superadmin@classical.local
SA_PWD=YourSecurePassword123!
```

Si no están configuradas, el super_admin no se crea pero la app continúa iniciando.

---

## Próximos Pasos Opcionales

1. **Crear seed service de auditoría** si es necesario grabar eventos de bootstrap
2. **Agregar métricas** para medir tiempo de inicialización de cada fase
3. **Implementar re-seed endpoint** (POST /admin/bootstrap/reseed) para regenerar datos

---

## Testing

Para validar que el bootstrap funciona:

```bash
# Ver logs de inicialización
npm run start:dev | grep -E "Bootstrap|PHASE|completed"

# Verificar BD
# - Colección 'modules': 17 documentos
# - Colección 'permissions': 89 documentos
# - Colección 'roles': 6 documentos
# - Colección 'users': 1 documento (super_admin)
```

---

## Archivo de Referencia

Para entender la estructura de datos:

- [system-modules.ts](src/modules/modules/seeds/system-modules.ts) - Definición de módulos
- [system-permissions.ts](src/modules/roles/seeds/system-permissions.ts) - Definición de permisos
- [system-roles.ts](src/modules/roles/seeds/system-roles.ts) - Definición de roles
