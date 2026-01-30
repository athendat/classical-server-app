/**
 * Evento de dominio: usuario creado.
 */
export class UserCreatedEvent {
  constructor(
    readonly userId: string,
    readonly email?: string,
  ) {}
}
