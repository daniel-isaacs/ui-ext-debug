/**
 * Tests whether extension frames can talk to each other without the backend.
 *
 * Every extension frame has its own opaque origin ("null"), but cross-origin postMessage is still
 * allowed, and window.top.frames can be walked without same-origin access. So each frame listens
 * for tagged messages, answers pings, and records what it receives. BroadcastChannel is tried as
 * well; with opaque origins it is expected to stay within one frame.
 *
 * installCrossFrame() runs at load in every entry, so a folded property editor still answers.
 */

const TAG = 'uxd-xframe';

export type CrossFrameKind = 'hello' | 'reply' | 'note' | 'property';
export type CrossFrameVia = 'postMessage' | 'BroadcastChannel';

interface CrossFrameMessage {
  tag: typeof TAG;
  kind: CrossFrameKind;
  from: {frameId: string; label: string};
  sentAt: string;
  text?: string;
  value?: unknown;
}

export interface CrossFrameRecord {
  via: CrossFrameVia;
  origin: string;
  kind: CrossFrameKind;
  from: {frameId: string; label: string};
  sentAt: string;
  receivedAt: string;
  text?: string;
  value?: unknown;
}

export interface PingResult {
  at: string;
  framesFound: number;
  self: string | null;
  posted: number;
  failed: {path: string; error: string}[];
  paths: string[];
}

const frameId = Math.random().toString(36).slice(2, 8);
let label = 'unknown';
let channel: BroadcastChannel | null = null;
let channelStatus = 'not opened';
let records: CrossFrameRecord[] = [];
const listeners = new Set<() => void>();
let installed = false;

function push(record: CrossFrameRecord): void {
  records = [record, ...records].slice(0, 200);
  listeners.forEach((listener) => listener());
}

function message(kind: CrossFrameKind, extra: Partial<CrossFrameMessage> = {}): CrossFrameMessage {
  return {tag: TAG, kind, from: {frameId, label}, sentAt: new Date().toISOString(), ...extra};
}

function receive(data: unknown, via: CrossFrameVia, origin: string, reply: (answer: CrossFrameMessage) => void): void {
  const incoming = data as CrossFrameMessage | null;
  if (incoming?.tag !== TAG || incoming.from?.frameId === frameId) return;
  push({
    via,
    origin,
    kind: incoming.kind,
    from: incoming.from,
    sentAt: incoming.sentAt,
    receivedAt: new Date().toISOString(),
    text: incoming.text,
    value: incoming.value
  });
  if (incoming.kind === 'hello') reply(message('reply'));
}

export function installCrossFrame(frameLabel: string): void {
  if (installed) return;
  installed = true;
  label = frameLabel;

  window.addEventListener('message', (event: MessageEvent) => {
    receive(event.data, 'postMessage', event.origin, (answer) => {
      try {
        (event.source as Window | null)?.postMessage(answer, '*');
      } catch {
        // ignored: the ping side records what it receives
      }
    });
  });

  try {
    channel = new BroadcastChannel(TAG);
    channel.addEventListener('message', (event: MessageEvent) => {
      receive(event.data, 'BroadcastChannel', event.origin, (answer) => channel?.postMessage(answer));
    });
    channelStatus = 'open';
  } catch (error) {
    channelStatus = `blocked: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** Every window reachable from the top, as `top.frames[1].frames[0]`-style paths. */
function walkFrames(): {win: Window; path: string}[] {
  const found: {win: Window; path: string}[] = [];
  const visit = (win: Window, path: string, depth: number) => {
    found.push({win, path});
    if (depth >= 5 || found.length >= 100) return;
    let count = 0;
    try {
      count = win.frames.length;
    } catch {
      return;
    }
    for (let index = 0; index < count; index++) {
      try {
        visit(win.frames[index] as Window, `${path}.frames[${index}]`, depth + 1);
      } catch {
        // ignored: an unreachable frame is just skipped
      }
    }
  };
  visit(window.top ?? window, 'top', 0);
  return found;
}

/** Sends a hello to every other frame on the page, and on the BroadcastChannel. */
export function pingAllFrames(): PingResult {
  const frames = walkFrames();
  const hello = message('hello');
  const failed: PingResult['failed'] = [];
  let posted = 0;
  for (const {win, path} of frames) {
    if (win === window) continue;
    try {
      win.postMessage(hello, '*');
      posted++;
    } catch (error) {
      failed.push({path, error: error instanceof Error ? error.message : String(error)});
    }
  }
  channel?.postMessage(hello);
  return {
    at: hello.sentAt,
    framesFound: frames.length,
    self: frames.find(({win}) => win === window)?.path ?? null,
    posted,
    failed,
    paths: frames.map(({path}) => path)
  };
}

/** Sends a note (or a property change) to every other frame. */
export function broadcast(kind: 'note' | 'property', payload: {text?: string; value?: unknown}): number {
  const outgoing = message(kind, payload);
  let posted = 0;
  for (const {win} of walkFrames()) {
    if (win === window) continue;
    try {
      win.postMessage(outgoing, '*');
      posted++;
    } catch {
      // ignored: counted as not posted
    }
  }
  channel?.postMessage(outgoing);
  return posted;
}

export function getCrossFrameInfo() {
  return {frameId, label, broadcastChannel: channelStatus};
}

export function getCrossFrameRecords(): CrossFrameRecord[] {
  return records;
}

export function clearCrossFrameRecords(): void {
  records = [];
  listeners.forEach((listener) => listener());
}

export function subscribeCrossFrame(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
