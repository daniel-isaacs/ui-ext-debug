import type {ContentState, ExtensionContext} from '@optimizely/cms-extensibility-sdk';
import type {AeoRecord, AeoStatus} from '@shared/protocol';
import {useCallback, useEffect, useRef, useState} from 'react';
import {callBackend, type CallOutcome} from '../common/debugContext';
import {logGroup} from '../common/log';
import './aeo.css';
import {type AeoReport, ANALYSIS_STEP_MS, ANALYSIS_STEPS, buildMockReport, pageNameFromUrl} from './mockReport';
import {
  Analysing,
  Checklist,
  DraftChip,
  ErrorPanel,
  type Failure,
  LocaleChip,
  MockupChip,
  PageContext,
  PromptHero,
  PublishedChip,
  PublishedNote,
  Results,
  Root,
  TypeChip
} from './views';

type Stored = AeoStatus<AeoReport>;

type Phase =
  | {name: 'checking'}
  | {name: 'idle'}
  /** `done` steps are finished. At `done === ANALYSIS_STEPS.length` the result is being saved. */
  | {name: 'running'; done: number}
  | {name: 'failed'; failure: Failure; retry: 'load' | 'analyse' | 'clear'};

/**
 * A mockup of an AEO readiness report for the page open in the editor, laid out for the
 * sidebar's narrowest width (about 300 px). Analyses only on a button press. The mock steps
 * through ANALYSIS_STEPS on a timer, then stores the fake report in kvStore (`aeoPut`), so the
 * next visit loads it straight away (`aeoGet`). A real job would run in the backend and the
 * panel would poll its progress instead.
 */
export function AeoReadiness({context}: {context: ExtensionContext}) {
  const [content, setContent] = useState<ContentState>(null);
  const [stored, setStored] = useState<Stored | null>(null);
  const [phase, setPhase] = useState<Phase>({name: 'checking'});
  const [recheck, setRecheck] = useState(0);
  // Bumped by every load, analysis and cancel, so late answers for an old page are dropped.
  const run = useRef(0);
  const latest = useRef<ContentState>(null);
  const unpublished = useRef(false);
  unpublished.current = stored?.published === false;

  // get() for the first value and subscribe() for changes; the CMS sometimes sends both.
  useEffect(() => {
    let active = true;
    const apply = (source: string, next: ContentState) => {
      logGroup(`aeo content ${source}`, next);
      if (!active) return;
      if (sameContent(latest.current, next)) {
        // The same page again is a status change (ready to publish, publish, schedule).
        if (source === 'subscribe()' && unpublished.current) setRecheck((n) => n + 1);
        return;
      }
      latest.current = next;
      setContent(next);
    };
    context.content
      .get()
      .then((next) => apply('get()', next))
      .catch((err: unknown) => logGroup('aeo content.get() failed', err));
    const unsubscribe = context.content.subscribe((next) => apply('subscribe()', next));
    void context.extension.setReady();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [context]);

  const key = content?.key;
  const locale = content?.locale ?? '';
  const publicUrl = content?.publicUrl;

  const call = useCallback(
    <T,>(action: 'aeoGet' | 'aeoPut' | 'aeoClear', params: Record<string, unknown>) =>
      callBackend<T>({context, surface: 'sidebar', content}, action, params),
    [context, content]
  );

  const load = useCallback(async () => {
    if (!key || !publicUrl) return;
    const id = ++run.current;
    setPhase({name: 'checking'});
    const outcome = await call<Stored>('aeoGet', {key, locale});
    if (id !== run.current) return;
    if (outcome.envelope?.ok) {
      setStored(outcome.envelope.result);
      setPhase({name: 'idle'});
    } else {
      setPhase({name: 'failed', retry: 'load', failure: toFailure("Couldn't load the saved analysis", outcome, publicUrl)});
    }
  }, [call, key, locale, publicUrl]);

  // A new page or language: drop what's on screen and look for a stored result.
  useEffect(() => {
    setStored(null);
    void load();
    // `load` changes with every content event; only a new page or language should reload.
  }, [key, locale, publicUrl]);

  // An unpublished page got a status event: check again whether it's published now.
  useEffect(() => {
    if (recheck) void load();
  }, [recheck]);

  const analyse = useCallback(() => {
    run.current++;
    setPhase({name: 'running', done: 0});
  }, []);

  const clear = useCallback(async () => {
    if (!key || !publicUrl) return;
    const id = ++run.current;
    setPhase({name: 'checking'});
    const outcome = await call('aeoClear', {key, locale});
    if (id !== run.current) return;
    if (outcome.envelope?.ok) {
      setStored((prev) => (prev ? {...prev, record: null} : prev));
      setPhase({name: 'idle'});
    } else {
      setPhase({name: 'failed', retry: 'clear', failure: toFailure("Couldn't clear the analysis", outcome, publicUrl)});
    }
  }, [call, key, locale, publicUrl]);

  const cancel = useCallback(() => {
    run.current++;
    setPhase({name: 'idle'});
  }, []);

  // The mock's progress: one step every ANALYSIS_STEP_MS, then save the fake report.
  const done = phase.name === 'running' ? phase.done : -1;
  useEffect(() => {
    if (done < 0 || !key || !publicUrl) return undefined;
    if (done < ANALYSIS_STEPS.length) {
      const timer = setTimeout(() => setPhase({name: 'running', done: done + 1}), ANALYSIS_STEP_MS);
      return () => clearTimeout(timer);
    }
    const id = run.current;
    const report = buildMockReport(key, stored?.displayName ?? pageNameFromUrl(publicUrl));
    void call<AeoRecord<AeoReport>>('aeoPut', {key, locale, version: content?.version ?? null, publicUrl, report}).then(
      (outcome) => {
        if (id !== run.current) return;
        if (outcome.envelope?.ok) {
          const record = outcome.envelope.result;
          setStored((prev) =>
            prev
              ? {...prev, record}
              : {published: null, publishedCheck: '', displayName: null, contentType: null, record}
          );
          setPhase({name: 'idle'});
        } else {
          const failure = toFailure("Couldn't analyse this page", outcome, publicUrl);
          if (outcome.envelope) {
            failure.checks = [
              {label: 'Analysis (mock)', result: 'ok'},
              {label: 'Save result', result: 'failed', detail: String(outcome.statusCode ?? '')}
            ];
          }
          setPhase({name: 'failed', retry: 'analyse', failure});
        }
      }
    );
    return undefined;
    // Only the step count drives this; the rest is read when the step changes.
  }, [done]);

  if (!content?.key) {
    return (
      <Unavailable
        text="Select a page in the tree to see its AEO readiness. After a reload or a language switch the CMS sometimes sends no page until you navigate to another one and back."
        title="No page selected"
      />
    );
  }
  if (!publicUrl) {
    return (
      <Unavailable
        text="This item has no public URL (a block, for example), so there's nothing for an answer engine to read. Select a page to see its score."
        title="Not a page"
      />
    );
  }

  const record = stored?.record ?? null;
  // Graph's display name when the backend could get it; the URL's last segment otherwise.
  const pageName = stored?.displayName ?? record?.report.pageName ?? pageNameFromUrl(publicUrl);
  const pageChips = (
    <>
      <LocaleChip locale={locale} />
      {stored?.contentType && <TypeChip type={stored.contentType} />}
    </>
  );

  if (phase.name === 'running') {
    return (
      <Root>
        <PageContext chips={pageChips} name={pageName} />
        {/* The mock's timer really stops. A backend job keeps running, so hide Cancel then. */}
        <Analysing done={phase.done} onCancel={phase.done < ANALYSIS_STEPS.length ? cancel : undefined} />
      </Root>
    );
  }

  if (phase.name === 'failed') {
    return (
      <Root>
        <PageContext chips={pageChips} name={pageName} />
        <ErrorPanel failure={phase.failure} onRetry={phase.retry === 'analyse' ? analyse : () => void (phase.retry === 'load' ? load() : clear())} />
      </Root>
    );
  }

  if (phase.name === 'checking') {
    return (
      <Root>
        <PageContext chips={pageChips} name={pageName} />
        <PromptHero busy text="Looking for an earlier analysis of this page." title="Loading…" tone="dark" />
      </Root>
    );
  }

  if (stored?.published === false) {
    return (
      <Root>
        <PageContext
          chips={
            <>
              {pageChips}
              <DraftChip />
            </>
          }
         
          name={pageName}
        />
        <PromptHero
          action={{label: 'Analyse page', disabled: true}}
          icon="hidden"
          text="AI crawlers can only see published pages. Publish this page, then come back to analyse it."
          title="Not published yet"
          tone="light"
        />
        <Checklist title="What we'll check after publishing" />
      </Root>
    );
  }

  if (!record) {
    return (
      <Root>
        <PageContext
          chips={
            <>
              {pageChips}
              {stored?.published && <PublishedChip />}
            </>
          }
         
          name={pageName}
        />
        <PromptHero
          action={{label: 'Analyse page', onClick: analyse}}
          text="See how easily AI answer engines can find, read and cite this page."
          title="Not analysed yet"
          tone="dark"
        />
        <Checklist title="What we check" />
        <PublishedNote />
      </Root>
    );
  }

  return (
    <Root>
      <PageContext
        chips={
          <>
            {pageChips}
            <MockupChip />
          </>
        }
       
        name={pageName}
      />
      <Results analysedAt={record.analysedAt} onAnalyse={analyse} onClear={() => void clear()} report={record.report} />
    </Root>
  );
}

/** No page, or not a page: the Empty layout, neutral, without a button. */
function Unavailable({text, title}: {text: string; title: string}) {
  return (
    <Root>
      <PromptHero text={text} title={title} tone="light" />
      <Checklist title="What we check" />
    </Root>
  );
}

/**
 * The backend's own envelope gives a specific reason. A transport failure (the CMS's generic
 * "Failed to invoke function") can't be told from a timeout or a too-large response.
 */
function toFailure(title: string, outcome: CallOutcome<unknown>, url: string): Failure {
  const envelope = outcome.envelope && !outcome.envelope.ok ? outcome.envelope : null;
  const reason = envelope
    ? (envelope.message ?? envelope.error)
    : "The analysis service didn't respond. Try again in a minute.";
  const at = new Date().toISOString();
  const details = [
    title,
    `Reason: ${reason}`,
    `URL: ${url}`,
    `Action: ${outcome.action}`,
    `Status: ${outcome.statusCode ?? 'none (transport error)'}`,
    envelope
      ? `Error code: ${envelope.error}`
      : outcome.transportError !== undefined
        ? `Transport error: ${outcome.transportError}`
        : `Response body: ${JSON.stringify(outcome.rawData)}`,
    `Round trip: ${outcome.roundTripMs} ms`,
    `At: ${at}`
  ].join('\n');
  return {title, reason, url, at, details};
}

function sameContent(a: ContentState, b: ContentState): boolean {
  return a?.key === b?.key && a?.version === b?.version && a?.locale === b?.locale && a?.publicUrl === b?.publicUrl;
}
