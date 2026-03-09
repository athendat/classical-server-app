# SGT Pinblock Specification

## Overview

The SGT (Switch / Módulo Emisor) uses a **proprietary pinblock format** different from the ISO-4 standard. This document describes the format, encoding algorithm, and AES-128-CBC encryption used to transmit PINs to the SGT.

## Pinblock Format

### Structure (32 hex characters)

```
┌────┬──────┬─────────────────────┬────┬──────────────┐
│ ID │ LEN  │   PIN (ASCII-hex)   │ FF │   Padding    │
│ 00 │ 2dig │   2 hex per digit   │    │   '0' fill   │
└────┴──────┴─────────────────────┴────┴──────────────┘
          Total: 32 hex characters (16 bytes)
```

| Field       | Size       | Description                                      |
|-------------|------------|--------------------------------------------------|
| ID          | 2 chars    | Fixed identifier `"00"`                          |
| LEN         | 2 chars    | PIN length as 2-digit decimal (e.g., `"04"`)     |
| PIN         | 2×N chars  | Each PIN digit encoded as its ASCII hex value     |
| Terminator  | 2 chars    | Fixed `"FF"`                                     |
| Padding     | Variable   | Right-padded with `'0'` to reach 32 characters   |

### ASCII-Hex Encoding Table

| Digit | ASCII Code | Hex  |
|-------|-----------|------|
| 0     | 48        | 30   |
| 1     | 49        | 31   |
| 2     | 50        | 32   |
| 3     | 51        | 33   |
| 4     | 52        | 34   |
| 5     | 53        | 35   |
| 6     | 54        | 36   |
| 7     | 55        | 37   |
| 8     | 56        | 38   |
| 9     | 57        | 39   |

### Examples

**PIN "1234" (4 digits):**
```
"00" + "04" + "31323334" + "FF" + "000000000000000000"
 ID    LEN    ASCII-hex    TERM         Padding
Result: "000431323334FF000000000000000000" (32 chars)
```

**PIN "123456" (6 digits):**
```
"00" + "06" + "313233343536" + "FF" + "00000000000000"
 ID    LEN      ASCII-hex      TERM       Padding
Result: "0006313233343536FF00000000000000" (32 chars)
```

**PIN "0000" (all zeros):**
```
"00" + "04" + "30303030" + "FF" + "000000000000000000"
Result: "000430303030FF000000000000000000" (32 chars)
```

## Encryption: AES-128-CBC

The encoded pinblock (16 bytes) is encrypted using **AES-128-CBC** with PKCS7 padding before being sent to the SGT.

### Parameters

| Parameter | Size     | Source                    |
|-----------|----------|---------------------------|
| Key       | 16 bytes | `SGT_AES_KEY` env var (32 hex chars) |
| IV        | 16 bytes | `SGT_AES_IV` env var (32 hex chars)  |
| Mode      | —        | CBC (Cipher Block Chaining) |
| Padding   | —        | PKCS7 (Node.js default)    |

### Process

1. Convert the 32-char hex pinblock to a 16-byte buffer
2. Create AES-128-CBC cipher with key and IV (both from hex)
3. Encrypt with PKCS7 padding
4. Output the encrypted result as uppercase hex string

## Complete Flow

```
   User PIN          ISO-4 Pinblock           Vault
   "1234"  ──────────► XOR(PIN,PAN) ────────► Stored
      │
      │               SGT Pinblock
      └──► encode() ──► "000431323334FF..."
                              │
                        encrypt(AES-128-CBC)
                              │
                              ▼
                     Encrypted hex string ────► SGT API
```

The system maintains **dual pinblock formats**:
- **ISO-4** (XOR of PIN + PAN) → stored in Vault for internal use
- **SGT proprietary** (ASCII-hex + AES-128-CBC) → sent to SGT for card activation

## Environment Variables

| Variable      | Required | Format              | Description                |
|---------------|----------|---------------------|----------------------------|
| `SGT_AES_KEY` | Yes      | 32 hex chars (16B)  | AES-128 encryption key     |
| `SGT_AES_IV`  | Yes      | 32 hex chars (16B)  | AES-128 initialization vector |

## References

- [AES (FIPS 197)](https://csrc.nist.gov/publications/detail/fips/197/final)
- [CBC Mode (NIST SP 800-38A)](https://csrc.nist.gov/publications/detail/sp/800-38a/final)
- [PKCS#7 Padding (RFC 5652)](https://datatracker.ietf.org/doc/html/rfc5652)
