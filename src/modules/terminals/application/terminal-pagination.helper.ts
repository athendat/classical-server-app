import { PaginationMeta } from 'src/common/types';

export const DEFAULT_TERMINAL_PAGE = 1;
export const DEFAULT_TERMINAL_LIMIT = 20;
export const MAX_TERMINAL_LIMIT = 100;

/**
 * Normaliza los parámetros de paginación del listado admin de terminales.
 * Defensivo ante valores ausentes, no numéricos o fuera de rango (el
 * ValidationPipe corre con enableImplicitConversion:false, así que esto no
 * depende de la coerción del pipe).
 */
export function normalizeTerminalPagination(
  page?: number,
  limit?: number,
): { page: number; limit: number; skip: number } {
  const parsedPage = Math.floor(Number(page));
  const safePage = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : DEFAULT_TERMINAL_PAGE;

  const parsedLimit = Math.floor(Number(limit));
  const safeLimit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), MAX_TERMINAL_LIMIT)
    : DEFAULT_TERMINAL_LIMIT;

  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
}

/**
 * Construye el meta de paginación a partir de page/limit/total.
 */
export function buildPaginationMeta(
  page: number,
  limit: number,
  total: number,
): PaginationMeta {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  const hasMore = page < totalPages;

  return {
    page,
    limit,
    total,
    totalPages,
    nextPage: hasMore ? page + 1 : null,
    prevPage: page > 1 ? page - 1 : null,
    hasMore,
  };
}
