import * as App from '@zaiusinc/app-sdk';
import {functions, getAppContext, logger, notifications, storage} from '@zaiusinc/app-sdk';
import {MAX_PAYLOAD_KB, MAX_SLEEP_MS} from '@shared/constants';
import {ACTIONS, Action, Envelope, EnvelopeMeta, GraphAuth, RequestBody} from '@shared/protocol';
import {cmsRequest, getCmsToken} from '../lib/cmsApi';
import {graphQuery} from '../lib/graph';
import {ConfigError} from '../lib/http';
import {decodeJwt} from '../lib/jwt';
import {clearLog, INBOX_KEY, LIFECYCLE_KEY, readLog, SCRATCH_KEY} from '../lib/logs';
import {reportEnv, reportHeaders} from '../lib/redact';
import {nextInvocation, runtimeInfo} from '../lib/runtime';
import {settingsSummary} from '../lib/settings';

type Params = Record<string, unknown>;

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * One function serves every debugger action (see src/shared/protocol.ts).
 * It is declared with `accepts: cms_ui_extension`, so the only caller is
 * `context.extension.invokeFunction(...)` in a CMS UI extension.
 */
export class DebugBackend extends App.Function {
  private meta!: EnvelopeMeta;
  private startedAt = 0;

  public async perform(): Promise<App.Response> {
    this.startedAt = Date.now();
    const body = (this.request.bodyJSON ?? {}) as Partial<RequestBody>;
    const action = str(body.action) as Action;
    const params = (body.params ?? {}) as Params;
    this.meta = {
      action,
      receivedAt: new Date(this.startedAt).toISOString(),
      durationMs: 0,
      ...nextInvocation()
    };
    logger.info('debug_backend', action, `invocation ${this.meta.invocation}`);

    if (!ACTIONS.includes(action)) {
      return this.fail(400, 'unknown_action', `Unknown action "${action}". Known: ${ACTIONS.join(', ')}`);
    }

    try {
      return await this.dispatch(action, params, body);
    } catch (error) {
      if (error instanceof ConfigError) return this.fail(400, error.code, error.message);
      logger.error('debug_backend failed', action, error);
      return this.fail(500, 'internal_error', error instanceof Error ? error.message : String(error));
    }
  }

  private async dispatch(action: Action, params: Params, body: Partial<RequestBody>): Promise<App.Response> {
    switch (action) {
      case 'whoami':
        return this.ok(await this.whoami(body));

      case 'echo':
        return this.ok({
          youSent: body,
          bodyBytes: this.request.body.byteLength,
          contentType: this.request.contentType
        });

      case 'payload': {
        const kb = Math.min(MAX_PAYLOAD_KB, Math.max(1, num(params.kb, 64)));
        return this.ok({kb, data: 'x'.repeat(kb * 1024)});
      }

      case 'sleep': {
        const ms = Math.min(MAX_SLEEP_MS, Math.max(0, num(params.ms, 1000)));
        await new Promise((resolve) => setTimeout(resolve, ms));
        return this.ok({sleptMs: ms});
      }

      case 'error': {
        if (params.mode === 'throw') throw new Error('Thrown on purpose by the debugger.');
        const status = Math.min(599, Math.max(400, num(params.status, 418)));
        return this.fail(status, 'requested_error', `Returned HTTP ${status} on purpose.`);
      }

      case 'kvGet':
        return this.ok(await storage.kvStore.get(SCRATCH_KEY));

      case 'kvPut': {
        const value = {
          note: str(params.note),
          writtenBy: str(body.client?.surface, 'unknown'),
          writtenAt: new Date().toISOString()
        };
        await storage.kvStore.put(SCRATCH_KEY, value);
        return this.ok(value);
      }

      case 'inbox':
        return this.ok({
          endpoint: await this.webhookUrl(),
          items: await readLog(INBOX_KEY)
        });

      case 'inboxClear':
        await clearLog(INBOX_KEY);
        return this.ok({cleared: true});

      case 'lifecycleLog':
        return this.ok(await readLog(LIFECYCLE_KEY));

      case 'notify': {
        const message = str(params.message, 'Hello from the UI Extension Debugger');
        await notifications.info('UI Extension Debugger', 'Debugger notification', message);
        return this.ok({sent: true, message});
      }

      case 'cmsToken':
        return this.ok((await getCmsToken()).report);

      case 'cmsRequest':
        return this.ok(await cmsRequest(str(params.method, 'GET'), str(params.path), params.body));

      case 'graphQuery':
        return this.ok(
          await graphQuery(
            str(params.query),
            (params.variables ?? undefined) as Params | undefined,
            (str(params.auth, 'single') as GraphAuth)
          )
        );

      case 'probeForwardedAuth':
        return this.ok(await this.probeForwardedAuth());
    }
  }

  private async whoami(body: Partial<RequestBody>) {
    const context = getAppContext();
    const manifest = context?.manifest as unknown as Record<string, unknown> | undefined;
    return {
      appContext: {
        trackerId: context?.trackerId,
        installId: context?.installId,
        scope: context?.scope ?? null,
        account: context?.account ?? null,
        manifest: manifest
          ? {meta: manifest.meta, runtime: manifest.runtime, functions: manifest.functions, ui_extensions: manifest.ui_extensions}
          : null
      },
      request: {
        method: this.request.method,
        path: this.request.path,
        params: this.request.params,
        contentType: this.request.contentType,
        bodyBytes: this.request.body.byteLength
      },
      inbound: reportHeaders(this.request.headers.toArray()),
      clientSaid: body.client ?? null,
      functionEndpoints: await this.endpoints(),
      settings: await settingsSummary(),
      runtime: runtimeInfo(),
      env: reportEnv()
    };
  }

  /** Looks for a bearer token on the inbound call and tries it against the CMS API and Graph. */
  private async probeForwardedAuth() {
    const {headers, jwts} = reportHeaders(this.request.headers.toArray());
    const authorization = this.request.headers.get('authorization') ?? '';
    const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    const candidates = Object.keys(jwts);

    if (!bearer) {
      return {
        found: false,
        note: 'No Authorization: Bearer header reached the function. Headers that hold a JWT are listed in jwtHeaders.',
        jwtHeaders: candidates,
        headerNames: Object.keys(headers)
      };
    }

    const attempt = async (run: () => Promise<unknown>) => {
      try {
        return await run();
      } catch (error) {
        return {error: error instanceof Error ? error.message : String(error)};
      }
    };

    return {
      found: true,
      decoded: decodeJwt(bearer),
      cmsApi: await attempt(() => cmsRequest('GET', '/v1/contenttypes?pageSize=1', undefined, bearer)),
      graph: await attempt(() => graphQuery('{ _Content(limit: 1) { total } }', undefined, 'bearer', bearer))
    };
  }

  private async endpoints(): Promise<Record<string, string> | {error: string}> {
    try {
      return await functions.getEndpoints();
    } catch (error) {
      return {error: error instanceof Error ? error.message : String(error)};
    }
  }

  private async webhookUrl(): Promise<string | null> {
    const all = await this.endpoints();
    if ('error' in all) return null;
    return all.debug_webhook ?? null;
  }

  private ok<T>(result: T): App.Response {
    const envelope: Envelope<T> = {ok: true, result, meta: this.finishMeta()};
    return new App.Response(200, envelope);
  }

  private fail(status: number, error: string, message?: string): App.Response {
    const envelope: Envelope = {ok: false, error, message, meta: this.finishMeta()};
    return new App.Response(status, envelope);
  }

  private finishMeta(): EnvelopeMeta {
    return {...this.meta, durationMs: Date.now() - this.startedAt};
  }
}
