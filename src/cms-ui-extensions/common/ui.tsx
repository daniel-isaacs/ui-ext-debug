import {
  Badge,
  Box,
  Button,
  Disclosure,
  DisclosureContent,
  DisclosureTrigger,
  Group,
  Heading,
  Spinner,
  Text
} from '@optiaxiom/react';
import type {ReactNode} from 'react';
import {useState} from 'react';
import {copyToClipboard} from './clipboard';
import type {CallOutcome} from './debugContext';
import {logGroup} from './log';

export function stringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Copies a value as pretty JSON, for pasting into a report. */
export function CopyButton({value, label = 'Copy as JSON'}: {value: unknown; label?: string}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      onClick={() => {
        void copyToClipboard(stringify(value)).then((ok) => {
          setCopied(ok);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {copied ? 'Copied' : label}
    </Button>
  );
}

/** A JSON block with copy and log-to-console buttons. Axiom has no code-block component, so this uses <pre>. */
export function JsonView({title, value, maxHeight = 360}: {title?: string; value: unknown; maxHeight?: number}) {
  const [copied, setCopied] = useState(false);
  const text = stringify(value);
  return (
    <Group flexDirection="column" gap="4">
      <Group alignItems="center" gap="4" justifyContent="space-between">
        {title ? (
          <Text fontSize="sm" fontWeight="600">
            {title}
          </Text>
        ) : (
          <span />
        )}
        <Group gap="4">
          <Button
            appearance="subtle"
            onClick={() => {
              void copyToClipboard(text).then((ok) => {
                setCopied(ok);
                window.setTimeout(() => setCopied(false), 1200);
              });
            }}
            size="sm"
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button appearance="subtle" onClick={() => logGroup(title ?? 'value', value)} size="sm">
            Console
          </Button>
        </Group>
      </Group>
      <pre
        style={{
          background: 'rgba(127, 127, 127, 0.08)',
          borderRadius: 4,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 12,
          lineHeight: 1.45,
          margin: 0,
          maxHeight,
          overflow: 'auto',
          padding: 8,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}
      >
        {text}
      </pre>
    </Group>
  );
}

/**
 * What a section tests and how. `why` is always shown; the rest folds away so the narrow
 * sidebar stays usable. Keep each line short: this is for people new to UI extensions.
 */
export interface Guide {
  /** What question this section answers, and why it matters to an extension author. */
  why: ReactNode;
  /** Steps to run the test, in order. */
  steps?: ReactNode[];
  /** What a normal result looks like, in a sentence or two. */
  expect?: ReactNode;
  /** What to copy when reporting a result. */
  report?: ReactNode;
  /** What earlier runs found, so readers don't have to repeat them. */
  found?: ReactNode;
}

function GuideRow({label, children}: {label: string; children: ReactNode}) {
  return (
    <Group gap="8" alignItems="start">
      <Text fontSize="sm" fontWeight="600" style={{flex: '0 0 64px'}}>
        {label}
      </Text>
      <Box fontSize="sm" style={{minWidth: 0, overflowWrap: 'anywhere'}}>
        {children}
      </Box>
    </Group>
  );
}

function GuideView({guide}: {guide: Guide}) {
  const {steps, expect, report, found} = guide;
  if (!steps && !expect && !report && !found) return null;
  return (
    <Disclosure>
      <DisclosureTrigger>How to test · what to expect</DisclosureTrigger>
      <DisclosureContent>
        <Group flexDirection="column" gap="8" pt="4">
          {steps && (
            <GuideRow label="Steps">
              <ol style={{margin: 0, paddingLeft: 18}}>
                {steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </GuideRow>
          )}
          {expect && <GuideRow label="Expect">{expect}</GuideRow>}
          {report && <GuideRow label="Report">{report}</GuideRow>}
          {found && <GuideRow label="Found">{found}</GuideRow>}
        </Group>
      </DisclosureContent>
    </Disclosure>
  );
}

export function Section({
  title,
  children,
  hint,
  guide
}: {
  title: string;
  children: ReactNode;
  hint?: ReactNode;
  guide?: Guide;
}) {
  const intro = guide?.why ?? hint;
  return (
    <Group flexDirection="column" gap="8">
      <Heading level="4">{title}</Heading>
      {intro && (
        <Text color="fg.secondary" fontSize="sm">
          {intro}
        </Text>
      )}
      {guide && <GuideView guide={guide} />}
      {children}
    </Group>
  );
}

/** Key facts as label/value rows. */
export function Facts({rows}: {rows: [string, ReactNode][]}) {
  return (
    <Group flexDirection="column" gap="4">
      {rows.map(([label, value]) => (
        <Group gap="8" key={label} alignItems="start">
          <Text color="fg.secondary" fontSize="sm" style={{flex: '0 0 140px'}}>
            {label}
          </Text>
          <Text fontSize="sm" style={{minWidth: 0, overflowWrap: 'anywhere'}}>
            {value === undefined || value === null || value === '' ? '—' : value}
          </Text>
        </Group>
      ))}
    </Group>
  );
}

export function OutcomeView({outcome, loading, title}: {outcome: CallOutcome | null; loading?: boolean; title?: string}) {
  if (loading) return <Spinner size="sm" />;
  if (!outcome) return null;
  const meta = outcome.envelope?.meta;
  const status = outcome.statusCode;
  const intent = outcome.transportError ? 'danger' : status && status < 300 ? 'success' : 'warning';
  return (
    <Group flexDirection="column" gap="8">
      <Group gap="4" flexWrap="wrap">
        <Badge intent={intent}>{outcome.transportError ? 'transport error' : `HTTP ${status}`}</Badge>
        <Badge intent="neutral">round trip {outcome.roundTripMs} ms</Badge>
        {meta && <Badge intent="neutral">function {meta.durationMs} ms</Badge>}
        {meta && (
          <Badge intent={meta.invocation === 1 ? 'warning' : 'information'}>
            {meta.invocation === 1 ? 'cold start' : `warm #${meta.invocation}`}
          </Badge>
        )}
      </Group>
      {outcome.transportError && <Text color="fg.error">{outcome.transportError}</Text>}
      {outcome.envelope && !outcome.envelope.ok && (
        <Text color="fg.error" fontSize="sm">
          {outcome.envelope.error}
          {outcome.envelope.message ? `: ${outcome.envelope.message}` : ''}
        </Text>
      )}
      <JsonView title={title ?? outcome.action} value={outcome.envelope ?? outcome.rawData ?? null} />
    </Group>
  );
}

export function Bordered({children}: {children: ReactNode}) {
  return (
    <Box p="12" rounded="md" style={{border: '1px solid rgba(127, 127, 127, 0.25)'}}>
      {children}
    </Box>
  );
}
