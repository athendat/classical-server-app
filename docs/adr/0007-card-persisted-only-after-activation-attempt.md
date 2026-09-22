# A Card is saved only after SGT answers, with Vault rollback on rejection

Card registration writes the PAN and Stored PIN block to Vault, then calls SGT to activate the PIN. The Card document is written only after SGT replies:

| SGT result | What happens |
|---|---|
| Hard rejection (AP001, AP004) | The Vault secret is deleted and nothing is saved |
| Pending (AP002) | The Card is saved as **Registered**, with the Card token, for a later `retry-activation` |
| Success (AP000, AP003) | The Card is saved as **Active** |

This replaced the plan in `plan-sgtCardVerification.prompt.md` to save the Card anyway as `VERIFICATION_FAILED`, so the database never holds Cards the Issuer refused. The `PENDING_VERIFICATION` and `VERIFICATION_FAILED` statuses are leftovers and are never set.
