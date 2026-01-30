# Prompt: Crear Endpoint Backend `/modules/navigation` para Construcción de Navegación Dinámica

## Objetivo

Crear un endpoint GET `/modules/navigation` en el backend que sea responsable de construir y retornar la navegación dinámica basada en módulos, agrupamientos por categoría y permisos del usuario autenticado. Este endpoint será la fuente única de verdad (single source of truth) para la navegación generada.

## Responsabilidades del Endpoint

### 1. **Construcción de Estructura de Navegación**

- Recuperar todos los módulos con `isNavigable: true` ordenados por `order`
- Agrupar módulos por `category`
- Crear items tipo `group` para cada categoría
- Colocar módulos sin `category` como items `basic` en top level
- Respetar la propiedad `order` en cada módulo para ordenamiento

### 2. **Control de Acceso Basado en Permisos**

- Evaluar permisos del usuario autenticado contra los módulos
- Para items tipo `basic`: incluir solo si el usuario tiene al menos uno de los permisos del módulo
- Para items tipo `group`: incluir si el usuario tiene permisos en **cualquier hijo** (unión lógica OR)
- Soportar wildcards en permisos (ej: `modules:*`, `modules:read:*`)
- Filtrar `children` de grupos mostrando solo elementos accesibles

### 3. **Enriquecimiento de Items de Navegación**

- Mapear propiedades de Module a NavigationItem:
  - `module.name` → `item.title`
  - `module.icon` → `item.icon`
  - `module.indicator` → `item.moduleIndicator`
  - `module.order` → `item.order`
  - `module.category` → `item.id` (para grupos)
- Establecer `link` basado en `module.indicator` (ej: `/modules/{indicator}`)
- Usar tipos correctos: `basic` para módulos individuales, `group` para categorías

### 4. **Respuesta Estructurada**

Retornar estructura que incluya:

- Array de `NavigationItem[]` generados dinámicamente
- Metadatos opcionales: total de módulos, total de módulos accesibles, timestamp
- Formato compatible con `NavigationService` del frontend

## Especificación Técnica

### Endpoint

```text
GET /api/modules/navigation
Authorization: Bearer {token}
```

### Request

```typescript
// Headers
Authorization: Bearer {jwt_token}
```

### Response (200 OK)

```typescript
{
  "success": true,
  "data": {
    "navigationItems": [
      {
        "id": "management",
        "title": "Management",
        "type": "group",
        "order": 0,
        "children": [
          {
            "id": "terminals",
            "title": "Terminals",
            "type": "basic",
            "link": "/modules/terminals",
            "icon": "devices",
            "moduleIndicator": "terminals",
            "order": 0
          }
        ]
      },
      {
        "id": "keys",
        "title": "Keys",
        "type": "basic",
        "link": "/modules/keys",
        "icon": "key",
        "moduleIndicator": "keys",
        "order": 1,
        "active": false
      }
    ],
    "metadata": {
      "totalModules": 15,
      "accessibleModules": 8,
      "generatedAt": "2026-01-18T10:30:00Z"
    }
  }
}
```

### Response (403 Forbidden)

```typescript
{
  "success": false,
  "error": "Insufficient permissions to access navigation"
}
```

### Response (401 Unauthorized)

```typescript
{
  "success": false,
  "error": "Authentication required"
}
```

## Lógica de Implementación

### Pseudocódigo

```typescript
GET /api/modules/navigation
├── 1. Validar usuario autenticado
├── 2. Recuperar módulos con isNavigable: true, ordenados por order
├── 3. Obtener permisos del usuario desde token/sesión
├── 4. Construir estructura:
│   ├── Agrupar módulos por category
│   ├── Para cada categoría:
│   │   ├── Crear item tipo 'group'
│   │   ├── Para cada módulo en categoría:
│   │   │   ├── Verificar acceso (permiso en lista del usuario)
│   │   │   └── Si acceso, agregar como 'basic' child
│   │   └── Si algún child es accesible, incluir group
│   ├── Para módulos sin categoría:
│   │   ├── Verificar acceso
│   │   └── Si acceso, agregar como item 'basic' top-level
├── 5. Ordenar items por propiedad order
├── 6. Retornar navigationItems + metadatos
└── 7. Cachear resultado (TTL: 5-10 minutos) para optimizar
```

## Consideraciones Implementación

### 1. **Validación de Permisos**

```typescript
// Helper para verificar acceso
function userHasModulePermission(
  userPermissions: string[],
  moduleActions: string[]
): boolean {
  return moduleActions.some(action =>
    userPermissions.some(perm =>
      perm === action || 
      perm === '*' || 
      perm.endsWith(':*')
    )
  );
}

// Herencia de permisos en grupos (OR lógica)
function canAccessGroup(
  userPermissions: string[],
  groupChildren: Module[]
): boolean {
  return groupChildren.some(child =>
    userHasModulePermission(userPermissions, child.actions)
  );
}
```

### 2. **Caching**

- Cachear navegación generada con TTL de 5-10 minutos
- Invalidar caché cuando:
  - Se modifique un módulo (`POST/PATCH /modules/*`)
  - Se reordene módulos (`PATCH /modules/reorder`)
  - Cambie la asignación de permisos a roles

### 3. **Performance**

- Usar índices en BD: `modules.isNavigable`, `modules.order`, `modules.category`
- Evitar N+1 queries: cargar módulos + permisos en una única consulta
- Considerar GraphQL si la complejidad de consultas crece

### 4. **Versionado**

- Incluir versión de API en response para invalidación de caché frontend
- Header: `X-Navigation-Version: {hash}` para cache busting

## Integración con Frontend

### En `navigation.service.ts`

```typescript
// En lugar de NavigationBuilderService, usar endpoint backend
loadNavigationFromBackend(): Observable<NavigationItem[]> {
  return this.http.get<NavigationResponse>('/api/modules/navigation')
    .pipe(
      map(res => res.data.navigationItems),
      tap(items => this._navigation.set(items))
    );
}
```

### Trigger de Actualización

- Al login: cargar navegación
- Al cambiar módulos en módules-list: llamar endpoint
- Usar polling o WebSocket para actualizaciones en tiempo real (opcional)

## Testing

### Unit Tests

- [ ] Validar construcción de grupos
- [ ] Validar filtrado por permisos (OR lógica)
- [ ] Validar módulos sin categoría en top-level
- [ ] Validar ordenamiento por `order`
- [ ] Validar respuesta con diferentes niveles de acceso

### Integration Tests

- [ ] E2E: Usuario A ve diferente navegación que Usuario B según permisos
- [ ] E2E: Cambiar módulo regenera navegación correctamente
- [ ] E2E: Reordenar módulos refleja cambios en navegación

---

**Nota**: Este endpoint reemplaza la lógica `NavigationBuilderService` del frontend, centralizando la construcción de navegación en el backend donde reside la autoridad de permisos.
