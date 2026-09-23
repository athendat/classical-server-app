/**
 * How the platform reaches the Issuer (issue #60). Single source of truth for
 * the config schema and the CARD_SGT_PORT binding.
 * - live: the real SGT over HTTP.
 * - simulated: an in-process simulated Issuer, for commercial demos outside production.
 */
export const SGT_MODES = ['live', 'simulated'] as const;

export type SgtMode = (typeof SGT_MODES)[number];

export const DEFAULT_SGT_MODE: SgtMode = 'live';

/** Narrows a raw SGT_MODE value: unset means the default, anything unknown is refused. */
export function parseSgtMode(value: unknown): SgtMode {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_SGT_MODE;
  }
  const mode = SGT_MODES.find((candidate) => candidate === value);
  if (!mode) {
    throw new Error(
      `Invalid SGT_MODE "${String(value)}": expected one of ${SGT_MODES.join(', ')}`,
    );
  }
  return mode;
}
