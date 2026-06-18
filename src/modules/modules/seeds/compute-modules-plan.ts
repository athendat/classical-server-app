/**
 * Returns the set of module indicators that exist in the DB but are no longer
 * present in the current seed catalog. The bootstrap layer uses this list to
 * mark such modules as `inactive`, so they stop appearing in navigation when
 * a module is intentionally removed from {@link SYSTEM_MODULES} (e.g. when its
 * frontend route was deleted — see admin issue #5 for `contact`).
 */
export function computeStaleModuleIndicators(
  dbIndicators: readonly string[],
  seedIndicators: readonly string[],
): string[] {
  const seedSet = new Set(seedIndicators);
  const stale = new Set<string>();
  for (const indicator of dbIndicators) {
    if (!seedSet.has(indicator)) {
      stale.add(indicator);
    }
  }
  return Array.from(stale);
}
