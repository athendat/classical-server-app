/**
 * Construye el fragmento de filtro Mongo para acotar `createdAt` a un rango.
 *
 * Issue #28 (admin): el listado de transacciones mostraba el rango de fechas en
 * la UI pero nunca lo aplicaba. El controller ahora recibe `from`/`to` (ISO) y
 * este helper los traduce a `{ createdAt: { $gte, $lte } }` para mezclarlo en el
 * filtro. Fechas ausentes o inválidas se ignoran (no acotan ese extremo).
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
        range['$lte'] = toDate;
    }

    return Object.keys(range).length > 0 ? { createdAt: range } : {};
}
