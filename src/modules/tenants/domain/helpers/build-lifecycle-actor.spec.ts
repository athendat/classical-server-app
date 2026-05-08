import { Actor } from 'src/common/interfaces';
import { buildLifecycleActor } from './build-lifecycle-actor';

/**
 * Issue #29 — el log de ciclo de vida del tenant mostraba "user:UUID (Read)"
 * porque el creador del evento copiaba `actor.sub` como username y el primer
 * scope del JWT como roleKey. Esta función centraliza el armado del actor
 * con un nombre legible y un rol coherente.
 */
describe('buildLifecycleActor', () => {
  const baseActor: Actor = {
    actorId: 'a3f0',
    actorType: 'user',
    sub: 'user:a3f0',
    scopes: ['Read', 'audit.read'],
  };

  it('usa el fullname del usuario como username y su roleKey como rol', () => {
    const result = buildLifecycleActor(baseActor, {
      id: 'a3f0',
      fullname: 'Frank Rodríguez López',
      roleKey: 'super_admin',
    });

    expect(result).toEqual({
      userId: 'a3f0',
      username: 'Frank Rodríguez López',
      roleKey: 'super_admin',
    });
  });

  it('cae a actor.actorId cuando no hay usuario resuelto', () => {
    const result = buildLifecycleActor(baseActor, undefined);

    expect(result.userId).toBe('a3f0');
    // username y roleKey se llenan con valores por defecto coherentes
    expect(result.username).toBe('a3f0');
    expect(result.roleKey).toBe('system');
  });

  it('NO usa el primer scope como roleKey (evita el bug "(Read)")', () => {
    const result = buildLifecycleActor(baseActor, undefined);

    expect(result.roleKey).not.toBe('Read');
    expect(result.roleKey).not.toBe('audit.read');
  });

  it('cuando user existe pero sin fullname, usa actorId como username', () => {
    const result = buildLifecycleActor(baseActor, {
      id: 'a3f0',
      fullname: undefined,
      roleKey: 'merchant',
    });

    expect(result.username).toBe('a3f0');
    expect(result.roleKey).toBe('merchant');
  });

  it('si no hay actor (system action) devuelve placeholder system', () => {
    const result = buildLifecycleActor(undefined, undefined);

    expect(result).toEqual({
      userId: 'system',
      username: 'system',
      roleKey: 'system',
    });
  });
});
