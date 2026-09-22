# Classical Payments Platform

Closed-loop card payment platform: people pay registered businesses with cards issued by Clásica, by scanning a QR code or tapping a phone on a terminal. Money moves at the issuer (via the SGT switch); this platform authorizes, orchestrates and records payments.

## Parties

**User**:
A person with an account, identified by a confirmed phone number. May hold several roles.
_Avoid_: account, cliente

**Customer**:
The User paying in a given Transaction.
_Avoid_: payer, buyer

**Tenant**:
A registered business that receives payments, with its own approval lifecycle, beneficiary PAN, credentials and webhook.
_Avoid_: comercio, negocio, business, teniente, "merchant" (for the organization)

**Merchant**:
A role held by a User who operates a Tenant. The Merchant is the person; the Tenant is the organization.
_Avoid_: tenant-admin

**Tenant owner**:
The User who created the Tenant and is bound to it.

**Actor**:
The authenticated principal behind a request: a User, or a Service acting for a Tenant or Terminal.
_Avoid_: using "user" when a Service may be meant

**Service**:
A non-human Actor (a Tenant integration or a Terminal) authenticating with client credentials.

**Platform operator**:
A User holding a platform role (super_admin, admin, security_officer, ops, auditor). Not bound to any Tenant.
_Avoid_: ATHENDAT staff, system user

**Super admin**:
The single bootstrap Platform operator that cannot be managed through the regular user screens.

## Access control

**Role**:
A named set of Permissions. Platform roles are for Platform operators; tenant-assignable roles (user, developer, merchant) are for Tenant members.

**Permission**:
A `area.action` key (or wildcard) granting one capability to Users.
_Avoid_: scope (see below)

**Scope**:
A capability granted to a Service's credentials (e.g. `payments:authorize`). Scopes are for Services; Permissions are for Users.

**System module**:
A navigable functional area of the back office shown in the menu.
_Avoid_: module (ambiguous with code modules)

## Cards

**Card**:
A Clásica card registered by a User; at most one personal and one business card per User.
_Avoid_: tarjeta

**Issuer**:
Clásica, the card issuer. It holds the balance of record.
_Avoid_: emisor, bank

**SGT**:
The Issuer's switch. The platform talks to it to activate PINs and move money.
_Avoid_: switch, módulo emisor, card processor

**PAN**:
A full card number. Stored only in the secrets store, never in the business database.

**Card token**:
The Issuer's token that stands for a Card's PAN in SGT transfers.
_Avoid_: token (unqualified; confused with access tokens)

**TML / AUT**:
Issuer-provided codes a User supplies when registering a Card.
_Avoid_: "terminal code" (TML is not a Terminal)

**Card activation**:
Registering the Card's PIN with the Issuer through SGT. A Card is Registered (activation pending, retryable) or Active.

**Stored PIN block**:
The PIN block kept in the secrets store for a Card.
_Avoid_: ISO-4 PIN block (the stored format is not ISO format 4)

**SGT PIN block**:
The Issuer-specific encrypted PIN block sent to SGT.

**Balance**:
The Card's available funds as last reported by the Issuer. A cached copy, not a ledger.

## Payments

**Transaction**:
One payment attempt from a Customer's Card to a Tenant. Its status is new, processing, success, failed or cancelled.
_Avoid_: payment, operación

**Intent id**:
The Tenant-supplied idempotency key of a Transaction. It also names the channel the payment result is pushed to.

**Transaction reference**:
The Tenant's own order reference attached to a Transaction.

**Payment QR**:
The QR code for a Transaction, encoded in EMVCo-style fields. The Customer's app scans it to confirm.

**Confirmation**:
The Customer accepting a Transaction by choosing a Card, which triggers Settlement.

**Expiry**:
A new Transaction that was never confirmed within its time-to-live. It is recorded as cancelled.

**Settlement**:
Moving the funds at the Issuer through an SGT transfer. It decides whether the Transaction succeeds or fails.
_Avoid_: processing, payment (for this step)

**Authorization (NFC)**:
Cryptographic verification of an NFC payment token before Settlement.
_Avoid_: using "authorization" for access control in payment contexts

**Gateway fee**:
The platform's percentage charged on a Settlement.

**Webhook**:
A Tenant's single callback URL that receives Transaction events.

## NFC payments

**Terminal**:
A Tenant's point of sale (physical POS, web or kiosk) with its own credentials and Capabilities.
_Avoid_: POS (as an entity name), device

**Capability**:
A payment method a Terminal can accept (nfc, chip, QR…).

**NFC enrollment**:
Pairing a Card with a Customer's phone so the phone can sign payments for that Card.

**Root seed**:
The per-enrollment secret that the phone and server derive from their key exchange.

**Counter**:
The per-enrollment, strictly increasing number used to derive each one-time signing key.

**Payment session**:
A short-lived, single-use Customer session opened before tapping, carrying the nonce and expected Counter.
_Avoid_: session (unqualified)

**Payment token (NFC)**:
The signed TLV blob the phone hands to the Terminal.
_Avoid_: token (unqualified)

## Devices & sessions

**Device**:
A Customer's phone registered through the device key exchange.
_Avoid_: terminal

**Device key**:
The key pair a Device agreed with the server, referenced by its key handle.

**Login session**:
A User's signed-in period after login, extended by refresh.
_Avoid_: session (unqualified)

## Relationships

- A **User** may be the **Tenant owner** of a **Tenant** and may hold the **Merchant** role
- A **Tenant** has many **Terminals**; each **Terminal** has exactly one set of Service credentials
- A **User** has at most one personal and one business **Card**
- A **Transaction** belongs to one **Tenant**, and gets a **Customer** and a **Card** only when confirmed
- An **NFC enrollment** belongs to one **Card**; its **Payment sessions** and **Counter** belong to that enrollment
- Every **Transaction**, whether QR or NFC, is completed by one **Settlement** at the **Issuer**

## Example dialogue

> **Dev:** "When the merchant creates a payment, whose tenant ID do we use?"
> **Domain expert:** "The **Merchant** is a person. The **Tenant** comes from the **Actor**'s credentials, never from the request body. The request creates a **Transaction** in new status, with the Tenant's **Intent id**."
> **Dev:** "And when the customer taps the phone instead of scanning?"
> **Domain expert:** "The **Terminal** sends the **Payment token** for **Authorization**. If it verifies, we build the same kind of **Transaction** and run the same **Settlement** as for the **Payment QR**."

## Flagged ambiguities

- "merchant" was used for both the organization and the person. Resolved: **Tenant** is the organization, **Merchant** is the role.
- "session" meant a Login session, the Redis/Mongo session records, and an NFC Payment session. Always qualify it.
- "token" meant access tokens, refresh tokens, the Card token and the NFC Payment token. Always qualify it.
- "terminal" was used for the POS entity and for the TML code. Only the POS is a **Terminal**.
- "ISO-4 PIN block" does not describe what is stored. Use **Stored PIN block**.
- "expired" Transactions are stored as cancelled. **Expiry** is the reason, not a separate status.
- "module" meant both NestJS modules and back-office menu areas. Use **System module** for the latter.
