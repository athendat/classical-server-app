## Plan: Endpoints de autenticación completa con phone y confirmación obligatoria

Crear endpoints **register**, **confirm-phone**, **resend-code**, **forgot-password**, **reset-password** usando **phone** (inicia 5-6, 8 dígitos), confirmación obligatoria, códigos 6 dígitos en Redis (TTL 10 min), máximo 3 intentos de validación, máximo 3 resends en 24h, decoradores @Phone y @Password personalizados.

### Steps

1. **Crear decorador @Phone personalizado** en [src/common/validators/phone.validator.ts](src/common/validators/phone.validator.ts):
   - Validar: inicia con 5 o 6, exactamente 8 dígitos numéricos
   - Mensaje: "Phone debe comenzar con 5 o 6 y tener 8 dígitos"

2. **Crear decorador @Password personalizado** en [src/common/validators/password.validator.ts](src/common/validators/password.validator.ts):
   - Validar: mínimo 8 caracteres, mayúscula, minúscula, número y símbolo (@$!%*?&)
   - Mensaje descriptivo con requisitos

3. **Crear DTOs para nuevos endpoints** en [src/modules/auth/dto/](src/modules/auth/dto/):
   - `RegisterDto`: phone (@Phone), password (@Password), passwordConfirm
   - `ConfirmPhoneDto`: phone, confirmationCode (6 dígitos)
   - `ResendCodeDto`: phone
   - `ForgotPasswordDto`: phone
   - `ResetPasswordDto`: phone, resetCode, newPassword (@Password), passwordConfirm

4. **Crear ConfirmationCodeService** [src/modules/auth/infrastructure/services/confirmation-code.service.ts](src/modules/auth/infrastructure/services/confirmation-code.service.ts):
   - Generar código: 6 dígitos aleatorios
   - Keys Redis:
     * `confirmation:${phone}` → código (TTL 10 min)
     * `confirmation:attempts:${phone}` → intentos validación (TTL 10 min)
     * `confirmation:resends:${phone}` → contador resends (TTL 24h)
     * `reset:${phone}` → código reset (TTL 10 min)
     * `reset:attempts:${phone}` → intentos reset (TTL 10 min)
   - Métodos:
     * `generateAndStore(phone, type)`: genera código, almacena con TTL
     * `validate(phone, code, type)`: valida, incrementa intentos, rechaza si >3
     * `clear(phone, type)`: limpia código tras éxito
     * `canResend(phone)`: verifica resends < 3 en 24h
     * `incrementResendCount(phone)`: incrementa contador resends
     * `getResendCountRemaining(phone)`: retorna resends restantes

5. **Actualizar User schema** [src/modules/users/schemas/](src/modules/users/schemas/) o [src/modules/users/domain/](src/modules/users/domain/):
   - Agregar campo `phoneConfirmed: boolean = false`
   - Índice único en `phone`

6. **Actualizar validateCredentials()** en AuthService:
   - Verificar `user.phoneConfirmed === true` después de validar password
   - Si no confirmado: retornar `{ valid: false, reason: 'PHONE_NOT_CONFIRMED' }`
   - En `login()`: retornar HTTP 401 "Teléfono no confirmado"
   - Auditar logDeny con reason

7. **Extender AuthService** [src/modules/auth/application/auth.service.ts](src/modules/auth/application/auth.service.ts):
   - Inyectar `ConfirmationCodeService`
   - Método `register(registerDto)`:
     * Validar phone único O phone existe pero `phoneConfirmed=false`
     * Si phone existe y confirmado → error "Phone ya registrado"
     * Si phone existe y NO confirmado → actualizar password, generar nuevo código
     * Si phone no existe → crear usuario con `phoneConfirmed=false`
     * Generar código confirmación
     * Auditar logAllow
     * Retornar HTTP 201 "Código enviado al SMS"
   - Método `confirmPhone(confirmPhoneDto)`:
     * Validar código (captura intentos)
     * Si >3 intentos: HTTP 400 + logDeny "Demasiados intentos, use resend-code"
     * Buscar usuario por phone
     * Marcar `phoneConfirmed=true`
     * Limpiar código y contadores
     * Auditar logAllow
     * Retornar HTTP 200 "Teléfono confirmado"
   - Método `resendCode(resendCodeDto)`:
     * Validar phone existe y `phoneConfirmed=false`
     * Verificar resends < 3 en 24h
     * Si >=3: HTTP 429 + logDeny "Límite de reenvíos alcanzado, intente en 24h"
     * Generar NUEVO código, reemplazar anterior
     * Resetear intentos validación a 0
     * Incrementar contador resends
     * Auditar logAllow
     * Retornar HTTP 200 "Nuevo código enviado (X reenvíos restantes)"
   - Método `forgotPassword(forgotPasswordDto)`:
     * Validar phone existe y `phoneConfirmed=true`
     * Generar reset code
     * Auditar logAllow
     * Retornar HTTP 200 "Código enviado" (mismo mensaje si no existe)
   - Método `resetPassword(resetPasswordDto)`:
     * Validar reset code (máx 3 intentos)
     * Buscar usuario por phone
     * Hash nueva password
     * Actualizar contraseña
     * Limpiar reset code
     * Auditar logAllow
     * Retornar HTTP 200 "Contraseña actualizada"

8. **Extender UsersService** [src/modules/users/application/users.service.ts](src/modules/users/application/users.service.ts):
   - `findByPhone(phone)`: buscar por phone
   - `existsByPhone(phone)`: verificar phone existe
   - `markPhoneConfirmed(userId)`: actualizar `phoneConfirmed=true`
   - `updatePasswordByPhone(phone, passwordHash)`: actualizar password para re-register

9. **Registrar ConfirmationCodeService en AuthModule**:
   - Provider con inyección de `INJECTION_TOKENS.CACHE_SERVICE`
   - Export para uso en AuthService

10. **Agregar 5 nuevos endpoints en AuthController** [src/modules/auth/infrastructure/controllers/auth.controller.ts](src/modules/auth/infrastructure/controllers/auth.controller.ts):
    - `POST /auth/register`: RegisterDto → HTTP 201
    - `POST /auth/confirm-phone`: ConfirmPhoneDto → HTTP 200 / 400
    - `POST /auth/resend-code`: ResendCodeDto → HTTP 200 / 400 / 429
    - `POST /auth/forgot-password`: ForgotPasswordDto → HTTP 200
    - `POST /auth/reset-password`: ResetPasswordDto → HTTP 200 / 400
    - Decoradores Swagger: @ApiOperation, @ApiBody, @ApiResponse, @ApiBadRequestResponse, @ApiTooManyRequestsResponse

11. **Auditoría completa**:
    - `register`: logAllow (nuevo usuario o re-register no confirmado)
    - `confirmPhone`: logAllow / logDeny (intentos agotados)
    - `resendCode`: logAllow / logDeny (límite 24h alcanzado)
    - `forgotPassword`: logAllow
    - `resetPassword`: logAllow / logDeny (código inválido)
    - `login`: logDeny si `phoneConfirmed=false`

### Resumen de Flujos

| Endpoint | Éxito | Error |
|----------|-------|-------|
| register | 201 + código enviado | 400 phone ya confirmado |
| confirm-phone | 200 + confirmado | 400 código inválido/intentos agotados |
| resend-code | 200 + nuevo código | 400 no existe / 429 límite 24h |
| forgot-password | 200 + código enviado | (siempre 200) |
| reset-password | 200 + password actualizado | 400 código inválido |
| login | 200 + tokens | 401 phone no confirmado |
