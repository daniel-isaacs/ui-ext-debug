import {Disclosure, DisclosureContent, DisclosureTrigger, Group, Input, Switch, Text} from '@optiaxiom/react';
import type {ExtensionContext, PropertyState} from '@optimizely/cms-extensibility-sdk';
import {useEffect, useState} from 'react';
import {DebuggerApp} from './DebuggerApp';
import {logGroup} from './log';

export type EditorKind = 'string' | 'boolean';

/**
 * A working editor for the bound property, with the full debugger folded
 * underneath. The editor comes first so content stays editable while the
 * debugger is installed.
 */
export function PropertyEditorShell({context, kind}: {context: ExtensionContext; kind: EditorKind}) {
  const [state, setState] = useState<PropertyState | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const apply = (next: PropertyState) => {
      if (!active) return;
      setState(next);
      if (kind === 'string') setDraft(typeof next.value === 'string' ? next.value : '');
    };
    context.property
      .get()
      .then(apply)
      .catch((err: unknown) => setError(String(err)));
    const unsubscribe = context.property.subscribe(apply);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [context, kind]);

  const save = async (value: unknown) => {
    const result = await context.property.set(value);
    logGroup('editor property.set()', {value, result});
    setError(result.success ? null : (result.error ?? 'The CMS rejected the value.'));
  };

  const readonly = !state || state.readonly;

  return (
    <Group flexDirection="column" gap="8">
      {kind === 'string' ? (
        <Input
          disabled={readonly}
          onBlur={() => {
            if (draft !== state?.value) void save(draft);
          }}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void save(draft);
            }
          }}
          value={draft}
        />
      ) : (
        <Switch checked={state?.value === true} disabled={readonly} onCheckedChange={(checked) => void save(checked)}>
          {state?.value === true ? 'On' : 'Off'}
        </Switch>
      )}
      {error && (
        <Text color="fg.error" fontSize="sm">
          {error}
        </Text>
      )}
      <Disclosure>
        <DisclosureTrigger>UI Extension Debugger</DisclosureTrigger>
        <DisclosureContent>
          <DebuggerApp context={context} surface="property-editor" />
        </DisclosureContent>
      </Disclosure>
    </Group>
  );
}
