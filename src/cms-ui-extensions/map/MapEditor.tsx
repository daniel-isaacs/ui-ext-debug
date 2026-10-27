import {Box, Button, Group, Input, Text} from '@optiaxiom/react';
import type {ExtensionContext, PropertyState} from '@optimizely/cms-extensibility-sdk';
import type {CSSProperties} from 'react';
import {useEffect, useState} from 'react';
import {logGroup} from '../common/log';
import {
  clampZoom,
  DEFAULT_ZOOM,
  formatCoordinates,
  MAX_ZOOM,
  MIN_ZOOM,
  MOCK_PLACES,
  type MapValue,
  parseMapValue
} from './mapValue';
import {isInsideMockMap, MockMap} from './MockMap';

/**
 * How the value is written. A string property needs JSON text: set() with an object on a string
 * property gets the CMS's .NET conversion error. `object` is for a `json` property, once the SDK
 * allows editors for it.
 */
export type MapStorage = 'string' | 'object';

/** Label for a point placed by clicking the map rather than picked from the search. */
const PINNED_LABEL = 'Pinned location';

// The CMS gives a property editor frame at most 150 px of height, and it can be as narrow as
// 280 px (optimised for 400 px). So everything is one row, map on the left and details on the
// right, with fixed heights: the compact view is shorter, and only the picker uses all 150 px.
// Heights are in px, not 100vh: the frame seems to size itself to its content (up to 150 px),
// so 100vh doesn't give a reliable height.
const COMPACT_HEIGHT = 112;
const PICKER_HEIGHT = 150;
/** Search results: three rows show, the rest scroll. */
const RESULT_ROW_HEIGHT = 22;
const VISIBLE_RESULTS = 3;

const frame = (height: number): CSSProperties => ({boxSizing: 'border-box', height, overflow: 'hidden'});
const ELLIPSIS: CSSProperties = {overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'};

/**
 * A mockup of a map-reference editor. The value is a small object ({lat, lng, zoom, label}),
 * stored as JSON text or as an object (see MapStorage); the map is a sketch, not a real map.
 *
 * Picking happens in place, in the same frame: a dialog can't leave the iframe, so a "popup"
 * would get the same 150 px. No debugger here either; everything goes to the console.
 */
export function MapEditor({context, storage}: {context: ExtensionContext; storage: MapStorage}) {
  const [state, setState] = useState<PropertyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let active = true;
    context.property
      .get()
      .then((next) => {
        logGroup('map editor property.get()', {next, valueType: describeType(next.value)});
        if (active) setState(next);
      })
      .catch((err: unknown) => setError(String(err)));
    const unsubscribe = context.property.subscribe((next) => {
      logGroup('map editor property subscribe()', {next, valueType: describeType(next.value)});
      if (active) setState(next);
    });
    void context.extension.setReady();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [context]);

  useFrameSizeLog();

  // The CMS doesn't echo a successful set() through subscribe(), so the editor updates itself.
  const save = async (location: MapValue | null) => {
    const value = location && storage === 'string' ? JSON.stringify(location) : location;
    const result = await context.property.set(value);
    logGroup('map editor property.set()', {value, storage, result});
    if (result.success) {
      setState((prev) => ({...(prev ?? {readonly: false}), value}));
      setError(null);
    } else {
      setError(result.error ?? 'The CMS rejected the value.');
    }
    return result.success;
  };

  const parsed = parseMapValue(state?.value);
  const readonly = !state || state.readonly;

  if (picking) {
    return (
      <Picker
        initial={parsed.kind === 'valid' ? parsed.value : null}
        onCancel={() => setPicking(false)}
        onPick={async (value) => {
          if (await save(value)) setPicking(false);
        }}
      />
    );
  }

  if (parsed.kind === 'empty') {
    return (
      <Group alignItems="stretch" gap="8" p="8" style={frame(COMPACT_HEIGHT)}>
        <Group
          alignItems="center"
          flexDirection="column"
          gap="8"
          justifyContent="center"
          style={{border: '1px dashed rgba(127, 127, 127, 0.5)', borderRadius: 6, flex: '1 1 auto'}}
        >
          <Text color="fg.secondary" fontSize="sm">
            No location
          </Text>
          <Button disabled={readonly} onClick={() => setPicking(true)} size="sm">
            Choose location…
          </Button>
          {error && <ErrorLine error={error} />}
        </Group>
      </Group>
    );
  }

  if (parsed.kind === 'invalid') {
    return (
      <Group flexDirection="column" gap="4" p="8" style={frame(COMPACT_HEIGHT)}>
        <Text color="fg.error" fontSize="sm">
          The stored value isn't a map location. {parsed.reason}
        </Text>
        <Text fontSize="sm" style={{...ELLIPSIS, fontFamily: 'monospace'}} title={parsed.raw}>
          {parsed.raw}
        </Text>
        {error && <ErrorLine error={error} />}
        <Group flexWrap="wrap" gap="8" mt="4">
          <Button disabled={readonly} onClick={() => setPicking(true)} size="sm">
            Choose location…
          </Button>
          <Button appearance="subtle" disabled={readonly} onClick={() => void save(null)} size="sm">
            Reset
          </Button>
        </Group>
      </Group>
    );
  }

  const value = parsed.value;
  return (
    <Group alignItems="stretch" gap="8" p="8" style={frame(COMPACT_HEIGHT)}>
      <Box style={{flex: '0 0 auto', width: 'clamp(96px, 32vw, 150px)'}}>
        <MockMap height="100%" point={value} />
      </Box>
      <Group flexDirection="column" gap="4" style={{flex: '1 1 auto', minWidth: 0}}>
        <Text fontWeight="600" style={ELLIPSIS} title={value.label}>
          {value.label || 'Unnamed location'}
        </Text>
        <Text color="fg.secondary" fontSize="sm" style={ELLIPSIS}>
          {formatCoordinates(value)}
        </Text>
        <Text color="fg.secondary" fontSize="sm" style={ELLIPSIS}>
          Zoom {value.zoom}
          {!isInsideMockMap(value) && ' · outside the mock map'}
        </Text>
        {error && <ErrorLine error={error} />}
        <Group gap="8" style={{marginTop: 'auto'}}>
          <Button disabled={readonly} onClick={() => setPicking(true)} size="sm">
            Change…
          </Button>
          <Button appearance="subtle" disabled={readonly} onClick={() => void save(null)} size="sm">
            Clear
          </Button>
        </Group>
      </Group>
    </Group>
  );
}

/**
 * Choosing a location, in place of the compact view. The map (click to pin, zoom buttons on top)
 * is on the left; a search with a short scrolling result list and the buttons are on the right.
 */
function Picker({
  initial,
  onCancel,
  onPick
}: {
  initial: MapValue | null;
  onCancel: () => void;
  onPick: (value: MapValue) => void;
}) {
  const [draft, setDraft] = useState<MapValue | null>(initial);
  const [query, setQuery] = useState('');

  useEffect(() => logGroup('map editor picker opened', {initial}), [initial]);

  const matches = query.trim()
    ? MOCK_PLACES.filter((place) => place.label.toLowerCase().includes(query.trim().toLowerCase()))
    : MOCK_PLACES;
  const zoom = draft?.zoom ?? DEFAULT_ZOOM;
  const setZoom = (next: number) => draft && setDraft({...draft, zoom: clampZoom(next)});

  return (
    <Group
      alignItems="stretch"
      gap="8"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
      p="8"
      style={frame(PICKER_HEIGHT)}
    >
      <Box style={{flex: '0 0 auto', position: 'relative', width: 'clamp(110px, 40vw, 180px)'}}>
        <MockMap
          caption={draft ? `${formatCoordinates(draft)} · z${zoom}` : 'Click to pin'}
          height="100%"
          onPick={(point) => {
            logGroup('map editor map click', point);
            setDraft({...point, zoom, label: PINNED_LABEL});
          }}
          point={draft ?? undefined}
        />
        <Group flexDirection="column" gap="4" style={{position: 'absolute', right: 4, top: 4}}>
          <ZoomButton disabled={!draft || zoom >= MAX_ZOOM} label="Zoom in" onClick={() => setZoom(zoom + 1)}>
            +
          </ZoomButton>
          <ZoomButton disabled={!draft || zoom <= MIN_ZOOM} label="Zoom out" onClick={() => setZoom(zoom - 1)}>
            –
          </ZoomButton>
        </Group>
      </Box>
      <Group flexDirection="column" gap="4" style={{flex: '1 1 auto', minWidth: 0}}>
        <Input
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search (mock)…"
          value={query}
        />
        <Box style={{flex: '0 0 auto', height: RESULT_ROW_HEIGHT * VISIBLE_RESULTS, overflowY: 'auto'}}>
          {matches.map((place) => {
            const selected = draft?.label === place.label && draft.lat === place.lat && draft.lng === place.lng;
            return (
              <button
                key={place.label}
                onClick={() => {
                  logGroup('map editor picked a mock place', place);
                  setDraft(place);
                }}
                style={{
                  ...ELLIPSIS,
                  background: selected ? 'rgba(56, 132, 255, 0.18)' : 'transparent',
                  border: 'none',
                  borderRadius: 4,
                  color: 'inherit',
                  cursor: 'pointer',
                  display: 'block',
                  font: 'inherit',
                  fontSize: 13,
                  height: RESULT_ROW_HEIGHT,
                  lineHeight: `${RESULT_ROW_HEIGHT}px`,
                  padding: '0 6px',
                  textAlign: 'left',
                  width: '100%'
                }}
                type="button"
              >
                {place.label}
              </button>
            );
          })}
          {matches.length === 0 && (
            <Text color="fg.secondary" fontSize="sm" px="4">
              No matches.
            </Text>
          )}
        </Box>
        <Group gap="8" justifyContent="end" style={{marginTop: 'auto'}}>
          <Button appearance="subtle" onClick={onCancel} size="sm">
            Cancel
          </Button>
          <Button appearance="primary" disabled={!draft} onClick={() => draft && onPick(draft)} size="sm">
            Use this
          </Button>
        </Group>
      </Group>
    </Group>
  );
}

function ZoomButton({
  children,
  disabled,
  label,
  onClick
}: {
  children: string;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        background: 'var(--ax-colors-bg-default, Canvas)',
        border: '1px solid rgba(127, 127, 127, 0.45)',
        borderRadius: 4,
        color: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 14,
        height: 22,
        lineHeight: 1,
        opacity: disabled ? 0.5 : 1,
        padding: 0,
        width: 22
      }}
      type="button"
    >
      {children}
    </button>
  );
}

function ErrorLine({error}: {error: string}) {
  return (
    <Text color="fg.error" fontSize="sm" style={ELLIPSIS} title={error}>
      {error}
    </Text>
  );
}

/** Logs the frame's size at load and after each resize, to learn the Visual Builder panel's limits. */
function useFrameSizeLog() {
  useEffect(() => {
    const log = (reason: string) =>
      logGroup(`map editor frame size (${reason})`, {
        viewport: `${window.innerWidth} × ${window.innerHeight}`,
        devicePixelRatio: window.devicePixelRatio
      });
    log('load');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => log('resize'), 300);
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, []);
}

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
