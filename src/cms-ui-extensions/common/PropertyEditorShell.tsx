import {Box, Button, Group, Input, Switch, Text} from '@optiaxiom/react';
import type {ExtensionContext, PropertySetResult, PropertyState} from '@optimizely/cms-extensibility-sdk';
import {useEffect, useMemo, useRef, useState} from 'react';
import {broadcast} from './crossFrame';
import {DebuggerApp} from './DebuggerApp';
import {logGroup} from './log';

export type EditorKind = 'string' | 'boolean';

/**
 * A working editor for the bound property, with the debugger folded underneath.
 *
 * The CMS gives the iframe a fixed height, so the editor stays pinned at the top and only the
 * debugger scrolls. The CMS does not echo a property.set() back through subscribe(), so every
 * successful set() (from the editor or from the debugger's Property tab) updates the editor here.
 */
export function PropertyEditorShell({context, kind}: {context: ExtensionContext; kind: EditorKind}) {
  const [state, setState] = useState<PropertyState | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const stateRef = useRef<PropertyState | null>(null);

  const apply = (next: PropertyState) => {
    stateRef.current = next;
    setState(next);
    if (kind === 'string') setDraft(typeof next.value === 'string' ? next.value : '');
  };
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    let active = true;
    context.property
      .get()
      .then((next) => active && applyRef.current(next))
      .catch((err: unknown) => setError(String(err)));
    const unsubscribe = context.property.subscribe((next) => {
      logGroup('editor property subscribe()', next);
      if (active) applyRef.current(next);
      // Tells the other extension frames, to test frame-to-frame messaging (Bridge tab).
      broadcast('property', {text: 'subscribe()', value: next.value});
    });
    // The debugger below only mounts when unfolded, so the editor tells the CMS it's ready.
    void context.extension.setReady();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [context]);

  // Every set(), wherever it comes from, goes through here and updates the editor on success.
  const syncedContext = useMemo<ExtensionContext>(() => {
    const property = context.property;
    return {
      ...context,
      property: {
        get: () => property.get(),
        subscribe: (callback) => property.subscribe(callback),
        set: async (value: unknown): Promise<PropertySetResult> => {
          const result = await property.set(value);
          if (result.success) {
            applyRef.current({...(stateRef.current ?? {readonly: false}), value} as PropertyState);
            broadcast('property', {text: 'set()', value});
          }
          return result;
        }
      }
    };
  }, [context]);

  const save = async (value: unknown) => {
    const result = await syncedContext.property.set(value);
    logGroup('editor property.set()', {value, result});
    setError(result.success ? null : (result.error ?? 'The CMS rejected the value.'));
  };

  const readonly = !state || state.readonly;

  // Not Axiom's Disclosure: its content sits in wrappers with overflow hidden and no height limit,
  // so it can't scroll inside the iframe's fixed height.
  return (
    <Group flexDirection="column" gap="4" style={{height: '100vh', overflow: 'hidden'}}>
      <Group flexDirection="column" gap="4" style={{flex: '0 0 auto'}}>
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
      </Group>
      <Button
        appearance="subtle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        size="sm"
        style={{alignSelf: 'flex-start', flex: '0 0 auto'}}
      >
        {open ? '▾' : '▸'} UI Extension Debugger
      </Button>
      {open && (
        <Box style={{flex: '1 1 auto', minHeight: 0, overflowY: 'auto'}}>
          <DebuggerApp context={syncedContext} surface="property-editor" />
        </Box>
      )}
    </Group>
  );
}
