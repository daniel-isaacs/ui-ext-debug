import {Button, Group, Input, Text} from '@optiaxiom/react';
import {MAX_PAYLOAD_KB, MAX_SLEEP_MS} from '@shared/constants';
import {useEffect, useState} from 'react';
import {useBackendAction} from '../common/debugContext';
import {OutcomeView, Section} from '../common/ui';

export function BackendPanel() {
  const whoami = useBackendAction();
  const tests = useBackendAction();
  const kv = useBackendAction();
  const lifecycle = useBackendAction();
  const [kb, setKb] = useState('256');
  const [ms, setMs] = useState('3000');
  const [status, setStatus] = useState('418');
  const [note, setNote] = useState('Hello from another surface');
  const runWhoami = whoami.run;

  useEffect(() => {
    void runWhoami('whoami');
  }, [runWhoami]);

  return (
    <Group flexDirection="column" gap="16">
      <Section
        title="What the backend function sees"
        guide={{
          why: 'Everything the backend knows when an extension calls it: install context, the inbound request and headers, its own URLs and runtime. This tells you what a backend can rely on.',
          expect: 'scope = the CMS instance UUID, request path "/", the version you deployed.',
          report: 'The Copy button on the result.',
          found:
            'No headers at all reach the function: no user, no token, no JWT. account is null. Only debug_webhook has a public URL.'
        }}
      >
        <Button appearance="primary" onClick={() => void whoami.run('whoami')}>
          Run whoami
        </Button>
        <OutcomeView outcome={whoami.outcome} loading={whoami.loading} />
      </Section>

      <Section
        title="Transport tests"
        guide={{
          why: 'The limits of invokeFunction: how much data, how long a call may run, and what errors look like here. A real extension needs these to design its backend calls.',
          steps: [
            'Echo: the request comes back unchanged.',
            `Return N KB with 256, then 1024, then ${MAX_PAYLOAD_KB}. Note where it fails.`,
            'Sleep N ms with 3000, 30000 and 55000, then 65000 to see what the SDK\'s 60 s timeout looks like. Afterwards, check the server logs: did the function still finish?',
            'Return HTTP status with 418, then 500.',
            'Throw (caught), then Throw (uncaught): the first is turned into a 500 by this function, the second escapes perform().',
            'OCP notification, then check where (if anywhere) it shows up.'
          ],
          expect:
            'Echo returns æøå 🐞 intact. Large payloads and long sleeps succeed up to some limit. Any status and body the function returns arrives unchanged. An uncaught exception is expected to arrive as HTTP 500 with an empty body.',
          found:
            'Responses up to just under 4 MiB work; 4096 KB fails with "Failed to invoke function:". 55 s sleeps work. 418 and a caught 500 arrive with their JSON body. Overhead is 200 to 650 ms per call.',
          report: 'For each test: the badges (HTTP status, round trip) and the first lines of the result. The Copy button gives the whole thing.'
        }}
      >
        <Group gap="8" flexWrap="wrap">
          <Button onClick={() => void tests.run('echo', {nested: {array: [1, 2, 3], unicode: 'æøå 🐞'}})}>Echo</Button>
          <Button onClick={() => void tests.run('probeForwardedAuth')}>Probe forwarded auth</Button>
          <Button onClick={() => void tests.run('notify', {message: 'Sent from the debugger'})}>OCP notification</Button>
        </Group>
        <Group gap="8" alignItems="center">
          <Input value={kb} onChange={(event) => setKb(event.target.value)} style={{width: 90}} />
          <Button onClick={() => void tests.run('payload', {kb: Number(kb)})}>Return N KB (max {MAX_PAYLOAD_KB})</Button>
        </Group>
        <Group gap="8" alignItems="center">
          <Input value={ms} onChange={(event) => setMs(event.target.value)} style={{width: 90}} />
          <Button onClick={() => void tests.run('sleep', {ms: Number(ms)})}>Sleep N ms (max {MAX_SLEEP_MS})</Button>
        </Group>
        <Group gap="8" alignItems="center">
          <Input value={status} onChange={(event) => setStatus(event.target.value)} style={{width: 90}} />
          <Button onClick={() => void tests.run('error', {status: Number(status)})}>Return HTTP status</Button>
          <Button appearance="danger" onClick={() => void tests.run('error', {mode: 'throw'})}>
            Throw (caught)
          </Button>
          <Button appearance="danger" onClick={() => void tests.run('error', {mode: 'uncaught'})}>
            Throw (uncaught)
          </Button>
        </Group>
        <OutcomeView outcome={tests.outcome} loading={tests.loading} />
      </Section>

      <Section
        title="Shared state between surfaces"
        guide={{
          why: "Extensions can't talk to each other directly, and the iframe has no localStorage. The backend's kvStore is the only shared, persistent store.",
          steps: ['Type a note and click Write in the sidebar.', 'Open the view (full-page extension) and click Read.'],
          expect: 'The view reads the note with writtenBy "sidebar" and the time it was written.',
          report: 'The Read result.'
        }}
      >
        <Group gap="8" alignItems="center">
          <Input value={note} onChange={(event) => setNote(event.target.value)} />
          <Button onClick={() => void kv.run('kvPut', {note})}>Write</Button>
          <Button onClick={() => void kv.run('kvGet')}>Read</Button>
        </Group>
        <OutcomeView outcome={kv.outcome} loading={kv.loading} />
      </Section>

      <Section
        title="Lifecycle log"
        guide={{
          why: 'onInstall, onUpgrade and onSettingsForm run outside any extension call. This shows when they ran and with what context, compared with the function context above.',
          steps: ['Click Load lifecycle log.', 'Save the app settings once, then load it again.'],
          expect: 'onInstall from the first install, onUpgrade for each deploy (from the previous version), onSettingsForm for each save.',
          report: 'The Copy button on the result.'
        }}
      >
        <Button onClick={() => void lifecycle.run('lifecycleLog')}>Load lifecycle log</Button>
        <OutcomeView outcome={lifecycle.outcome} loading={lifecycle.loading} />
      </Section>

      <Text color="fg.secondary" fontSize="sm">
        Server logs: ocp app logs --appId steve_ui_ext_debug --scope &lt;cms-instance-uuid&gt; --tail
      </Text>
    </Group>
  );
}
