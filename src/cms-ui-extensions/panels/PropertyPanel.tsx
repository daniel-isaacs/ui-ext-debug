import {Button, Group, Text, Textarea} from '@optiaxiom/react';
import type {PropertySetResult, PropertyState} from '@optimizely/cms-extensibility-sdk';
import {useEffect, useState} from 'react';
import {useDebug} from '../common/debugContext';
import {logGroup} from '../common/log';
import {Bordered, CopyButton, Facts, JsonView, Section} from '../common/ui';

interface PropertyEvent {
  at: string;
  source: 'get()' | 'subscribe()';
  state: PropertyState;
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array (${value.length})`;
  return typeof value;
}

function preview(value: unknown): string {
  const text = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value) ?? String(value);
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

export function PropertyPanel() {
  const {context, content} = useDebug();
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
  const settings = latest?.settings;
  const settingsEntries = settings ? Object.entries(settings) : [];

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
      <Section
        title="Page context"
        guide={{
          why: 'A property editor also knows which content it belongs to, from context.content, the same as the sidebar.',
          expect: 'Key, version, locale and public URL of the content being edited.',
          found:
            'Property editors get the page context and can call the backend through invokeFunction, the same as the sidebar.'
        }}
      >
        <Bordered>
          <Facts
            rows={[
              ['Key', content?.key],
              ['Version', content?.version],
              ['Locale', content?.locale],
              ['Public URL', content?.publicUrl]
            ]}
          />
        </Bordered>
      </Section>

      <Section
        title="PropertyState"
        guide={{
          why: 'Everything the CMS tells the editor about its property: the value, whether it may be changed, and optional settings.',
          steps: ['Open content with a property that uses this editor.', 'Compare a new property with one that has a value.'],
          expect: 'value matches the property type (a string here), readonly is false unless the content is locked or published.',
          report: '"Copy state".'
        }}
      >
        {latest ? (
          <>
            <Bordered>
              <Facts
                rows={[
                  ['value type', typeOf(latest.value)],
                  ['readonly', String(latest.readonly)],
                  ['settings', settings === undefined ? 'undefined (not sent)' : `${typeOf(settings)}, ${settingsEntries.length} keys`]
                ]}
              />
            </Bordered>
            <JsonView title="Latest PropertyState" value={latest} maxHeight={200} />
          </>
        ) : (
          <Text color="fg.secondary">No PropertyState yet.</Text>
        )}
      </Section>

      <Section
        title="settings"
        guide={{
          why: 'PropertyState.settings is typed as Record<string, unknown> and isn\'t documented. It may carry the property\'s configuration from the content type (length limits, required, allowed values).',
          steps: [
            'Look at the keys below.',
            'Change the property\'s settings in CMS Settings → Content Types (required, help text, limits), reload, and compare.'
          ],
          expect: 'Unknown. That is what this section is for.',
          report: '"Copy settings", plus what you changed in the content type.'
        }}
      >
        {settingsEntries.length > 0 ? (
          <>
            <Bordered>
              <Facts rows={settingsEntries.map(([key, value]) => [key, `${typeOf(value)}: ${preview(value)}`])} />
            </Bordered>
            <CopyButton value={settings} label="Copy settings" />
          </>
        ) : (
          <Text color="fg.secondary" fontSize="sm">
            {latest ? (settings === undefined ? 'The CMS sent no settings.' : 'settings is empty.') : 'Waiting for the property state.'}
          </Text>
        )}
      </Section>

      <Section
        title="Write a raw value"
        guide={{
          why: 'What the CMS accepts or rejects for this property type. The text is parsed as JSON, or sent as a string if it isn\'t JSON.',
          steps: ['Try "text", 42, true and null.', 'Watch the editor above and the result below.'],
          expect: 'Strings succeed. Other types should be rejected with an error.',
          report: 'The set() result for each value.',
          found: 'A successful set() saves the value, but the CMS sends no subscribe() event back. The editor updates its own input.'
        }}
      >
        <Textarea value={raw} onChange={(event) => setRaw(event.target.value)} placeholder='"text", 42, true, null' />
        <Group gap="8">
          <Button appearance="danger" disabled={latest?.readonly} onClick={() => void writeRaw()}>
            property.set()
          </Button>
        </Group>
        {setResult && <JsonView title="set() result" value={setResult} />}
      </Section>

      <Section title={`Property events (${events.length})`} hint="get() when the editor loads, then every subscribe() callback, newest first.">
        <CopyButton value={events} label="Copy events" />
        {events.map((event, index) => (
          <JsonView key={`${event.at}-${index}`} title={`${event.at.slice(11, 23)} ${event.source}`} value={event.state} maxHeight={160} />
        ))}
      </Section>
    </Group>
  );
}
