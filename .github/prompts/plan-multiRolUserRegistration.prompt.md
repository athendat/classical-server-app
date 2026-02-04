# Plan: Opción B - Multi-rol con Restricciones y Auto-registro

## Descripción General

Implementar `additionalRoleKeys` en User con validaciones estrictas. Auto-registro de usuarios (`user`) con phone, y auto-registro de comerciantes (`user` + `merchant`) con phone + email. JWT incluye `roleKey`, `additionalRoleKeys`, y `tenantId`. Permisos de merchant inmediatos. Auditoría registra cambios de roles.

---

## Restricciones de Combinación de Roles

1. **super_admin**: No puede tener `additionalRoleKeys` ni incluirse en roles adicionales
2. **user**: Puede convivir con `merchant`, `admin`, `ops`, cualquier rol excepto `super_admin`
3. **merchant**: Solo puede convivir con `user`
4. **admin, ops**: Solo pueden convivir con `user`

---

## Especificaciones de Validación

### Auto-registro de Usuario Común (`POST /auth/register`)

- **Campos requeridos**: `phone` (obligatorio, validado), `password` (fuerte), `fullname`, `idNumber`
- **Campos opcionales**: `email`
- **Lógica**:
  - phone → buscar usuario existente
  - Si no existe: crear con `roleKey: 'user'` + `additionalRoleKeys: []`
  - Si existe y `phoneConfirmed: true` → rechazar 400 "Phone already registered"
  - Si existe sin confirmar → actualizar contraseña
  - Generar código confirmación SMS
- **Auditoría**: Registrar `AUTH_REGISTER` con severity HIGH

### Auto-registro de Comerciante (`POST /auth/register-merchant`)

- **Campos requeridos**: `phone` (obligatorio, validado), `email` (obligatorio, validado), `password` (fuerte), `fullname`, `idNumber`, `businessName`
- **Lógica**:
  - phone → buscar usuario existente
  - Si no existe: crear con `roleKey: 'user'` + `additionalRoleKeys: ['merchant']`
  - Si existe:
    - Si `roleKey` es `super_admin`, `admin`, u `ops` → rechazar 409 "Administrative user cannot be a merchant"
    - Si `roleKey` es `user` → agregar `'merchant'` a `additionalRoleKeys`
  - Email debe ser único globalmente → rechazar 409 si existe
  - Generar código confirmación SMS
- **Auditoría**: Registrar `MERCHANT_REGISTRATION` con severity HIGH y cambios `{ after: { additionalRoleKeys: ['merchant'] } }`

---

## JWT Payload

El token debe incluir:
- `roleKey`: string (rol principal)
- `additionalRoleKeys`: string[] (roles adicionales, vacío si no tiene)
- `tenantId`: string (opcional, si aplica)

---

## Resolución de Permisos

- Extraer `roleKey` + `additionalRoleKeys` como array: `[roleKey, ...additionalRoleKeys]`
- Buscar todos los roles en BD
- Combinar todas las `permissionKeys` de todos los roles
- Los permisos de merchant son inmediatos después del registro (sin confirmación de email)

---

## Steps de Implementación

### 1. Modificar User Schema
**Archivo**: `src/modules/users/infrastructure/schemas/user.schema.ts`

- Agregar propiedad: `additionalRoleKeys?: string[]`
- Actualizar índices:
  - Mantener `{ phone: 1 }` con unique
  - Mantener `{ email: 1 }` con sparse
  - Agregar índice compuesto: `{ roleKey: 1, additionalRoleKeys: 1 }`
- Actualizar virtual populate para incluir ambos roles

### 2. Crear Validador de Combinaciones de Roles
**Archivo**: `src/modules/permissions/application/permissions.service.ts`

- Agregar método: `validateRoleCombination(roleKey: string, additionalRoleKeys?: string[]): { valid: boolean; error?: string }`
- Implementar reglas de restricción

### 3. Actualizar Domain Ports y DTOs
**Archivos**:
- `src/modules/users/domain/ports/create-user.port.ts`
- `src/modules/users/domain/ports/update-user.port.ts`
- `src/modules/users/dto/user.dto.ts`

- Agregar `additionalRoleKeys?: string[]` en todos

### 4. Crear MerchantRegistrationDto
**Archivo**: `src/modules/auth/dto/merchant-registration.dto.ts` (nuevo)

```typescript
export class MerchantRegistrationDto {
  @ApiProperty({ description: 'Teléfono (obligatorio)', example: '50952149' })
  @IsNotEmpty()
  @IsPhoneNumber('CU')
  phone: string;

  @ApiProperty({ description: 'Email (obligatorio, debe ser único)', example: 'merchant@example.com' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Contraseña fuerte' })
  @IsNotEmpty()
  @IsStrongPassword(...)
  password: string;

  @ApiProperty({ description: 'Nombre completo' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  fullname: string;

  @ApiProperty({ description: 'Número de identificación (11 caracteres)' })
  @IsNotEmpty()
  @IsString()
  @Length(11, 11)
  idNumber: string;

  @ApiProperty({ description: 'Nombre del negocio' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  businessName: string;
}
```

### 5. Actualizar RegisterDto
**Archivo**: `src/modules/auth/dto/register.dto.ts`

- Mantener igual (phone obligatorio, email opcional)
- Actualizar docstring para clarificar que es para rol `user`

### 6. Modificar AuthService.register()
**Archivo**: `src/modules/auth/application/auth.service.ts`

- Lógica: phone → buscar → crear/actualizar con `roleKey: 'user'` + `additionalRoleKeys: []`
- Rechazar 400 si phoneConfirmed existe
- Generar código SMS

### 7. Crear AuthService.registerMerchant()
**Archivo**: `src/modules/auth/application/auth.service.ts`

- Lógica: phone + email → buscar → validar rol → crear/agregar `merchant`
- Rechazar 409 si rol es administrativo
- Rechazar 409 si email existe
- Generar código SMS
- Emitir auditoría con cambios de roles

### 8. Agregar Endpoints en AuthController
**Archivo**: `src/modules/auth/infrastructure/controllers/auth.controller.ts`

```typescript
@Post('register')
@HttpCode(HttpStatus.CREATED)
async register(@Body() registerDto: RegisterDto, @Res() res: Response): Promise<Response> {
  const response = await this.authService.register(registerDto);
  return res.status(response.statusCode).json(response);
}

@Post('register-merchant')
@HttpCode(HttpStatus.CREATED)
async registerMerchant(@Body() registerMerchantDto: MerchantRegistrationDto, @Res() res: Response): Promise<Response> {
  const response = await this.authService.registerMerchant(registerMerchantDto);
  return res.status(response.statusCode).json(response);
}
```

### 9. Actualizar UsersService.create()
**Archivo**: `src/modules/users/application/users.service.ts`

- Aceptar `additionalRoleKeys?: string[]`
- Validar combinación antes de persistir
- Emitir evento con ambos roles

### 10. Actualizar UsersRepository
**Archivo**: `src/modules/users/infrastructure/adapters/users.repository.ts`

- Actualizar método `create()` para persistir `additionalRoleKeys`
- Actualizar todos los query builders para retornar `additionalRoleKeys`

### 11. Modificar PermissionsService.fetchPermissionsFromDB()
**Archivo**: `src/modules/permissions/application/permissions.service.ts`

- Extraer `roleKey` + `additionalRoleKeys` como array: `[roleKey, ...additionalRoleKeys]`
- Buscar todos los roles
- Combinar todas las `permissionKeys`

### 12. Actualizar AuthService.generateTokens()
**Archivo**: `src/modules/auth/application/auth.service.ts`

- Incluir en JWT payload:
  - `roleKey`
  - `additionalRoleKeys`
  - `tenantId` (si aplica)

### 13. Registrar Cambios de Roles en Auditoría
**Archivo**: `src/modules/users/application/users.service.ts`

- Registrar operación específica cuando se agregan roles
- Incluir `changes: { before: {...}, after: {...} }`

### 14. Actualizar UsersService - Métodos de Lectura
**Archivo**: `src/modules/users/application/users.service.ts`

- `findById()`
- `findByPhone()`
- `list()`
- `mapToDTO()`

Asegurar que incluyen `additionalRoleKeys` en respuestas

---

## Consideraciones Específicas

1. **Email único**: Validar en `registerMerchant()` que email no exista en ningún usuario
2. **Validación de phone**: Usar `@IsPhoneNumber('CU')` en ambos DTOs
3. **Validación de password**: Usar `@IsStrongPassword()` con requisitos: min 8 chars, mayúscula, minúscula, número, símbolo
4. **Auditoría de cambios de rol**: Registrar en auditoría cuando se agrega `merchant` a usuario existente
5. **Permisos inmediatos**: No requerir confirmación de email para permisos de merchant (solo phone)
6. **Rechazo 409**: Usar cuando email existe, cuando rol es administrativo, o cuando combinación de roles es inválida

---

## Archivos a Modificar

- `src/modules/users/infrastructure/schemas/user.schema.ts` ✏️
- `src/modules/permissions/application/permissions.service.ts` ✏️
- `src/modules/users/domain/ports/create-user.port.ts` ✏️
- `src/modules/users/domain/ports/update-user.port.ts` ✏️
- `src/modules/users/dto/user.dto.ts` ✏️
- `src/modules/auth/dto/register.dto.ts` ✏️
- `src/modules/auth/application/auth.service.ts` ✏️
- `src/modules/auth/infrastructure/controllers/auth.controller.ts` ✏️
- `src/modules/users/application/users.service.ts` ✏️
- `src/modules/users/infrastructure/adapters/users.repository.ts` ✏️

## Archivos a Crear

- `src/modules/auth/dto/merchant-registration.dto.ts` ✨
