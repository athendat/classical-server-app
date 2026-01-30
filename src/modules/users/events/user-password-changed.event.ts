/**
 * Evento de dominio: contraseña de usuario cambió.
 */
export class UserPasswordChangedEvent {
  constructor(readonly userId: string) {}
}
