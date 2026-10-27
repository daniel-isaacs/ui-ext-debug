import type {MouseEvent} from 'react';
import type {MapValue} from './mapValue';

/**
 * A stand-in for a real map: an SVG sketch of central Oslo with a fixed bounding box, so a click
 * can be turned into coordinates. No tiles and no network.
 */
const BOUNDS = {north: 59.98, south: 59.88, west: 10.62, east: 10.82};

const PIN_COLOR = '#e5484d';

export function isInsideMockMap({lat, lng}: Pick<MapValue, 'lat' | 'lng'>): boolean {
  return lat <= BOUNDS.north && lat >= BOUNDS.south && lng >= BOUNDS.west && lng <= BOUNDS.east;
}

export function MockMap({
  caption = 'Mock map',
  height,
  onPick,
  point
}: {
  caption?: string;
  height: number | string;
  onPick?: (point: {lat: number; lng: number}) => void;
  point?: Pick<MapValue, 'lat' | 'lng'>;
}) {
  const pin = point && isInsideMockMap(point) ? toFraction(point) : null;

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!onPick) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    onPick({
      lat: round(BOUNDS.north - y * (BOUNDS.north - BOUNDS.south)),
      lng: round(BOUNDS.west + x * (BOUNDS.east - BOUNDS.west))
    });
  };

  return (
    <div
      aria-label={onPick ? 'Mock map: click to place the pin' : 'Mock map'}
      onClick={handleClick}
      role={onPick ? 'button' : 'img'}
      style={{
        background: 'rgba(127, 127, 127, 0.08)',
        border: '1px solid rgba(127, 127, 127, 0.35)',
        borderRadius: 6,
        cursor: onPick ? 'crosshair' : 'default',
        height,
        overflow: 'hidden',
        position: 'relative',
        width: '100%'
      }}
    >
      <svg
        height="100%"
        preserveAspectRatio="none"
        style={{display: 'block', inset: 0, position: 'absolute'}}
        viewBox="0 0 100 100"
        width="100%"
      >
        {/* The fjord, roughly where it is in the bounding box. */}
        <path d="M0 78 Q20 70 35 74 T62 72 Q72 66 82 74 T100 70 V100 H0 Z" fill="rgba(56, 132, 255, 0.25)" />
        {[20, 40, 60, 80].map((n) => (
          <g key={n} stroke="currentColor" strokeOpacity={0.12} strokeWidth={0.4}>
            <line x1={n} x2={n} y1={0} y2={100} />
            <line x1={0} x2={100} y1={n} y2={n} />
          </g>
        ))}
        <path
          d="M10 10 L40 45 L62 62 M62 62 L95 35 M40 45 L5 60 M62 62 L70 20"
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.3}
          strokeWidth={0.8}
        />
      </svg>
      <span
        style={{
          bottom: 3,
          fontSize: 10,
          left: 6,
          opacity: 0.7,
          overflow: 'hidden',
          pointerEvents: 'none',
          position: 'absolute',
          right: 6,
          textAlign: 'right',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
      >
        {caption}
      </span>
      {pin && (
        <svg
          height={28}
          style={{
            left: `${pin.x * 100}%`,
            pointerEvents: 'none',
            position: 'absolute',
            top: `${pin.y * 100}%`,
            transform: 'translate(-50%, -100%)'
          }}
          viewBox="0 0 24 32"
          width={21}
        >
          <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill={PIN_COLOR} />
          <circle cx={12} cy={12} fill="#fff" r={4.5} />
        </svg>
      )}
    </div>
  );
}

function toFraction({lat, lng}: Pick<MapValue, 'lat' | 'lng'>): {x: number; y: number} {
  return {
    x: (lng - BOUNDS.west) / (BOUNDS.east - BOUNDS.west),
    y: (BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south)
  };
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
