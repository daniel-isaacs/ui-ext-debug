import type {ContentState, ExtensionContext} from '@optimizely/cms-extensibility-sdk';
import {BACKEND_FUNCTION_ID} from '@shared/constants';
import type {Action, Envelope, RequestBody} from '@shared/protocol';
import {createContext, useCallback, useContext, useRef, useState} from 'react';
import {logGroup} from './log';

export type Surface = 'sidebar' | 'view' | 'property-editor';

export interface DebugCtx {
  context: ExtensionContext;
  surface: Surface;
  /** Latest content state seen by this extension, from get() or subscribe(). */
  content: ContentState;
}

const Ctx = createContext<DebugCtx | null>(null);
export const DebugProvider = Ctx.Provider;

export function useDebug(): DebugCtx {
  const value = useContext(Ctx);
  if (!value) throw new Error('useDebug must be used inside DebugProvider');
  return value;
}

export interface CallOutcome<T = unknown> {
  action: Action;
  params: Record<string, unknown>;
  /** HTTP status the function returned, as reported by the CMS. */
  statusCode?: number;
  envelope?: Envelope<T>;
  /** Whatever came back in `data` when it wasn't an envelope (an empty body after a throw, for example). */
  rawData?: unknown;
  /** Set when invokeFunction itself rejected (transport error or bridge timeout). */
  transportError?: string;
  roundTripMs: number;
}

export async function callBackend<T>(
  debug: DebugCtx,
  action: Action,
  params: Record<string, unknown> = {}
): Promise<CallOutcome<T>> {
  const body: RequestBody = {
    action,
    params,
    client: {surface: debug.surface, sentAt: new Date().toISOString(), content: debug.content}
  };
  const started = performance.now();
  let outcome: CallOutcome<T>;
  try {
    const response = await debug.context.extension.invokeFunction(BACKEND_FUNCTION_ID, body);
    const data = response.data as Envelope<T> | null;
    const isEnvelope = Boolean(data && typeof data === 'object' && 'ok' in data);
    outcome = {
      action,
      params,
      statusCode: response.statusCode,
      envelope: isEnvelope ? (data as Envelope<T>) : undefined,
      rawData: isEnvelope ? undefined : data,
      roundTripMs: Math.round(performance.now() - started)
    };
  } catch (error) {
    outcome = {
      action,
      params,
      transportError: error instanceof Error ? error.message : String(error),
      roundTripMs: Math.round(performance.now() - started)
    };
  }
  logGroup(`backend ${action} → ${outcome.statusCode ?? 'transport error'} (${outcome.roundTripMs} ms)`, outcome);
  return outcome;
}

/** Runs backend actions and keeps the latest outcome for display. */
export function useBackendAction<T = unknown>() {
  const debug = useDebug();
  // Read the latest context through a ref so `run` stays stable when the content changes.
  const debugRef = useRef(debug);
  debugRef.current = debug;
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<CallOutcome<T> | null>(null);

  const run = useCallback(async (action: Action, params: Record<string, unknown> = {}) => {
    setLoading(true);
    try {
      const next = await callBackend<T>(debugRef.current, action, params);
      setOutcome(next);
      return next;
    } finally {
      setLoading(false);
    }
  }, []);

  return {loading, outcome, run};
}

export function resultOf<T>(outcome: CallOutcome<T> | null): T | undefined {
  return outcome?.envelope?.ok ? outcome.envelope.result : undefined;
}
