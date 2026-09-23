# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Repo status

This repo uses the canonical vocabulary unchanged — no remapping.

`wontfix` already existed in `athendat/classical-server-app` as a GitHub default label ("This will not be worked on") and is reused as-is. The other four (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`) were created during setup.

Note that `gh issue edit --add-label` fails on a label that doesn't exist rather than creating it, so any new role added to the table above must also be created in the repo.
