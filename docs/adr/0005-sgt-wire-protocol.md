---
status: accepted — under review (#53, #54)
---

# SGT integration: HMAC-signed requests and AES-128-CBC PIN blocks, behind a port

SGT dictates the integration contract, and the platform follows it through a hexagonal port (`CARD_SGT_PORT`, `SGT_PINBLOCK_PORT`) so the rest of the system stays unaware of it.

- Every request is signed with `hex(HMAC-SHA256(SGT_HMAC_SECRET, JSON(body) + timestamp))`. The signature, timestamp and client id go in the `X-Signature`, `X-Timestamp` and `X-Client-ID` headers, and an `apiKey` header is also sent.
- The PIN goes in SGT's own PIN block format (`00` + length + ASCII-hex PIN + `FF`, zero-padded), encrypted with AES-128-CBC. The key and IV are static, come from env, and no padding is applied.
- Amounts travel as 12-digit minor units. The Tenant is identified to SGT by its code/NIT, padded to 15 characters.

A fixed key and IV make the PIN encryption deterministic, which allows a dictionary attack, and CBC provides no integrity. Moving to an authenticated cipher needs SGT to agree, plus a period where both formats are accepted (#53, #54).

[HMAC_AUTH_GUIDE.md](../integration-guides/HMAC_AUTH_GUIDE.md) describes SGT's side of this contract. This server does not validate inbound HMAC.
