import {
  normalizeTerminalPagination,
  DEFAULT_TERMINAL_LIMIT,
  MAX_TERMINAL_LIMIT,
} from './terminal-pagination.helper';

describe('normalizeTerminalPagination', () => {
  it('applies defaults when page and limit are undefined', () => {
    expect(normalizeTerminalPagination()).toEqual({
      page: 1,
      limit: DEFAULT_TERMINAL_LIMIT,
      skip: 0,
    });
  });

  it('computes skip from page and limit', () => {
    expect(normalizeTerminalPagination(3, 10)).toEqual({ page: 3, limit: 10, skip: 20 });
  });

  it('clamps limit above the maximum', () => {
    const { limit } = normalizeTerminalPagination(1, 500);
    expect(limit).toBe(MAX_TERMINAL_LIMIT);
  });

  it('falls back to page 1 for invalid (zero/negative/NaN) page', () => {
    expect(normalizeTerminalPagination(0, 10).page).toBe(1);
    expect(normalizeTerminalPagination(-4, 10).page).toBe(1);
    expect(normalizeTerminalPagination(NaN, 10).page).toBe(1);
  });

  it('clamps limit below 1 up to 1', () => {
    expect(normalizeTerminalPagination(1, 0).limit).toBe(1);
    expect(normalizeTerminalPagination(1, -3).limit).toBe(1);
  });

  it('floors non-integer page and limit', () => {
    expect(normalizeTerminalPagination(2.9, 10.7)).toEqual({ page: 2, limit: 10, skip: 10 });
  });

  it('defaults limit to the default when limit is NaN/undefined', () => {
    expect(normalizeTerminalPagination(2, NaN).limit).toBe(DEFAULT_TERMINAL_LIMIT);
  });
});
