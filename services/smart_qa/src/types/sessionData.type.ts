export type SessionData = {
  access_token: string;
  expire_at_unix_timestamp: number;
  refresh_token: string;
  refresh_expire_at_unix_timestamp: number;
  role: string[];
};
