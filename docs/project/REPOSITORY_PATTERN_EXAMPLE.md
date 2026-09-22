# Patrón de Repositorio MongoDB en el Proyecto

## Estructura General del Patrón

El proyecto sigue la arquitectura **hexagonal** con el patrón **Repository** que separa la lógica de persistencia de la lógica de negocio.

### Estructura de Carpetas
```text
src/modules/{entity}/
├── domain/
│   ├── {entity}.entity.ts
│   ├── {entity}.repository.ts (Interface/Puerto)
│   ├── enums.ts
│   └── ports/
├── infrastructure/
│   ├── adapters/
│   │   └── mongodb-{entity}.repository.ts (Implementación)
│   ├── schemas/
│   │   └── {entity}.schema.ts (Mongoose Schema)
│   └── {entity}.module.ts
```

---

## 1️⃣ Ejemplo: Interface/Puerto del Repositorio (Domain)

**Archivo:** `src/modules/roles/domain/roles.repository.ts`

```typescript
import { Role } from './role.entity';

/**
 * IRolesRepository - Puerto (interfaz)
 * Define operaciones de persistencia para roles
 * Implementada en RolesRepository
 */
export interface IRolesRepository {
  create(role: Role): Promise<Role>;
  findAll(): Promise<Role[]>;
  findById(id: string): Promise<Role | null>;
  findByKey(key: string): Promise<Role | null>;
  update(id: string, updates: Partial<Role>): Promise<Role | null>;
  disable(id: string): Promise<Role | null>;
  delete(id: string): Promise<boolean>;
  findSystemRoles(): Promise<Role[]>;
}
```

---

## 2️⃣ Ejemplo: Schema Mongoose con Índices

**Archivo:** `src/modules/roles/infrastructure/schemas/role.schema.ts`

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { RoleStatus } from '../../domain/role.enums';
import { AbstractSchema } from 'src/common/schemas/abstract.schema';

export type RoleDocument = HydratedDocument<Role>;

@Schema({ timestamps: true, collection: 'roles' })
export class Role extends AbstractSchema {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  key: string;

  @Prop({ required: true, trim: true, type: String, maxlength: 100 })
  name: string;

  @Prop({ type: String, trim: true, maxlength: 20 })
  icon?: string;

  @Prop({ type: String, trim: true, maxlength: 500 })
  description?: string;

  @Prop({ type: Number, default: 0, min: 0 })
  assignedUsersCount?: number;

  @Prop({ required: true, type: [String], default: [] })
  permissionKeys: string[];

  @Prop({ required: true, default: false, immutable: true })
  isSystem: boolean;

  @Prop({
    required: true,
    enum: Object.values(RoleStatus),
    type: String,
    default: RoleStatus.ACTIVE,
  })
  status: RoleStatus;
}

export const RoleSchema = SchemaFactory.createForClass(Role);

// ⭐ Índices para queries frecuentes
RoleSchema.index({ status: 1 });
RoleSchema.index({ isSystem: 1 });
RoleSchema.index({ permissionKeys: 1 });
// Index compuesto para queries complejas
RoleSchema.index({ status: 1, isSystem: 1 });
```

---

## 3️⃣ Ejemplo: Adaptador MongoDB (Infraestructura)

**Archivo:** `src/modules/roles/infrastructure/adapters/mongodb-roles.repository.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role as RoleSchema } from '../schemas/role.schema';
import { RoleStatus } from '../../domain/role.enums';
import { Role } from '../../domain/role.entity';
import { IRolesRepository } from '../../domain/roles.repository';
import { v4 as uuidv4 } from 'uuid';

/**
 * RolesRepository - Adaptador de persistencia para roles en MongoDB
 * Implementa IRolesRepository
 * 
 * ✅ Inyecta modelo Mongoose
 * ✅ Mapea documentos a entidades
 * ✅ Maneja errores con try-catch
 */
@Injectable()
export class RolesRepository implements IRolesRepository {
  private readonly logger = new Logger(RolesRepository.name);

  // ⭐ @InjectModel - Inyecta el modelo Mongoose de NestJS
  constructor(@InjectModel(RoleSchema.name) private roleModel: Model<RoleSchema>) {}

  /**
   * Crear un nuevo rol
   */
  async create(role: Role): Promise<Role> {
    try {
      const roleDoc = new this.roleModel({
        ...role,
        id: role.id || uuidv4(),
      });
      const saved = await roleDoc.save();
      this.logger.log(`Role created: ${saved.id}`);
      return this.mapToEntity(saved);
    } catch (error: any) {
      this.logger.error(`Error creating role: ${error}`);
      throw error;
    }
  }

  /**
   * ⭐ Obtener todos los roles activos
   */
  async findAll(): Promise<Role[]> {
    try {
      const roles = await this.roleModel
        .find({ status: RoleStatus.ACTIVE })
        .sort({ createdAt: -1 })
        .exec();
      return roles.map((r) => this.mapToEntity(r));
    } catch (error: any) {
      this.logger.error(`Error fetching all roles: ${error}`);
      throw error;
    }
  }

  /**
   * ⭐ Obtener rol por ID
   */
  async findById(id: string): Promise<Role | null> {
    try {
      const role = await this.roleModel
        .findOne({ id, status: RoleStatus.ACTIVE })
        .exec();
      return role ? this.mapToEntity(role) : null;
    } catch (error: any) {
      this.logger.error(`Error finding role by id ${id}: ${error}`);
      throw error;
    }
  }

  /**
   * ⭐ Obtener rol por key (búsqueda normalizando)
   */
  async findByKey(key: string): Promise<Role | null> {
    try {
      const role = await this.roleModel
        .findOne({ 
          key: key.toLowerCase().trim(),
          status: RoleStatus.ACTIVE
        })
        .exec();
      return role ? this.mapToEntity(role) : null;
    } catch (error: any) {
      this.logger.error(`Error finding role by key ${key}: ${error}`);
      throw error;
    }
  }

  /**
   * Actualizar rol
   */
  async update(id: string, updates: Partial<Role>): Promise<Role | null> {
    try {
      const updated = await this.roleModel
        .findOneAndUpdate(
          { id },
          updates,
          { new: true, runValidators: true }
        )
        .exec();
      return updated ? this.mapToEntity(updated) : null;
    } catch (error: any) {
      this.logger.error(`Error updating role ${id}: ${error}`);
      throw error;
    }
  }

  /**
   * Deshabilitar rol (soft delete)
   */
  async disable(id: string): Promise<Role | null> {
    return this.update(id, { status: RoleStatus.DISABLED });
  }

  /**
   * Eliminar rol (hard delete)
   */
  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.roleModel
        .deleteOne({ id })
        .exec();
      return result.deletedCount > 0;
    } catch (error: any) {
      this.logger.error(`Error deleting role ${id}: ${error}`);
      throw error;
    }
  }

  /**
   * ⭐ Obtener roles del sistema
   */
  async findSystemRoles(): Promise<Role[]> {
    try {
      const roles = await this.roleModel
        .find({ isSystem: true, status: RoleStatus.ACTIVE })
        .exec();
      return roles.map((r) => this.mapToEntity(r));
    } catch (error: any) {
      this.logger.error(`Error fetching system roles: ${error}`);
      throw error;
    }
  }

  /**
   * ⭐ Mapea documento Mongoose a entidad de dominio
   */
  private mapToEntity(doc: RoleSchema): Role {
    return new Role({
      id: doc.id,
      key: doc.key,
      name: doc.name,
      icon: doc.icon,
      description: doc.description,
      permissionKeys: doc.permissionKeys,
      assignedUsersCount: doc.assignedUsersCount,
      status: doc.status,
      isSystem: doc.isSystem,
    });
  }
}
```

---

## 4️⃣ Ejemplo: Repositorio con Paginación y Result Pattern

**Archivo:** `src/modules/audit/infrastructure/adapters/audit.adapter.ts` (parcial)

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditEvent, AuditEventDocument } from '../../schemas/audit-event.schema';
import { Result } from 'src/common/types/result.type';
import { createPaginationMeta } from 'src/common/helpers';

export interface AuditError {
  name: string;
  message: string;
  code: string;
  statusCode: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  actor: { id: string; type: string };
  operation: string;
  resource: { type: string; id: string };
  status: 'success' | 'failure';
  requestId?: string;
  error?: { code: string; message: string };
}

@Injectable()
export class AuditAdapter {
  private readonly logger = new Logger(AuditAdapter.name);

  constructor(
    @InjectModel(AuditEvent.name)
    private auditModel: Model<AuditEventDocument>,
  ) {}

  /**
   * ⭐ Query con paginación y Result pattern
   * 
   * @param actorId - Filtrar por actor (opcional)
   * @param operationType - Filtrar por tipo de operación (opcional)
   * @param limit - Límite de documentos por página (default: 20)
   * @param offset - Offset para paginación (skip)
   * @returns Result con array de entries y total
   */
  async query(
    actorId?: string,
    operationType?: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<Result<{ entries: AuditLogEntry[]; total: number }, AuditError>> {
    const startTime = Date.now();

    try {
      // Construir query dinámicamente
      const query: any = {};
      if (actorId) query.actorKid = actorId;
      if (operationType) query.action = operationType;

      // ⭐ Ejecutar count y find en paralelo
      const [events, total] = await Promise.all([
        this.auditModel
          .find(query)
          .sort({ at: -1 })           // Ordenar por fecha descendente
          .limit(limit)                // Limitar resultados
          .skip(offset)                // Offset para paginación
          .lean()                      // Retornar objetos planos (más rápido)
          .exec(),
        this.auditModel.countDocuments(query).exec(),
      ]);

      // Mapear documentos a AuditLogEntry
      const entries: AuditLogEntry[] = events.map((evt: any) => ({
        id: evt._id?.toString() || 'unknown',
        timestamp: evt.at?.getTime() || Date.now(),
        actor: {
          id: evt.actorKid || evt.actorSub || 'unknown',
          type: 'user',
        },
        operation: evt.action,
        resource: {
          type: evt.resourceType,
          id: evt.resourceRef || 'unknown',
        },
        status: evt.result === 'allow' ? 'success' : 'failure',
        requestId: evt.requestId,
        error: evt.reason
          ? { code: 'AUDIT_ERROR', message: evt.reason }
          : undefined,
      }));

      this.logger.log(
        `Query completed in ${Date.now() - startTime}ms. Found ${total} entries`,
      );

      // ⭐ Retornar Result.ok con los datos
      return Result.ok({ entries, total });
    } catch (error: any) {
      const err = error as Error;
      this.logger.error(`Query failed: ${err.message}`, err.stack);

      // ⭐ Retornar Result.fail con error estructurado
      const auditError: AuditError = {
        name: 'AuditError',
        message: err.message,
        code: 'AUDIT_QUERY_FAILED',
        statusCode: 500,
      };

      return Result.fail(auditError);
    }
  }

  /**
   * ⭐ findById con Result pattern
   */
  async getEntry(entryId: string): Promise<Result<AuditLogEntry, AuditError>> {
    try {
      const evt = await this.auditModel.findById(entryId).lean().exec();

      if (!evt) {
        const err: AuditError = {
          name: 'AuditError',
          message: `Entry not found: ${entryId}`,
          code: 'AUDIT_ENTRY_NOT_FOUND',
          statusCode: 404,
        };
        return Result.fail(err);
      }

      const entry: AuditLogEntry = {
        id: evt._id?.toString() || entryId,
        timestamp: evt.at?.getTime() || Date.now(),
        actor: {
          id: evt.actorKid || evt.actorSub || 'unknown',
          type: 'user',
        },
        operation: evt.action,
        resource: {
          type: evt.resourceType,
          id: evt.resourceRef || 'unknown',
        },
        status: evt.result === 'allow' ? 'success' : 'failure',
        requestId: evt.requestId,
      };

      return Result.ok(entry);
    } catch (error: any) {
      const err = error as Error;
      this.logger.error(`Get entry failed: ${err.message}`);

      return Result.fail({
        name: 'AuditError',
        message: err.message,
        code: 'AUDIT_GET_FAILED',
        statusCode: 500,
      });
    }
  }
}
```

---

## 5️⃣ Helpers: Build Pagination Meta

**Archivo:** `src/common/helpers/build-pagination-meta.ts`

```typescript
import { PaginationMeta } from '../types/common.types';

/**
 * ⭐ Crea el objeto de metadatos para la respuesta paginada
 * 
 * @param total - Total de documentos en la colección
 * @param page - Número de página (1-indexed)
 * @param limit - Límite de documentos por página
 * @returns PaginationMeta con info de paginación
 */
export function createPaginationMeta(
  total: number,
  page: number = 1,
  limit: number = 10,
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);

  const currentPage = Number(page);
  const currentLimit = Number(limit);

  return {
    page: currentPage,
    limit: currentLimit,
    total,
    totalPages,
    hasMore: currentPage < totalPages,
    nextPage: currentPage < totalPages ? currentPage + 1 : null,
    prevPage: currentPage > 1 ? currentPage - 1 : null,
  };
}
```

---

## 6️⃣ Result Pattern

**Archivo:** `src/common/types/result.type.ts`

```typescript
/**
 * ⭐ Generic Result type para manejo funcional de errores
 * Evita excepciones y proporciona un patrón predecible para éxito/fracaso
 * 
 * Uso:
 * - Result.ok(data) - Resultado exitoso
 * - Result.fail(error) - Resultado con fallo
 * - result.isSuccess / result.isFailure - Verificar estado
 * - result.getValue() / result.getError() - Obtener valor o error
 */
export class Result<T = void, E = Error> {
  private constructor(
    private readonly _isSuccess: boolean,
    private readonly _value?: T,
    private readonly _error?: E,
  ) {}

  static ok<T = void, E = Error>(value?: T): Result<T, E> {
    return new Result<T, E>(true, value);
  }

  static fail<T = void, E = Error>(error: E): Result<T, E> {
    return new Result<T, E>(false, undefined, error);
  }

  get isSuccess(): boolean {
    return this._isSuccess;
  }

  get isFailure(): boolean {
    return !this._isSuccess;
  }

  getValue(): T {
    if (!this._isSuccess) {
      throw new Error('Cannot get value from failed result');
    }
    return this._value!;
  }

  getError(): E {
    if (this._isSuccess) {
      throw new Error('Cannot get error from successful result');
    }
    return this._error!;
  }

  // Mapeo funcional
  map<U>(fn: (value: T) => U): Result<U, E> {
    if (this.isFailure) {
      return Result.fail<U, E>(this._error!);
    }
    return Result.ok<U, E>(fn(this._value!));
  }

  // Flat map para encadenamiento
  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    if (this.isFailure) {
      return Result.fail<U, E>(this._error!);
    }
    return fn(this._value!);
  }
}
```

---

## 7️⃣ Ejemplo Completo en Controlador

```typescript
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditAdapter } from './audit.adapter';
import { createPaginationMeta } from 'src/common/helpers';

@Controller('audit')
export class AuditController {
  constructor(private auditService: AuditAdapter) {}

  /**
   * GET /audit/logs?page=1&limit=20&actorId=user123
   */
  @Get('logs')
  async getLogs(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('actorId') actorId?: string,
  ) {
    const pageNum = page ? Number(page) : 1;
    const limitNum = limit ? Number(limit) : 20;
    const offset = (pageNum - 1) * limitNum;

    // ⭐ Llamar al repositorio que retorna Result
    const result = await this.auditService.query(
      actorId,
      undefined,
      limitNum,
      offset,
    );

    // ⭐ Manejar el Result pattern
    if (result.isFailure) {
      const error = result.getError();
      throw new HttpException(error.message, error.statusCode);
    }

    const { entries, total } = result.getValue();

    return {
      data: entries,
      pagination: createPaginationMeta(total, pageNum, limitNum),
    };
  }
}
```

---

## 📋 Resumen del Patrón

| Aspecto | Patrón |
|--------|--------|
| **Inyección** | `@InjectModel(SchemaClass.name)` |
| **Queries Básicas** | `findById()`, `findAll()`, `findByKey()` |
| **Paginación** | `limit(n).skip(offset)` + `createPaginationMeta()` |
| **Manejo de Errores** | `Result<T, E>` pattern (`isSuccess`, `getValue()`, `getError()`) |
| **Índices** | `Schema.index()` en el schema |
| **Mapping** | `mapToEntity()` para Mongoose → Domain |
| **Performance** | `lean()` para queries read-only, `Promise.all()` en paralelo |

---

## 🎯 Key Takeaways

✅ **Interfaces en Domain** - Define contratos independientes de BD  
✅ **Adapters en Infrastructure** - Implementa con MongoDB específico  
✅ **Result Pattern** - Evita excepciones innecesarias  
✅ **Índices en Schema** - Optimiza queries frecuentes  
✅ **Mapeo de Entidades** - Mantiene separación entre persistencia y lógica  
✅ **Paginación Helpers** - Reutilizable en toda la app  
