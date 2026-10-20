import {Button, Group, Switch, Text} from '@optiaxiom/react';
import type {WebhookEntry} from '@shared/protocol';
import {useEffect, useState} from 'react';
import {resultOf, useBackendAction} from '../common/debugContext';
import {JsonView, OutcomeView, Section} from '../common/ui';

const POLL_MS = 5000;

interface InboxResult {
  endpoint: string | null;
  items: WebhookEntry[];
}

export function InboxPanel() {
  const inbox = useBackendAction<InboxResult>();
  const clear = useBackendAction();
  const [polling, setPolling] = useState(false);
  const runInbox = inbox.run;

  useEffect(() => {
    void runInbox('inbox');
    if (!polling) return;
    const timer = window.setInterval(() => void runInbox('inbox'), POLL_MS);
    return () => window.clearInterval(timer);
  }, [polling, runInbox]);

  const result = resultOf(inbox.outcome);
  const endpoint = result?.endpoint;

  return (
    <Group flexDirection="column" gap="16">
      <Section
        title="Webhook inbox"
        guide={{
          why: "Nothing can push to an extension. To get outside data into the UI, send it to the app's plain HTTP function: it stores the request, and this tab polls for it. It also shows which headers a normal HTTP call brings, unlike extension calls, which bring none.",
          steps: [
            'Turn on "Poll every 5 s".',
            'Run the curl command below in Git Bash (PowerShell mangles the quotes).',
            'Wait for the request to appear.'
          ],
          expect: 'Within 5 s: the method, path, headers (secrets masked) and body you sent.',
          report: 'The Copy button on the received request.'
        }}
      >
        <Text fontSize="sm" style={{overflowWrap: 'anywhere'}}>
          Endpoint: <b>{endpoint ?? '(not found: check whoami → functionEndpoints)'}</b>
        </Text>
        {endpoint && (
          <JsonView
            title="Try it"
            value={`curl -X POST "${endpoint}" -H "content-type: application/json" -d '{"hello":"from curl"}'`}
          />
        )}
        <Group gap="8" alignItems="center">
          <Button appearance="primary" onClick={() => void inbox.run('inbox')}>
            Refresh
          </Button>
          <Switch checked={polling} onCheckedChange={setPolling}>
            Poll every {POLL_MS / 1000} s
          </Switch>
          <Button
            onClick={() => {
              void clear.run('inboxClear').then(() => inbox.run('inbox'));
            }}
          >
            Clear
          </Button>
        </Group>
      </Section>

      {result?.items.length === 0 && <Text color="fg.secondary">Nothing received yet.</Text>}
      {result?.items.map((item, index) => (
        <JsonView key={`${item.receivedAt}-${index}`} title={`${item.receivedAt} ${item.method}`} value={item} maxHeight={220} />
      ))}
      {!result && <OutcomeView outcome={inbox.outcome} loading={inbox.loading} />}
    </Group>
  );
}
