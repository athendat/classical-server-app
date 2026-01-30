import { Role } from './role.entity';

/**
 * IRolesRepository - Puerto (interfaz)
 * Define operaciones de persistencia para roles
 * Implementada en MongoDBRolesRepository
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
