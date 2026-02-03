# Plan: Diseño Módulo de Tarjetas con Pinblock ISO-4 (Final)

**Resumen**: Crear un módulo de tarjetas para usuarios individuales (límite: 1 personal + 1 empresarial) con almacenamiento seguro de PAN y pinblock ISO-4 en Vault, máquina de estados simplificada (ACTIVE, BLOCKED), balance desnormalizado inicial en 0, y número de ticket como referencia simple. Respuestas enmascaran PAN como `**** **** **** XXXX`, nunca exponen PIN, e incluyen tipo, balance y estado. Retorna 409 (Conflict) al exceder límites.

## Decisiones Confirmadas

1. **Validación de límite duplicado**: HTTP 409 con mensaje específico "El usuario ya tiene una tarjeta [PERSONAL|BUSINESS] registrada"
2. **Orden de operaciones**: Vault-First (guardar en Vault, luego crear documento MongoDB)
3. **Índices MongoDB**: Índice compuesto único en `(userId, cardType)`
4. **Balance**: Desnormalizado en schema, inicializado en 0
5. **Estados**: Se crean en ACTIVE por defecto (sin PENDING_VERIFICATION)
6. **Formato PAN en respuestas**: `**** **** **** XXXX` (con espacios)
7. **PIN**: Nunca se expone en respuestas
8. **Campos en respuesta**: id, mascaraPan, expiryMonth, expiryYear, cardType, balance, status, createdAt
9. **Ticket Reference**: Campo numérico/string de referencia simple (sin validación contra operaciones)
10. **Pinblock**: Estándar ISO-4, 16 bytes hexadecimal

## Steps de Implementación

### Step 1: Definir dominio y máquina de estados
**Archivos**:
- `src/modules/cards/domain/enums/card-status.enum.ts` - Estados: ACTIVE, BLOCKED
- `src/modules/cards/domain/enums/card-type.enum.ts` - Tipos: PERSONAL, BUSINESS
- `src/modules/cards/domain/state-machines/card-lifecycle.machine.ts` - XState machine (transiciones ACTIVE ↔ BLOCKED)
- `src/modules/cards/domain/ports/card-vault.port.ts` - ICardVaultPort interface
- `src/modules/cards/domain/ports/pinblock.port.ts` - IPinblockService interface

**Contenido**:
- Enumeraciones simples
- Machine definition con estados y transiciones
- Port interfaces con métodos de lectura/escritura Vault

---

### Step 2: Crear esquema MongoDB y DTOs
**Archivos**:
- `src/modules/cards/infrastructure/schemas/card.schema.ts` - CardSchema Mongoose
- `src/modules/cards/infrastructure/schemas/card-lifecycle.schema.ts` - CardLifecycleSchema (auditoría)
- `src/modules/cards/dto/create-card.dto.ts` - CreateCardDto
- `src/modules/cards/dto/card-response.dto.ts` - CardResponseDto
- `src/modules/cards/dto/card-list-response.dto.ts` - Paginado con CardResponseDto[]

**CardSchema**:
```typescript
{
  id: UUID (from AbstractSchema),
  userId: string (ObjectId ref),
  cardType: CardTypeEnum,
  status: CardStatusEnum,
  lastFour: string (últimos 4 dígitos del PAN),
  expiryMonth: number (1-12),
  expiryYear: number,
  ticketReference: string (referencia de operación),
  balance: number (inicial 0, desnormalizado),
  createdAt: Date (from AbstractSchema),
  updatedAt: Date (from AbstractSchema)
}
```

**Índices**:
- Unique: `(userId, cardType)` - Validar 1 PERSONAL + 1 BUSINESS
- Simple: `userId` - Búsquedas rápidas
- Simple: `status` - Filtrados por estado

**DTOs**:
- `CreateCardDto`: pan @IsLuhnCard, pin, expiryMonth, expiryYear, ticketReference
- `CardResponseDto`: id, mascaraPan (**** **** **** XXXX), expiryMonth, expiryYear, cardType, balance, status, createdAt
- `CardListResponseDto`: Array de CardResponseDto + paginación

---

### Step 3: Implementar servicio ISO-4 pinblock
**Archivo**:
- `src/modules/cards/infrastructure/services/iso4-pinblock.service.ts`

**Funcionalidad**:
```typescript
convertToIso4Pinblock(pin: string, pan: string): Result<string, Error>
// Retorna: 16 bytes hexadecimal (32 caracteres hex)
// Formato ISO-4: PIN Block = (PIN_Length + PIN + Filler) XOR PAN_Block
```

**Métodos**:
- `convertToIso4Pinblock(pin: string, pan: string)` - Convierte PIN + PAN a pinblock
- Usar crypto nativo de Node.js
- No reversible (one-way hash)

---

### Step 4: Crear adaptador Vault para tarjetas
**Archivo**:
- `src/modules/cards/infrastructure/adapters/card-vault.adapter.ts`

**Implementa**: `ICardVaultPort`

**Métodos**:
```typescript
savePanAndPinblock(cardId: string, pan: string, pinblock: string): Promise<Result<void, VaultError>>
// Guarda en Vault:
// - cards/{cardId}/pan = pan (encriptado AES-GCM)
// - cards/{cardId}/pinblock = pinblock (encriptado AES-GCM)

getPan(cardId: string): Promise<Result<string, VaultError>>
// Lectura de PAN (para futura integración con emisor)

getPinblock(cardId: string): Promise<Result<string, VaultError>>
// Lectura de pinblock (para validación futura)

deletePanAndPinblock(cardId: string): Promise<Result<void, VaultError>>
// Elimina datos al borrar tarjeta
```

**Usa**:
- `@Inject(INJECTION_TOKENS.VAULT_CLIENT)` - IVaultClient del módulo común
- Result pattern para error handling
- AES-GCM para encriptación

---

### Step 5: Desarrollar servicio de aplicación
**Archivo**:
- `src/modules/cards/application/card.service.ts`

**Funcionalidad principal**:

#### `registerCard(userId: string, createCardDto: CreateCardDto): Promise<ApiResponse<CardResponseDto>>`
1. Validar límite: Contar tarjetas PERSONAL/BUSINESS del usuario
2. Si ya existe, retornar HTTP 409: "El usuario ya tiene una tarjeta [tipo] registrada"
3. Validar PAN con Luhn (@IsLuhnCard ya en DTO)
4. Extraer últimos 4 dígitos: `lastFour = pan.slice(-4)`
5. **Vault-First**: 
   - Convertir PIN a pinblock ISO-4
   - Guardar PAN + pinblock en Vault bajo `cards/{newCardId}/pan` y `cards/{newCardId}/pinblock`
   - Si falla Vault, retornar error 500 (no crear documento)
6. Crear documento CardSchema:
   - `userId`, `cardType`, `status: ACTIVE`, `lastFour`, `expiryMonth/Year`, `ticketReference`, `balance: 0`
7. Auditar: `AuditService.logAllow('CREATE_CARD', 'card', cardId, ...)`
8. Retornar CardResponseDto (con mascara PAN)

#### `listCardsForUser(userId: string, page: number, limit: number): Promise<ApiResponse<CardListResponseDto>>`
1. Contar total de tarjetas del usuario
2. Query MongoDB: `{ userId, status: { $in: [ACTIVE, BLOCKED] } }` (proyectar sin pan/pinblock)
3. Retornar paginado con `build-pagination-meta`

#### `getCardDetail(userId: string, cardId: string): Promise<ApiResponse<CardResponseDto>>`
1. Buscar tarjeta por `id` y validar ownership (`userId` match)
2. Si no pertenece al usuario, retornar 403
3. Retornar con mascara PAN

#### `maskPan(pan: string | undefined): string`
Helper privado:
```typescript
// Pan: "4111111111111111" → "**** **** **** 1111"
if (!pan) return '****';
const lastFour = pan.slice(-4);
return `**** **** **** ${lastFour}`;
```

**Injecciones**:
```typescript
@Inject(INJECTION_TOKENS.VAULT_CLIENT)
private readonly vaultClient: IVaultClient;

@Inject(INJECTION_TOKENS.CARD_VAULT_ADAPTER)
private readonly cardVaultAdapter: ICardVaultPort;

private readonly iso4Service: Iso4PinblockService;
private readonly auditService: AuditService;
private readonly asyncContext: AsyncContextService;
```

---

### Step 6: Implementar controlador HTTP
**Archivo**:
- `src/modules/cards/infrastructure/controllers/card.controller.ts`

**Endpoints**:

#### `POST /cards` - Registrar tarjeta
```typescript
@Post()
@UseGuards(JwtAuthGuard)
async registerCard(
  @Body() createCardDto: CreateCardDto,
  @CurrentUser() user: UserPayload,
): Promise<ApiResponse<CardResponseDto>>
```
- Validación: Inyectar usuario actual del JWT
- Respuesta 201 (Created) o 409 (Conflict si límite)

#### `GET /cards` - Listar tarjetas del usuario
```typescript
@Get()
@UseGuards(JwtAuthGuard)
async listCards(
  @Query() { page = 1, limit = 10 }: PaginationQueryDto,
  @CurrentUser() user: UserPayload,
): Promise<ApiResponse<CardListResponseDto>>
```
- Respuesta 200 con array de CardResponseDto

#### `GET /cards/:id` - Detalle de tarjeta
```typescript
@Get(':id')
@UseGuards(JwtAuthGuard)
async getCardDetail(
  @Param('id') cardId: string,
  @CurrentUser() user: UserPayload,
): Promise<ApiResponse<CardResponseDto>>
```
- Validar ownership
- Respuesta 200 con mascara PAN o 403/404

**Decoradores**:
- `@JwtAuthGuard()` - Protege todos los endpoints
- `@CurrentUser()` - Extrae usuario del token (crear si no existe)

---

### Step 7: Configurar validadores, guards y auditoría
**Archivos**:
- `src/modules/cards/infrastructure/decorators/current-user.decorator.ts` - Extrae usuario del contexto
- `src/common/validators/card-validators.ts` - Validadores adicionales

**Validadores existentes a usar**:
- `@IsLuhnCard()` - Ya existe en validators
- `@IsEnum(CardTypeEnum)` - Class-validator estándar

**Auditoría**:
- Loguear `CREATE_CARD` al registrar
- Loguear `VIEW_CARD` al consultar (opcional)
- Usar `AuditService.logAllow/logDeny/logError`

---

### Step 8: Crear módulo contenedor
**Archivo**:
- `src/modules/cards/card.module.ts`

**Estructura**:
```typescript
@Module({
  imports: [AuthModule, UsersModule, CacheModule],
  controllers: [CardController],
  providers: [
    CardsService,
    Iso4PinblockService,
    {
      provide: INJECTION_TOKENS.CARD_VAULT_ADAPTER,
      useClass: CardVaultAdapter,
    },
    // ... otros providers
  ],
  exports: [CardsService],
})
export class CardsModule {}
```

**Configuración**:
- Registrar providers con INJECTION_TOKENS
- Importar AuthModule para JwtAuthGuard
- Importar UsersModule para validar usuarios
- Importar CacheModule si se usa caché
- Exportar CardsService para futura integración

**Importar en `app.module.ts`**:
```typescript
imports: [
  BootstrapModule,
  SharedContextModule,
  // ... otros módulos
  CardsModule, // ← AGREGAR AQUÍ
]
```

---

## Archivos a crear (Checklist)

**Domain**:
- [ ] `src/modules/cards/domain/enums/card-status.enum.ts`
- [ ] `src/modules/cards/domain/enums/card-type.enum.ts`
- [ ] `src/modules/cards/domain/state-machines/card-lifecycle.machine.ts`
- [ ] `src/modules/cards/domain/ports/card-vault.port.ts`
- [ ] `src/modules/cards/domain/ports/pinblock.port.ts`

**Infrastructure**:
- [ ] `src/modules/cards/infrastructure/schemas/card.schema.ts`
- [ ] `src/modules/cards/infrastructure/schemas/card-lifecycle.schema.ts`
- [ ] `src/modules/cards/infrastructure/adapters/card-vault.adapter.ts`
- [ ] `src/modules/cards/infrastructure/services/iso4-pinblock.service.ts`
- [ ] `src/modules/cards/infrastructure/controllers/card.controller.ts`
- [ ] `src/modules/cards/infrastructure/decorators/current-user.decorator.ts`

**Application**:
- [ ] `src/modules/cards/application/card.service.ts`

**DTO**:
- [ ] `src/modules/cards/dto/create-card.dto.ts`
- [ ] `src/modules/cards/dto/card-response.dto.ts`
- [ ] `src/modules/cards/dto/card-list-response.dto.ts`
- [ ] `src/modules/cards/dto/pagination-query.dto.ts`

**Module**:
- [ ] `src/modules/cards/card.module.ts`
- [ ] Actualizar `src/app.module.ts`

**Constants**:
- [ ] Agregar tokens a `src/common/constants/injection-tokens.ts`:
  - `CARD_VAULT_ADAPTER`
  - `PINBLOCK_SERVICE`
  - `CARD_SERVICE`

---

## Testing & Validation

### Casos de prueba:
1. **POST /cards - Registrar tarjeta exitosa**:
   - Input: PAN válido (Luhn), PIN, fecha, ticket
   - Output: 201 con CardResponseDto (mascara PAN)
   - Vault: PAN + pinblock guardados

2. **POST /cards - Registrar segunda tarjeta PERSONAL**:
   - Input: Segunda tarjeta PERSONAL
   - Output: 409 "El usuario ya tiene una tarjeta personal registrada"

3. **POST /cards - Registrar tarjeta PERSONAL + BUSINESS**:
   - Input: Primero PERSONAL, luego BUSINESS
   - Output: Ambas exitosas (201)

4. **GET /cards - Listar tarjetas paginadas**:
   - Output: Array de CardResponseDto sin exposición de PAN/pinblock

5. **GET /cards/:id - Detalle con mascara**:
   - Output: CardResponseDto con mascaraPan: "**** **** **** XXXX"

6. **GET /cards/:id - Ownership check**:
   - Input: CardId que pertenece a otro usuario
   - Output: 403 Forbidden

---

## Consideraciones futuras

1. **Integración con API emisor**: Crear endpoint PATCH `/cards/:id/verify` que llame API simulada
2. **Actualización de balance**: Listener de eventos de transacciones para desnormalizar balance
3. **Bloqueo/desbloqueo de tarjetas**: PATCH `/cards/:id/block` y PATCH `/cards/:id/unblock`
4. **Historial de cambios**: Usar `CardLifecycleSchema` para auditoría de transiciones
5. **Eliminación segura**: DELETE `/cards/:id` que limpie Vault + documento
