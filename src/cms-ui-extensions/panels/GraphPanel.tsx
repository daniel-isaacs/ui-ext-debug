import {Button, Group, Textarea} from '@optiaxiom/react';
import type {GraphAuth} from '@shared/protocol';
import {useState} from 'react';
import {useBackendAction, useDebug} from '../common/debugContext';
import {OutcomeView, Section} from '../common/ui';

const AUTH_OPTIONS: [GraphAuth, string][] = [
  ['single', 'Single key'],
  ['basic', 'App key + secret'],
  ['bearer', 'CMS API token']
];

const PRESETS: Record<string, string> = {
  'Content types in Graph': `{
  __schema {
    types { name kind }
  }
}`,
  'Latest content': `{
  _Content(limit: 10, orderBy: { _metadata: { lastModified: DESC } }) {
    total
    items { _metadata { key displayName types locale status lastModified url { default } } }
  }
}`,
  'This content': `query ContentByKey($key: String!) {
  _Content(where: { _metadata: { key: { eq: $key } } }) {
    total
    items { _metadata { key displayName types locale version status published lastModified url { default hierarchical base } } }
  }
}`,
  'This version': `query ContentVersion($key: String!, $locale: String!, $version: String!) {
  _Content(where: { _metadata: { key: { eq: $key }, locale: { eq: $locale }, version: { eq: $version } } }) {
    total
    items { _metadata { key displayName types locale version status published lastModified url { default hierarchical base } } }
  }
}`,
  'Count by type': `{
  _Content {
    total
    facets { _metadata { types { name count } } }
  }
}`
};

export function GraphPanel() {
  const {content} = useDebug();
  const graph = useBackendAction();
  const [auth, setAuth] = useState<GraphAuth>('single');
  const [query, setQuery] = useState(PRESETS['Latest content']);
  const [variables, setVariables] = useState('');

  const pickPreset = (name: string) => {
    setQuery(PRESETS[name]);
    const current = {key: content?.key ?? '', locale: content?.locale ?? '', version: content?.version ?? ''};
    const variables: Record<string, unknown> = {
      'This content': {key: current.key},
      'This version': current
    };
    setVariables(name in variables ? JSON.stringify(variables[name], null, 2) : '');
    // The open content is often a draft, which only the app key can see.
    if (name in variables) setAuth('basic');
  };

  const send = () => {
    let parsed: unknown;
    try {
      parsed = variables.trim() ? JSON.parse(variables) : undefined;
    } catch {
      parsed = undefined;
    }
    void graph.run('graphQuery', {query, variables: parsed, auth});
  };

  return (
    <Group flexDirection="column" gap="16">
      <Section
        title="Optimizely Graph"
        guide={{
          why: 'Graph is the fastest way for a backend to look up content. Which key you use decides what you see. Queries run through the backend with the keys from the app settings.',
          steps: [
            'Pick "This version" or "This content". They fill in the open content and switch to the app key, since drafts need it.',
            'Run it, then try the other auth options.'
          ],
          expect: 'Single key: published versions only. App key + secret: every version with its status. CMS API token: rejected.',
          report: 'The status badge and the item count (total).',
          found:
            'As expected. The CMS API token gets 401 "Missing tenant_id". Rate limit: 2500 requests per 10 s, and each query reports its cost.'
        }}
      >
        <Group gap="4" flexWrap="wrap">
          {AUTH_OPTIONS.map(([value, label]) => (
            <Button appearance={value === auth ? 'primary' : 'subtle'} key={value} onClick={() => setAuth(value)} size="sm">
              {label}
            </Button>
          ))}
        </Group>
        <Group gap="4" flexWrap="wrap">
          {Object.keys(PRESETS).map((name) => (
            <Button appearance="subtle" key={name} onClick={() => pickPreset(name)} size="sm">
              {name}
            </Button>
          ))}
        </Group>
        <Textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={10} style={{fontFamily: 'monospace'}} />
        <Textarea value={variables} onChange={(event) => setVariables(event.target.value)} placeholder="variables (JSON)" />
        <Button appearance="primary" onClick={send}>
          Run query
        </Button>
        <OutcomeView outcome={graph.outcome} loading={graph.loading} />
      </Section>
    </Group>
  );
}
