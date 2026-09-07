export const RESET_TOKEN_COOKIE = 'reset_token';
export const RESET_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  maxAge: 5 * 60 * 1000,
} as const;

export const JWT_RESET_PASSWORD_EXPIRY = '5m';
export const JWT_Change_PASSWORD_EXPIRY = '5m';
