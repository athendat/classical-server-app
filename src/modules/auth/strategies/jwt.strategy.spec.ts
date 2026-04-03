import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

// We test validate() directly since it's the public interface that
// transforms a JWT payload into an Actor object.

describe('JwtStrategy.validate()', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    // JwtStrategy extends PassportStrategy which calls super() with options.
    // We bypass the constructor by creating an instance and only testing validate().
    strategy = Object.create(JwtStrategy.prototype);
  });

  it('should set tenantId from payload for user tokens', () => {
    const payload = {
      sub: 'user:user-123',
      iss: 'test-issuer',
      aud: 'test-audience',
      scope: 'read write',
      jti: 'jti-123',
      tenantId: 'tenant-abc',
    };

    const actor = strategy.validate({}, payload);

    expect(actor.actorType).toBe('user');
    expect(actor.actorId).toBe('user-123');
    expect(actor.tenantId).toBe('tenant-abc');
  });

  it('should set tenantId to undefined for user tokens without tenantId', () => {
    const payload = {
      sub: 'user:user-456',
      iss: 'test-issuer',
      aud: 'test-audience',
      scope: 'read write',
      jti: 'jti-456',
    };

    const actor = strategy.validate({}, payload);

    expect(actor.actorType).toBe('user');
    expect(actor.tenantId).toBeUndefined();
  });

  it('should derive tenantId from actorId for service tokens', () => {
    const payload = {
      sub: 'svc:tenant-xyz',
      iss: 'test-issuer',
      aud: 'test-audience',
      scope: 'read write',
      jti: 'jti-789',
    };

    const actor = strategy.validate({}, payload);

    expect(actor.actorType).toBe('service');
    expect(actor.tenantId).toBe('tenant-xyz');
  });
});
