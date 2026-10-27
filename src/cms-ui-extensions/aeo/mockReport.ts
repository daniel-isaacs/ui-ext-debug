/**
 * Fake AEO readiness data for the mockup. The real scores will probably come from Optimizely Mark.
 * The numbers are derived from the content key, so each page gets its own, stable report.
 */

export type Status = 'act-now' | 'needs-improvement' | 'good';

export interface Section {
  name: string;
  score: number;
  max: number;
}

export interface PageSpeed {
  /** Lighthouse performance scores, 0 to 100. */
  mobile: number;
  desktop: number;
}

/** One row in "AI signals": either a status chip or a value with a note. */
export interface Signal {
  label: string;
  status?: Status;
  value?: string;
  note?: string;
}

export type FindingKind = 'critical' | 'strength' | 'quick-win';

export interface Finding {
  kind: FindingKind;
  text: string;
  /** Points a quick win is expected to recover. */
  points?: number;
}

export interface AeoReport {
  pageName: string;
  score: number;
  max: number;
  pageSpeed: PageSpeed;
  signals: Signal[];
  findings: Finding[];
  sections: Section[];
  /** Rubric items that scored 0 because their data couldn't be retrieved. */
  notVerified: number;
  /** Which items weren't verified, shown after "N items not verified." */
  caveat: string;
}

/** The analysis steps, in order. The mock spends ANALYSIS_STEP_MS on each. */
export const ANALYSIS_STEPS: {label: string; running: string}[] = [
  {label: 'Fetch server-rendered HTML', running: 'Fetching the page…'},
  {label: 'Check robots.txt, llms.txt & sitemap', running: 'Checking crawler access…'},
  {label: 'Run PageSpeed (mobile & desktop)', running: 'Running PageSpeed…'},
  {label: 'Parse structured data', running: 'Parsing structured data…'},
  {label: 'Score content & entities', running: 'Scoring content…'}
];

export const ANALYSIS_STEP_MS = 5000;

const SECTIONS: {name: string; max: number; base: number}[] = [
  {name: 'Technical foundation & discoverability', max: 20, base: 0.7},
  {name: 'Structured data & metadata', max: 12, base: 0.5},
  {name: 'Content structure & answer extractability', max: 13, base: 0.2},
  {name: 'E-E-A-T, depth & originality', max: 10, base: 0.7},
  {name: 'Entity clarity & brand consistency', max: 4, base: 0.5},
  {name: 'Competitive positioning', max: 5, base: 0.25}
];

export function statusFor(fraction: number): Status {
  if (fraction < 0.5) return 'act-now';
  if (fraction < 0.75) return 'needs-improvement';
  return 'good';
}

export function buildMockReport(contentKey: string, pageName: string): AeoReport {
  const random = seededRandom(contentKey);
  const jitter = (spread: number) => (random() - 0.5) * 2 * spread;

  const sections = SECTIONS.map(({name, max, base}) => ({
    name,
    max,
    score: clamp(Math.round(max * (base + jitter(0.15))), 0, max)
  }));
  const score = sections.reduce((sum, s) => sum + s.score, 0);
  const max = sections.reduce((sum, s) => sum + s.max, 0);
  const fraction = (index: number) => sections[index].score / sections[index].max;

  const mobile = clamp(Math.round(55 + jitter(25)), 1, 100);
  const desktop = clamp(Math.round(mobile + 10 + jitter(10)), 1, 100);
  const notVerified = clamp(Math.round(6 + jitter(3)), 0, max);

  return {
    pageName,
    score,
    max,
    notVerified,
    pageSpeed: {mobile, desktop},
    signals: [
      {label: 'Citation readiness', status: statusFor(fraction(2))},
      {label: 'Entity clarity', status: statusFor(fraction(4))},
      {label: 'E-E-A-T', status: statusFor(fraction(3))},
      {label: 'AI crawlers allowed', value: '4 / 4', note: 'all permitted'},
      {label: 'Schemas found', value: '2', note: 'Organization, WebSite'}
    ],
    findings: [
      {
        kind: 'critical',
        text:
          `The FAQ answers on “${pageName}” are empty in the server-rendered HTML, so the page's main ` +
          'definitions are invisible to AI crawlers that don’t run JavaScript.'
      },
      {
        kind: 'strength',
        text:
          'Crawler access is the strongest area: robots.txt blocks no AI agent, llms.txt indexes the ' +
          'site, and the sitemap has a fresh lastmod. Nothing structured is waiting at the end of it.'
      },
      {
        kind: 'quick-win',
        points: 4,
        text: 'Add FAQPage schema with server-rendered answers, plus sameAs on the Organization node, in one deployment.'
      }
    ],
    sections,
    caveat:
      'Server response time, IndexNow submissions, broken-link status and competitor comparisons ' +
      'couldn’t be retrieved and scored 0. The real score may be higher.'
  };
}

/** Turns the last URL segment into a readable name: `/en/blog/agentic-ai/` → "Agentic ai". */
export function pageNameFromUrl(publicUrl: string): string {
  try {
    const segments = new URL(publicUrl).pathname.split('/').filter(Boolean);
    // A path that is only the locale ("/en/") is the start page.
    const last = segments.length > 1 || (segments[0] && segments[0].length > 2) ? segments[segments.length - 1] : '';
    if (!last) return 'Start page';
    const words = decodeURIComponent(last).replace(/[-_]+/g, ' ').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
  } catch {
    return publicUrl;
  }
}

function seededRandom(seed: string): () => number {
  // FNV-1a for the seed, then mulberry32.
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
