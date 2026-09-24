declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    LM_CLOUDFLARE_CORE_URL: string;
    LM_HUB_LINK_SECRET: string;
  }
}
