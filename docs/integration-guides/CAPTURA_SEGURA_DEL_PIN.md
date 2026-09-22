# Documento de Arquitectura de Seguridad PCI-DSS

## Protección End-to-End del PIN en Activación de Tarjetas

### ATHPAY - Sistema de Pagos Móviles

### **Alcance: Dispositivo Móvil Únicamente**

---

## Índice

1. [Visión General del Proceso](#visión-general-del-proceso)
2. [Fase 1: Inicialización del Dispositivo](#fase-1-inicialización-del-dispositivo)
3. [Fase 2: Derivación Dinámica de Claves](#fase-2-derivación-dinámica-de-claves)
4. [Fase 3: Captura y Procesamiento del PIN](#fase-3-captura-y-procesamiento-del-pin)
5. [Fase 4: Construcción del PIN Block ISO-4](#fase-4-construcción-del-pin-block-iso-4)
6. [Fase 5: Cifrado y Preparación para Transmisión](#fase-5-cifrado-y-preparación-para-transmisión)
7. [Matriz de Cumplimiento PCI-DSS](#matriz-de-cumplimiento-pci-dss)
8. [Consideraciones de Seguridad Adicionales](#consideraciones-de-seguridad-adicionales)

---

## Visión General del Proceso

El presente documento describe exclusivamente los procesos de seguridad que ocurren **dentro del dispositivo móvil del usuario** para la protección del PIN durante la activación de tarjetas. El alcance se limita a las operaciones realizadas en la aplicación Flutter antes de que cualquier dato sensible abandone el dispositivo.

El objetivo es garantizar que el PIN ingresado por el usuario se capture, procese y cifre de manera segura dentro del entorno controlado del dispositivo, cumpliendo con los estándares PCI-DSS aplicables a dispositivos móviles que realizan entrada de PIN (software-based PIN entry).

---

## Fase 1: Inicialización del Dispositivo

### Propósito

Establecer la infraestructura criptográfica base dentro del dispositivo, generando y protegiendo el material de claves necesario para operaciones posteriores de cifrado.

### Proceso Detallado

**Paso 1.1: Verificación del Entorno de Ejecución**
Antes de cualquier operación criptográfica, la aplicación verifica la integridad del entorno:

- Detección de **root/jailbreak**: Verificación de existencia de binarios su (Android) o modificaciones al kernel (iOS)
- Detección de **debuggers**: Verificación de estado de ptrace (Android) o sysctl para debuggers (iOS)
- Detección de **emuladores**: Verificación de características de hardware propias de dispositivos físicos
- **Certificación de entorno**: Si se detecta compromiso, la aplicación se niega a iniciar operaciones criptográficas

**Paso 1.2: Generación de Par de Claves Asimétricas**
La aplicación genera un par de claves **ECDH con curva P-256** (secp256r1):

- La generación utiliza el generador de números aleatorios criptográficamente seguro del sistema operativo:
  - Android: `SecureRandom` con semilla del `/dev/urandom` del kernel
  - iOS: `SecRandomCopyBytes` con `kSecRandomDefault`
- La clave privada nunca existe en memoria de la aplicación como objeto accesible; se genera directamente dentro del Keystore seguro

**Paso 1.3: Almacenamiento en Keystore del Sistema Operativo**
La clave privada se almacena utilizando los mecanismos de seguridad hardware del dispositivo:

**Android (API 23+):**

- Uso de `AndroidKeyStore` con las siguientes restricciones:
  - `setUserAuthenticationRequired(true)`: Requiere autenticación del usuario (biometría o PIN del dispositivo) antes de usar la clave privada
  - `setInvalidatedByBiometricEnrollment(true)`: Invalida la clave si se registra nueva biometría (protección contra ataques de enrolamiento)
  - `setUserAuthenticationValidityDurationSeconds(0)`: Requiere autenticación en cada uso de la clave
  - `setRandomizedEncryptionRequired(true)`: Usa IV aleatorios para cifrado adicional del material de clave
  - Almacenamiento en **TEE (Trusted Execution Environment)** o **StrongBox** si el hardware lo soporta

**iOS:**

- Uso de `Secure Enclave` mediante `SecKeyGeneratePair` con atributos:
  - `kSecAttrTokenID: kSecAttrTokenIDSecureEnclave`: Fuerza almacenamiento en hardware seguro
  - `kSecAttrAccessible: kSecAttrAccessibleWhenUnlockedThisDeviceOnly`: Accesible solo cuando el dispositivo está desbloqueado; no transferible a otros dispositivos ni backups
  - `kSecPrivateKeyAttrs` con `kSecAttrAccessControl`: Control de acceso mediante biometría (`biometryCurrentSet`) o passcode

**Paso 1.4: Generación de Secreto Compartido Local**
En esta fase de inicialización, el dispositivo prepara el mecanismo para establecer secreto compartido:

- La clave pública generada está disponible para exportación cuando sea necesario
- La clave privada permanece inaccesible; las operaciones de firma o acuerdo de claves ocurren dentro del Keystore mediante operaciones de proxy
- Se establece un **contador de transacciones persistente** inicializado en cero, almacenado en almacenamiento cifrado de la aplicación (`EncryptedSharedPreferences` en Android, `Keychain` con `kSecAttrAccessible` en iOS)

**Paso 1.5: Derivación de Clave Maestra de Dispositivo (DMK)**
Utilizando el secreto compartido (establecido en momento posterior de registro) o material de entropía local:

- Aplicación de **HKDF-SHA256** con parámetros:
  - IKM: Material de entropía del dispositivo (concatenación de identificadores únicos de hardware cifrados)
  - Salt: Valor único generado en primera instalación y almacenado en Keystore
  - Info: Etiqueta de contexto "ATHPAY_DEVICE_MASTER_KEY_v1"
- Resultado: **Clave Maestra de Dispositivo (DMK)** de 256 bits, almacenada en Keystore, nunca en texto claro accesible por la aplicación

### Requisitos PCI-DSS Cumplidos en esta Fase

| Requisito | Descripción PCI-DSS | Implementación en Fase 1 |
|-----------|---------------------|--------------------------|
| **3.6.1** | Generación de claves criptográficas fuertes | Uso de curva P-256 con generación de entropía del sistema operativo certificada |
| **3.6.2** | Distribución segura de claves | Clave privada nunca exportada; generada y almacenada directamente en Keystore seguro |
| **3.6.3** | Almacenamiento seguro de claves | Android Keystore con TEE/StrongBox; iOS Secure Enclave con protección biométrica |
| **3.6.4** | Rotación criptográfica de claves | Cada dispositivo tiene par de claves único; compromiso de un dispositivo no afecta a otros |
| **8.2** | Identificación única de usuarios | Clave pública como identificador criptográfico único del dispositivo |
| **12.3.9** | Activación de funciones de seguridad | Invalidación ante cambios de biometría; requerimiento de autenticación en cada uso |

---

## Fase 2: Derivación Dinámica de Claves

### Propósito

Generar una clave simétrica única y no predecible para cada transacción de activación de PIN, garantizando que la compromisión de una clave de transacción no afecte a operaciones pasadas ni futuras.

### Proceso Detallado

**Paso 2.1: Recuperación de Contexto de Transacción**
Antes de cada operación de activación de PIN, el dispositivo prepara los parámetros de contexto:

- **Contador de transacciones**: Recuperado de almacenamiento cifrado persistente; valor monotónico incrementado atómicamente antes de cada derivación
- **Timestamp criptográfico**: Obtención de tiempo seguro del sistema (preferentemente de fuentes múltiples: system clock validado contra NTP si disponible, o reloj monotónico del sistema)
- **Identificador de dispositivo**: Key Handle o identificador único derivado de características del dispositivo (no PII)

**Paso 2.2: Acceso a Clave Privada mediante Autenticación del Usuario**
Para operaciones de derivación de claves para PIN, se requiere autenticación explícita del usuario:

- **Android**: Invocación de `BiometricPrompt` o `KeyguardManager` para:
  - Biometría fuerte (huella dactilar, reconocimiento facial 3D, iris)
  - O PIN/contraseña del dispositivo como fallback
  - La autenticación autoriza el uso de la clave privada almacenada en Keystore por ventana de tiempo limitada (tipicamente 30 segundos)
- **iOS**: Uso de `LAContext` con `evaluatePolicy` para:
  - `LAPolicy.deviceOwnerAuthenticationWithBiometrics` o `deviceOwnerAuthentication`
  - Acceso a clave en Secure Enclave mediante `SecKeyCreateSignature` o operaciones de acuerdo de claves

**Paso 2.3: Cálculo de Secreto Compartido (Preparación)**
Si el acuerdo de claves con el emisor ya fue establecido:

- El dispositivo utiliza su clave privada (protegida por Keystore) para operaciones de acuerdo de claves ECDH
- El secreto compartido se calcula dentro del entorno seguro del Keystore cuando el hardware lo soporta
- Si no hay acuerdo previo, se utiliza la **DMK** como base de derivación con parámetros adicionales de contexto

**Paso 2.4: Aplicación de Función de Derivación de Claves (HKDF)**
El dispositivo aplica **HKDF-SHA256** (RFC 5869) en dos etapas:

*Extracción (Extract):*

- Input: Secreto compartido (o DMK) concatenado con salt único por dispositivo
- Output: Pseudorandom Key (PRK) de 256 bits

*Expansión (Expand):*

- Input: PRK + contexto específico de transacción
- Info string estructurado: `"ATHPAY_PIN_TXN|{key_handle}|{counter}|{timestamp}|{purpose}"`
- Output: Material de clave expandido de 64 bytes

**Paso 2.5: Derivación Jerárquica de Claves de Propósito Específico**
Del material expandido se derivan dos claves independientes:

- **Clave de Cifrado (CEK - Content Encryption Key)**: Primeros 32 bytes, para AES-256-GCM
- **Clave de Autenticación (AK - Authentication Key)**: Siguientes 32 bytes, para HMAC-SHA256 de metadatos (si es necesario)

**Paso 2.6: Propiedades de Seguridad de la Clave Derivada**
La clave de transacción resultante tiene las siguientes características críticas:

- **Unicidad estadística**: Probabilidad de colisión negligible debido a contador monotónico y timestamp
- **No reversibilidad**: El conocimiento de claves de transacción pasadas o futuras no permite calcular la clave actual (propiedad de seguridad de HKDF)
- **Vida limitada**: La clave existe únicamente en memoria volátil del dispositivo durante el tiempo de procesamiento de la transacción (milisegundos)
- **No persistencia**: La clave nunca se escribe a almacenamiento; destrucción explícita post-uso mediante sobrescritura de memoria

**Paso 2.7: Gestión de Contador y Resiliencia**

- El contador se incrementa atómicamente antes de la derivación
- En caso de fallo de transacción (timeout de red, error del servidor), el contador no retrocede; la siguiente transacción usa el siguiente valor (no hay reutilización)
- Se mantiene respaldo cifrado del contador en `EncryptedSharedPreferences` (Android) o `NSUserDefaults` con cifrado (iOS) para recuperación ante terminación abrupta de la aplicación

### Requisitos PCI-DSS Cumplidos en esta Fase

| Requisito | Descripción PCI-DSS | Implementación en Fase 2 |
|-----------|---------------------|--------------------------|
| **3.6.1** | Gestión de claves mediante procedimientos seguros | Derivación determinística elimina necesidad de almacenar claves de transacción |
| **3.6.3** | Protección de claves de cifrado | Clave de transacción existe únicamente en memoria volátil durante milisegundos |
| **3.6.4** | Rotación de claves de cifrado | Cada transacción usa clave única (rotación por operación) |
| **6.5.10** | Protección contra ataques de criptografía insegura | Uso de HKDF-SHA256 estándar IETF; no KDF ad-hoc |
| **8.2** | Autenticación de usuarios | Biometría/PIN del dispositivo como requisito para acceso a clave privada |
| **10.2.4** | Registro de actividad de usuarios | Contador de transacciones registrado para auditoría local |
| **10.4** | Sincronización de relojes | Timestamp criptográfico requiere sincronización NTP segura o reloj monotónico |

---

## Fase 3: Captura y Procesamiento del PIN

### Propósito

Capturar el PIN del usuario de manera segura, minimizando la exposición en memoria y previniendo ataques de interceptación en el dispositivo.

### Proceso Detallado

**Paso 3.1: Preparación de Interfaz de Captura Segura**
La aplicación invoca exclusivamente mecanismos del sistema operativo para entrada de PIN:

- **Android**:
  - Uso de `EditText` con `inputType = InputType.TYPE_NUMBER_VARIATION_PASSWORD` o `TYPE_CLASS_NUMBER | TYPE_NUMBER_VARIATION_PASSWORD`
  - Deshabilitación de sugerencias de teclado (`textNoSuggestions`)
  - Forzado de teclado del sistema mediante `inputMethod` por defecto; bloqueo de teclados de terceros
- **iOS**:
  - Uso de `UITextField` con `isSecureTextEntry = true`
  - `textContentType = .password` para deshabilitar autocorrección y sugerencias
  - `keyboardType = .numberPad` para teclado numérico

**Paso 3.2: Protección de la Interfaz de Usuario**
Durante la captura del PIN, la aplicación activa protecciones de pantalla:

- **Android**:
  - `WindowManager.LayoutParams.FLAG_SECURE` en la Activity de captura
  - Previene capturas de pantalla (screenshots) y grabaciones de pantalla
  - La vista aparece como negro en recientes/multitarea
- **iOS**:
  - `UIApplication.shared.isIdleTimerDisabled = false` para permitir bloqueo de pantalla
  - `UIScreen.main.isCaptured` monitoreado; si se detecta captura de pantalla (Screen Recording), se oculta el campo de PIN
  - `UITextField` con `passwordRules` para prevenir sugerencias de contraseñas de iCloud Keychain

**Paso 3.3: Deshabilitación de Servicios de Accesibilidad**
Para prevenir que aplicaciones de accesibilidad maliciosas lean el PIN:

- Verificación de servicios de accesibilidad activos antes de mostrar el campo de PIN
- Si se detectan servicios no estándar o sospechosos, se muestra advertencia o se bloquea la entrada
- En Android, uso de `IMPORTANT_FOR_ACCESSIBILITY_NO` en el campo de PIN para evitar lectura por TalkBack (con consideración de accesibilidad legítima)

**Paso 3.4: Manejo Seguro en Memoria**
El PIN ingresado se maneja utilizando estructuras de datos seguras:

- **Nunca uso de `String`** (inmutable en Java/Kotlin/Swift); se utiliza:
  - Android: `CharArray` o `ByteArray` con acceso directo a bytes
  - iOS: `UnsafeMutablePointer<UInt8>` o `Data` con control de memoria manual
- Almacenamiento en **búfer de memoria no swapeable** cuando el sistema operativo lo permite
- Acceso a memoria con técnicas de **constant-time** para prevenir ataques de canal lateral de timing

**Paso 3.5: Validación Local del PIN**
Antes de procesamiento criptográfico, se valida el formato:

- Longitud: 4 a 12 dígitos (configurable según política del emisor)
- Composición: Solo caracteres numéricos (0-9)
- Entropía mínima: Rechazo de patrones predecibles mediante validación local:
  - Secuencias ascendentes/descendentes (1234, 4321)
  - Dígitos repetidos (1111, 2222)
  - Patrones de teclado (2580, 1397 basado en posición en teclado numérico)
- Validación contra datos conocidos del usuario (si están disponibles localmente de forma segura): no fecha de nacimiento, no últimos 4 dígitos de teléfono

**Paso 3.6: Confirmación de PIN (Flujo Opcional)**
Si el flujo requiere confirmación:

- Segunda entrada de PIN en búfer separado
- Comparación byte-a-byte de ambos búferes
- Si coinciden: se procede con el primer búfer; el segundo se destruye inmediatamente
- Si no coinciden: ambos búferes se sobrescriben con bytes aleatorios y se solicita reingreso

**Paso 3.7: Borrado Seguro Post-Uso**
Inmediatamente después de la construcción del PIN block (Fase 4):

- Sobrescritura explícita del búfer de PIN con bytes aleatorios (no solo `null` o liberación de referencia)
- Uso de `memset_s` (C11) o equivalente seguro que no sea optimizado por el compilador
- Solicitud explícita de **garbage collection** no garantiza borrado; se requiere sobrescritura manual
- El búfer se mantiene en scope mínimo posible (variables locales en función de procesamiento)

### Requisitos PCI-DSS Cumplidos en esta Fase

| Requisito | Descripción PCI-DSS | Implementación en Fase 3 |
|-----------|---------------------|--------------------------|
| **3.4** | Renderizar PAN y datos sensibles ilegibles | PIN enmascarado con asteriscos inmediatamente; nunca visible en texto claro |
| **6.5.1** | Inyección de código | Uso de teclado del sistema; validación de integridad de entrada |
| **6.5.2** | Buffer overflow | Manejo de memoria segura con búferes de tamaño fijo y validación de límites |
| **6.5.3** | Exposición de datos sensibles | Manejo en memoria segura con borrado explícito; no uso de Strings inmutables |
| **6.5.5** | Configuración de seguridad incorrecta | FLAG_SECURE y protecciones de pantalla activadas por defecto |
| **8.2** | Autenticación de usuarios | Biometría del dispositivo como factor de autenticación previo al procesamiento |
| **8.2.3** | Autenticación multifactor | Factor de posesión (dispositivo registrado) + factor de inherencia (biometría) |
| **12.3.9** | Activación de funciones de seguridad | Prevención de captura de pantalla; ocultamiento en recientes |

---

## Fase 4: Construcción del PIN Block ISO-4

### Propósito

Estructurar el PIN en un formato estandarizado internacional que incluya diversificación criptográfica con el número de tarjeta (PAN), proporcionando integridad y autenticación del origen.

### Proceso Detallado

**Paso 4.1: Selección de Formato ISO-4**
Se utiliza el **Formato 4 de ISO 9564-1:2017** (ISO-4) por sus ventajas de seguridad sobre formatos legacy:

- Reemplazo de ISO-0, ISO-1, ISO-2, ISO-3 (obsoletos y con vulnerabilidades conocidas)
- Uso de relleno aleatorio en lugar de valores fijos (0xF), previniendo ataques de análisis de patrón
- Diversificación completa con 12 dígitos del PAN en lugar de 4 dígitos
- Campo de control explícito que codifica longitud del PIN y formato

**Paso 4.2: Construcción del Campo de Control (2 bytes)**

- **Byte 0 (Control Byte)**:
  - Nibble alto (bits 7-4): `0x4` (identificador de formato 4)
  - Nibble bajo (bits 3-0): Longitud del PIN en hexadecimal (0x4 para 4 dígitos, hasta 0xC para 12 dígitos)
- **Byte 1 (Reservado)**: Valor fijo `0x00`

Ejemplo para PIN de 6 dígitos: Byte 0 = `0x46` (formato 4, longitud 6), Byte 1 = `0x00`

**Paso 4.3: Preparación del Campo de PIN (14 bytes / 28 nibbles)**

- Se toman los dígitos del PIN (4-12 caracteres)
- Cada dígito se codifica en un nibble de 4 bits con valor 0x0-0x9
- El campo tiene capacidad para 14 dígitos (14 nibbles = 7 bytes)
- Los nibbles restantes (14 menos la longitud del PIN) se completan con **dígitos aleatorios criptográficamente seguros** (0-9), no con valores fijos como en ISO-0
- Generación de aleatoriedad: `SecureRandom` (Android) o `SecRandomCopyBytes` (iOS)

Ejemplo para PIN "123456" (6 dígitos):

- Dígitos PIN: 1, 2, 3, 4, 5, 6 → nibbles: 0x1, 0x2, 0x3, 0x4, 0x5, 0x6
- Relleno aleatorio (8 dígitos): 7, 8, 9, 0, 1, 2, 3, 4 → nibbles: 0x7, 0x8, 0x9, 0x0, 0x1, 0x2, 0x3, 0x4
- Campo de PIN completo: 14 nibbles [0x1, 0x2, 0x3, 0x4, 0x5, 0x6, 0x7, 0x8, 0x9, 0x0, 0x1, 0x2, 0x3, 0x4]

**Paso 4.4: Diversificación con PAN (Protección contra Uso Fraudulento)**

- Se extraen 12 dígitos del PAN según especificación ISO-4:
  - Si PAN tiene 16 dígitos: se toman los dígitos 2 al 13 (excluyendo el primero y los últimos dos, incluyendo el dígito de verificación en posición 16)
  - Si PAN tiene 19 dígitos: ajuste proporcional manteniendo 12 dígitos centrales
- Cada dígito del PAN se codifica en nibble 0x0-0x9
- Se realiza **operación XOR nibble-a-nibble** entre los primeros 12 nibbles del campo de PIN y los 12 nibbles del PAN
- Los últimos 2 nibbles del campo de PIN (relleno aleatorio) permanecen sin diversificar

Ejemplo de diversificación:

- PIN field (primeros 12 nibbles): [0x1, 0x2, 0x3, 0x4, 0x5, 0x6, 0x7, 0x8, 0x9, 0x0, 0x1, 0x2]
- PAN digits (12 nibbles): [0x5, 0x4, 0x3, 0x2, 0x1, 0x0, 0x9, 0x8, 0x7, 0x6, 0x5, 0x4]
- Resultado XOR: [0x4, 0x6, 0x0, 0x6, 0x4, 0x6, 0xE, 0x0, 0xE, 0x6, 0x4, 0x6]

**Paso 4.5: Ensamblaje del PIN Block Plano (16 bytes)**
El PIN block plano resultante tiene estructura fija de 16 bytes (128 bits):

| Bytes | Contenido | Descripción |
|-------|-----------|-------------|
| 0 | Control Byte | Formato (0x4) + Longitud PIN |
| 1 | Reservado | 0x00 |
| 2-15 | Campo de PIN diversificado | 14 bytes: 12 bytes diversificados con PAN + 2 bytes de relleno aleatorio |

**Paso 4.6: Propiedades de Seguridad del ISO-4**
El PIN block construido tiene las siguientes propiedades criptográficas:

- **Confusión**: El mismo PIN produce bloques completamente diferentes para diferentes PANs (diversificación)
- **Difusión**: Un cambio en un dígito del PAN afecta a todo el bloque (efecto avalancha en XOR)
- **Aleatoriedad**: El relleno aleatorio asegura que bloques con PINs idénticos pero generados en momentos diferentes sean estadísticamente indistinguibles
- **Autenticación implícita**: Solo el poseedor del PAN correcto puede generar o validar el bloque (vinculación tarjeta-PIN)

**Paso 4.7: Destrucción de Material Intermedio**
Inmediatamente después del ensamblaje:

- El búfer que contenía los dígitos del PIN en claro se sobrescribe con aleatoriedad
- El búfer que contenía los dígitos del PAN (si fue desencriptado localmente) se sobrescribe
- Solo permanece el PIN block plano de 16 bytes en memoria para la fase de cifrado

### Requisitos PCI-DSS Cumplidos en esta Fase

| Requisito | Descripción PCI-DSS | Implementación en Fase 4 |
|-----------|---------------------|--------------------------|
| **3.4** | Cifrado de datos sensibles | Diversificación con PAN asegura que el PIN block solo sea válido para esa tarjeta específica |
| **3.5** | Protección de claves criptográficas | PIN block construido con clave de sesión efímera, no con claves estáticas |
| **6.5.10** | Uso de criptografía insegura | Implementación de estándar ISO 9564-1:2017 reconocido internacionalmente |
| **6.5.3** | Exposición de datos sensibles | Destrucción de búferes intermedios post-construcción |

---

## Fase 5: Cifrado y Preparación para Transmisión

### Propósito

Proteger el PIN block mediante cifrado autenticado antes de que abandone el dispositivo, garantizando confidencialidad, integridad y autenticación del origen.

### Proceso Detallado

**Paso 5.1: Preparación de Parámetros de Cifrado**

- **Algoritmo**: AES-256 en modo **GCM (Galois/Counter Mode)**
  - Modo AEAD (Authenticated Encryption with Associated Data): proporciona confidencialidad e integridad simultáneamente
  - Ventajas sobre CBC + HMAC: mejor rendimiento, no requiere padding, autenticación integrada
  - Tamaño de bloque: 128 bits; tamaño de clave: 256 bits
- **Clave**: 256 bits (32 bytes) obtenidos de la Fase 2 (CEK - Content Encryption Key)
- **Nonce (IV)**: 96 bits (12 bytes) generados aleatoriamente usando el generador criptográfico seguro del sistema
  - Unicidad crítica: El mismo par (clave, nonce) nunca debe reusarse en GCM
  - Generación: `SecureRandom` con `nextBytes(12)` o `SecRandomCopyBytes(kSecRandomDefault, 12, buffer)`

**Paso 5.2: Datos Autenticados Adicionales (AAD)**
Se preparan datos asociados que se autentican pero no se cifran (integridad sin confidencialidad):

- Versión del protocolo: "E2E1" (4 bytes ASCII)
- Key Handle del dispositivo (identificador opaco)
- Contador de transacción (4 bytes, big-endian)
- Timestamp ISO 8601 completo
- Identificador de la operación: "PIN_ACTIVATION"

El AAD se incluye en el cálculo del tag de autenticación de GCM, vinculando el ciphertext a su contexto específico y previendo ataques de reenvío en diferentes contextos.

**Paso 5.3: Operación de Cifrado AES-256-GCM**
El cifrado se ejecuta con los siguientes parámetros:

- **Plaintext**: PIN block ISO-4 de 16 bytes
- **Key**: CEK de 32 bytes de la Fase 2
- **Nonce**: 12 bytes aleatorios únicos
- **AAD**: Datos asociados estructurados

Salida de la operación de cifrado:

- **Ciphertext**: 16 bytes (mismo tamaño que plaintext por propiedad de cifrado de bloque en modo CTR subyacente a GCM)
- **Tag de autenticación**: 16 bytes (128 bits de seguridad de integridad)

**Paso 5.4: Construcción del Payload E2E (End-to-End)**
El mensaje final estructurado contiene:

*Encabezado de Protocolo (no cifrado, metadatos):*

- `version`: "E2E1" (4 caracteres ASCII)
- `key_handle`: Identificador del dispositivo (string alfanumérico)
- `counter`: Número de secuencia de transacción (entero, 4 bytes en representación binaria)
- `timestamp`: ISO 8601 con milisegundos (string)

*Cuerpo Cifrado (binario, base64-encoded para transporte JSON):*

- `nonce`: 12 bytes (base64)
- `ciphertext`: 16 bytes (base64)
- `auth_tag`: 16 bytes (base64, parte de la salida GCM)

*Metadata de Validación (no sensible):*

- `operation_type`: "PIN_ACTIVATION"
- `key_derivation_info`: Parámetros públicos usados en HKDF (salt, info string sin partes secretas)

**Paso 5.5: Serialización para Transmisión**
El payload se serializa en formato JSON para transmisión HTTP:

```json
{
  "protocol": {
    "version": "E2E1",
    "key_handle": "ah4K9mNpQvWx7Zr3",
    "counter": 42,
    "timestamp": "2025-01-15T14:30:25.123Z"
  },
  "encrypted_payload": {
    "nonce": "base64_encoded_12_bytes",
    "ciphertext": "base64_encoded_16_bytes",
    "tag": "base64_encoded_16_bytes"
  },
  "derivation_context": {
    "salt": "base64_encoded_salt",
    "info_prefix": "ATHPAY_PIN_TXN"
  },
  "operation": "PIN_ACTIVATION"
}
```

**Paso 5.6: Protección durante Transmisión Inicial**
Antes de salir del dispositivo, el mensaje:

- Se transmite únicamente sobre **TLS 1.3** con configuración segura
- Implementa **certificate pinning**: la aplicación verifica que el certificado del servidor coincida con un hash pre-instalado o obtenido de forma segura en el registro inicial
- Incluye headers de seguridad:
  - `X-Request-ID`: UUID v4 generado localmente para trazabilidad
  - `X-Client-Timestamp`: Timestamp del dispositivo para detección de replay de tiempo
  - `X-Key-Handle`: Repetido en header para logging sin parseo de body

**Paso 5.7: Destrucción Post-Transmisión**
Inmediatamente después de la transmisión (independientemente de éxito o fallo de red):

- El búfer que contenía el PIN block plano se sobrescribe
- La clave de sesión (CEK) se elimina de memoria (referencia nulaada)
- El nonce y tag se mantienen solo si es necesario para retransmisión; de lo contrario, destruidos
- Se solicita garbage collection (como hint, no garantía) mediante `System.gc()` (Android) o `autoreleasepool` (iOS)

### Requisitos PCI-DSS Cumplidos en esta Fase

| Requisito | Descripción PCI-DSS | Implementación en Fase 5 |
|-----------|---------------------|--------------------------|
| **3.4** | Cifrado de datos sensibles en tránsito | AES-256-GCM proporciona cifrado fuerte; TLS 1.3 adicional para capa de transporte |
| **3.5** | Gestión de claves de cifrado | Clave de sesión única por transacción; no reutilización de nonces |
| **4.1** | Uso de cifrado fuerte en redes públicas | TLS 1.3 con cipher suites seguras; certificate pinning |
| **4.2** | Nunca enviar claves de cifrado en texto claro | Claves derivadas localmente, nunca transmitidas |
| **6.5.4** | Referencias inseguras a objetos directos | Uso de Key Handle opaco (no revela información del dispositivo) |
| **6.5.10** | Criptografía insegura | AES-256-GCM estándar NIST; no algoritmos propietarios |
| **10.5** | Protección de datos de seguimiento | X-Request-ID para trazabilidad sin exponer datos del PIN |

---

## Matriz de Cumplimiento PCI-DSS

### Requisitos del Dominio 3: Protección de Datos del Titular de la Tarjeta

| ID | Requisito | Cumplimiento en Arquitectura | Fase(s) |
|----|-----------|------------------------------|---------|
| **3.1** | Mantener política de retención de datos | PIN no retenido post-transmisión; solo metadata de transacción | 5 |
| **3.2** | No almacenar datos sensibles de autenticación después de autorización | PIN existe solo transitoriamente en memoria del dispositivo; destruido post-cifrado | 3, 4, 5 |
| **3.3** | Enmascarar PAN al mostrar | PAN tokenizado o enmascarado en todas las fases; solo dígitos necesarios para diversificación ISO-4 | 4 |
| **3.4** | Renderizar PAN ilegible donde sea almacenado | PAN diversificado en PIN block; no almacenado en texto claro | 4, 5 |
| **3.5** | Proteger claves de cifrado | Claves en Keystore móvil; nunca en texto claro accesible por aplicación | 1, 2, 5 |
| **3.5.1** | Almacenamiento seguro de claves de cifrado | Android Keystore con TEE/StrongBox; iOS Secure Enclave | 1 |
| **3.5.2** | Almacenamiento seguro de claves de encriptación para transmisión | Claves de sesión derivadas, no almacenadas | 2 |
| **3.6** | Procedimientos completos de gestión de claves | Documentación de generación, distribución, almacenamiento, rotación en dispositivo | Todas |
| **3.6.1** | Generación de claves fuertes | ECDH P-256 + HKDF-SHA256; entropía del sistema operativo | 1, 2 |
| **3.6.2** | Distribución segura de claves | Intercambio de claves públicas únicamente; secreto compartido calculado localmente | 1 |
| **3.6.3** | Almacenamiento seguro de claves | Keystore hardware del dispositivo | 1 |
| **3.6.4** | Rotación criptográfica de claves | Rotación por transacción (claves de sesión); rotación periódica de claves de dispositivo | 2 |
| **3.6.5** | Retiro o sustitución de claves | Procedimientos de revocación de dispositivos en nivel de aplicación | 1 |
| **3.6.6** | División de conocimiento y dual control | Separación de funciones entre componentes del dispositivo (Keystore vs aplicación) | 1, 2 |
| **3.6.7** | Prevención de acceso no autorizado a claves | Acceso a clave privada requiere autenticación biométrica/PIN del dispositivo | 1, 2 |
| **3.7** | Gestión de claves usadas por proveedores de servicios | No aplica a nivel de dispositivo; gestión de Keystore del SO | 1 |

### Requisitos del Dominio 4: Redes Abiertas y Públicas

| ID | Requisito | Cumplimiento en Arquitectura | Fase(s) |
|----|-----------|------------------------------|---------|
| **4.1** | Uso de cifrado fuerte en redes públicas | TLS 1.3 + AES-256-GCM E2E; defense in depth | 5 |
| **4.1.1** | Cifrado fuerte para transmisión | Cipher suites ECDHE con PFS; no RSA key exchange estático | 5 |
| **4.2** | Nunca enviar claves de cifrado en texto claro | Claves derivadas localmente; nunca en tránsito | 1, 2, 5 |

### Requisitos del Dominio 6: Desarrollo y Mantenimiento de Sistemas Seguros

| ID | Requisito | Cumplimiento en Arquitectura | Fase(s) |
|----|-----------|------------------------------|---------|
| **6.5.1** | Inyección de código | Uso de teclado del sistema; validación de entradas | 3 |
| **6.5.2** | Buffer overflow | Manejo de memoria segura en lenguajes seguros (Kotlin/Swift) | 3, 4 |
| **6.5.3** | Exposición de datos sensibles | PIN en memoria solo durante procesamiento; borrado explícito | 3, 4, 5 |
| **6.5.4** | Referencias inseguras a objetos directos | Key Handle opaco; no revela estructura interna | 5 |
| **6.5.5** | Configuración de seguridad incorrecta | Configuración por defecto segura; certificate pinning | 5 |
| **6.5.10** | Criptografía insegura | Uso de estándares ISO/IETF/NIST; no algoritmos propietarios | 2, 4, 5 |
| **6.5.10.1** | SSL/TLS inseguro | TLS 1.3 únicamente; rechazo de versiones anteriores | 5 |

### Requisitos del Dominio 8: Identificación y Autenticación

| ID | Requisito | Cumplimiento en Arquitectura | Fase(s) |
|----|-----------|------------------------------|---------|
| **8.1** | Definición de políticas de identificación | Key Handle como identificador único de dispositivo | 1, 5 |
| **8.2** | Autenticación de usuarios | Biometría del dispositivo + PIN de activación como autenticación multifactor | 2, 3 |
| **8.2.3** | Autenticación multifactor | Factor de posesión (dispositivo registrado) + factor de inherencia (biometría) o conocimiento (PIN del dispositivo) | 2, 3 |

### Requisitos del Dominio 10: Seguimiento y Monitoreo

| ID | Requisito | Cumplimiento en Arquitectura | Fase(s) |
|----|-----------|------------------------------|---------|
| **10.1** | Implementación de trazabilidad de auditoría | X-Request-ID; correlación en dispositivo | 5 |
| **10.2** | Implementación de auditoría automática | Logs de metadata locales sin datos sensibles | 2, 5 |
| **10.2.4** | Registro de actividad de usuarios | Registro de contadores y timestamps en dispositivo | 2 |
| **10.4** | Sincronización de relojes | NTP seguro con autenticación; validación de timestamps | 2, 5 |
| **10.5** | Protección de datos de seguimiento | Almacenamiento cifrado de logs locales | 2, 5 |

### Requisitos del Dominio 12: Políticas de Seguridad de la Información

| ID | Requisito | Cumplimiento en Arquitectura | Fase(s) |
|----|-----------|------------------------------|---------|
| **12.3** | Políticas de uso aceptable | Prohibición de captura de pantalla; deshabilitación de accesibilidad durante PIN entry | 3 |
| **12.3.8** | Autenticación de dispositivos móviles | Key Handle + contador como mecanismo de autenticación implícita | 2, 5 |
| **12.3.9** | Activación de funciones de seguridad | `FLAG_SECURE` en Android; `preventScreenCapture` en iOS | 3 |
| **12.4** | Políticas de seguridad de la información | Documentación de arquitectura E2E; procedimientos de respuesta a incidentes en dispositivo | Todas |

---

## Consideraciones de Seguridad Adicionales

### Protección contra Ataques Específicos al Dispositivo

| Ataque | Mitigación en Arquitectura |
|--------|---------------------------|
| **Root/Jailbreak** | Verificación de integridad del entorno en Fase 1.1; negativa de operar en dispositivos comprometidos |
| **Extracción de Claves de Dispositivo** | Almacenamiento en Keystore hardware (TEE/Secure Enclave); no accesible incluso con root en dispositivos modernos |
| **Análisis de Memoria (Memory Dump)** | Claves de sesión en memoria volátil por tiempo mínimo; destrucción explícita post-uso |
| **Ataque de Diccionario de PINs** | Rate limiting local; validación de fortaleza de PIN en Fase 3.5; bloqueo tras intentos fallidos |
| **Side-Channel (Timing/Power)** | Implementaciones constant-time en bibliotecas criptográficas del sistema operativo |
| **Keylogger de Software** | Uso obligatorio de teclado del sistema; deshabilitación de teclados de terceros |
| **Keylogger de Hardware** | Fuera de alcance de control de software; mitigado por entrada de PIN en aplicación bancaria segura |
| **Análisis de Tráfico de Red** | Tamaño fijo de payloads cifrados; padding aleatorio en mensajes |

### Respaldo y Recuperación en Dispositivo

- **Pérdida de datos de aplicación**: El contador y estado se respaldan en almacenamiento cifrado del sistema; requieren autenticación para restaurar
- **Desinstalación/Reinstalación**: Pérdida de claves del Keystore; requiere re-registro completo del dispositivo
- **Cambio de dispositivo**: Las claves no son transferibles (especialmente en iOS con `ThisDeviceOnly`); nuevo registro requerido
- **Sincronización de contador**: Protocolo de resincronización con backend si se detecta desincronización mayor a ventana permitida

### Cumplimiento de Estándares Adicionales

| Estándar | Cumplimiento en Dispositivo |
|----------|----------------------------|
| **PCI PTS POI** | Cumplimiento de requisitos de entrada de PIN en dispositivos móviles (software-based PIN entry) |
| **ISO 9564-1:2017** | Uso de formato 4 (ISO-4) para PIN blocks |
| **NIST SP 800-38D** | Uso de AES-GCM para cifrado autenticado |
| **RFC 5869** | Implementación de HKDF para derivación de claves |
| **OWASP Mobile Security Testing Guide (MSTG)** | Alineación con controles de seguridad móvil |

### Límites del Alcance del Dispositivo

Este documento cubre exclusivamente procesos dentro del dispositivo móvil. Aspectos fuera de este alcance incluyen:

| Aspecto | Responsable | Nota |
|---------|-------------|------|
| Validación de PIN en emisor | Backend/Emisor | El dispositivo no valida el PIN contra el sistema de tarjetas |
| Almacenamiento de PIN | Emisor | El dispositivo nunca almacena PIN del usuario |
| Revocación de claves de dispositivo | Emisor | El dispositivo recibe notificación de revocación pero no la genera |
| Detección de fraude basada en comportamiento | Backend/Emisor | El dispositivo provee metadata pero no analiza patrones |
| Cumplimiento PCI-DSS de infraestructura backend | ATHPAY/Emisor | Fuera del alcance de este documento |

---

## Conclusión

Este documento detalla la arquitectura de seguridad implementada **exclusivamente en el dispositivo móvil** para la protección del PIN durante la activación de tarjetas en el sistema ATHPAY. El diseño garantiza que:

1. **El PIN nunca está en texto claro fuera del entorno seguro del dispositivo** (Keystore/Secure Enclave)
2. **Cada transacción usa claves criptográficamente únicas**, proporcionando forward secrecy
3. **El formato ISO-4 y el cifrado AES-256-GCM** proporcionan protección estándar de la industria
4. **El cumplimiento PCI-DSS se logra mediante controles técnicos robustos** en el dispositivo, independientemente de la infraestructura backend

La implementación requiere coordinación entre equipos de:

- **Desarrollo móvil** (Flutter/Android/iOS) para integración con Keystore
- **Seguridad de aplicaciones** para validación de controles y pruebas de penetración
- **Criptografía** para verificación correcta de algoritmos y parámetros
- **Compliance** para auditoría de controles en dispositivo

---

**Documento elaborado conforme a:**

- PCI DSS v4.0 (Requisitos de Seguridad de Datos para la Industria de Tarjetas de Pago)
- PCI PTS POI v6.0 (Requisitos de Seguridad de Dispositivos de Punto de Interacción)
- ISO 9564-1:2017 (Gestión de Seguridad del PIN)
- NIST SP 800-57 (Recomendaciones para Gestión de Claves Criptográficas)
- OWASP Mobile Security Testing Guide (MSTG)

**Alcance:** Dispositivo móvil únicamente (Frontend/Cliente)
**Fecha de elaboración:** 2025
**Versión:** 1.0
