export const OAUTH_CONSTANTS = {
  TOKEN_TTL_SECONDS: 28800, // 8 hours
  VALID_SCOPES: ['payments:authorize', 'payments:refund', 'transactions:read'],
  TOKEN_TYPE: 'Bearer',
  GRANT_TYPE: 'client_credentials',
};

export const OAUTH_INJECTION_TOKENS = {
  OAUTH_CLIENT_REPOSITORY: Symbol('IOAuthClientRepository'),
};
