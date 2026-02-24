
---
mode: agent
tools: ['codebase', 'editing', 'terminal']
description: 'Genera un módulo completo NestJS con arquitectura hexagonal siguiendo estándares del proyecto'
---

# Generador de Módulos NestJS - Arquitectura Hexagonal

## Contexto del Proyecto

Este proyecto utiliza NestJS con una arquitectura hexagonal (Ports & Adapters) para garantizar una separación clara entre la lógica de negocio y las dependencias externas. El ORM utilizado es Mongoose con MongoDB, y la documentación de la API se realiza tanto con GraphQL como con Swagger. La validación de datos se maneja con class-validator, y el código debe estar en inglés mientras que la documentación debe estar en español.

- **Framework**: NestJS con TypeScript estricto
- **Arquitectura**: Hexagonal (Ports & Adapters)
- **ORM**: Mongoose con MongoDB
- **Documentación API**: GraphQL + Swagger
- **Validación**: class-validator
- **Idioma código**: Inglés (clases, propiedades, métodos)
- **Idioma documentación**: Español (JSDoc, descripciones Swagger/GraphQL)

### Patrones y Servicios Transversales Obligatorios

Todos los módulos generados **DEBEN** utilizar obligatoriamente los siguientes patrones y servicios del proyecto:

| Patrón / Servicio | Ruta | Propósito |
|---|---|---|
| `ApiResponse<T>` | `src/common/types/api-response.type.ts` | Patrón Result para todas las respuestas de servicios |
| `QueryParams<F>` | `src/common/types/common.types.ts` | Tipado unificado de parámetros de consulta con filtros genéricos |
| `PaginationMeta` | `src/common/types/common.types.ts` | Metadatos de paginación incluidos en `meta` de `ApiResponse` |
| `buildMongoQuery` | `src/common/helpers/build-mongo-query.ts` | Constructor dinámico de filtros, paginación y ordenamiento para MongoDB |
| `createPaginationMeta` | `src/common/helpers/build-pagination-meta.ts` | Crea el objeto `PaginationMeta` a partir de total/page/limit |
| `AbstractSchema` | `src/common/schemas/abstract.schema.ts` | Schema base con `id` (UUID), `userId`, `createdAt`, `updatedAt` |
| `AuditService` | `src/modules/audit/application/audit.service.ts` | Auditoría de todas las operaciones CRUD (fire-and-forget) |
| `CacheService` | `src/common/cache/cache.service.ts` | Caché Redis para operaciones de lectura frecuentes |
| `HttpService` | `src/common/http/http.service.ts` | Wrapper Axios para llamadas HTTP externas |
| `AsyncContextService` | `src/common/context/async-context.service.ts` | Extrae `requestId` y `actorId` del contexto de la petición |
| `MODULES` / `ACTIONS` | `src/modules/modules/domain/constants/module.constants.ts` | Constantes para claves de módulos y acciones |
| `SYSTEM_PERMISSIONS` | `src/modules/roles/seeds/system-permissions.ts` | Catálogo inicial de permisos del sistema |
| `SYSTEM_ROLES` | `src/modules/roles/seeds/system-roles.ts` | Roles del sistema con sus permisos asignados |

## Estructura de Carpetas Requerida

```text
src/modules/{module-name}/
├── application/
│   ├── dto/
│   │   ├── create-{entity}.dto.ts
│   │   ├── update-{entity}.dto.ts
│   │   └── index.ts
│   ├── ports/
│   │   ├── {entity}.repository.port.ts
│   │   └── index.ts
│   └── services/
│       ├── {entity}.service.ts
│       └── index.ts
├── domain/
│   ├── entities/
│   │   ├── {entity}.entity.ts
│   │   └── index.ts
│   └── enums/
│       └── {entity}-status.enum.ts (si aplica)
├── infrastructure/
│   ├── persistence/
│   │   ├── mongoose/
│   │   │   ├── schemas/
│   │   │   │   ├── {entity}.schema.ts
│   │   │   │   └── index.ts
│   │   │   ├── repositories/
│   │   │   │   ├── {entity}.repository.ts
│   │   │   │   └── index.ts
│   │   │   └── mappers/
│   │   │       ├── {entity}.mapper.ts
│   │   │       └── index.ts
│   │   └── index.ts
│   └── http/
│       ├── controllers/
│       │   ├── {entity}.controller.ts
│       │   └── index.ts
│       ├── resolvers/
│       │   ├── {entity}.resolver.ts
│       │   └── index.ts
│       └── index.ts
├── {module-name}.module.ts
└── index.ts
```

## Instrucciones de Generación

Cuando el usuario proporcione:

- **MODULE_NAME**: Nombre del módulo (ej: "users", "orders")
- **ENTITY_NAME**: Nombre de la entidad principal en singular (ej: "User", "Order")
- **ENTITY_PROPERTIES**: Lista de propiedades con tipo, validaciones y relaciones
- **EXTRA_METHODS**: Métodos de negocio adicionales al CRUD básico

El generador debe crear:

1. **Schema de Mongoose** en [src/modules/{module-name}/infrastructure/persistence/mongoose/schemas/{entity}.schema.ts](src/modules/{module-name}/infrastructure/persistence/mongoose/schemas/{entity}.schema.ts):

   - Definir propiedades con `@Prop()`, tipos y validaciones
   - Configurar índices para optimización de consultas
   - Implementar virtuales para relaciones (poblado directo e inverso)
   - Hooks para lógica pre/post guardado o eliminación
   - Timestamps automáticos y soft delete

### 1. Esquema Mongoose ({entity}.schema.ts)

**Requisitos obligatorios:**
- Usar `HydratedDocument<T>` para tipado del documento
- **OBLIGATORIO**: Extender `AbstractSchema` de `src/common/schemas/abstract.schema.ts` — provee `id` (UUID v4, único, indexado), `userId`, `createdAt`, `updatedAt` sin necesidad de redefinirlos
- Proteger campos sensibles con `select: false` (ej: password, pin)
- Utilizar el campo `id` (heredado de `AbstractSchema`) como identificador público para referencias entre documentos en lugar de `_id`
- Definir índices estratégicos: simples, compuestos, sparse/partial según el caso
- Completar el decorador `@Schema()` con `timestamps: true` y `collection` explícita
- Definir todas las propiedades propias con `@Prop()` incluyendo tipo, validaciones y opciones
- Implementar virtuales para relaciones directas e inversas (localField apunta a `id`, no a `_id`)
- Configurar hooks según lógica de negocio

**Ejemplo de estructura:**
```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { AbstractSchema } from 'src/common/schemas/abstract.schema';

export type ProductDocument = HydratedDocument<Product>;

/**
 * Esquema Mongoose para Producto.
 * Extiende AbstractSchema: id (UUID), userId, createdAt, updatedAt
 */
@Schema({ timestamps: true, collection: 'products' })
export class Product extends AbstractSchema {
  @Prop({ type: String, required: true, index: true })
  name: string;

  @Prop({ type: String, required: true, unique: true, index: true })
  sku: string;

  @Prop({ type: String, ref: 'Category', required: true, index: true })
  categoryId: string;  // Referencia por `id` (UUID) — NO por _id

  @Prop({ type: Number, required: true, min: 0 })
  price: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  stock: number;

  @Prop({ type: Boolean, default: true, index: true })
  isActive: boolean;

  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

// Índices compuestos para optimización
ProductSchema.index({ name: 1, isActive: 1 });
ProductSchema.index({ categoryId: 1, isActive: 1 });
ProductSchema.index({ createdAt: -1 });

// Virtual para relación directa (siempre usar foreignField: 'id' para UUIDs)
ProductSchema.virtual('category', {
  ref: 'Category',
  localField: 'categoryId',
  foreignField: 'id',
  justOne: true,
});

// Virtual inverso
ProductSchema.virtual('orderItems', {
  ref: 'OrderItem',
  localField: 'id',         // Campo 'id' del AbstractSchema
  foreignField: 'productId',
  justOne: false,
});

// Hook pre-save: normalización
ProductSchema.pre('save', function (next) {
  if (this.name) this.name = this.name.trim();
  next();
});

export { ProductSchema };
```

### 2. DTOs con Validación y Documentación

**Create{Entity}Dto:**
- Todos los campos con `@ApiProperty()` (Swagger) y `@Field()` (GraphQL)
- Descripciones en español detalladas
- Validaciones class-validator completas
- Ejemplos con `@ApiProperty({ example: '...' })`

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { Field, InputType } from '@nestjs/graphql';
import { IsString, IsEmail, IsOptional, IsEnum, Length, Matches } from 'class-validator';

@InputType()
export class CreateUserDto {
  /**
   * Correo electrónico único del usuario
   * @example "usuario@empresa.com"
   */
  @ApiProperty({
    description: 'Correo electrónico único del usuario para autenticación y notificaciones',
    example: 'usuario@empresa.com',
    required: true,
    uniqueItems: true
  })
  @Field(() => String, { 
    description: 'Correo electrónico único del usuario para autenticación y notificaciones' 
  })
  @IsEmail({}, { message: 'El correo electrónico debe tener un formato válido' })
  @IsString({ message: 'El correo debe ser una cadena de texto' })
  email: string;

  /**
   * Nombre completo del usuario
   * @example "Juan Pérez García"
   */
  @ApiProperty({
    description: 'Nombre completo del usuario incluyendo nombre y apellidos',
    example: 'Juan Pérez García',
    minLength: 2,
    maxLength: 100,
    required: true
  })
  @Field(() => String, { 
    description: 'Nombre completo del usuario incluyendo nombre y apellidos',
    nullable: false
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @Length(2, 100, { message: 'El nombre debe tener entre 2 y 100 caracteres' })
  @Matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, { message: 'El nombre solo puede contener letras y espacios' })
  fullName: string;
}
```

### 3. Entidad de Dominio

- Clase pura sin dependencias de infraestructura
- Lógica de negocio encapsulada
- Inmutabilidad donde sea posible

### 4. Puerto del Repositorio (Contrato)

El puerto define el contrato que la capa de aplicación conoce. El repositorio recibe el `mongoFilter` y `options` pre-construidos por `buildMongoQuery` en el servicio — **no** recibe `QueryParams` directamente.

```typescript
import type { QueryFilter } from 'mongoose';
import type { ProductEntity } from '../entities/product.entity';

export interface IProductRepository {
  /**
   * Crear un nuevo producto en la base de datos.
   */
  create(payload: Partial<ProductDocument>): Promise<Product>;

  /**
   * Buscar producto por su ID público (UUID del AbstractSchema).
   */
  findById(id: string): Promise<Product | null>;

  /**
   * Listar productos con filtros, paginación y ordenamiento.
   * El filtro ya viene construido por buildMongoQuery en la capa de servicio.
   */
  findAll(
    filter: QueryFilter<Product>,
    options: { skip: number; limit: number; sort?: Record<string, number> },
  ): Promise<{ data: Product[]; total: number }>;

  /**
   * Actualizar producto por ID. Retorna null si no existe.
   */
  update(id: string, payload: Partial<ProductDocument>): Promise<Product | null>;

  /**
   * Eliminación lógica (soft delete) — marca como inactivo.
   */
  softDelete(id: string): Promise<boolean>;
}
```

### 5. Servicio de Aplicación

El servicio orquesta casos de uso y **DEBE** cumplir estas reglas sin excepción:

- **Todos** los métodos públicos retornan `Promise<ApiResponse<T>>` usando `ApiResponse.ok` / `ApiResponse.fail`
- **Todas** las operaciones (create, read, update, delete, list) registran auditoría con `AuditService` (fire-and-forget)
- **Las consultas de lista** usan `buildMongoQuery` + `createPaginationMeta` y devuelven `PaginationMeta` en `meta`
- **Las lecturas frecuentes** pueden usar `CacheService` — obligatorio para endpoints que no cambian con frecuencia
- **NO** contiene lógica de negocio compleja — va en el dominio
- Extraer `requestId` y `actorId` de `AsyncContextService` al inicio de cada método

**Ejemplo de estructura completa:**
```typescript
import { Injectable, Logger, HttpStatus } from '@nestjs/common';

import { ProductsRepository } from '../infrastructure/adapters/products.repository';
import { AsyncContextService } from 'src/common/context/async-context.service';
import { AuditService } from 'src/modules/audit/application/audit.service';
import { CacheService } from 'src/common/cache/cache.service';

import { ApiResponse } from 'src/common/types/api-response.type';
import { QueryParams, PaginationMeta } from 'src/common/types/common.types';
import { buildMongoQuery } from 'src/common/helpers/build-mongo-query';
import { createPaginationMeta } from 'src/common/helpers/build-pagination-meta';

import { CreateProductDto, UpdateProductDto } from '../dto';
import type { ProductDTO } from '../domain/ports/products.port';

/**
 * Servicio de gestión de productos.
 *
 * Implementa:
 * - CRUD con patrón ApiResponse (Result Pattern)
 * - Auditoría end-to-end en todas las operaciones
 * - Paginación y filtros dinámicos con buildMongoQuery
 * - Caché Redis para lecturas frecuentes
 */
@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  private readonly CACHE_TTL = 300; // 5 minutos

  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly asyncContextService: AsyncContextService,
    private readonly auditService: AuditService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * ① CREATE — Crear producto
   */
  async create(dto: CreateProductDto): Promise<ApiResponse<ProductDTO>> {
    const requestId = this.asyncContextService.getRequestId();
    const actorId = this.asyncContextService.getActorId()!;
    try {
      const product = await this.productsRepository.create({ ...dto, userId: actorId });

      // Auditoría: operación exitosa
      this.auditService.logAllow('PRODUCT_CREATED', 'product', actorId, {
        module: 'products',
        severity: 'MEDIUM',
        tags: ['product', 'creation'],
        changes: { after: { id: product.id, name: product.name } },
      });

      return ApiResponse.ok<ProductDTO>(HttpStatus.CREATED, this.mapToDTO(product), 'Producto creado exitosamente', { requestId });
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.auditService.logError('PRODUCT_CREATE_FAILED', 'product', actorId, error, {
        module: 'products',
        severity: 'HIGH',
        tags: ['product', 'creation', 'error'],
      });
      return ApiResponse.fail<ProductDTO>(HttpStatus.INTERNAL_SERVER_ERROR, errorMsg, 'Error al crear producto', { requestId });
    }
  }

  /**
   * ② READ por ID — con caché
   */
  async findById(id: string): Promise<ApiResponse<ProductDTO | null>> {
    const requestId = this.asyncContextService.getRequestId();
    const actorId = this.asyncContextService.getActorId()!;
    try {
      // Intentar desde caché primero
      const cached = await this.cacheService.getByKey<ProductDTO>(`products:${id}`);
      if (cached) {
        return ApiResponse.ok<ProductDTO>(HttpStatus.OK, cached, undefined, { requestId, fromCache: true });
      }

      const product = await this.productsRepository.findById(id);
      if (!product) {
        this.auditService.logDeny('PRODUCT_READ_NOT_FOUND', 'product', actorId, 'Product not found', {
          module: 'products', severity: 'LOW',
        });
        return ApiResponse.ok<ProductDTO | null>(HttpStatus.OK, null, undefined, { requestId });
      }

      const dto = this.mapToDTO(product);
      await this.cacheService.set(`products:${id}`, dto, this.CACHE_TTL);

      this.auditService.logAllow('PRODUCT_READ', 'product', actorId, {
        module: 'products', severity: 'LOW', tags: ['product', 'read'],
      });

      return ApiResponse.ok<ProductDTO>(HttpStatus.OK, dto, undefined, { requestId });
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.auditService.logError('PRODUCT_READ_FAILED', 'product', actorId, error, { module: 'products', severity: 'MEDIUM' });
      return ApiResponse.fail<ProductDTO>(HttpStatus.INTERNAL_SERVER_ERROR, errorMsg, 'Error al obtener producto', { requestId });
    }
  }

  /**
   * ③ LIST — con QueryParams, buildMongoQuery y PaginationMeta en meta
   */
  async list(queryParams: QueryParams): Promise<ApiResponse<ProductDTO[]>> {
    const requestId = this.asyncContextService.getRequestId();
    const actorId = this.asyncContextService.getActorId()!;
    try {
      // Campos permitidos para búsqueda global (regex)
      const searchFields = ['name', 'sku'];

      // Construye mongoFilter + options (skip, limit, sort) desde QueryParams
      const { mongoFilter, options } = buildMongoQuery(queryParams, searchFields);

      const { data: products, total } = await this.productsRepository.findAll(mongoFilter, options);

      const dtos = products.map((p) => this.mapToDTO(p));
      const paginationMeta: PaginationMeta = createPaginationMeta(total, queryParams.page, queryParams.limit);

      this.auditService.logAllow('PRODUCTS_LIST', 'products', actorId, {
        module: 'products', severity: 'LOW', tags: ['products', 'list'],
        response: { count: dtos.length },
      });

      // PaginationMeta se incluye dentro del campo `meta` de ApiResponse
      return ApiResponse.ok<ProductDTO[]>(HttpStatus.OK, dtos, undefined, {
        requestId,
        pagination: paginationMeta,
      });
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.auditService.logError('PRODUCTS_LIST_FAILED', 'products', 'all', error, { module: 'products', severity: 'MEDIUM' });
      return ApiResponse.fail<ProductDTO[]>(HttpStatus.INTERNAL_SERVER_ERROR, errorMsg, 'Error al listar productos', { requestId });
    }
  }

  /**
   * ④ UPDATE
   */
  async update(id: string, dto: UpdateProductDto): Promise<ApiResponse<ProductDTO>> {
    const requestId = this.asyncContextService.getRequestId();
    const actorId = this.asyncContextService.getActorId()!;
    try {
      const before = await this.productsRepository.findById(id);
      if (!before) {
        this.auditService.logDeny('PRODUCT_UPDATE_NOT_FOUND', 'product', actorId, 'Product not found', { module: 'products', severity: 'LOW' });
        return ApiResponse.fail<ProductDTO>(HttpStatus.NOT_FOUND, 'Producto no encontrado', undefined, { requestId });
      }

      const updated = await this.productsRepository.update(id, dto);
      await this.cacheService.delete(`products:${id}`); // Invalidar caché

      this.auditService.logAllow('PRODUCT_UPDATED', 'product', actorId, {
        module: 'products', severity: 'MEDIUM', tags: ['product', 'update'],
        changes: { before: { name: before.name }, after: { name: updated!.name } },
      });

      return ApiResponse.ok<ProductDTO>(HttpStatus.OK, this.mapToDTO(updated!), 'Producto actualizado exitosamente', { requestId });
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.auditService.logError('PRODUCT_UPDATE_FAILED', 'product', actorId, error, { module: 'products', severity: 'HIGH' });
      return ApiResponse.fail<ProductDTO>(HttpStatus.INTERNAL_SERVER_ERROR, errorMsg, 'Error al actualizar producto', { requestId });
    }
  }

  /**
   * ⑤ DELETE (soft)
   */
  async remove(id: string): Promise<ApiResponse<void>> {
    const requestId = this.asyncContextService.getRequestId();
    const actorId = this.asyncContextService.getActorId()!;
    try {
      const deleted = await this.productsRepository.softDelete(id);
      if (!deleted) {
        return ApiResponse.fail<void>(HttpStatus.NOT_FOUND, 'Producto no encontrado', undefined, { requestId });
      }
      await this.cacheService.delete(`products:${id}`);

      this.auditService.logAllow('PRODUCT_DELETED', 'product', actorId, {
        module: 'products', severity: 'HIGH', tags: ['product', 'delete'],
      });

      return ApiResponse.ok<void>(HttpStatus.OK, undefined, 'Producto eliminado exitosamente', { requestId });
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.auditService.logError('PRODUCT_DELETE_FAILED', 'product', actorId, error, { module: 'products', severity: 'HIGH' });
      return ApiResponse.fail<void>(HttpStatus.INTERNAL_SERVER_ERROR, errorMsg, 'Error al eliminar producto', { requestId });
    }
  }

  private mapToDTO(product: Product): ProductDTO {
    return { id: product.id, name: product.name, sku: product.sku, price: product.price, stock: product.stock };
  }
}
```

### 6. Adaptadores de Infraestructura

**Repositorio MongoDB:**
- Implementa el puerto definido
- Usa el Schema de Mongoose con `@InjectModel`
- Recibe `filter` y `options` ya construidos por `buildMongoQuery` en el servicio
- Ejecuta consultas en paralelo con `Promise.all` (datos + total) para eficiencia
- Manejo de errores específicos de MongoDB

**Ejemplo de repositorio:**
```typescript
@Injectable()
export class ProductsRepository implements IProductRepository {
  constructor(@InjectModel(Product.name) private readonly model: Model<ProductDocument>) {}

  async create(payload: Partial<ProductDocument>): Promise<Product> {
    return this.model.create(payload);
  }

  async findById(id: string): Promise<Product | null> {
    return this.model.findOne({ id }).exec();
  }

  async findAll(
    filter: QueryFilter<Product>,
    options: { skip: number; limit: number; sort?: Record<string, number> },
  ): Promise<{ data: Product[]; total: number }> {
    const [data, total] = await Promise.all([
      this.model.find(filter as any)
        .skip(options.skip)
        .limit(options.limit)
        .sort((options.sort || { createdAt: -1 }) as any)
        .exec(),
      this.model.countDocuments(filter as any),
    ]);
    return { data, total };
  }

  async update(id: string, payload: Partial<ProductDocument>): Promise<Product | null> {
    return this.model.findOneAndUpdate({ id }, payload, { new: true }).exec();
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.model.findOneAndUpdate({ id }, { isActive: false }).exec();
    return !!result;
  }
}
```

**Mapper:**
- `toEntity(document): Entity` — para cuando se usa mapper explícito
- `toDocument(entity): Partial<Document>` — para hidratación

**Uso de `HttpService` (llamadas HTTP externas):**
Cuando el módulo necesita llamar a servicios externos, usar obligatoriamente el `HttpService` del proyecto en lugar de Axios directamente:

```typescript
import { HttpService } from 'src/common/http/http.service';

@Injectable()
export class ExternalPaymentAdapter {
  constructor(private readonly httpService: HttpService) {}

  async processPayment(payload: PaymentPayload): Promise<PaymentResult> {
    return this.httpService.post<PaymentResult>(
      'https://api.payment-gateway.com/process',
      payload,
      { headers: { Authorization: `Bearer ${this.apiKey}` } },
    );
  }
}
```

### 7. Controlador HTTP y Resolver GraphQL

**Controlador:**
- Swagger tags y descripciones en español
- Decoradores de autorización (`@UseGuards(JwtAuthGuard)`) y `@ApiBearerAuth`
- El controlador **no** maneja lógica de negocio; simplemente llama al servicio y devuelve el `ApiResponse<T>` directamente
- Soportar `@Query()` con `QueryParams` en los endpoints de lista
- Status codes apropiados con `@HttpCode()`

**Ejemplo parcial de controlador con QueryParams:**
```typescript
@ApiTags('Products')
@ApiBearerAuth('Bearer Token')
@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear producto', description: 'Crea un nuevo producto en el inventario' })
  create(@Body() dto: CreateProductDto): Promise<ApiResponse<ProductDTO>> {
    return this.productsService.create(dto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Listar productos', description: 'Lista todos los productos con paginación y filtros' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  list(@Query() query: QueryParams): Promise<ApiResponse<ProductDTO[]>> {
    return this.productsService.list(query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  findOne(@Param('id') id: string): Promise<ApiResponse<ProductDTO | null>> {
    return this.productsService.findById(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  update(@Param('id') id: string, @Body() dto: UpdateProductDto): Promise<ApiResponse<ProductDTO>> {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string): Promise<ApiResponse<void>> {
    return this.productsService.remove(id);
  }
}
```

**Resolver GraphQL:**
- Queries y mutations con descripciones en español
- Args con validación usando `@Args()` con DTOs decorados con `@InputType()`
- `@ResolveField` para relaciones virtuales

### 8. Registro de Módulo, Permisos y Roles del Sistema

**OBLIGATORIO** al crear cualquier módulo nuevo: registrar la clave del módulo y sus permisos en los archivos de constantes del sistema.

#### 8.1 — Agregar la clave del módulo

En **`src/modules/modules/domain/constants/module.constants.ts`**, añadir la nueva clave al objeto `MODULES`:

```typescript
export const MODULES = {
  // ... (entradas existentes) ...

  // Módulo nuevo
  PRODUCTS: 'products',   // ← Agregar aquí en la categoría semántica correspondiente
} as const;
```

#### 8.2 — Registrar permisos del módulo

En **`src/modules/roles/seeds/system-permissions.ts`**, agregar **todos** los permisos del módulo usando las acciones del catálogo `ACTIONS`:

```typescript
// ===== PRODUCTS =====
{
  key: `${MODULES.PRODUCTS}.${ACTIONS.CREATE}`,
  description: 'Crear productos',
  resource: MODULES.PRODUCTS,
  action: ACTIONS.CREATE,
},
{
  key: `${MODULES.PRODUCTS}.${ACTIONS.READ}`,
  description: 'Leer productos',
  resource: MODULES.PRODUCTS,
  action: ACTIONS.READ,
},
{
  key: `${MODULES.PRODUCTS}.${ACTIONS.UPDATE}`,
  description: 'Actualizar productos',
  resource: MODULES.PRODUCTS,
  action: ACTIONS.UPDATE,
},
{
  key: `${MODULES.PRODUCTS}.${ACTIONS.DELETE}`,
  description: 'Eliminar productos',
  resource: MODULES.PRODUCTS,
  action: ACTIONS.DELETE,
},
{
  key: `${MODULES.PRODUCTS}.${ACTIONS.EXPORT}`,
  description: 'Exportar datos de productos',
  resource: MODULES.PRODUCTS,
  action: ACTIONS.EXPORT,
},
// Agregar acciones personalizadas según EXTRA_METHODS (ej: ACTIONS.ENABLE, ACTIONS.DISABLE)
```

> **Nota de acciones personalizadas**: Si el módulo define métodos extra no cubiertos por `ACTIONS`, evaluarlo:
> - Si la acción aplica globalmente → agregar a `ACTIONS` en module.constants.ts
> - Si es específica del módulo → definir como constante local y documentarlo

#### 8.3 — Asignar permisos a roles existentes

En **`src/modules/roles/seeds/system-roles.ts`**, actualizar los roles del sistema que deben tener acceso al nuevo módulo:

```typescript
// En el rol 'admin' o el rol de negocio correspondiente:
{
  key: 'inventory_manager',
  name: 'Gestor de Inventario',
  description: 'Gestión completa del módulo de productos',
  permissionKeys: [
    // Acceso completo al nuevo módulo
    `${MODULES.PRODUCTS}.*`,
    // Si solo lectura en otro módulo:
    `${MODULES.CATEGORIES}.read`,
  ],
  status: 'active',
  isSystem: true,
},
```

> **Convención de wildcards**:
> - `*` — acceso global total (solo super_admin / admin)
> - `module.*` — acceso completo a un módulo específico
> - `module.action` — permiso exacto para una acción

## Reglas Estrictas

1. **Nomenclatura**: 
   - Clases/Interfaces: PascalCase en inglés (`UserRepository`, `OrderService`)
   - Propiedades: camelCase en inglés (`createdAt`, `profileId`)
   - Archivos: kebab-case (`user-repository.ts`, `create-user.dto.ts`)

2. **Documentación JSDoc**:
   - Toda clase pública debe tener JSDoc en español
   - Describir propósito, parámetros y retornos
   - Incluir ejemplos donde sea útil

3. **Decoradores obligatorios**:
   - `@ApiProperty()` en todos los campos de DTOs (descripción en español)
   - `@Field()` en todos los campos de GraphQL (descripción en español)
   - `@Schema()` en clases de Mongoose
   - `@Prop()` en todas las propiedades propias del schema (no en las heredadas de `AbstractSchema`)

4. **AbstractSchema — OBLIGATORIO**:
   - Todos los schemas de Mongoose **DEBEN** extender `AbstractSchema`
   - **NO** redefinir `id`, `userId`, `createdAt`, `updatedAt` — ya vienen del base
   - Las relaciones entre documentos usan `foreignField: 'id'` (UUID de AbstractSchema), no `_id`

5. **Patrón Result (ApiResponse) — OBLIGATORIO**:
   - **TODOS** los métodos públicos del servicio retornan `Promise<ApiResponse<T>>`
   - Éxito: `ApiResponse.ok<T>(statusCode, data, message, meta)`
   - Error: `ApiResponse.fail<T>(statusCode, errors, message, meta)`
   - El campo `meta` incluye siempre `{ requestId }` y `{ pagination: PaginationMeta }` en consultas de lista

6. **QueryParams + buildMongoQuery — OBLIGATORIO en consultas de lista**:
   - Los endpoints de lista reciben `@Query() query: QueryParams` en el controlador
   - El servicio llama a `buildMongoQuery(queryParams, searchFields, ranges?)` para construir `mongoFilter` y `options`
   - La paginación se construye con `createPaginationMeta(total, page, limit)` y se incluye en `meta.pagination`
   - El repositorio acepta `filter: QueryFilter<T>` y `options: { skip, limit, sort }` — no recibe `QueryParams`

7. **AuditService — OBLIGATORIO en todas las operaciones**:
   - `logAllow(action, resource, actorId, options)` en operaciones exitosas
   - `logDeny(action, resource, actorId, reason, options)` cuando se niega el acceso (not found, sin permisos)
   - `logError(action, resource, actorId, error, options)` en el bloque `catch`
   - Siempre fire-and-forget (sin `await`)
   - Severidad mínima recomendada: `LOW` para reads, `MEDIUM` para updates, `HIGH` para creates/deletes/errores

8. **CacheService — Recomendado para lecturas**:
   - Cache key con prefijo del módulo: `products:${id}`, `products:list:${hash}`
   - Invalidar caché en update y delete: `this.cacheService.delete(key)`
   - TTL adecuado al dominio (300s por defecto para datos de configuración)

9. **HttpService — OBLIGATORIO para llamadas externas**:
   - Usar `HttpService` del proyecto (`src/common/http/http.service.ts`) en lugar de Axios directamente
   - Nunca importar o instanciar `HttpModule` de `@nestjs/axios` de forma independiente

10. **Optimización MongoDB**:
    - Índices simples para campos de búsqueda frecuente
    - Índices compuestos para queries comunes
    - Índices de texto para búsquedas full-text
    - Sparse o partial índices donde aplique

11. **Hooks requeridos**:
    - `pre('save')` para normalización de datos, hashing de campos sensibles
    - `pre('find')` / `pre('findOne')` para filtrar soft-deleted si aplica
    - `post('remove')` para cleanup de relaciones si aplica

12. **Manejo de Relaciones**:
    - Usar `string` (UUID de AbstractSchema) para referencias, no `Types.ObjectId`
    - Virtuales con `foreignField: 'id'` para acceder a documentos relacionados
    - Poblado selectivo para evitar over-fetching

13. **Registro de Módulo y Permisos — OBLIGATORIO al crear módulo nuevo**:
    - Agregar clave al objeto `MODULES` en `module.constants.ts`
    - Registrar todos los permisos en `SYSTEM_PERMISSIONS` en `system-permissions.ts`
    - Asignar permisos a los roles del sistema apropiados en `system-roles.ts`
    - Si se necesita un rol nuevo específico, definirlo con sus `permissionKeys`

## Ejemplo de Uso del Prompt

**Input del usuario:**
```
MODULE_NAME: inventory-management
ENTITY_NAME: Product
ENTITY_PROPERTIES:
  - name: string, required, unique, index
  - sku: string, required, unique, index
  - categoryId: string (ref: Category por 'id'), required, index
  - price: number, required, min: 0
  - stock: number, required, default: 0, min: 0
  - tags: string[], optional
  - metadata: Map<string, any>, optional
  - isActive: boolean, default: true, index

EXTRA_METHODS:
  - adjustStock(productId: string, quantity: number, type: 'in' | 'out'): Promise<void>
  - findLowStock(threshold: number): Promise<Product[]>
  - updateCategory(productId: string, newCategoryId: string): Promise<Product>
  - searchByTags(tags: string[]): Promise<Product[]>
```

**Output esperado:**

Generar todos los archivos de la estructura con implementaciones completas, incluyendo:
- Schema extendiendo `AbstractSchema` con índices optimizados y virtuales para `category` (directo) y `orderItems` (inverso), ambos con `foreignField: 'id'`
- Permisos en `SYSTEM_PERMISSIONS`: `products.create`, `products.read`, `products.update`, `products.delete`, `products.export`
- Clave `PRODUCTS: 'products'` agregada a `MODULES` en `module.constants.ts`
- Rol `inventory_manager` con `products.*` en `SYSTEM_ROLES`
- Servicio con todos los métodos CRUD usando `ApiResponse<T>`, `AuditService`, `CacheService`, `buildMongoQuery` y `createPaginationMeta`
- Métodos extra (`adjustStock`, `findLowStock`, `updateCategory`, `searchByTags`) con auditoría y `ApiResponse`
- Controlador con `@Query() query: QueryParams` en el endpoint `list`
- Hook `pre('save')` para validar stock nunca negativo

## Notas Adicionales

- **`requestId`** siempre incluido en `meta` de `ApiResponse` — extraer al inicio del método con `this.asyncContextService.getRequestId()`
- **`actorId`** siempre extraído al inicio con `this.asyncContextService.getActorId()!` — usado en auditoría y como `userId` al crear
- Emitir eventos de dominio con `EventEmitter2` para operaciones importantes (create, delete, cambios de estado)
- Usar inyección de dependencias de NestJS en todos los servicios (constructor injection)
- Mantener consistencia en estilo de código y formato
- Los campos de `AbstractSchema` (`id`, `userId`, `createdAt`, `updatedAt`) **nunca** se redefinen en esquemas hijos

---

## Checklist de Verificación

Antes de dar por completada la generación del módulo, verificar **cada ítem** de esta lista. Un módulo solo se considera correcto cuando **todos** los ítems están marcados.

### 📁 Estructura de Archivos

- [ ] Existe el archivo `{module-name}.module.ts` con el módulo NestJS registrado
- [ ] Existe `index.ts` en la raíz del módulo exportando los elementos públicos
- [ ] Existe el DTO de creación: `application/dto/create-{entity}.dto.ts`
- [ ] Existe el DTO de actualización: `application/dto/update-{entity}.dto.ts`
- [ ] Existe el archivo `application/dto/index.ts` exportando ambos DTOs
- [ ] Existe el puerto del repositorio: `application/ports/{entity}.repository.port.ts`
- [ ] Existe la entidad de dominio: `domain/entities/{entity}.entity.ts`
- [ ] Existe el schema de Mongoose: `infrastructure/persistence/mongoose/schemas/{entity}.schema.ts`
- [ ] Existe el repositorio: `infrastructure/persistence/mongoose/repositories/{entity}.repository.ts`
- [ ] Existe el mapper: `infrastructure/persistence/mongoose/mappers/{entity}.mapper.ts`
- [ ] Existe el controlador HTTP: `infrastructure/http/controllers/{entity}.controller.ts`
- [ ] Existe el resolver GraphQL: `infrastructure/http/resolvers/{entity}.resolver.ts`

### 🏗️ Schema Mongoose

- [ ] La clase del schema extiende `AbstractSchema` (`import { AbstractSchema } from 'src/common/schemas/abstract.schema'`)
- [ ] NO se redefinen `id`, `userId`, `createdAt` ni `updatedAt` (ya están en `AbstractSchema`)
- [ ] El decorador `@Schema()` incluye `timestamps: true` y `collection` explícita
- [ ] Todas las propiedades propias usan el decorador `@Prop()` con tipo explícito
- [ ] Los campos sensibles tienen `select: false`
- [ ] Las referencias a otros documentos usan `string` (UUID), no `Types.ObjectId`
- [ ] Los virtuales de relación directa usan `foreignField: 'id'` (no `_id`)
- [ ] Los virtuales de relación inversa usan `localField: 'id'` (campo del `AbstractSchema`)
- [ ] Existen índices simples en campos de búsqueda frecuente
- [ ] Existen índices compuestos para queries comunes
- [ ] Existe al menos el índice `createdAt: -1`
- [ ] Se implementa `pre('save')` si hay normalización o validaciones previas al guardado

### 📋 DTOs

- [ ] Cada campo tiene `@ApiProperty()` con descripción en español y `example`
- [ ] Cada campo tiene `@Field()` de GraphQL con descripción en español
- [ ] Todas las validaciones de `class-validator` están presentes y tienen mensajes en español
- [ ] `UpdateDto` extiende `PartialType(CreateDto)` o redefine campos opcionales correctamente

### 🔌 Puerto del Repositorio

- [ ] Define los métodos: `create`, `findById`, `findAll`, `update`, `softDelete`
- [ ] `findAll` recibe `filter: QueryFilter<Entity>` y `options: { skip, limit, sort? }` (no `QueryParams`)
- [ ] `findAll` retorna `Promise<{ data: Entity[]; total: number }>`
- [ ] Está exportado desde `application/ports/index.ts`

### ⚙️ Servicio de Aplicación

- [ ] **Todos** los métodos públicos retornan `Promise<ApiResponse<T>>`
- [ ] Se importan y usan `ApiResponse` de `src/common/types/api-response.type`
- [ ] Se importan y usan `QueryParams`, `PaginationMeta` de `src/common/types/common.types`
- [ ] Se importan y usan `buildMongoQuery` de `src/common/helpers/build-mongo-query`
- [ ] Se importan y usan `createPaginationMeta` de `src/common/helpers/build-pagination-meta`
- [ ] `AsyncContextService` está inyectado y `getRequestId()` / `getActorId()` se llaman al inicio de cada método
- [ ] `AuditService` está inyectado y se invoca en **cada** operación:
  - [ ] `logAllow` en el camino exitoso
  - [ ] `logDeny` cuando la entidad no se encuentra o se rechaza la operación
  - [ ] `logError` en el bloque `catch`
- [ ] Las llamadas a `AuditService` son fire-and-forget (sin `await`)
- [ ] `CacheService` está inyectado y se usa en `findById` (get + set)
- [ ] El caché se invalida (`delete`) en `update` y `remove`
- [ ] El método `list` incluye `pagination: PaginationMeta` en el `meta` de `ApiResponse`
- [ ] `{ requestId }` está incluido en el `meta` de **todas** las respuestas
- [ ] El bloque `catch` captura el mensaje con `error instanceof Error ? error.message : String(error)`

### 🗄️ Repositorio MongoDB

- [ ] Implementa la interfaz del puerto
- [ ] Usa `@InjectModel(Entity.name)` para inyectar el modelo
- [ ] `findAll` ejecuta datos y conteo en paralelo con `Promise.all`
- [ ] `findAll` aplica `.skip()`, `.limit()` y `.sort()` con los `options` recibidos
- [ ] `findById` busca por el campo `id` (UUID del `AbstractSchema`), no por `_id`
- [ ] `update` usa `findOneAndUpdate` con `{ new: true }` para retornar el documento actualizado
- [ ] `softDelete` marca el registro como inactivo en lugar de eliminarlo físicamente

### 🌐 Controlador HTTP

- [ ] Tiene `@ApiTags`, `@ApiBearerAuth('Bearer Token')` y `@UseGuards(JwtAuthGuard)`
- [ ] El endpoint `list` recibe `@Query() query: QueryParams`
- [ ] El endpoint `list` tiene `@ApiQuery` para `page`, `limit`, `search`, `sortBy`, `sortOrder`
- [ ] Cada endpoint tiene `@ApiOperation` con `summary` y `description` en español
- [ ] Cada endpoint tiene `@HttpCode()` con el status code correcto
- [ ] El controlador no contiene lógica de negocio — solo delega al servicio

### 🔷 Resolver GraphQL

- [ ] Tiene `@Resolver()` con la clase del schema GraphQL
- [ ] Las queries tienen `@Query()` con descripción en español
- [ ] Las mutations tienen `@Mutation()` con descripción en español
- [ ] Los `@Args()` usan los DTOs decorados con `@InputType()`
- [ ] Las relaciones virtuales tienen `@ResolveField()`

### 🔑 Registro de Módulo, Permisos y Roles

- [ ] La clave del módulo está agregada al objeto `MODULES` en `module.constants.ts`
- [ ] Los permisos CRUD (`create`, `read`, `update`, `delete`) están en `SYSTEM_PERMISSIONS`
- [ ] Se agregó el permiso `export` si el módulo lo soporta
- [ ] Se agregaron permisos para acciones extra (`enable`, `disable`, `approve`, etc.) si aplica
- [ ] Los roles que deben acceder al módulo tienen sus `permissionKeys` actualizados en `SYSTEM_ROLES`
- [ ] Si se requirió un rol nuevo, está definido con `isSystem: true` y sus `permissionKeys`

### 🧩 Módulo NestJS (`{module-name}.module.ts`)

- [ ] `MongooseModule.forFeature` registra el schema de la entidad
- [ ] `AuditModule` está importado (o `CommonModule` si lo exporta)
- [ ] `CacheModule` está importado si el servicio usa `CacheService`
- [ ] `HttpModule` del proyecto está importado si el módulo llama a servicios externos
- [ ] El servicio, repositorio y controlador están declarados como `providers` y `controllers`
- [ ] Los elementos públicos del módulo están en `exports` si otros módulos los necesitan
