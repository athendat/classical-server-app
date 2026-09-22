# Settlement runs synchronously inside the confirmation request

When a Customer confirms a Transaction (`POST /transactions/confirm`), the platform calls SGT inside the same HTTP request and replies with the final outcome (`TransactionPaymentProcessor`, "NO es event-driven"). The original plan (`.github/prompts/plan-transactionsModule.prompt.md`) had an asynchronous `transaction.confirmed` event with a listener doing Settlement. It was dropped so the Customer's app gets a definite success or failure on the spot, with no polling and no queue infrastructure to run. After Settlement, `transaction.processed` is still emitted to fan out to Webhooks, the socket push and the balance refresh.

## Consequences

- Request latency includes the SGT round trip, and an SGT outage fails the confirmation.
- `TransactionConfirmedEvent` and the `transaction.confirmed` Webhook event are defined but never emitted.
- The confirmation must move the Transaction out of `new` atomically (a conditional update). Otherwise two concurrent confirmations can both settle. Today it is **not** atomic.
