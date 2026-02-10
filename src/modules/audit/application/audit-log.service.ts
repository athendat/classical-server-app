import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditEvent, AuditEventDocument } from '../schemas/audit-event.schema';
import { AsyncContextService } from 'src/common/context/async-context.service';
import { ApiResponse } from 'src/common/types/api-response.type';
import { QueryParams, PaginationMeta } from 'src/common/types/common.types';
import { buildMongoQuery } from 'src/common/helpers/build-mongo-query';

export interface AuditFilterParams {
  actorId?: string;
  action?: string;
  resourceType?: string;
  result?: string;
  severity?: string;
  method?: string;
  statusCode?: number | string;
  startDate?: string;
  endDate?: string;
}

export interface AuditSummaryResponse {
  total: number;
  byResult: {
    allow: number;
    deny: number;
    error: number;
  };
  bySeverity: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
    CRITICAL: number;
  };
  timeRange: {
    earliest: Date | null;
    latest: Date | null;
  };
}

/**
 * AuditLogService: Servicio de aplicación para consultas de auditoría
 * 
 * Responsabilidades:
 * - Construir queries y filtros validados
 * - Recuperar logs desde la base de datos
 * - Calcular estadísticas y resúmenes
 * - Manejo de paginación
 * 
 * Implementa:
 * - ApiResponse pattern para respuestas consistentes
 * - Trazabilidad con requestId y userId
 * - Logging de operaciones
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectModel(AuditEvent.name)
    private readonly auditEventModel: Model<AuditEventDocument>,
    private readonly asyncContext: AsyncContextService,
  ) { }

  /**
   * Obtener lista de logs de auditoría con filtros y paginación
   * Usa patrón reutilizable QueryParams y buildMongoQuery
   */
  async findAll(queryParams: QueryParams<AuditFilterParams>): Promise<ApiResponse<any[]>> {
    const requestId = this.asyncContext.getRequestId();
    const userId = this.asyncContext.getActorId();
    console.log({ queryParams })
    try {
      this.logger.log(
        `[${requestId}] Fetching audit logs for user: ${userId} - page=${queryParams.page}, limit=${queryParams.limit}`,
      );

      // Establecer valores por defecto si no vienen
      const page = queryParams.page ?? 1;
      const limit = queryParams.limit ?? 20;

      // Campos en los que buscar de forma global
      const searchFields = ['action', 'actorId', 'actorSub', 'resourceType', 'endpoint', 'method'];

      // Campos que soportan rango de fechas
      const rangeConfigs = [
        {
          paramMin: 'startDate',
          paramMax: 'endDate',
          dbField: 'at',
          type: 'date' as const,
        },
      ];

      // Limpiar filtros: eliminar propiedades undefined
      const cleanedFilters = queryParams.filters
        ? Object.fromEntries(
          Object.entries(queryParams.filters).filter(([, value]) => value !== undefined && value !== null && value !== '')
        )
        : {};

      // Construir query MongoDB dinámicamente
      const { mongoFilter, options } = buildMongoQuery<AuditFilterParams>(
        {
          page,
          limit,
          search: queryParams.search,
          sortBy: queryParams.sortBy,
          sortOrder: queryParams.sortOrder,
          filters: cleanedFilters as AuditFilterParams,
        },
        searchFields,
        rangeConfigs,
      );

      // Función auxiliar para expandir valores separados por comas a $in
      const expandMultipleValues = (value: any): any => {
        if (typeof value === 'string' && value.includes(',')) {
          return { $in: value.split(',').map(v => v.trim()) };
        }
        return value;
      };

      // Expandir valores múltiples (separados por comas) a operador $in
      if (mongoFilter.method) {
        mongoFilter.method = expandMultipleValues(mongoFilter.method);
      }

      if (mongoFilter.statusCode) {
        const statusCodeValue = String(mongoFilter.statusCode);
        if (statusCodeValue.includes(',')) {
          mongoFilter.statusCode = {
            $in: statusCodeValue.split(',').map(v => {
              const num = Number(v.trim());
              return !isNaN(num) ? num : v.trim();
            }),
          };
        } else {
          const statusCodeNum = Number(statusCodeValue);
          if (!isNaN(statusCodeNum)) {
            mongoFilter.statusCode = statusCodeNum;
          } else {
            delete mongoFilter.statusCode;
          }
        }
      }

      // Validar y normalizar filtros específicos de auditoría
      if (mongoFilter.result) {
        const resultValue = String(mongoFilter.result).toLowerCase();
        if (resultValue.includes(',')) {
          const validResults = ['allow', 'deny', 'error'];
          const results = resultValue.split(',')
            .map(v => v.trim())
            .filter(v => validResults.includes(v));
          if (results.length > 0) {
            mongoFilter.result = { $in: results };
          } else {
            delete mongoFilter.result;
          }
        } else {
          const validResults = ['allow', 'deny', 'error'];
          if (!validResults.includes(resultValue)) {
            delete mongoFilter.result;
          } else {
            mongoFilter.result = resultValue;
          }
        }
      }

      if (mongoFilter.severity) {
        const severityValue = String(mongoFilter.severity).toUpperCase();
        if (severityValue.includes(',')) {
          const validSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
          const severities = severityValue.split(',')
            .map(v => v.trim().toUpperCase())
            .filter(v => validSeverities.includes(v));
          if (severities.length > 0) {
            mongoFilter.severity = { $in: severities };
          } else {
            delete mongoFilter.severity;
          }
        } else {
          const validSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
          if (!validSeverities.includes(severityValue)) {
            delete mongoFilter.severity;
          } else {
            mongoFilter.severity = severityValue;
          }
        }
      }

      // Aplicar ordenamiento por fecha descending por defecto
      const sortOrder = queryParams.sortBy ? options.sort : { at: -1 };

      // Ejecutar query y contar en paralelo (castear mongoFilter para evitar problemas de tipos de Mongoose)
      const [items, total] = await Promise.all([
        this.auditEventModel
          .find(mongoFilter as any)
          .sort(sortOrder as any)
          .limit(options.limit)
          .skip(options.skip)
          .lean()
          .exec(),
        this.auditEventModel.countDocuments(mongoFilter as any).exec(),
      ]);

      const pages = Math.ceil(total / limit);

      // Construir objeto PaginationMeta
      const paginationMeta: PaginationMeta = {
        page,
        limit,
        total,
        totalPages: pages,
        nextPage: page < pages ? page + 1 : null,
        prevPage: page > 1 ? page - 1 : null,
        hasMore: page < pages,
      };

      this.logger.log(
        `[${requestId}] Audit logs retrieved successfully - Total: ${total}, Page: ${page}/${pages}`,
      );

      return ApiResponse.ok<any[]>(
        HttpStatus.OK,
        items,
        'Audit logs retrieved successfully',
        {
          requestId,
          userId,
          pagination: paginationMeta,
        },
      );
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `[${requestId}] Failed to find audit logs: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      return ApiResponse.fail<any[]>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMessage,
        'Error al obtener logs de auditoría',
        { requestId, userId },
      );
    }
  }

  /**
   * Obtener un log de auditoría específico por ID
   */
  async findById(id: string): Promise<ApiResponse<any>> {
    const requestId = this.asyncContext.getRequestId();
    const userId = this.asyncContext.getActorId();

    try {
      this.logger.log(`[${requestId}] Fetching audit log by ID: ${id} for user: ${userId}`);

      // Validar que sea un ObjectId válido
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        const errorMsg = 'Invalid audit log ID format. Must be a valid MongoDB ObjectId.';
        this.logger.warn(`[${requestId}] ${errorMsg}`);

        return ApiResponse.fail<any>(
          HttpStatus.BAD_REQUEST,
          errorMsg,
          'Formato de ID inválido',
          { requestId, userId },
        );
      }

      const auditEvent = await this.auditEventModel.findById(id).lean().exec();

      if (!auditEvent) {
        const errorMsg = 'Audit log not found';
        this.logger.warn(`[${requestId}] ${errorMsg}: ${id}`);

        return ApiResponse.fail<any>(
          HttpStatus.NOT_FOUND,
          errorMsg,
          'Log de auditoría no encontrado',
          { requestId, userId },
        );
      }

      this.logger.log(`[${requestId}] Audit log retrieved successfully: ${id}`);

      return ApiResponse.ok<any>(
        HttpStatus.OK,
        auditEvent,
        'Audit log retrieved successfully',
        { requestId, userId },
      );
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `[${requestId}] Failed to find audit log by ID: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      return ApiResponse.fail<any>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMessage,
        'Error al obtener log de auditoría',
        { requestId, userId },
      );
    }
  }

  /**
   * Obtener resumen de auditoría (estadísticas)
   */
  async getSummary(startDate?: string, endDate?: string): Promise<ApiResponse<AuditSummaryResponse>> {
    const requestId = this.asyncContext.getRequestId();
    const userId = this.asyncContext.getActorId();

    try {
      this.logger.log(
        `[${requestId}] Fetching audit summary for user: ${userId} - Range: ${startDate} to ${endDate}`,
      );

      // Construir filtro por fecha
      const filter: any = {};

      if (startDate || endDate) {
        filter.at = {};

        if (startDate) {
          const start = new Date(startDate);
          if (isNaN(start.getTime())) {
            const errorMsg = 'Invalid startDate format. Use ISO format.';
            this.logger.warn(`[${requestId}] ${errorMsg}`);

            return ApiResponse.fail<AuditSummaryResponse>(
              HttpStatus.BAD_REQUEST,
              errorMsg,
              'Formato de fecha de inicio inválido',
              { requestId, userId },
            );
          }
          filter.at.$gte = start;
        }

        if (endDate) {
          const end = new Date(endDate);
          if (isNaN(end.getTime())) {
            const errorMsg = 'Invalid endDate format. Use ISO format.';
            this.logger.warn(`[${requestId}] ${errorMsg}`);

            return ApiResponse.fail<AuditSummaryResponse>(
              HttpStatus.BAD_REQUEST,
              errorMsg,
              'Formato de fecha de fin inválido',
              { requestId, userId },
            );
          }
          filter.at.$lte = end;
        }
      }

      // Ejecutar aggregation pipeline
      const summary = await this.auditEventModel
        .aggregate([
          { $match: filter },
          {
            $facet: {
              total: [{ $count: 'count' }],
              byResult: [
                { $group: { _id: '$result', count: { $sum: 1 } } },
                { $sort: { _id: 1 } },
              ],
              bySeverity: [
                { $group: { _id: '$severity', count: { $sum: 1 } } },
                { $sort: { _id: 1 } },
              ],
              timeRange: [
                {
                  $group: {
                    _id: null,
                    earliest: { $min: '$at' },
                    latest: { $max: '$at' },
                  },
                },
              ],
            },
          },
        ])
        .exec();

      // Transformar resultado
      const data: AuditSummaryResponse = {
        total: summary[0]?.total[0]?.count || 0,
        byResult: {
          allow: 0,
          deny: 0,
          error: 0,
        },
        bySeverity: {
          LOW: 0,
          MEDIUM: 0,
          HIGH: 0,
          CRITICAL: 0,
        },
        timeRange: {
          earliest: null,
          latest: null,
        },
      };

      // Procesar resultados por resultado
      summary[0]?.byResult?.forEach((item: any) => {
        if (item._id === 'allow') data.byResult.allow = item.count;
        if (item._id === 'deny') data.byResult.deny = item.count;
        if (item._id === 'error') data.byResult.error = item.count;
      });

      // Procesar resultados por severidad
      summary[0]?.bySeverity?.forEach((item: any) => {
        if (item._id === 'LOW') data.bySeverity.LOW = item.count;
        if (item._id === 'MEDIUM') data.bySeverity.MEDIUM = item.count;
        if (item._id === 'HIGH') data.bySeverity.HIGH = item.count;
        if (item._id === 'CRITICAL') data.bySeverity.CRITICAL = item.count;
      });

      // Procesar rango de tiempo
      if (summary[0]?.timeRange?.[0]) {
        data.timeRange.earliest = summary[0].timeRange[0].earliest;
        data.timeRange.latest = summary[0].timeRange[0].latest;
      }

      this.logger.log(
        `[${requestId}] Audit summary retrieved successfully - Total: ${data.total}`,
      );

      return ApiResponse.ok<AuditSummaryResponse>(
        HttpStatus.OK,
        data,
        'Audit summary retrieved successfully',
        { requestId, userId, total: data.total },
      );
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `[${requestId}] Failed to get audit summary: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      return ApiResponse.fail<AuditSummaryResponse>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMessage,
        'Error al obtener resumen de auditoría',
        { requestId, userId },
      );
    }
  }
}
