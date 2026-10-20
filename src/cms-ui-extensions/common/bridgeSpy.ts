import {LOG_PREFIX} from '@shared/constants';

/**
 * The SDK talks to the CMS over a MessagePort that the CMS sends in a
 * `CMS_INIT` window message. The SDK keeps that port private, so this module
 * watches the same init message, keeps its own reference to the port, and
 * logs every message both ways. It must be installed before `register()`.
 *
 * Protocol (from @optimizely/cms-extensibility-sdk 1.1.0):
 *   out: CMS_CALL {id, method, payload}, CMS_SUBSCRIBE {id, event}, CMS_UNSUBSCRIBE {id}
 *   in:  CMS_RESULT {id, result}, CMS_ERROR {id, error}, CMS_EVENT {id, payload}, CMS_DESTROY
 */

export type Direction = 'init' | 'out' | 'in' | 'csp';

export interface BridgeEntry {
  seq: number;
  at: string;
  dir: Direction;
  type: string;
  id?: number;
  /** The method of a call, or the event name of a subscription. */
  name?: string;
  latencyMs?: number;
  data: unknown;
}

export interface InitInfo {
  receivedAt: string;
  origin: string;
  portCount: number;
  /** The whole init message except the transferred port. */
  message: unknown;
}

interface WireMessage {
  type?: string;
  id?: number;
  method?: string;
  event?: string;
  payload?: unknown;
  result?: unknown;
  error?: unknown;
}

const MAX_ENTRIES = 300;
const PROBE_ID_BASE = 1_000_000;

let entries: BridgeEntry[] = [];
let seq = 0;
let probeSeq = 0;
let installed = false;
let port: MessagePort | null = null;
let initInfo: InitInfo | null = null;
const listeners = new Set<() => void>();
const pendingCalls = new Map<number, {sentAt: number; method?: string}>();
const subscriptionNames = new Map<number, string>();

function snapshot(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch {
    return String(value);
  }
}

function push(entry: Omit<BridgeEntry, 'seq' | 'at'>): void {
  const full: BridgeEntry = {...entry, seq: ++seq, at: new Date().toISOString()};
  entries = [full, ...entries].slice(0, MAX_ENTRIES);
  listeners.forEach((listener) => listener());
  console.debug(`${LOG_PREFIX} bridge ${full.dir} ${full.type}`, full.name ?? '', full.data);
}

function recordOutgoing(raw: unknown): void {
  const message = raw as WireMessage;
  if (message.type === 'CMS_CALL' && typeof message.id === 'number') {
    pendingCalls.set(message.id, {sentAt: performance.now(), method: message.method});
  }
  if (message.type === 'CMS_SUBSCRIBE' && typeof message.id === 'number' && message.event) {
    subscriptionNames.set(message.id, message.event);
  }
  push({
    dir: 'out',
    type: message.type ?? 'unknown',
    id: message.id,
    name: message.method ?? message.event ?? subscriptionNames.get(message.id ?? -1),
    data: snapshot(message.payload ?? message)
  });
}

function recordIncoming(raw: unknown): void {
  const message = raw as WireMessage;
  const id = message.id ?? -1;
  if (message.type === 'CMS_EVENT') {
    push({dir: 'in', type: message.type, id, name: subscriptionNames.get(id), data: snapshot(message.payload)});
    return;
  }
  const pending = pendingCalls.get(id);
  pendingCalls.delete(id);
  push({
    dir: 'in',
    type: message.type ?? 'unknown',
    id,
    name: pending?.method,
    latencyMs: pending ? Math.round(performance.now() - pending.sentAt) : undefined,
    data: snapshot(message.type === 'CMS_ERROR' ? message.error : message.result ?? message)
  });
}

export function installBridgeSpy(): void {
  if (installed) return;
  installed = true;

  const proto = MessagePort.prototype as unknown as {postMessage: (...args: unknown[]) => void};
  const originalPost = proto.postMessage;
  proto.postMessage = function patchedPostMessage(this: MessagePort, ...args: unknown[]) {
    if (this === port) recordOutgoing(args[0]);
    return originalPost.apply(this, args);
  };

  // Registered before the SDK's own listener, so the port is captured first.
  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as WireMessage | null;
    if (data?.type !== 'CMS_INIT' || event.source !== window.parent) return;
    port = event.ports[0] ?? null;
    initInfo = {
      receivedAt: new Date().toISOString(),
      origin: event.origin,
      portCount: event.ports.length,
      message: snapshot(data)
    };
    push({dir: 'init', type: 'CMS_INIT', data: initInfo});
    port?.addEventListener('message', (message: MessageEvent) => recordIncoming(message.data));
  });

  document.addEventListener('securitypolicyviolation', (event) => {
    push({
      dir: 'csp',
      type: 'CSP violation',
      name: event.violatedDirective,
      data: {blockedURI: event.blockedURI, directive: event.violatedDirective, policy: event.originalPolicy}
    });
  });
}

export function getInitInfo(): InitInfo | null {
  return initInfo;
}

export function getEntries(): BridgeEntry[] {
  return entries;
}

export function clearEntries(): void {
  entries = [];
  listeners.forEach((listener) => listener());
}

export function subscribeEntries(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface ProbeResult {
  method: string;
  outcome: 'result' | 'error' | 'timeout' | 'no-port';
  value?: unknown;
  latencyMs: number;
}

/**
 * Sends a CMS_CALL for any method name, including ones the SDK doesn't wrap.
 * The ID range is far above the SDK's own counter, so the SDK ignores the reply.
 */
export function rawCall(method: string, payload: unknown, timeoutMs = 5000): Promise<ProbeResult> {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  const target = port;
  if (!target) return Promise.resolve({method, outcome: 'no-port', latencyMs: 0});

  const id = PROBE_ID_BASE + ++probeSeq;
  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent) => {
      const message = event.data as WireMessage;
      if (message.id !== id) return;
      cleanup();
      resolve(
        message.type === 'CMS_ERROR'
          ? {method, outcome: 'error', value: message.error, latencyMs: elapsed()}
          : {method, outcome: 'result', value: snapshot(message.result), latencyMs: elapsed()}
      );
    };
    const timer = window.setTimeout(() => {
      cleanup();
      resolve({method, outcome: 'timeout', latencyMs: elapsed()});
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timer);
      target.removeEventListener('message', onMessage);
    };
    target.addEventListener('message', onMessage);
    target.postMessage({type: 'CMS_CALL', id, method, payload});
  });
}

/** Subscribes to any event name. Events show up in the traffic log. Returns an unsubscribe function. */
export function rawSubscribe(event: string): (() => void) | null {
  const target = port;
  if (!target) return null;
  const id = PROBE_ID_BASE + ++probeSeq;
  target.postMessage({type: 'CMS_SUBSCRIBE', id, event});
  return () => target.postMessage({type: 'CMS_UNSUBSCRIBE', id});
}
