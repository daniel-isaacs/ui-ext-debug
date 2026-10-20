import {Badge, Button, Group, Input, Text, Textarea} from '@optiaxiom/react';
import {useRef, useState, useSyncExternalStore} from 'react';
import {
  clearEntries,
  getEntries,
  getInitInfo,
  rawCall,
  rawSubscribe,
  subscribeEntries,
  type BridgeEntry,
  type ProbeResult
} from '../common/bridgeSpy';
import {logGroup} from '../common/log';
import {CopyButton, JsonView, Section} from '../common/ui';

// Read-only guesses at host methods the SDK doesn't wrap. Nothing here should change CMS state.
const GUESSED_METHODS = [
  'extension.getDefinition',
  'content.get',
  'property.get',
  'extension.getContext',
  'context.get',
  'host.getInfo',
  'user.get',
  'user.getCurrent',
  'auth.getToken',
  'locale.get',
  'theme.get',
  'cms.getInstance',
  'content.getType',
  'content.getProperties'
];

const GUESSED_EVENTS = ['content', 'property', 'user', 'theme', 'locale', 'selection', 'navigation'];

const DIR_INTENT: Record<BridgeEntry['dir'], 'information' | 'success' | 'neutral' | 'danger'> = {
  init: 'neutral',
  out: 'information',
  in: 'success',
  csp: 'danger'
};

export function BridgePanel() {
  const entries = useSyncExternalStore(subscribeEntries, getEntries);
  const [method, setMethod] = useState('user.get');
  const [payload, setPayload] = useState('');
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [sweep, setSweep] = useState<ProbeResult[] | null>(null);
  const [eventName, setEventName] = useState('user');
  const [subscribed, setSubscribed] = useState<string[]>([]);
  const unsubscribers = useRef(new Map<string, () => void>());

  const parsePayload = (): unknown => {
    if (!payload.trim()) return undefined;
    try {
      return JSON.parse(payload);
    } catch {
      return payload;
    }
  };

  const callOne = async () => {
    const result = await rawCall(method.trim(), parsePayload());
    logGroup(`raw call ${method}`, result);
    setProbe(result);
  };

  const callAll = async () => {
    setSweep([]);
    const results: ProbeResult[] = [];
    for (const name of GUESSED_METHODS) {
      results.push(await rawCall(name, undefined, 2000));
      setSweep([...results]);
    }
    logGroup('method sweep', results);
  };

  const subscribe = () => {
    const name = eventName.trim();
    if (!name || unsubscribers.current.has(name)) return;
    const off = rawSubscribe(name);
    if (!off) return;
    unsubscribers.current.set(name, off);
    setSubscribed([...unsubscribers.current.keys()]);
  };

  const unsubscribe = (name: string) => {
    unsubscribers.current.get(name)?.();
    unsubscribers.current.delete(name);
    setSubscribed([...unsubscribers.current.keys()]);
  };

  return (
    <Group flexDirection="column" gap="16">
      <Section
        title="Init message"
        guide={{
          why: 'The CMS starts every extension with a CMS_INIT window message that carries a private MessagePort. Any extra data in it would be context the SDK hides.',
          expect: 'A message with only a type, and one port.',
          found: 'Only {type: "CMS_INIT"} and one port, in both the sidebar and the view.'
        }}
      >
        <JsonView value={getInitInfo() ?? 'No CMS_INIT seen. Was the spy installed before register()?'} />
      </Section>

      <Section
        title="Call any host method"
        guide={{
          why: 'The SDK wraps six host methods. The CMS may support more (user, locale, theme). This sends raw calls over the same port to find out. All guesses are read-only.',
          steps: [
            `Click "Try ${GUESSED_METHODS.length} guessed methods" and wait for the list to finish.`,
            'Do it in both the sidebar and the view.',
            'If an error text names other methods, type one into the field and click Call.'
          ],
          expect:
            'extension.getDefinition and content.get return a result. Unknown methods return an error, or time out after 2 s if the host ignores them.',
          report: '"Copy results" below. Note which surface you ran it in.',
          found:
            'Sidebar (dev.9): only extension.getDefinition, content.get and property.get answer; property.get is {readonly: true} there. Everything else is "Unknown method: <name>", with no list of supported methods.'
        }}
      >
        <Input value={method} onChange={(event) => setMethod(event.target.value)} placeholder="method name" />
        <Textarea value={payload} onChange={(event) => setPayload(event.target.value)} placeholder="payload (JSON, optional)" />
        <Group gap="8" flexWrap="wrap">
          <Button appearance="primary" onClick={() => void callOne()}>
            Call
          </Button>
          <Button onClick={() => void callAll()}>Try {GUESSED_METHODS.length} guessed methods</Button>
          {sweep && sweep.length > 0 && <CopyButton value={sweep} label="Copy results" />}
        </Group>
        {probe && <JsonView title={`${probe.method}: ${probe.outcome} (${probe.latencyMs} ms)`} value={probe.value ?? null} />}
        {sweep && (
          <Group flexDirection="column" gap="4">
            {sweep.map((result) => (
              <Group gap="8" key={result.method} alignItems="start">
                <Badge intent={result.outcome === 'result' ? 'success' : result.outcome === 'error' ? 'warning' : 'neutral'}>
                  {result.outcome}
                </Badge>
                <Text fontSize="sm" style={{flex: '0 0 180px'}}>
                  {result.method}
                </Text>
                <Text fontSize="sm" color="fg.secondary" style={{minWidth: 0, overflowWrap: 'anywhere'}}>
                  {result.value === undefined ? '' : JSON.stringify(result.value).slice(0, 200)}
                </Text>
              </Group>
            ))}
          </Group>
        )}
      </Section>

      <Section
        title="Subscribe to any event"
        guide={{
          why: 'The SDK only subscribes to content and property. The host may emit other events, for example when the editor switches theme or language.',
          steps: [
            'Click an event name, then Subscribe. Repeat for every name.',
            'In the CMS: navigate, switch the UI theme (light or dark), switch language, select a block.',
            'Look for CMS_EVENT entries in Traffic below.'
          ],
          expect: 'Only "content" produces events. Any other event that fires is a new finding.',
          report: '"Copy traffic" in the Traffic section, with a note of what you did in the CMS.',
          found:
            'Unknown events are accepted without an error but never fire. Only content does: on pages, page versions and blocks (blocks have no publicUrl). Each content subscription gets the current state right away.'
        }}
      >
        <Group gap="8">
          <Input value={eventName} onChange={(event) => setEventName(event.target.value)} placeholder="event name" />
          <Button onClick={subscribe}>Subscribe</Button>
        </Group>
        <Group gap="4" flexWrap="wrap">
          {GUESSED_EVENTS.map((name) => (
            <Button appearance="subtle" key={name} onClick={() => setEventName(name)} size="sm">
              {name}
            </Button>
          ))}
        </Group>
        {subscribed.map((name) => (
          <Group gap="8" key={name} alignItems="center">
            <Badge intent="information">{name}</Badge>
            <Button appearance="subtle" onClick={() => unsubscribe(name)} size="sm">
              Unsubscribe
            </Button>
          </Group>
        ))}
      </Section>

      <Section
        title={`Traffic (${entries.length})`}
        guide={{
          why: 'Every message between the extension and the CMS, newest first, including backend calls. This is the raw truth when the SDK hides something.',
          expect: 'out = the extension calls the CMS, in = the CMS answers or sends an event, csp = the browser blocked something.',
          report: '"Copy traffic". Click Clear first to keep the paste short.'
        }}
      >
        <Group gap="8" flexWrap="wrap">
          <Button onClick={clearEntries}>Clear</Button>
          <CopyButton value={entries} label="Copy traffic" />
          <Button onClick={() => logGroup('bridge traffic', entries)}>Log all to console</Button>
        </Group>
        {entries.map((entry) => (
          <Group flexDirection="column" gap="4" key={entry.seq}>
            <Group gap="4" alignItems="center" flexWrap="wrap">
              <Badge intent={DIR_INTENT[entry.dir]}>{entry.dir}</Badge>
              <Text fontSize="sm" fontWeight="600">
                {entry.type}
              </Text>
              {entry.name && <Text fontSize="sm">{entry.name}</Text>}
              {entry.id !== undefined && (
                <Text fontSize="sm" color="fg.secondary">
                  #{entry.id}
                </Text>
              )}
              {entry.latencyMs !== undefined && <Badge intent="neutral">{entry.latencyMs} ms</Badge>}
              <Text fontSize="sm" color="fg.secondary">
                {entry.at.slice(11, 23)}
              </Text>
            </Group>
            <JsonView value={entry.data} maxHeight={160} />
          </Group>
        ))}
      </Section>
    </Group>
  );
}
