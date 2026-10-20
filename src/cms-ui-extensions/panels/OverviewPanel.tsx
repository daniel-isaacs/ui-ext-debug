import {Button, Group, Text} from '@optiaxiom/react';
import type {ExtensionDefinition} from '@optimizely/cms-extensibility-sdk';
import {useCallback, useEffect, useState} from 'react';
import {getEntries, getInitInfo} from '../common/bridgeSpy';
import {useBackendAction, useDebug, resultOf} from '../common/debugContext';
import {collectEnvironment} from '../common/environment';
import {logGroup} from '../common/log';
import {Bordered, CopyButton, Facts, JsonView, OutcomeView, Section} from '../common/ui';

interface WhoAmI {
  appContext: {
    trackerId?: string;
    installId?: number;
    scope?: string | null;
    account?: {organizationId: string; instanceId: string} | null;
    manifest?: {meta?: {app_id?: string; version?: string}} | null;
  };
  runtime: {containerStartedAt: string; node: string};
  functionEndpoints: Record<string, string>;
}

export function OverviewPanel() {
  const debug = useDebug();
  const {context, surface, content} = debug;
  const [definition, setDefinition] = useState<ExtensionDefinition | string | null>(null);
  const whoami = useBackendAction<WhoAmI>();
  const {run} = whoami;

  const load = useCallback(() => {
    context.extension
      .getDefinition()
      .then((value) => {
        logGroup('getDefinition()', value);
        setDefinition(value);
      })
      .catch((error: unknown) => setDefinition(`failed: ${error instanceof Error ? error.message : String(error)}`));
    void run('whoami');
  }, [context, run]);

  useEffect(load, [load]);

  const who = resultOf(whoami.outcome);
  const def = typeof definition === 'object' ? definition : null;
  const init = getInitInfo();
  const env = collectEnvironment();
  const ancestors = Array.isArray(env.frame.ancestorOrigins) ? env.frame.ancestorOrigins.join(', ') : env.frame.ancestorOrigins;

  // CDN layout: …/bundles/<app_id>/<version>/<Entry>.js. Other hosts (ocp dev) have no version.
  const bundleVersion = env.bundleUrl?.match(/\/(\d+\.\d+\.\d+[^/]*)\/[^/]+\.js$/)?.[1];
  const backendVersion = who?.appContext.manifest?.meta?.version;
  const versionsMatch = !bundleVersion || !backendVersion || bundleVersion === backendVersion;

  const dump = () => ({
    dumpedAt: new Date().toISOString(),
    surface,
    versions: {bundle: bundleVersion ?? null, backend: backendVersion ?? null},
    definition,
    content,
    init,
    backend: whoami.outcome,
    environment: env,
    bridgeTraffic: getEntries()
  });

  return (
    <Group flexDirection="column" gap="16">
      <Group gap="8" flexWrap="wrap">
        <Button appearance="primary" onClick={load}>
          Refresh
        </Button>
        <CopyButton value={dump()} label="Copy full dump" />
        <Button onClick={() => logGroup('FULL DUMP', dump())}>Dump to console</Button>
      </Group>

      <Section
        title="This extension"
        guide={{
          why: 'Which extension this is and where its code came from. Check this first after every deploy.',
          steps: [
            'Open the extension after a deploy. If it shows no content, navigate to another item and back.',
            'Compare the two versions below.'
          ],
          expect: 'Frontend and backend show the same version. Type is "content" in the sidebar and "view" in the view.',
          report: '"Copy full dump" (top of this tab) when anything looks wrong.',
          found:
            'Right after an upgrade the backend switches at once, but the CMS can serve the old bundles for a while. The definition id changes with each upgrade.'
        }}
      >
        {!versionsMatch && (
          <Text color="fg.error" fontSize="sm">
            Version mismatch: the CMS serves {bundleVersion} bundles, but the backend runs {backendVersion}. Reload
            the CMS; if it persists, the CMS hasn't picked up the upgrade.
          </Text>
        )}
        <Bordered>
          <Facts
            rows={[
              ['Surface', surface],
              ['Frontend version', bundleVersion],
              ['Backend version', backendVersion],
              ['Definition id', def?.id],
              ['Display name', def?.displayName],
              ['Type', def?.type],
              ['Icon URL', def?.iconUrl],
              ['Host origin', init?.origin],
              ['Ancestor origins', ancestors],
              ['Bundle URL', env.bundleUrl]
            ]}
          />
        </Bordered>
      </Section>

      <Section
        title="Current content"
        guide={{
          why: 'The content the editor has open, as the CMS reports it to the extension. It is all the context an extension gets.',
          expect: 'Key, version, locale and the public URL in the sidebar. Empty in a view.',
          found:
            'Empty after a full reload (F5 or switching language) while the sidebar is open, until you navigate to other content. Likely a CMS bug.'
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
        title="Installation (backend)"
        guide={{
          why: 'What the backend knows about where it is installed, from getAppContext(). The browser never sees the org or instance IDs unless the backend returns them.',
          expect: 'Scope is the CMS instance UUID. A "cold start" badge on the first call after a deploy or idle period.',
          found: 'Account org and instance IDs are empty for a CMS-scoped install. A cold start took 29 s; warm calls about 250 ms.'
        }}
      >
        <Bordered>
          <Facts
            rows={[
              ['App', who ? `${who.appContext.manifest?.meta?.app_id} ${who.appContext.manifest?.meta?.version}` : undefined],
              ['Scope (CMS instance)', who?.appContext.scope],
              ['Account org ID', who?.appContext.account?.organizationId],
              ['Account instance ID', who?.appContext.account?.instanceId],
              ['Tracker ID', who?.appContext.trackerId],
              ['Install ID', who?.appContext.installId],
              ['Node', who?.runtime.node],
              ['Container started', who?.runtime.containerStartedAt]
            ]}
          />
        </Bordered>
      </Section>

      <Section title="Not available to an extension">
        <Text fontSize="sm">
          SDK 1.1.0 gives no user identity, roles, organization name, CMS host URL, content type, or property
          values. Look for clues in the Bridge tab (other host methods, the init message), the Backend tab
          (inbound headers and any JWT claims), and the Graph and CMS API tabs (content metadata by key).
        </Text>
      </Section>

      <OutcomeView outcome={whoami.outcome} loading={whoami.loading} title="whoami (raw)" />
      {typeof definition === 'object' && definition && <JsonView title="getDefinition() (raw)" value={definition} />}
    </Group>
  );
}
