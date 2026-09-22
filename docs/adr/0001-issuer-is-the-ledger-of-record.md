# The Issuer is the ledger of record; the platform keeps no ledger

Money only moves at the Issuer, through SGT transfers. A Card's **Balance** is a cached copy of what the Issuer last reported, not a local ledger we debit or credit. PRD #14 dropped the earlier NFC plan of "MongoDB ledger debit" (#5): keeping a second ledger would mean reconciling two sources of truth for no gain, because the Issuer already rules on every transfer.

## Consequences

- Any local "balance check" before Settlement is advisory at most. The Issuer's answer (transfer codes TR0xx) is final.
- Refunds, reversals and reconciliation have to be SGT operations. None are implemented yet.
