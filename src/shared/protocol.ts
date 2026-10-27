/**
 * The contract between the extensions and the `debug_backend` function.
 * Every call is `invokeFunction(BACKEND_FUNCTION_ID, {action, params})` and
 * every answer is an Envelope. Isomorphic: no Node or browser APIs here.
 */

export const ACTIONS = [
  'whoami',
  'echo',
  'payload',
  'sleep',
  'error',
  'kvGet',
  'kvPut',
  'inbox',
  'inboxClear',
  'lifecycleLog',
  'notify',
  'cmsToken',
  'cmsRequest',
  'graphQuery',
  'probeForwardedAuth',
  'aeoGet',
  'aeoPut',
  'aeoClear'
] as const;

export type Action = (typeof ACTIONS)[number];

export interface RequestBody {
  action: Action;
  params?: Record<string, unknown>;
  /** Added by the frontend so the backend can show what the caller knew. */
  client?: {
    surface: string;
    sentAt: string;
    content?: unknown;
  };
}

export type Envelope<T = unknown> =
  | {ok: true; result: T; meta: EnvelopeMeta}
  | {ok: false; error: string; message?: string; meta?: EnvelopeMeta};

export interface EnvelopeMeta {
  action: string;
  receivedAt: string;
  durationMs: number;
  /** Number of calls this container has served since it started. 1 means a cold start. */
  invocation: number;
  containerStartedAt: string;
}

export interface ProxyResult {
  request: {method: string; url: string; auth: string};
  status: number;
  statusText: string;
  durationMs: number;
  headers: Record<string, string>;
  body: unknown;
  truncated: boolean;
}

export type GraphAuth = 'single' | 'basic' | 'bearer';

export interface WebhookEntry {
  receivedAt: string;
  method: string;
  path: string;
  query: Record<string, unknown>;
  headers: Record<string, string>;
  body: string;
}

export interface LifecycleEntry {
  at: string;
  hook: string;
  detail?: string;
  context?: unknown;
}

/** An AEO analysis kept in kvStore, one per content key and locale. */
export interface AeoRecord<R = unknown> {
  key: string;
  locale: string;
  /** The version the editor had open when the analysis ran. */
  version: string | null;
  publicUrl: string;
  analysedAt: string;
  report: R;
}

export interface AeoStatus<R = unknown> {
  /** From Graph (app key): true if any version is Published. null when Graph couldn't tell. */
  published: boolean | null;
  publishedCheck: string;
  /** From Graph, for this locale. null when Graph couldn't tell. */
  displayName: string | null;
  /** The content type's key, e.g. "ArticlePage". */
  contentType: string | null;
  record: AeoRecord<R> | null;
}
