import {Badge, Button, Group, Text} from '@optiaxiom/react';
import {DEFAULT_GRAPH_ENDPOINT} from '@shared/constants';
import {useMemo, useState, useSyncExternalStore} from 'react';
import {getEntries, subscribeEntries} from '../common/bridgeSpy';
import {collectEnvironment, runSandboxTests, type SandboxTest} from '../common/environment';
import {logGroup} from '../common/log';
import {CopyButton, JsonView, Section} from '../common/ui';

export function EnvironmentPanel() {
  const [environment, setEnvironment] = useState(collectEnvironment);
  const [tests, setTests] = useState<SandboxTest[] | null>(null);
  const [running, setRunning] = useState(false);
  const entries = useSyncExternalStore(subscribeEntries, getEntries);
  const violations = useMemo(() => entries.filter((entry) => entry.dir === 'csp'), [entries]);

  const runTests = async () => {
    setRunning(true);
    try {
      const results = await runSandboxTests(DEFAULT_GRAPH_ENDPOINT);
      logGroup('sandbox tests', results);
      setTests(results);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Group flexDirection="column" gap="16">
      <Section
        title="Sandbox tests"
        guide={{
          why: 'The extension runs in a sandboxed iframe. This finds out which browser features work there: forms, popups, clipboard, IndexedDB, the Cache API and direct calls to Graph.',
          steps: ['Click Run tests. A blank tab may open if popups are allowed; close it.'],
          expect: 'Form submit blocked (no allow-forms). Popups and clipboard vary. IndexedDB and the Cache API blocked by the opaque origin. fetch to Graph gets an HTTP answer (CSP allows https:).',
          report: '"Copy results".',
          found:
            'Blocked: localStorage, sessionStorage, cookies, IndexedDB and the Cache API (no allow-same-origin), form submit, window.open and the Clipboard API (permissions policy; copying still works through execCommand). Allowed: fetch to Graph straight from the browser.'
        }}
      >
        <Group gap="8" flexWrap="wrap">
          <Button appearance="primary" disabled={running} onClick={() => void runTests()}>
            Run tests
          </Button>
          {tests && <CopyButton value={tests} label="Copy results" />}
        </Group>
        {tests?.map((test) => (
          <Group gap="8" key={test.name} alignItems="start">
            <Badge intent={/allowed|HTTP 2|HTTP 4/.test(test.result) ? 'success' : 'warning'}>{test.name}</Badge>
            <Text fontSize="sm" style={{minWidth: 0, overflowWrap: 'anywhere'}}>
              {test.result}
            </Text>
          </Group>
        ))}
      </Section>

      <Section
        title={`CSP violations (${violations.length})`}
        guide={{
          why: "The CMS sets a strict Content Security Policy on the iframe. Anything it blocks (fonts, scripts, images from other hosts) is listed here, since the extension can't see it fail otherwise.",
          expect: 'None. The debugger ships no fonts, so nothing is blocked.',
          report: 'The list, if it isn\'t empty.',
          found:
            'dev.3 had 22 font-src violations: fonts inlined as data: URLs, which the policy blocks. Serving them as files from the build failed too (the OCP CDN answers 403), so from dev.15 the debugger ships no fonts and uses the browser\'s fallback fonts.'
        }}
      >
        {violations.length > 0 && <JsonView value={violations.map((entry) => entry.data)} />}
      </Section>

      <Section
        title="Iframe environment"
        guide={{
          why: 'Location, storage, permissions, browser and display details as seen from inside the iframe. It shows what an extension can and can\'t use, and what it can learn about the editor.',
          expect: 'Origin "null", storage blocked, a short permissions-policy list, and the browser\'s own language, time zone and color scheme.',
          report: 'The Copy button on the JSON.',
          found:
            'Allowed features: client hints, gamepad, picture-in-picture, sync-xhr, storage-access and a few more. No clipboard, camera, microphone, geolocation or fullscreen. Language, time zone and dark mode come from the browser and OS, not from the CMS.'
        }}
      >
        <Button
          onClick={() => {
            const next = collectEnvironment();
            logGroup('environment', next);
            setEnvironment(next);
          }}
        >
          Refresh
        </Button>
        <JsonView value={environment} maxHeight={600} />
      </Section>
    </Group>
  );
}
