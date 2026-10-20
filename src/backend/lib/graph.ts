import type {GraphAuth, ProxyResult} from '@shared/protocol';
import {getCmsToken} from './cmsApi';
import {ConfigError, proxyFetch} from './http';
import {loadGraphSettings} from './settings';

/**
 * Sends a GraphQL query to Optimizely Graph.
 * - single: the public single key as ?auth=, published content only
 * - basic:  app key + secret, includes drafts
 * - bearer: the CMS API token (tests whether Graph accepts it)
 */
export async function graphQuery(
  query: string,
  variables: Record<string, unknown> | undefined,
  auth: GraphAuth,
  bearerOverride?: string
): Promise<ProxyResult> {
  if (!query.trim()) throw new ConfigError('missing_query', 'Enter a GraphQL query.');
  const settings = await loadGraphSettings();
  const headers: Record<string, string> = {'content-type': 'application/json', accept: 'application/json'};
  let url = settings.endpoint;
  let label: string;

  if (bearerOverride) {
    headers.authorization = `Bearer ${bearerOverride}`;
    label = 'forwarded bearer';
  } else if (auth === 'single') {
    if (!settings.singleKey) throw new ConfigError('graph_not_configured', 'Add a Graph single key in the app settings.');
    url = `${url}?auth=${encodeURIComponent(settings.singleKey)}`;
    label = 'single key';
  } else if (auth === 'basic') {
    if (!settings.appKey || !settings.appSecret) {
      throw new ConfigError('graph_not_configured', 'Add a Graph app key and secret in the app settings.');
    }
    headers.authorization = `Basic ${Buffer.from(`${settings.appKey}:${settings.appSecret}`).toString('base64')}`;
    label = 'basic (app key + secret)';
  } else {
    headers.authorization = `Bearer ${(await getCmsToken()).token}`;
    label = 'bearer (CMS API token)';
  }

  const result = await proxyFetch(
    url,
    {method: 'POST', headers, body: JSON.stringify({query, variables: variables ?? {}})},
    label
  );
  // Don't echo the single key back to the browser.
  result.request.url = settings.endpoint + (auth === 'single' && !bearerOverride ? '?auth=••••' : '');
  return result;
}
