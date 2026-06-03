/** Detecta un string de fecha sin componente horario (YYYY-MM-DD). */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Construye el fragmento de filtro Mongo para acotar `createdAt` a un rango.
 *
 * Issue #28 (admin): el listado de transacciones mostraba el rango de fechas en
 * la UI pero nunca lo aplicaba. El controller ahora recibe `from`/`to` (ISO) y
 * este helper los traduce a `{ createdAt: { $gte, $lte } }` para mezclarlo en el
 * filtro. Fechas ausentes o inválidas se ignoran (no acotan ese extremo).
 *
 * Diseño (review PR #45): se mantiene como helper PURO y aislado (en vez de
 * enrutar `from`/`to` por el soporte `ranges` de buildMongoQuery) a propósito —
 * es trivial de testear y NO cambia el comportamiento del path de rangos
 * compartido para todos sus callers.
 *
 * Borde-de-día: un `to` date-only ("YYYY-MM-DD") se interpreta como FIN del día
 * (23:59:59.999Z) para no excluir las transacciones de ese mismo día (sería un
 * off-by-a-day); un `from` date-only ya ancla al inicio del día por defecto.
 *
 * Rango invertido (`from` > `to`): produce intencionalmente un conjunto vacío
 * (Mongo evalúa $gte/$lte sin resultados) — no lo tratamos como error.
 */
export function buildCreatedAtRangeFilter(
    from?: string,
    to?: string,
): Record<string, unknown> {
    const range: Record<string, Date> = {};

    const fromDate = from ? new Date(from) : undefined;
    if (fromDate && !isNaN(fromDate.getTime())) {
        range['$gte'] = fromDate;
    }

    const toDate = to ? new Date(to) : undefined;
    if (toDate && !isNaN(toDate.getTime())) {
        // Un `to` sin hora se parsea a medianoche UTC; lo empujamos a fin de día
        // para incluir todas las transacciones de esa fecha.
        if (DATE_ONLY.test(to!)) {
            toDate.setUTCHours(23, 59, 59, 999);
        }
        range['$lte'] = toDate;
    }

    return Object.keys(range).length > 0 ? { createdAt: range } : {};
}
