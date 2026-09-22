# Each Tenant has exactly one Webhook

A Tenant has a single Webhook `{url, secret, events[], active}`, generated at onboarding. Payloads are signed with HMAC in `X-Webhook-Signature` and delivered fire-and-forget with no retries. An array of subscribers (in the transactions plan) was rejected in #23/#51 because the schema, the domain model and `TenantWebhooksService` all already modelled a single Webhook.

## Open questions

- Retries and delivery guarantees.
- Adding a timestamp to the signature to prevent replays.
- Moving the secret from MongoDB to Vault.
