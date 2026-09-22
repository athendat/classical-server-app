# QR and NFC payments share one Settlement path

NFC payments do not get their own settlement code. Once an NFC Payment token is authorized, the platform builds an ordinary Transaction (`NfcTransactionBuilder`) and hands it to the same `TransactionPaymentProcessor` that QR confirmations use (PRD #14: "so QR and NFC settlement paths stay consistent and we do not fork the logic"). NFC stays a **single atomic authorize call** from the Terminal. We rejected copying QR's two-step create-then-confirm flow, because the Terminal already holds everything needed in one message.

## Consequences

- For NFC, the phone's ECDSA signature is the proof of possession. The Customer does not re-enter a PIN; SGT still receives the Stored PIN block (see ADR-0006).
- The NFC Transaction's Intent id is the Payment session id, so the phone's result channel is reused.
- The nonce and Counter are consumed even when SGT then rejects the transfer. They are never rolled back.
- An invalid signature is rejected before any Transaction is written.
