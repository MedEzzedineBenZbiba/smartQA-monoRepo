export enum SyncFrequency {
  ONE_HOUR = '1h',
  SIX_HOURS = '6h',
  TWELVE_HOURS = '12h',
  DAILY = '24h',
}

export enum SyncJobStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  SYNCING = 'syncing',
  FAILED = 'failed',
}
