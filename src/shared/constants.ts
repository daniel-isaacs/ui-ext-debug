export const BACKEND_FUNCTION_ID = 'debug_backend';
export const WEBHOOK_FUNCTION_NAME = 'debug_webhook';

export const DEFAULT_CMS_BASE_URL = 'https://api.cms.optimizely.com';
export const DEFAULT_GRAPH_ENDPOINT = 'https://cg.optimizely.com/content/v2';

/** Prefix for every console line the frontend writes, so the CMS console can be filtered. */
export const LOG_PREFIX = '[UXD]';

/** Upper bounds for the backend test actions. */
export const MAX_SLEEP_MS = 55_000;
export const MAX_PAYLOAD_KB = 4096;
export const MAX_PROXY_BODY_CHARS = 200_000;
export const INBOX_LIMIT = 25;
export const LIFECYCLE_LOG_LIMIT = 25;
