/**
 * Masking for values that must never reach a log in full (ADR-0012).
 * Use these whenever a log line needs to identify a PAN or a Card token.
 */

/** PAN (Card or Tenant) → only its last 4 digits: "****0001" */
export function maskPan(pan: string | null | undefined): string {
  return pan ? `****${pan.slice(-4)}` : '****';
}

/** Card token → only its 4-character prefix: "0400****" */
export function maskCardToken(cardToken: string | null | undefined): string {
  return cardToken ? `${cardToken.slice(0, 4)}****` : '****';
}
