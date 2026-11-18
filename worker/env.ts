export interface Env {
  MEDIA: R2Bucket;
  DB: D1Database;
  ASSETS: Fetcher;
  CANONICAL_ORIGIN: string;
  ADMIN_HOST: string;
  OLD_HOST: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ENVIRONMENT: "production" | "preview" | "development";
  DEV_BYPASS_ACCESS?: string;
}
