import {Button, Group, Text} from '@optiaxiom/react';
import type {ContentState} from '@optimizely/cms-extensibility-sdk';
import {useState} from 'react';
import {useBackendAction, useDebug} from '../common/debugContext';
import {logGroup} from '../common/log';
import {CopyButton, JsonView, OutcomeView, Section} from '../common/ui';

export interface ContentEvent {
  at: string;
  source: 'get()' | 'subscribe()';
  state: ContentState;
}

const CONTENT_BY_KEY = `query ContentByKey($key: String!) {
  _Content(where: { _metadata: { key: { eq: $key } } }) {
    total
    items {
      _metadata {
        key locale version displayName types status
        published lastModified
        url { default hierarchical base }
      }
    }
  }
}`;

export function ContentPanel({events}: {events: ContentEvent[]}) {
  const {context, content} = useDebug();
  const [snapshot, setSnapshot] = useState<unknown>(undefined);
  const graph = useBackendAction();
  const rest = useBackendAction();
  const key = content?.key;

  const readNow = async () => {
    const state = await context.content.get().catch((error: unknown) => ({error: String(error)}));
    logGroup('content.get()', state);
    setSnapshot(state);
  };

  return (
    <Group flexDirection="column" gap="16">
      <Section
        title="Content events"
        guide={{
          why: 'When the CMS tells an extension about the open content. An extension that reacts to the page (checks, previews, suggestions) depends on these events.',
          steps: [
            'Open a page, then open this sidebar.',
            'Navigate to another page and back.',
            'Edit a property, then click "Ready to publish", then "Publish", then edit again.',
            'Reload the CMS (F5) with the sidebar open, wait 30 s, then click "Call content.get() now".',
            'In the view (full-page extension): same reload test.'
          ],
          expect:
            'The first entry comes from get() when the extension loads; the rest from subscribe(). Each entry has key, version, locale and public URL, but no status.',
          report: '"Copy events" below, plus a line saying what you did between the entries.',
          found:
            'Events on navigation (pages, older versions and blocks), "Ready to publish", "Publish" and the first edit after a publish (new version). None for edits inside a draft. Blocks have no public URL. After a full reload, get() and the first subscribe() event are both null until you navigate (CMS bug).'
        }}
      >
        <Group gap="8" flexWrap="wrap">
          <Button onClick={() => void readNow()}>Call content.get() now</Button>
          <CopyButton value={events} label="Copy events" />
        </Group>
        {snapshot !== undefined && <JsonView title="content.get()" value={snapshot} />}
        {events.length === 0 && <Text color="fg.secondary">No content events yet.</Text>}
        {events.map((event, index) => (
          <JsonView key={`${event.at}-${index}`} title={`${event.at.slice(11, 23)} ${event.source}`} value={event.state} maxHeight={160} />
        ))}
      </Section>

      <Section
        title="Look up this content"
        guide={{
          why: 'The CMS only sends key, version and locale. To know the status, type or property values, the backend has to look the content up. Needs Graph and CMS API keys in the app settings.',
          steps: ['Open a page that has a draft.', 'Click each of the three buttons.'],
          expect:
            'Graph (app key) lists every version in every locale with a status (Published, Draft, Previous). Graph (single key) lists only the published ones. The CMS API returns item metadata: type, parent, created and modified by, locales.',
          report: 'The Copy button on each result.',
          found: 'All three work. Graph shows a publish within about 12 s. Only Graph with the app key tells you the status of the version in a content event.'
        }}
      >
        <Group gap="8" flexWrap="wrap">
          <Button
            disabled={!key}
            onClick={() => void graph.run('graphQuery', {query: CONTENT_BY_KEY, variables: {key}, auth: 'basic'})}
          >
            Graph (app key, drafts)
          </Button>
          <Button
            disabled={!key}
            onClick={() => void graph.run('graphQuery', {query: CONTENT_BY_KEY, variables: {key}, auth: 'single'})}
          >
            Graph (single key)
          </Button>
          <Button disabled={!key} onClick={() => void rest.run('cmsRequest', {method: 'GET', path: `/v1/content/${key}`})}>
            CMS API /v1/content/{'{key}'}
          </Button>
        </Group>
        <OutcomeView outcome={graph.outcome} loading={graph.loading} title="Graph" />
        <OutcomeView outcome={rest.outcome} loading={rest.loading} title="CMS REST API" />
      </Section>
    </Group>
  );
}
