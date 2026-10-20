import {storage, ValueHash} from '@zaiusinc/app-sdk';
import {DEFAULT_CMS_BASE_URL, DEFAULT_GRAPH_ENDPOINT} from '@shared/constants';

export interface CmsSettings {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  actAs: string;
}

export interface GraphSettings {
  endpoint: string;
  singleKey: string;
  appKey: string;
  appSecret: string;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export async function loadCmsSettings(): Promise<CmsSettings> {
  const raw = await storage.settings.get<ValueHash>('cms_api');
  return {
    baseUrl: trimSlash(str(raw.baseUrl) || DEFAULT_CMS_BASE_URL),
    clientId: str(raw.clientId),
    clientSecret: str(raw.clientSecret),
    actAs: str(raw.actAs)
  };
}

export async function loadGraphSettings(): Promise<GraphSettings> {
  const raw = await storage.settings.get<ValueHash>('graph');
  return {
    endpoint: trimSlash(str(raw.endpoint) || DEFAULT_GRAPH_ENDPOINT),
    singleKey: str(raw.singleKey),
    appKey: str(raw.appKey),
    appSecret: str(raw.appSecret)
  };
}

/** What is configured, without exposing any secret. Safe to send to the browser. */
export async function settingsSummary() {
  const cms = await loadCmsSettings();
  const graph = await loadGraphSettings();
  return {
    cms_api: {
      baseUrl: cms.baseUrl,
      clientId: cms.clientId || null,
      clientSecretSet: Boolean(cms.clientSecret),
      actAs: cms.actAs || null
    },
    graph: {
      endpoint: graph.endpoint,
      singleKeySet: Boolean(graph.singleKey),
      appKey: graph.appKey || null,
      appSecretSet: Boolean(graph.appSecret)
    }
  };
}
