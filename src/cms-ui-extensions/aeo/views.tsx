import type {ReactNode} from 'react';
import {useEffect, useState} from 'react';
import {copyToClipboard} from '../common/clipboard';
import {
  type AeoReport,
  ANALYSIS_STEPS,
  type Finding,
  type Section,
  type Signal,
  type Status,
  statusFor
} from './mockReport';

const RING_R = 38;
const RING_C = 2 * Math.PI * RING_R; // 238.76

/* ---------- Building blocks ---------- */

export function Root({children}: {children: ReactNode}) {
  return <div className="aeo">{children}</div>;
}

/** The page name and its chips. No label above it: the shell's header already says "AEO Readiness". */
export function PageContext({chips, name}: {chips: ReactNode; name?: string}) {
  return (
    <div className="aeo-page">
      {name && <h1 className="aeo-page-name">{name}</h1>}
      <div className="aeo-chips">{chips}</div>
    </div>
  );
}

export function LocaleChip({locale}: {locale: string}) {
  return <span className="aeo-chip aeo-chip--tag">{locale.toUpperCase()}</span>;
}

/** The content type's key made readable: `ArticlePage` → "Article page". */
export function TypeChip({type}: {type: string}) {
  const words = type
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return (
    <span className="aeo-chip aeo-chip--tag" title={type}>
      {words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()}
    </span>
  );
}

export function MockupChip() {
  return <span className="aeo-chip aeo-chip--info">Mockup data</span>;
}

export function PublishedChip() {
  return (
    <span className="aeo-chip aeo-chip--good" style={{padding: '2px 8px'}}>
      <span className="aeo-dot aeo-dot--good" />
      Published
    </span>
  );
}

export function DraftChip() {
  return (
    <span className="aeo-chip aeo-chip--draft">
      <span className="aeo-dot aeo-dot--hollow" />
      Draft
    </span>
  );
}

const STATUS_LABEL: Record<Status, string> = {
  good: 'Good',
  'needs-improvement': 'Needs improvement',
  'act-now': 'Act now'
};

function StatusChip({short, status}: {short?: boolean; status: Status}) {
  return (
    <span className={`aeo-chip aeo-chip--${status}`}>
      <span className={`aeo-dot aeo-dot--${status}`} />
      {short && status === 'needs-improvement' ? 'Needs work' : STATUS_LABEL[status]}
    </span>
  );
}

function Card({children, className = '', title}: {children: ReactNode; className?: string; title?: ReactNode}) {
  return (
    <section className={`aeo-card ${className}`}>
      {typeof title === 'string' ? <div className="aeo-overline">{title}</div> : title}
      {children}
    </section>
  );
}

function Bar({fill, fraction, marker}: {fill?: Status; fraction: number; marker?: number}) {
  return (
    <div className="aeo-bar">
      <div
        className={`aeo-bar-fill${fill ? ` aeo-bar-fill--${fill}` : ''}`}
        style={{width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`}}
      />
      {marker !== undefined && <div className="aeo-bar-marker" style={{left: `${marker * 100}%`}} />}
    </div>
  );
}

function Button({
  children,
  disabled,
  onClick,
  variant
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  variant: 'primary' | 'on-dark' | 'secondary';
}) {
  return (
    <button
      aria-disabled={disabled || undefined}
      className={`aeo-button aeo-button--${variant}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

/* ---------- Icons (decorative) ---------- */

function Svg({children, size = 16, stroke = 'currentColor', width = 2}: {children: ReactNode; size?: number; stroke?: string; width?: number}) {
  return (
    <svg
      aria-hidden="true"
      className="aeo-icon"
      fill="none"
      height={size}
      stroke={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={width}
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  );
}

const PlayIcon = () => (
  <Svg>
    <polygon points="6 4 20 12 6 20 6 4" />
  </Svg>
);

const RefreshIcon = () => (
  <Svg>
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </Svg>
);

function InfoIcon({size = 18, stroke = 'var(--aeo-accent)'}: {size?: number; stroke?: string}) {
  return (
    <Svg size={size} stroke={stroke}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="11" y2="16" />
      <line x1="12" x2="12.01" y1="8" y2="8" />
    </Svg>
  );
}

const CHECKLIST: {label: string; icon: ReactNode}[] = [
  {
    label: 'AI crawler access, sitemap and llms.txt',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </>
    )
  },
  {
    label: 'Structured data and metadata',
    icon: (
      <>
        <polyline points="8 6 3 12 8 18" />
        <polyline points="16 6 21 12 16 18" />
      </>
    )
  },
  {
    label: 'Answer-ready content structure',
    icon: (
      <>
        <line x1="4" x2="20" y1="6" y2="6" />
        <line x1="4" x2="16" y1="12" y2="12" />
        <line x1="4" x2="12" y1="18" y2="18" />
      </>
    )
  },
  {label: 'E-E-A-T and entity clarity', icon: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />},
  {
    label: 'PageSpeed on mobile and desktop',
    icon: (
      <>
        <path d="m12 14 4-4" />
        <path d="M3.34 19a10 10 0 1 1 17.32 0" />
      </>
    )
  }
];

/* ---------- Score ring ---------- */

function RingSvg({children, label}: {children: ReactNode; label?: string}) {
  return (
    <svg
      aria-hidden={label ? undefined : true}
      aria-label={label}
      height="88"
      role={label ? 'img' : undefined}
      viewBox="0 0 88 88"
      width="88"
    >
      {children}
    </svg>
  );
}

function ScoreRing({max, score}: {max: number; score: number}) {
  const fraction = max ? score / max : 0;
  return (
    <div className="aeo-ring">
      <RingSvg label={`Score ${score} of ${max}, ${Math.round(fraction * 100)} percent`}>
        <circle cx="44" cy="44" fill="none" r={RING_R} stroke="var(--aeo-hero-track)" strokeWidth="8" />
        <circle
          cx="44"
          cy="44"
          fill="none"
          r={RING_R}
          stroke="var(--aeo-ring)"
          strokeDasharray={`${(fraction * RING_C).toFixed(2)} ${RING_C.toFixed(2)}`}
          strokeLinecap="round"
          strokeWidth="8"
          transform="rotate(-90 44 44)"
        />
      </RingSvg>
      <div aria-hidden="true" className="aeo-ring-label">
        <div className="aeo-ring-score">{score}</div>
        <div className="aeo-ring-of">of {max}</div>
      </div>
    </div>
  );
}

/** The dashed ring for states without a score. */
function EmptyRing({children}: {children: ReactNode}) {
  return (
    <div className="aeo-ring">
      <RingSvg>
        <circle cx="44" cy="44" fill="none" r={RING_R} stroke="var(--aeo-hero-track)" strokeDasharray="4 6" strokeWidth="8" />
      </RingSvg>
      <div className="aeo-ring-label">{children}</div>
    </div>
  );
}

/* ---------- Not analysed, unpublished, no page ---------- */

export interface Prompt {
  title: string;
  text: ReactNode;
  /** Dark hero with an enabled Analyse button, or the light one. */
  tone: 'dark' | 'light';
  /** Omit for no button. */
  action?: {label: string; disabled?: boolean; onClick?: () => void};
  icon?: 'dash' | 'hidden';
  busy?: boolean;
}

export function PromptHero({action, busy, icon = 'dash', text, title, tone}: Prompt) {
  return (
    <div className={`aeo-hero${tone === 'light' ? ' aeo-hero--light' : ''}`}>
      <div className="aeo-hero-main">
        <EmptyRing>
          {icon === 'hidden' ? (
            <Svg size={28} stroke="var(--aeo-ink-muted)" width={1.8}>
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <line x1="1" x2="23" y1="1" y2="23" />
            </Svg>
          ) : (
            <span aria-hidden="true" className="aeo-ring-empty">
              –
            </span>
          )}
        </EmptyRing>
        <div className="aeo-hero-text">
          <div className="aeo-overline">AEO score</div>
          <div className="aeo-hero-title" role={busy ? 'status' : undefined}>
            {title}
          </div>
        </div>
      </div>
      <div className="aeo-hero-foot">{text}</div>
      {action && (
        <Button disabled={action.disabled} onClick={action.onClick} variant={action.disabled ? 'secondary' : 'on-dark'}>
          <PlayIcon />
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function Checklist({title}: {title: string}) {
  return (
    <Card className="aeo-checklist" title={title}>
      {CHECKLIST.map((item) => (
        <div className="aeo-checklist-item" key={item.label}>
          <Svg stroke="var(--aeo-accent)">{item.icon}</Svg>
          <span>{item.label}</span>
        </div>
      ))}
    </Card>
  );
}

export function PublishedNote() {
  return (
    <div className="aeo-note">
      <InfoIcon size={14} stroke="currentColor" />
      <span>Analyses the published version of the page, not unsaved or draft changes.</span>
    </div>
  );
}

/* ---------- Results ---------- */

export function Results({
  analysedAt,
  onAnalyse,
  onClear,
  report
}: {
  analysedAt: string;
  onAnalyse: () => void;
  onClear: () => void;
  report: AeoReport;
}) {
  const fraction = report.max ? report.score / report.max : 0;
  return (
    <>
      <div className="aeo-hero">
        <div className="aeo-hero-main">
          <ScoreRing max={report.max} score={report.score} />
          <div className="aeo-hero-text">
            <div className="aeo-overline">Total AEO score</div>
            <div className="aeo-hero-percent">{Math.round(fraction * 100)}%</div>
            <div className="aeo-meta aeo-hero-muted">of available points</div>
          </div>
        </div>
        <div className="aeo-hero-foot">
          <StatusChip status={statusFor(fraction)} />
          <span className="aeo-meta aeo-hero-muted">
            {report.notVerified} {report.notVerified === 1 ? 'item' : 'items'} unverified
          </span>
        </div>
      </div>

      <Card
        title={
          <div className="aeo-card-head">
            <div className="aeo-overline">PageSpeed</div>
            <div className="aeo-meta">Target 90+</div>
          </div>
        }
      >
        <div className="aeo-speed">
          <SpeedItem label="Mobile" value={report.pageSpeed.mobile} />
          <SpeedItem label="Desktop" value={report.pageSpeed.desktop} />
        </div>
      </Card>

      <Card className="aeo-card--list" title="AI signals">
        {report.signals.map((signal) => (
          <SignalRow key={signal.label} signal={signal} />
        ))}
      </Card>

      <Card title="Key findings">
        <div>
          {report.findings.map((finding) => (
            <FindingItem finding={finding} key={finding.text} />
          ))}
        </div>
      </Card>

      <Card title="Score by section">
        {report.sections.map((section) => (
          <SectionItem key={section.name} section={section} />
        ))}
        <div className="aeo-caveat">
          <InfoIcon />
          <div>
            <strong>
              {report.notVerified} {report.notVerified === 1 ? 'item' : 'items'} not verified.
            </strong>{' '}
            {report.caveat}
          </div>
        </div>
      </Card>

      <div className="aeo-small aeo-muted">
        Analysed <Timestamp iso={analysedAt} />
      </div>
      <div className="aeo-actions">
        <Button onClick={onAnalyse} variant="primary">
          <RefreshIcon />
          Analyse again
        </Button>
        <Button onClick={onClear} variant="secondary">
          Clear result
        </Button>
      </div>
    </>
  );
}

/** Lighthouse's own bands: 90+ good, 50 to 89 needs improvement, below 50 poor. */
function speedStatus(value: number): Status {
  if (value >= 90) return 'good';
  if (value >= 50) return 'needs-improvement';
  return 'act-now';
}

function SpeedItem({label, value}: {label: string; value: number}) {
  return (
    <div className="aeo-speed-item">
      <div className="aeo-speed-head">
        <span className="aeo-small aeo-muted">{label}</span>
        <span>
          <span className="aeo-speed-value">{value}</span>
          <span className="aeo-meta"> /100</span>
        </span>
      </div>
      <Bar fill={speedStatus(value)} fraction={value / 100} marker={0.9} />
    </div>
  );
}

function SignalRow({signal}: {signal: Signal}) {
  return (
    <div className="aeo-row">
      <span>{signal.label}</span>
      {signal.status ? (
        <StatusChip short status={signal.status} />
      ) : (
        <span className="aeo-row-value">
          <span className="aeo-strong">{signal.value}</span>
          {signal.note && <span className="aeo-meta"> · {signal.note}</span>}
        </span>
      )}
    </div>
  );
}

const FINDING_TAG: Record<Finding['kind'], {label: string; dot: string}> = {
  critical: {label: 'Critical', dot: 'act-now'},
  strength: {label: 'Strength', dot: 'good'},
  'quick-win': {label: 'Quick win', dot: 'accent'}
};

function FindingItem({finding}: {finding: Finding}) {
  const tag = FINDING_TAG[finding.kind];
  return (
    <div className="aeo-finding">
      <span className={`aeo-tag aeo-tag--${finding.kind}`}>
        <span className={`aeo-dot aeo-dot--${tag.dot}`} />
        {tag.label}
        {finding.points !== undefined && ` · about +${finding.points} points`}
      </span>
      <p>{finding.text}</p>
    </div>
  );
}

function SectionItem({section}: {section: Section}) {
  const fraction = section.max ? section.score / section.max : 0;
  return (
    <div className="aeo-section">
      <div className="aeo-section-head">
        <span>{section.name}</span>
        <span className="aeo-section-score">
          {section.score}
          <span>/{section.max}</span>
        </span>
      </div>
      <Bar fill={statusFor(fraction) === 'act-now' ? 'act-now' : undefined} fraction={fraction} />
    </div>
  );
}

/* ---------- Analysing ---------- */

/** `done` steps are finished; the next one is running. `done === steps` means saving. */
export function Analysing({done, onCancel}: {done: number; onCancel?: () => void}) {
  const total = ANALYSIS_STEPS.length;
  const title = done < total ? ANALYSIS_STEPS[done].running : 'Saving the result…';
  return (
    <>
      <div className="aeo-hero">
        <div className="aeo-hero-main">
          <div className="aeo-ring">
            <svg aria-hidden="true" className="aeo-spin" height="88" viewBox="0 0 88 88" width="88">
              <circle cx="44" cy="44" fill="none" r={RING_R} stroke="var(--aeo-hero-track)" strokeWidth="8" />
              <circle
                cx="44"
                cy="44"
                fill="none"
                r={RING_R}
                stroke="var(--aeo-ring)"
                strokeDasharray={`60 ${RING_C.toFixed(2)}`}
                strokeLinecap="round"
                strokeWidth="8"
                transform="rotate(-90 44 44)"
              />
            </svg>
            <div aria-hidden="true" className="aeo-ring-label aeo-ring-steps">
              {done}/{total}
            </div>
          </div>
          <div className="aeo-hero-text">
            <div className="aeo-overline">Analysing</div>
            <div className="aeo-hero-title" role="status">
              {title}
            </div>
            <div className="aeo-meta aeo-hero-muted">Keep this panel open</div>
          </div>
        </div>
      </div>

      <section className="aeo-card aeo-card--steps" aria-label="Analysis steps">
        {ANALYSIS_STEPS.map((step, index) => {
          const state = index < done ? 'done' : index === done ? 'running' : 'pending';
          return (
            <div className={`aeo-step aeo-step--${state}`} key={step.label}>
              <StepIcon state={state} />
              <span className="aeo-step-label">{step.label}</span>
              {state === 'done' && <span className="aeo-meta">Done</span>}
            </div>
          );
        })}
      </section>

      <div aria-hidden="true" className="aeo-skeleton aeo-pulse">
        <div />
        <div style={{width: '100%'}} />
        <div style={{width: '70%'}} />
        <div style={{width: '85%'}} />
      </div>

      {onCancel && (
        <div className="aeo-footer aeo-footer--end">
          <Button onClick={onCancel} variant="secondary">
            Cancel
          </Button>
        </div>
      )}
    </>
  );
}

function StepIcon({state}: {state: 'done' | 'running' | 'pending'}) {
  if (state === 'done') {
    return (
      <Svg size={18} stroke="var(--aeo-good-dot)" width={2.5}>
        <polyline points="20 6 9 17 4 12" />
      </Svg>
    );
  }
  if (state === 'running') {
    return (
      <svg
        aria-hidden="true"
        className="aeo-icon aeo-spin aeo-spin--fast"
        fill="none"
        height="18"
        stroke="var(--aeo-accent)"
        strokeLinecap="round"
        strokeWidth="2.5"
        style={{marginTop: 0}}
        viewBox="0 0 24 24"
        width="18"
      >
        <path d="M21 12a9 9 0 1 1-6.2-8.56" />
      </svg>
    );
  }
  return (
    <Svg size={18} stroke="var(--aeo-pending)">
      <circle cx="12" cy="12" r="8" />
    </Svg>
  );
}

/* ---------- Error ---------- */

export interface Check {
  label: string;
  result: 'ok' | 'failed' | 'skipped';
  detail?: string;
}

export interface Failure {
  title: string;
  reason: ReactNode;
  url?: string;
  /** Only when the backend said what it checked; hidden for transport failures. */
  checks?: Check[];
  at: string;
  /** Plain text for "Copy details". */
  details: string;
}

const CHECK_LABEL: Record<Check['result'], string> = {ok: 'OK', failed: 'Failed', skipped: 'Skipped'};

export function ErrorPanel({failure, onRetry}: {failure: Failure; onRetry: () => void}) {
  const [copied, setCopied] = useState<boolean | null>(null);
  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <>
      <div className="aeo-error" role="alert">
        <div className="aeo-error-head">
          <div className="aeo-error-disc">
            <Svg size={18} stroke="#ffffff" width={2.5}>
              <line x1="12" x2="12" y1="7" y2="13" />
              <line x1="12" x2="12.01" y1="17" y2="17" />
            </Svg>
          </div>
          {failure.title}
        </div>
        <div className="aeo-error-reason">{failure.reason}</div>
        {failure.url && <div className="aeo-error-url">[{failure.url}]</div>}
      </div>

      <div className="aeo-actions">
        <Button onClick={onRetry} variant="primary">
          <RefreshIcon />
          Try again
        </Button>
        <Button onClick={() => void copyToClipboard(failure.details).then(setCopied)} variant="secondary">
          {copied === true ? 'Copied' : copied === false ? 'Copy failed' : 'Copy details'}
        </Button>
      </div>

      {failure.checks && failure.checks.length > 0 && (
        <Card className="aeo-checks" title="What we checked">
          {failure.checks.map((check) => (
            <div className="aeo-check" key={check.label}>
              <span>{check.label}</span>
              <span className={`aeo-check--${check.result}`}>
                {CHECK_LABEL[check.result]}
                {check.detail && ` · ${check.detail}`}
              </span>
            </div>
          ))}
        </Card>
      )}

      <div className="aeo-small aeo-muted">
        Last attempt <Timestamp iso={failure.at} />
      </div>
    </>
  );
}

/**
 * Date and time in the editor's locale and time zone, with UTC as a tooltip. The frame's
 * locale and time zone come from the browser and OS, not from the CMS.
 */
function Timestamp({iso}: {iso: string}) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return <>{iso}</>;
  const local = date.toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'medium'});
  const utc = `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
  return (
    <time dateTime={iso} title={utc}>
      {local}
    </time>
  );
}
