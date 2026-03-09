# Plan: Integración SGT para verificación de tarjeta al registrar

**Contexto:** Al registrar una tarjeta, el flujo actual guarda directamente en Vault + MongoDB y activa la tarjeta. El nuevo flujo añade un paso de verificación contra el servidor SGT (`http://localhost:9031/api_031/classical/activate-pin`) usando HMAC-SHA256. La tarjeta nace en estado `PENDING_VERIFICATION` y transiciona a `ACTIVE` o `VERIFICATION_FAILED` según la respuesta del SGT.

---

## Steps

**1. Nuevos estados en el enum de tarjeta**

Modificar `src/modules/cards/domain/enums/card-status.enum.ts` agregando dos valores:
- `PENDING_VERIFICATION = 'PENDING_VERIFICATION'`
- `VERIFICATION_FAILED = 'VERIFICATION_FAILED'`

---

**2. Puerto (interfaz) para el adaptador SGT**

Crear `src/modules/cards/domain/ports/sgt-card.port.ts` con la interfaz `ISgtCardPort` que expone un único método:
```
activatePin(cardId: string, pan: string, pinblock: string, expiryMonth: number, expiryYear: number): Promise<Result<SgtActivatePinResponse, Error>>
```
- Agregar el símbolo `CARD_SGT_PORT` a `src/common/constants/injection-tokens.ts`
- Exportar desde `src/modules/cards/domain/ports/index.ts`

> **TBD:** El payload exacto del body que acepta `/activate-pin` debe confirmarse con la documentación del SGT. El plan asume que recibe `pan`, `pinblock`, `expiryMonth`, `expiryYear`.

---

**3. Adaptador SGT con HMAC**

Crear `src/modules/cards/infrastructure/adapters/sgt-card.adapter.ts` que:
- Implementa `ISgtCardPort`
- Inyecta `HttpService` (del `HttpModule` común) y `ConfigService`
- En `activatePin()`:
  1. Construye el body del request
  2. Genera `X-Timestamp = new Date().toISOString()`
  3. Calcula `X-Signature = HEX(HMAC-SHA256(SGT_HMAC_SECRET, JSON.stringify(body) + timestamp))`
  4. Envía header `X-Client-ID = SGT_CLIENT_ID`
  5. Llama `this.httpService.post(SGT_BASE_URL + '/activate-pin', body, { headers })`
  6. Retorna `Result.ok(response)` o `Result.fail(error)`
- Exportar desde `src/modules/cards/infrastructure/adapters/index.ts`

---

**4. Variables de entorno**

Agregar a `src/config/config.schema.ts`:
- `SGT_BASE_URL` (required, default: `http://localhost:9031/api_031/classical`)
- `SGT_HMAC_SECRET` (required)
- `SGT_CLIENT_ID` (required)

Agregar valores correspondientes en `.env`.

---

**5. Registrar el adaptador en el módulo**

Modificar `src/modules/cards/cards.module.ts`:
- Importar `HttpModule` (el wrapper de Axios del common)
- Agregar `SgtCardAdapter` en `providers` usando el token `CARD_SGT_PORT`
- Asegurarse de que `ConfigModule` esté disponible (ya debería estarlo vía global)

---

**6. Modificar `CardsService.registerCard()`**

Modificar `src/modules/cards/application/cards.service.ts`:

- Inyectar `ISgtCardPort` via `@Inject(INJECTION_TOKENS.CARD_SGT_PORT)`
- Modificar el flujo `registerCard`:

| Paso | Cambio |
|------|--------|
| Step 2 | `CardsRepository` necesita método `updateStatus(id, status)` — ver paso 7 |
| Step 6 | Crear documento en MongoDB con `status: CardStatusEnum.PENDING_VERIFICATION` (antes era `ACTIVE`) |
| **Step 7 (nuevo)** | Llamar a `sgtCardPort.activatePin(cardId, dto.pan, pinblock, ...)` |
| **Step 8 (nuevo)** | Si SGT `isSuccess` → `cardsRepository.updateStatus(cardId, ACTIVE)` |
| **Step 9 (nuevo)** | Si SGT `isFailure` → `cardsRepository.updateStatus(cardId, VERIFICATION_FAILED)` + log audit `HIGH` + no lanzar excepción (retornar el card con estado failed) |

El método retorna la tarjeta con su estado real (`PENDING_VERIFICATION` no es visible en la respuesta, ya que el update es sincrónico antes de responder al cliente).

---

**7. Método `updateStatus` en el repositorio**

Modificar `src/modules/cards/infrastructure/adapters/card.repository.ts` y su port `src/modules/cards/domain/ports/card.port.ts` para agregar:
```
updateStatus(id: string, status: CardStatusEnum): Promise<Card | null>
```

---

## Verification

- Test manual: `POST /cards` con tarjeta válida → respuesta con `status: ACTIVE`
- Test manual: `POST /cards` con credenciales SGT incorrectas → respuesta con `status: VERIFICATION_FAILED`
- Revisar logs de auditoría para los eventos `SGT_ACTIVATE_PIN_SUCCESS` y `SGT_ACTIVATE_PIN_FAILED`
- Verificar que el header `X-Signature` se genera igual que en el `HMAC_AUTH_GUIDE.md`

---

## Decisions

- **Puerto + Adaptador SGT separado** (no inline en `CardsService`): mantiene la arquitectura hexagonal del proyecto y permite mockear fácilmente en tests
- **Fallo SGT no lanza excepción**: la tarjeta queda registrada en `VERIFICATION_FAILED` en lugar de hacer rollback, tal como especificado
- **HMAC calculado en el adaptador**: el `CardsService` no conoce detalles de autenticación del SGT
- **Body TBD**: el payload exacto del endpoint `/activate-pin` debe confirmarse; si el SGT requiere campos distintos, solo se ajusta `SgtCardAdapter`
