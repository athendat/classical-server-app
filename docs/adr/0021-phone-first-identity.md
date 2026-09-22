# User identity is phone-first, with mandatory SMS confirmation

A User's unique identifier is a Cuban mobile number. Login is blocked until the phone is confirmed with an SMS code (6 digits, 10-minute TTL, 3 attempts, 3 resends per 24 hours). Password reset also goes by SMS. Email is optional and can be used as a login alias. This fits the target market, where a phone number is the reliable, verifiable identity and email is not.

## Consequences

- Phone validation is inconsistent: `IsPhoneNumber('CU')` at registration, a `5|6` + 8-digit rule elsewhere, and the Super admin seeded with `00000000`, which fails that rule.
