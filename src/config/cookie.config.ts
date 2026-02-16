import { CookieOptions } from 'express';

export interface CookieConfiguration {
  access_token: CookieOptions;
  refresh_token: CookieOptions;
  csrf_token: CookieOptions;
}

export const getCookieConfig = (): CookieConfiguration => {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieDomain = process.env.COOKIE_DOMAIN;

  // En desarrollo local (localhost), NO incluir domain para que funcione con diferentes puertos
  // En producción, incluir domain si está configurado
  const baseConfig: CookieOptions = {
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    ...(isProduction && cookieDomain && { domain: cookieDomain }),
  };

  return {
    access_token: {
      ...baseConfig,
      httpOnly: true,
      maxAge: 3600000, // 1 hora
      path: '/',
    },
    refresh_token: {
      ...baseConfig,
      httpOnly: true,
      maxAge: 604800000, // 7 días
      path: '/',
    },
    csrf_token: {
      ...baseConfig,
      httpOnly: false, // Debe ser legible por JavaScript
      maxAge: 3600000, // 1 hora
      path: '/',
    },
  };
};
