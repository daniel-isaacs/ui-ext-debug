import {storage} from '@zaiusinc/app-sdk';
import type {AeoRecord, AeoStatus} from '@shared/protocol';
import {graphQuery} from './graph';
import {ConfigError} from './http';

// kvStore values must be objects of primitives, so the record is one JSON string field.
interface StoredRecord {
  record?: string;
  [field: string]: string | undefined;
}

const PUBLISHED_STATUSES = `query AeoPublished($key: String!, $locale: String!) {
  _Content(where: { _metadata: { key: { eq: $key }, locale: { eq: $locale } } }, limit: 100) {
    items { _metadata { status displayName types lastModified } }
  }
}`;

function recordKey(key: string, locale: string): string {
  return `aeo_${key}_${locale}`;
}

/** The stored analysis for a page, and whether the page has ever been published. */
export async function aeoGet(key: string, locale: string): Promise<AeoStatus> {
  if (!key || !locale) throw new ConfigError('missing_content', 'Send the content key and locale.');
  const [stored, published] = await Promise.all([
    storage.kvStore.get<StoredRecord>(recordKey(key, locale)),
    publishedState(key, locale)
  ]);
  let record: AeoRecord | null = null;
  if (stored.record) {
    try {
      record = JSON.parse(stored.record) as AeoRecord;
    } catch {
      record = null;
    }
  }
  return {...published, record};
}

/** Stores an analysis. The mock builds the report in the browser; a real job would build it here. */
export async function aeoPut(input: Omit<AeoRecord, 'analysedAt'>): Promise<AeoRecord> {
  if (!input.key || !input.locale) throw new ConfigError('missing_content', 'Send the content key and locale.');
  const record: AeoRecord = {...input, analysedAt: new Date().toISOString()};
  await storage.kvStore.put(recordKey(input.key, input.locale), {record: JSON.stringify(record)});
  return record;
}

/** Deletes the stored analysis, so the page shows "Not analysed yet" again. */
export async function aeoClear(key: string, locale: string): Promise<{cleared: true}> {
  if (!key || !locale) throw new ConfigError('missing_content', 'Send the content key and locale.');
  await storage.kvStore.delete(recordKey(key, locale));
  return {cleared: true};
}

interface GraphMetadata {
  status?: string;
  displayName?: string;
  types?: string[];
  lastModified?: string;
}

type PageInfo = Omit<AeoStatus, 'record'>;

/**
 * Asks Graph with the app key, which sees drafts. Uses `status`, not `published`: on a draft,
 * `published` holds the item's publish date. Unknown (null) when Graph isn't configured or fails.
 * The name and type come from the published version if there is one, else the newest version.
 */
async function publishedState(key: string, locale: string): Promise<PageInfo> {
  const unknown = (publishedCheck: string): PageInfo => ({
    published: null,
    publishedCheck,
    displayName: null,
    contentType: null
  });
  try {
    const result = await graphQuery(PUBLISHED_STATUSES, {key, locale}, 'basic');
    const items = (result.body as {data?: {_Content?: {items?: {_metadata?: GraphMetadata}[]}}})?.data?._Content
      ?.items;
    if (result.status !== 200 || !Array.isArray(items)) return unknown(`Graph answered HTTP ${result.status}`);

    const versions = items.map((item) => item._metadata ?? {});
    const published = versions.some((meta) => meta.status === 'Published');
    const newest = [...versions].sort((a, b) => (b.lastModified ?? '').localeCompare(a.lastModified ?? ''));
    const best = newest.find((meta) => meta.status === 'Published') ?? newest[0];
    return {
      published,
      publishedCheck: `Graph: ${items.length} version(s), ${published ? 'one published' : 'none published'}`,
      displayName: best?.displayName || null,
      // `types` lists the content type first, then base types such as `_Page` and `_Content`.
      contentType: best?.types?.find((type) => !type.startsWith('_')) ?? null
    };
  } catch (error) {
    return unknown(error instanceof Error ? error.message : String(error));
  }
}
