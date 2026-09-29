import { computeStaleModuleIndicators } from './compute-modules-plan';

describe('computeStaleModuleIndicators', () => {
  it('returns indicators present in DB but missing from the current seed catalog', () => {
    const dbIndicators = ['dashboard', 'transactions', 'contact', 'old-feature'];
    const seedIndicators = ['dashboard', 'transactions'];

    const stale = computeStaleModuleIndicators(dbIndicators, seedIndicators);

    expect(stale.sort()).toEqual(['contact', 'old-feature']);
  });

  it('returns an empty array when DB and seed agree', () => {
    const stale = computeStaleModuleIndicators(['a', 'b'], ['a', 'b']);
    expect(stale).toEqual([]);
  });

  it('returns an empty array when DB has fewer modules than seed (new modules to add)', () => {
    const stale = computeStaleModuleIndicators(['a'], ['a', 'b']);
    expect(stale).toEqual([]);
  });

  it('handles duplicate indicators in the DB list defensively', () => {
    const stale = computeStaleModuleIndicators(['a', 'a', 'b'], ['a']);
    expect(stale.sort()).toEqual(['b']);
  });
});
