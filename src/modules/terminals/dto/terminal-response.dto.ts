import type { TerminalEntity } from '../domain/ports/terminal-repository.port';

export interface CreateTerminalResult {
  terminal: TerminalEntity;
  credentials: {
    clientId: string;
    clientSecret: string;
  };
}

export interface RotateCredentialsResult {
  clientId: string;
  clientSecret: string;
}
