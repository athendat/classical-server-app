# HMAC Authentication Guide - Server-to-Server

Este documento describe cómo los servidores externos deben autenticarse con la API SGT usando HMAC-SHA256.

## Descripción General

La autenticación HMAC es un mecanismo criptográfico que permite validar que:

1. ✅ El request proviene del servidor autorizado
2. ✅ El payload no ha sido alterado durante la transmisión  
3. ✅ El request no es antiguo (previene replay attacks)

## Headers Requeridos

Cada request al API debe incluir estos 3 headers:

| Header | Descripción | Ejemplo |
| -------- | ------------- | --------- |
| `X-Signature` | Firma HMAC-SHA256 (hexadecimal) | `a3f2b1c9d4e8f7a2b5c1d4e8f7a9b3c` |
| `X-Timestamp` | Timestamp ISO 8601 del request | `2026-02-25T15:30:45.123Z` |
| `X-Client-ID` | Identificador del cliente servidor | `mi-servicio-backend` |

## Algoritmo de Firma

### Paso 1: Preparar el Payload

Concatenar el body JSON + timestamp:

```text
payload = body + timestamp
```

### Paso 2: Crear Firma HMAC

```text
X-Signature = HEX(HMAC-SHA256(HMAC_SECRET, payload))
```

## Ejemplos de Implementación

### Node.js / JavaScript

```javascript
const crypto = require('crypto');
const axios = require('axios');

// Configuración
const API_URL = 'https://api.teva-360.com/classical/transfer';
const HMAC_SECRET = 'your-shared-secret-key'; // Debe coincidir con env del servidor
const CLIENT_ID = 'mi-servicio-backend';

// Preparar request
const body = {
  cardNumber: '4111111111111111',
  amount: 10000,
  reference: 'TRX-2026-001'
};

const timestamp = new Date().toISOString(); // ej: 2026-02-25T15:30:45.123Z
const bodyStr = JSON.stringify(body);
const payload = bodyStr + timestamp;

// Calcular firma
const signature = crypto
  .createHmac('sha256', HMAC_SECRET)
  .update(payload)
  .digest('hex');

// Hacer request con headers HMAC
const response = await axios.post(API_URL, body, {
  headers: {
    'X-Signature': signature,
    'X-Timestamp': timestamp,
    'X-Client-ID': CLIENT_ID,
    'Content-Type': 'application/json'
  }
});

console.log('Response:', response.data);
```

### Python

```python
import requests
import json
import hmac
import hashlib
from datetime import datetime

# Configuración
API_URL = 'https://api.teva-360.com/classical/transfer'
HMAC_SECRET = 'your-shared-secret-key'
CLIENT_ID = 'mi-servicio-backend'

# Preparar request
body = {
    'cardNumber': '4111111111111111',
    'amount': 10000,
    'reference': 'TRX-2026-001'
}

timestamp = datetime.utcnow().isoformat() + 'Z'  # 2026-02-25T15:30:45.123Z
body_str = json.dumps(body)
payload = (body_str + timestamp).encode('utf-8')

# Calcular firma
signature = hmac.new(
    HMAC_SECRET.encode('utf-8'),
    payload,
    hashlib.sha256
).hexdigest()

# Hacer request con headers HMAC
headers = {
    'X-Signature': signature,
    'X-Timestamp': timestamp,
    'X-Client-ID': CLIENT_ID,
    'Content-Type': 'application/json'
}

response = requests.post(API_URL, json=body, headers=headers)
print('Response:', response.json())
```

### cURL

```bash
#!/bin/bash

API_URL="https://api.teva-360.com/classical/transfer"
HMAC_SECRET="your-shared-secret-key"
CLIENT_ID="mi-servicio-backend"

# Preparar request
BODY='{"cardNumber":"4111111111111111","amount":10000,"reference":"TRX-2026-001"}'
TIMESTAMP=$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')

# Calcular firma
PAYLOAD="$BODY$TIMESTAMP"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$HMAC_SECRET" -hex | cut -d' ' -f2)

# Hacer request
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "X-Signature: $SIGNATURE" \
  -H "X-Timestamp: $TIMESTAMP" \
  -H "X-Client-ID: $CLIENT_ID" \
  -d "$BODY"
```

### Java

```java
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public class HmacAuthClient {
    public static void main(String[] args) throws Exception {
        String API_URL = "https://api.teva-360.com/classical/transfer";
        String HMAC_SECRET = "your-shared-secret-key";
        String CLIENT_ID = "mi-servicio-backend";

        // Preparar request
        String body = "{\"cardNumber\":\"4111111111111111\",\"amount\":10000,\"reference\":\"TRX-2026-001\"}";
        String timestamp = Instant.now().toString().replace("Z", ".000Z");

        // Calcular firma
        String payload = body + timestamp;
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(HMAC_SECRET.getBytes(), "HmacSHA256"));
        String signature = bytesToHex(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));

        // Hacer request con headers
        System.out.println("X-Signature: " + signature);
        System.out.println("X-Timestamp: " + timestamp);
        System.out.println("X-Client-ID: " + CLIENT_ID);
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
```

## Puntos Importantes

### ✅ Qué HACER

- ✅ Usar **exactamente** el timestamp ISO 8601 en UTC/Z
- ✅ Concatenar `body + timestamp` **sin espacios ni caracteres especiales**
- ✅ Usar HMAC-SHA256 con la clave secreta compartida
- ✅ Convertir a hexadecimal para el header
- ✅ Incluir siempre los 3 headers en cada request
- ✅ Mantener la clave secreta protegida (variables de entorno)
- ✅ Regenerar el timestamp para cada request (no reutilizar)

### ❌ Qué NO hacer

- ❌ Hardcodear la clave secreta en código fuente
- ❌ Reutilizar el mismo timestamp en múltiples requests
- ❌ Usar timestamp mayor a 5 minutos en el pasado/futuro
- ❌ Modificar el body después de calcular la firma
- ❌ Usar diferente codificación (UTF-8 es obligatorio)
- ❌ Agregar espacios o saltos de línea al payload

## Validaciones del Servidor

El servidor validará:

1. **Presencia de headers**: Si falta alguno → `400 Bad Request`
2. **Formato de timestamp**: Debe ser ISO 8601 válido → `400 Bad Request`
3. **Edad del timestamp**: No mayor a 5 minutos → `401 Unauthorized`
4. **Validez de firma**: Debe coincidir con cálculo esperado → `401 Unauthorized`

## Códigos de Error

| Código | Mensaje | Causa |
| -------- | --------- | ------- |
| `400` | `Header X-Signature es requerido` | Falta el header de firma |
| `400` | `Header X-Timestamp es requerido` | Falta el timestamp |
| `400` | `Header X-Client-ID es requerido` | Falta el identificador de cliente |
| `400` | `X-Timestamp debe estar en formato ISO 8601 válido` | Formato de timestamp incorrecto |
| `401` | `Request expirado. Timestamp debe estar dentro de 300 segundos...` | Timestamp muy antiguo |
| `401` | `Firma HMAC inválida...` | La firma no coincide (clave incorrecta o payload modificado) |

## Auditoría

Todos los requests HMAC son registrados con:

- ✅ Client ID
- ✅ Endpoint llamado
- ✅ Timestamp
- ✅ IP origen
- ✅ Status (success/failure)

Consultar logs de auditoría para debugging de problemas.

## Troubleshooting

### "Firma HMAC inválida"

**Causas comunes:**

1. La clave secreta no coincide entre cliente y servidor
2. El timestamp fue modificado después de calcular la firma
3. El body fue modificado después de calcular la firma
4. Codificación diferente a UTF-8

**Solución:**

```javascript
// ❌ INCORRECTO - modificar body después de firma
const body = {...};
const signature = calculateHmac(body, timestamp);
body.extra = 'field'; // ❌ LA FIRMA YA NO SERÁ VÁLIDA

// ✅ CORRECTO - calcular firma al final
const body = {...};
const signature = calculateHmac(body, timestamp);
// No modificar body después de esto
```

### "Request expirado"

**Causa:** El timestamp es muy antiguo (mayor a 5 minutos)

**Solución:** Generar un nuevo timestamp justo antes de hacer el request

```javascript
// ❌ INCORRECTO - reutilizar timestamp
const timestamp = new Date().toISOString();
// ... hacer otras cosas ...
makeRequest(timestamp); // El timestamp puede ser antiguo

// ✅ CORRECTO - generar timestamp fresco
makeRequest(new Date().toISOString()); // Timestamp actual
```

## Seguridad

- HMAC-SHA256 es resistente a ataques de fuerza bruta
- El timestamp previene replay attacks
- Usar siempre HTTPS en producción
- Rotar la clave secreta periódicamente si se sospecha compromiso
- Monitorear logs de auditoría para intentos fallidos de autenticación

## Versión

- **Fecha**: 2026-02-25
- **Versión del API**: 1.0.0
- **Algoritmo**: HMAC-SHA256
- **Max Timestamp Age**: 300 segundos (5 minutos)

---

Para preguntas o problemas, contactar al equipo de desarrollo.
