import { QueryFilter } from 'mongoose';

import { QueryParams } from '../types/common.types';

/**
 * Configuración para mapear parámetros de rango
 */
interface RangeConfig {
  paramMin: string; // Nombre que viene del frontend (ej: 'minPrice')
  paramMax: string; // Nombre que viene del frontend (ej: 'maxPrice')
  dbField: string; // Nombre del campo en la DB (ej: 'price')
  type: 'number' | 'date';
}

export function buildMongoQuery<T>(
  params: QueryParams<T>,
  searchFields: string[] = [],
  ranges: RangeConfig[] = [], // Nueva configuración de rangos
) {
  const {
    page = 1,
    limit = 10,
    sortBy,
    sortOrder = 'desc',
    search,
    filters = {},
  } = params;

  // 1. Clonamos filtros base
  const mongoFilter: QueryFilter<any> = { ...filters };

  // 2. Procesamos Rangos Dinámicos (Fechas y Números)
  ranges.forEach((range) => {
    const minVal = mongoFilter[range.paramMin];
    const maxVal = mongoFilter[range.paramMax];

    if (minVal !== undefined || maxVal !== undefined) {
      mongoFilter[range.dbField] = {};

      if (minVal !== undefined) {
        mongoFilter[range.dbField].$gte =
          range.type === 'date' ? new Date(minVal) : Number(minVal);
        delete mongoFilter[range.paramMin];
      }
      if (maxVal !== undefined) {
        mongoFilter[range.dbField].$lte =
          range.type === 'date' ? new Date(maxVal) : Number(maxVal);
        delete mongoFilter[range.paramMax];
      }
    }
  });

  // 3. Búsqueda Global (Regex)
  if (search && searchFields.length > 0) {
    // Campos numéricos que no deben usar regex
    const numericFields = ['no'];
    
    mongoFilter.$or = searchFields.map((field) => {
      // Para campos numéricos, intentar match exacto si la búsqueda es un número
      if (numericFields.includes(field) && !isNaN(Number(search))) {
        return { [field]: Number(search) };
      }
      // Para campos de texto, usar regex
      return {
        [field]: { $regex: search, $options: 'i' },
      };
    });
  }

  return {
    mongoFilter,
    options: {
      limit: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
      sort: sortBy
        ? { [sortBy]: sortOrder === 'asc' ? 1 : -1 }
        : { createdAt: -1 },
    },
  };
}
