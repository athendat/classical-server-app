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
});
