import {Button, Group, Text, Textarea} from '@optiaxiom/react';
import type {PropertySetResult, PropertyState} from '@optimizely/cms-extensibility-sdk';
import {useEffect, useState} from 'react';
import {useDebug} from '../common/debugContext';
import {logGroup} from '../common/log';
import {JsonView, Section} from '../common/ui';

interface PropertyEvent {
  at: string;
  source: 'get()' | 'subscribe()';
  state: PropertyState;
}

export function PropertyPanel() {
  const {context} = useDebug();
  const [events, setEvents] = useState<PropertyEvent[]>([]);
  const [raw, setRaw] = useState('');
  const [setResult, setSetResult] = useState<PropertySetResult | string | null>(null);

  useEffect(() => {
    let active = true;
    const record = (source: PropertyEvent['source'], state: PropertyState) => {
      if (!active) return;
      logGroup(`property ${source}`, state);
      setEvents((prev) => [{at: new Date().toISOString(), source, state}, ...prev].slice(0, 50));
    };
    context.property
      .get()
      .then((state) => record('get()', state))
      .catch((error: unknown) => logGroup('property get() failed', error));
    const unsubscribe = context.property.subscribe((state) => record('subscribe()', state));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [context]);

  const latest = events[0]?.state;

  const writeRaw = async () => {
    let value: unknown = raw;
    try {
      value = JSON.parse(raw);
    } catch {
      // Not JSON: send the text as a string.
    }
    try {
      const result = await context.property.set(value);
      logGroup('property.set()', {value, result});
      setSetResult(result);
    } catch (error) {
      setSetResult(`threw: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <Group flexDirection="column" gap="16">
      <Section title="Property state" hint="value, readonly and settings from context.property, newest first.">
        {latest && (
          <Text fontSize="sm">
            Value type: <b>{latest.value === null ? 'null' : typeof latest.value}</b> · readonly:{' '}
            <b>{String(latest.readonly)}</b> · settings keys: <b>{Object.keys(latest.settings ?? {}).join(', ') || 'none'}</b>
          </Text>
        )}
        {events.map((event, index) => (
          <JsonView key={`${event.at}-${index}`} title={`${event.at.slice(11, 23)} ${event.source}`} value={event.state} maxHeight={200} />
        ))}
      </Section>

      <Section
        title="Write a raw value"
        hint="Sent to property.set() as parsed JSON, or as a string if it isn't JSON. Use this to see what the CMS accepts or rejects for this type."
      >
        <Textarea value={raw} onChange={(event) => setRaw(event.target.value)} placeholder='"text", 42, true, null' />
        <Group gap="8">
          <Button appearance="danger" disabled={latest?.readonly} onClick={() => void writeRaw()}>
            property.set()
          </Button>
        </Group>
        {setResult && <JsonView title="set() result" value={setResult} />}
      </Section>
    </Group>
  );
}
