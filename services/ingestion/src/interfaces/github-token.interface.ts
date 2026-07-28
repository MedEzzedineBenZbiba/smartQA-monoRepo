export interface GithubTokens {
    accessToken: string;
    accessTokenExpiry: number;    // timestamp in ms
    refreshToken: string;
    refreshTokenExpiry: number;   // timestamp in ms
  }