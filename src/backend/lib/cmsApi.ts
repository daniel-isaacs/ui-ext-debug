import type {ProxyResult} from '@shared/protocol';
import {ConfigError, proxyFetch} from './http';
import {decodeJwt, DecodedJwt} from './jwt';
import {mask} from './redact';
import {CmsSettings, loadCmsSettings} from './settings';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
  cacheKey: string;
}

// Tokens last about five minutes. Caching per container saves a round trip on warm calls.
let cached: CachedToken | null = null;

export interface TokenReport {
  tokenEndpoint: string;
  fromCache: boolean;
  expiresAt: string;
  preview: string;
  decoded: DecodedJwt | null;
  rawResponseFields: string[];
}

async function requestToken(settings: CmsSettings): Promise<{token: string; expiresIn: number; fields: string[]}> {
  if (!settings.clientId || !settings.clientSecret) {
    throw new ConfigError('cms_not_configured', 'Add a CMS API client ID and secret in the app settings.');
  }
  // The docs show a form body for plain client credentials and a JSON body when impersonating.
  // With the JSON body the endpoint ignores Basic auth and returns 400 "client_id is required",
  // so the credentials go in the body as well.
  const basic = Buffer.from(`${settings.clientId}:${settings.clientSecret}`).toString('base64');
  const response = await fetch(`${settings.baseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${basic}`,
      'content-type': settings.actAs ? 'application/json' : 'application/x-www-form-urlencoded',
      accept: 'application/json'
    },
    body: settings.actAs
      ? JSON.stringify({
          grant_type: 'client_credentials',
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          act_as: settings.actAs
        })
      : new URLSearchParams({grant_type: 'client_credentials'}).toString(),
    signal: AbortSignal.timeout(15_000)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new ConfigError('cms_token_failed', `Token request returned HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  const json = JSON.parse(text) as Record<string, unknown>;
  const token = typeof json.access_token === 'string' ? json.access_token : '';
  if (!token) throw new ConfigError('cms_token_failed', 'Token response had no access_token.');
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 300;
  return {token, expiresIn, fields: Object.keys(json)};
}

export async function getCmsToken(): Promise<{token: string; report: TokenReport}> {
  const settings = await loadCmsSettings();
  const cacheKey = `${settings.baseUrl}|${settings.clientId}|${settings.actAs}`;
  const tokenEndpoint = `${settings.baseUrl}/oauth/token`;

  if (cached && cached.cacheKey === cacheKey && cached.expiresAt - 30_000 > Date.now()) {
    return {
      token: cached.accessToken,
      report: {
        tokenEndpoint,
        fromCache: true,
        expiresAt: new Date(cached.expiresAt).toISOString(),
        preview: mask(cached.accessToken),
        decoded: decodeJwt(cached.accessToken),
        rawResponseFields: []
      }
    };
  }

  const {token, expiresIn, fields} = await requestToken(settings);
  cached = {accessToken: token, expiresAt: Date.now() + expiresIn * 1000, cacheKey};
  return {
    token,
    report: {
      tokenEndpoint,
      fromCache: false,
      expiresAt: new Date(cached.expiresAt).toISOString(),
      preview: mask(token),
      decoded: decodeJwt(token),
      rawResponseFields: fields
    }
  };
}

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Calls the CMS REST API with the app's API key. Only paths on the configured
 * base URL are allowed, so this can't be used as an open proxy.
 */
export async function cmsRequest(
  method: string,
  path: string,
  body: unknown,
  bearerOverride?: string
): Promise<ProxyResult> {
  const verb = method.toUpperCase();
  if (!METHODS.has(verb)) throw new ConfigError('bad_method', `Unsupported method ${method}.`);
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new ConfigError('bad_path', 'Path must start with a single "/", for example /v1/contenttypes.');
  }
  const settings = await loadCmsSettings();
  const token = bearerOverride ?? (await getCmsToken()).token;
  const headers: Record<string, string> = {authorization: `Bearer ${token}`, accept: 'application/json'};
  const init: RequestInit = {method: verb, headers};
  if (body !== undefined && body !== null && body !== '' && verb !== 'GET') {
    headers['content-type'] = 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return proxyFetch(`${settings.baseUrl}${path}`, init, bearerOverride ? 'forwarded bearer' : 'CMS API key token');
}
