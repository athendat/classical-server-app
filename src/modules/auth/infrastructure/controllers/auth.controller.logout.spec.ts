import 'reflect-metadata';
import type { Response, CookieOptions } from 'express';
import { AuthController } from './auth.controller';
import { getCookieConfig } from 'src/config/cookie.config';

/**
 * Issue #36 — logout dejaba la cookie viva en el navegador porque clearCookie
 * usaba atributos (Path/Domain/SameSite/Secure) distintos a los del Set-Cookie
 * original. Esta suite cubre dev y prod para evitar regresión.
 */
describe('AuthController.logout — clearCookie atributos coinciden con getCookieConfig', () => {
  const buildController = (): AuthController =>
    new AuthController({} as never, {} as never);

  const buildRes = () => {
    const calls: Array<{ name: string; options: CookieOptions }> = [];
    const res = {
      clearCookie: jest.fn((name: string, options: CookieOptions) => {
        calls.push({ name, options });
        return res;
      }),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;
    return { res, calls };
  };

  const assertMatches = (
    actual: CookieOptions | undefined,
    expected: CookieOptions,
  ) => {
    expect(actual).toBeDefined();
    expect(actual!.path).toBe(expected.path);
    expect(actual!.domain).toBe(expected.domain);
    expect(actual!.sameSite).toBe(expected.sameSite);
    expect(actual!.secure).toBe(expected.secure);
    expect(actual!.httpOnly).toBe(expected.httpOnly);
  };

  const originalEnv = process.env;
  afterEach(() => {
    process.env = originalEnv;
  });

  it('en development limpia las tres cookies con los mismos atributos con que se setean', async () => {
    process.env = { ...originalEnv, NODE_ENV: 'development' };
    const cfg = getCookieConfig();
    const controller = buildController();
    const { res, calls } = buildRes();

    await controller.logout(res);

    expect(calls).toHaveLength(3);
    const byName = Object.fromEntries(calls.map((c) => [c.name, c.options]));
    assertMatches(byName['access_token'], cfg.access_token);
    assertMatches(byName['refresh_token'], cfg.refresh_token);
    assertMatches(byName['XSRF-TOKEN'], cfg.csrf_token);
  });

  it('en production con COOKIE_DOMAIN limpia incluyendo domain/secure/sameSite=none', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      COOKIE_DOMAIN: '.clasica.xyz',
    };
    const cfg = getCookieConfig();
    const controller = buildController();
    const { res, calls } = buildRes();

    await controller.logout(res);

    expect(calls).toHaveLength(3);
    const byName = Object.fromEntries(calls.map((c) => [c.name, c.options]));
    assertMatches(byName['refresh_token'], cfg.refresh_token);
    // Path debe ser '/', no '/auth/refresh' como antes del fix
    expect(byName['refresh_token'].path).toBe('/');
    assertMatches(byName['access_token'], cfg.access_token);
    assertMatches(byName['XSRF-TOKEN'], cfg.csrf_token);
  });
});
