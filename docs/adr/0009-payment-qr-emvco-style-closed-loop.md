# The Payment QR uses EMVCo-style TLV fields, but only for our own app

The Payment QR is an EMVCo-like TLV string with a CRC16 checksum (`EmvcoService`). The app decodes it offline and sends back only the Transaction id. We picked this over a JSON payload so the QR looks familiar and could later move to real interoperability.

It is **not EMVCo-compliant**, though:

- the Tenant name is in tag 15 instead of 59;
- city and country (tags 60 and 58) are missing;
- tag 62-09 is misused for expiry;
- the amount is in minor units.

Third-party wallets and readers cannot use it. That is acceptable only while the network stays closed-loop (Clásica cards, our app).
