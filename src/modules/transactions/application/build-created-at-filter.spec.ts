import { buildCreatedAtRangeFilter } from './build-created-at-filter';

describe('buildCreatedAtRangeFilter (issue #28)', () => {
    it('arma $gte y $lte cuando vienen ambas fechas', () => {
        const f = buildCreatedAtRangeFilter(
            '2026-05-03T00:00:00.000Z',
            '2026-06-02T23:59:59.999Z',
        ) as any;
        expect(f.createdAt.$gte).toBeInstanceOf(Date);
        expect(f.createdAt.$lte).toBeInstanceOf(Date);
        expect(f.createdAt.$gte.toISOString()).toBe('2026-05-03T00:00:00.000Z');
    });

    it('devuelve {} cuando no hay fechas', () => {
        expect(buildCreatedAtRangeFilter()).toEqual({});
    });

    it('ignora fechas inválidas', () => {
        expect(buildCreatedAtRangeFilter('no-es-fecha', undefined)).toEqual({});
    });

    it('acota sólo un extremo si sólo viene uno', () => {
        const f = buildCreatedAtRangeFilter('2026-05-03T00:00:00.000Z') as any;
        expect(f.createdAt.$gte).toBeInstanceOf(Date);
        expect(f.createdAt.$lte).toBeUndefined();
    });

    it('un `to` date-only (YYYY-MM-DD) cubre TODO el día (fin de día), no medianoche', () => {
        const f = buildCreatedAtRangeFilter(undefined, '2026-06-02') as any;
        // No debe ser medianoche UTC (excluiría el día entero).
        expect(f.createdAt.$lte.toISOString()).toBe('2026-06-02T23:59:59.999Z');
    });

    it('un `from` date-only se ancla al inicio del día', () => {
        const f = buildCreatedAtRangeFilter('2026-05-03', undefined) as any;
        expect(f.createdAt.$gte.toISOString()).toBe('2026-05-03T00:00:00.000Z');
    });
});
