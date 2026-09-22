---
status: accepted — authentication under review
---

# Payment results are pushed through one socket gateway, in rooms named by Intent id

The Customer's app learns a payment's outcome from one app-wide socket gateway (`/api_053/socket`), joining a room named after the Transaction's Intent id (for NFC, that is the Payment session id). `PaymentSocketNotifier` sends `payment.processing` and `payment.result` there. This replaced a dedicated `/payments` namespace inside the transactions module (commits 0e241fd → 0cf5f83) so every module can use one gateway.

The gateway reads the JWT with `decode()` instead of `verify()` (commit 69e4b83), because single-use `jti` protection rejected tokens that had already been used over HTTP. With `decode()`, anyone can connect as anyone, and any client can join any room. A proper fix needs either a separate socket ticket or a verification that skips the single-use `jti` check.
