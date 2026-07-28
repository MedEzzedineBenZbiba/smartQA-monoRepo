export class SaveGithubTokenDto {
  userId!: string;
  accessToken!: string;
  accessTokenExpiry!: Date;
  refreshToken!: string;
  refreshTokenExpiry!: Date;
}
