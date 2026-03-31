export interface TerminalEntity {
  id?: string;
  terminalId: string;
  tenantId: string;
  name: string;
  type: string;
  capabilities: string[];
  status: string;
  location?: { label: string; address?: string; latitude?: number; longitude?: number };
  deviceSerial?: string;
  deviceModel?: string;
  deviceManufacturer?: string;
  oauthClientId: string;
  createdBy: string;
  revokedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TerminalFilters {
  type?: string;
  status?: string;
  capability?: string;
}

export interface ITerminalRepository {
  create(terminal: Partial<TerminalEntity>): Promise<TerminalEntity>;
  findByTerminalId(terminalId: string): Promise<TerminalEntity | null>;
  findByTenantId(tenantId: string, filters?: TerminalFilters): Promise<TerminalEntity[]>;
  findByOAuthClientId(clientId: string): Promise<TerminalEntity | null>;
  findAll(filters?: TerminalFilters): Promise<TerminalEntity[]>;
  update(terminalId: string, data: Partial<TerminalEntity>): Promise<TerminalEntity | null>;
}
