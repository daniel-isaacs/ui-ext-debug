/** The value the map editor stores in a `json` property. */
export interface MapValue {
  lat: number;
  lng: number;
  zoom: number;
  label: string;
}

export type ParsedMapValue =
  | {kind: 'empty'}
  | {kind: 'valid'; value: MapValue}
  | {kind: 'invalid'; raw: string; reason: string};

export const DEFAULT_ZOOM = 15;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 20;

/**
 * Reads whatever the CMS hands over. A `json` property may arrive as an object or as a JSON
 * string (not yet measured), so both are accepted.
 */
export function parseMapValue(value: unknown): ParsedMapValue {
  if (value === null || value === undefined || value === '') return {kind: 'empty'};

  let data: unknown = value;
  if (typeof value === 'string') {
    try {
      data = JSON.parse(value);
    } catch (err) {
      return {kind: 'invalid', raw: value, reason: `Not JSON: ${String(err)}`};
    }
  }

  const raw = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {kind: 'invalid', raw, reason: 'Expected a JSON object.'};
  }
  const record = data as Record<string, unknown>;
  const {lat, lng} = record;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return {kind: 'invalid', raw, reason: 'Missing or out-of-range lat/lng.'};
  }
  return {
    kind: 'valid',
    value: {
      lat,
      lng,
      zoom: isFiniteNumber(record.zoom) ? clampZoom(record.zoom) : DEFAULT_ZOOM,
      label: typeof record.label === 'string' ? record.label : ''
    }
  };
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom)));
}

export function formatCoordinates({lat, lng}: Pick<MapValue, 'lat' | 'lng'>): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Mock search results, all inside the mock map's bounding box. */
export const MOCK_PLACES: MapValue[] = [
  {label: 'Oslo S', lat: 59.9111, lng: 10.7528, zoom: 16},
  {label: 'Operahuset', lat: 59.9075, lng: 10.7531, zoom: 17},
  {label: 'Akershus festning', lat: 59.9067, lng: 10.7361, zoom: 16},
  {label: 'Rådhuset', lat: 59.9119, lng: 10.7336, zoom: 17},
  {label: 'Vigelandsparken', lat: 59.927, lng: 10.7008, zoom: 15},
  {label: 'Holmenkollbakken', lat: 59.9637, lng: 10.6676, zoom: 15}
];
