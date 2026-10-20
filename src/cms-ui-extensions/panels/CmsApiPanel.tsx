import {Button, Group, Input, Text, Textarea} from '@optiaxiom/react';
import {useState} from 'react';
import {useBackendAction, useDebug} from '../common/debugContext';
import {OutcomeView, Section} from '../common/ui';

const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];

export function CmsApiPanel() {
  const {content} = useDebug();
  const token = useBackendAction();
  const request = useBackendAction();
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('/v1/contenttypes');
  const [body, setBody] = useState('');
  const key = content?.key ?? '{key}';

  const presets: [string, string][] = [
    ['Content types', '/v1/contenttypes'],
    ['Content sources', '/v1/contentsources'],
    ['This content', `/v1/content/${key}`],
    ['This content, versions', `/v1/content/${key}/versions`],
    ['Preview3 content types', '/preview3/contenttypes']
  ];

  const send = () => {
    let parsed: unknown = undefined;
    if (body.trim()) {
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = body;
      }
    }
    void request.run('cmsRequest', {method, path, body: parsed});
  };

  return (
    <Group flexDirection="column" gap="16">
      <Section
        title="Token"
        guide={{
          why: "The extension can't pass on the editor's login, so the backend needs its own CMS API key (app settings, CMS API section). This gets a token with it.",
          steps: ['Click the button.'],
          expect: 'HTTP 200 and decoded claims naming the client and the CMS instance. Tokens last about 5 minutes.',
          report: 'The claims part of the result (the token itself is masked).'
        }}
      >
        <Button appearance="primary" onClick={() => void token.run('cmsToken')}>
          Get token and decode claims
        </Button>
        <OutcomeView outcome={token.outcome} loading={token.loading} />
      </Section>

      <Section
        title="Request"
        guide={{
          why: 'What the CMS REST API (v1) returns for the open content, as a backend would see it. Calls go only to the base URL in the app settings.',
          steps: [
            'Click a preset, then Send GET. Try each preset.',
            'For versions: add ?statuses=draft or ?locale=en to the versions path to look for drafts.'
          ],
          expect: 'HTTP 200 for the v1 presets. Preview3 may be gone (404).',
          report: 'The status badge and the first part of the body. Avoid pasting whole property values.',
          found:
            '/v1/content/{key} gives item metadata (type, parent, created and modified by, locales). /versions gives only the published version per locale, with all property values.'
        }}
      >
        <Group gap="4" flexWrap="wrap">
          {METHODS.map((verb) => (
            <Button appearance={verb === method ? 'primary' : 'subtle'} key={verb} onClick={() => setMethod(verb)} size="sm">
              {verb}
            </Button>
          ))}
        </Group>
        <Input value={path} onChange={(event) => setPath(event.target.value)} placeholder="/v1/..." />
        {method !== 'GET' && (
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="JSON body" />
        )}
        <Group gap="4" flexWrap="wrap">
          {presets.map(([label, value]) => (
            <Button appearance="subtle" key={label} onClick={() => setPath(value)} size="sm">
              {label}
            </Button>
          ))}
        </Group>
        <Group gap="8" alignItems="center">
          <Button appearance={method === 'GET' ? 'primary' : 'danger'} onClick={send}>
            Send {method}
          </Button>
          {method !== 'GET' && (
            <Text color="fg.error" fontSize="sm">
              Writes to the real CMS.
            </Text>
          )}
        </Group>
        <OutcomeView outcome={request.outcome} loading={request.loading} />
      </Section>
    </Group>
  );
}
