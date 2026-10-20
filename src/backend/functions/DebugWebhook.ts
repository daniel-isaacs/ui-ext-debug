import * as App from '@zaiusinc/app-sdk';
import {logger} from '@zaiusinc/app-sdk';
import {INBOX_LIMIT} from '@shared/constants';
import type {WebhookEntry} from '@shared/protocol';
import {appendLog, INBOX_KEY} from '../lib/logs';
import {reportHeaders} from '../lib/redact';

/**
 * An ordinary HTTP function. Anything that can make a request (curl, a CMS
 * webhook, another service) can call it. It stores each request in kvStore,
 * and the extensions read the store with the `inbox` action. That is the only
 * way to get data from outside into an extension: the extension has to poll.
 */
export class DebugWebhook extends App.Function {
  public async perform(): Promise<App.Response> {
    const entry: WebhookEntry = {
      receivedAt: new Date().toISOString(),
      method: this.request.method,
      path: this.request.path,
      query: this.request.params,
      headers: reportHeaders(this.request.headers.toArray()).headers,
      body: Buffer.from(this.request.body).toString('utf8').slice(0, 4000)
    };
    await appendLog(INBOX_KEY, entry, INBOX_LIMIT);
    logger.info('debug_webhook received', entry.method, entry.path);
    return new App.Response(200, {stored: true, receivedAt: entry.receivedAt});
  }
}
