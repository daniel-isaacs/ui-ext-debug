import {Box, Tabs, TabsContent, TabsList, TabsTrigger} from '@optiaxiom/react';
import type {ContentState, ExtensionContext} from '@optimizely/cms-extensibility-sdk';
import {useEffect, useMemo, useState} from 'react';
import {BackendPanel} from '../panels/BackendPanel';
import {BridgePanel} from '../panels/BridgePanel';
import {CmsApiPanel} from '../panels/CmsApiPanel';
import {ContentPanel, type ContentEvent} from '../panels/ContentPanel';
import {EnvironmentPanel} from '../panels/EnvironmentPanel';
import {GraphPanel} from '../panels/GraphPanel';
import {InboxPanel} from '../panels/InboxPanel';
import {OverviewPanel} from '../panels/OverviewPanel';
import {PropertyPanel} from '../panels/PropertyPanel';
import {DebugProvider, type DebugCtx, type Surface} from './debugContext';
import {logGroup} from './log';

const MAX_CONTENT_EVENTS = 50;

/**
 * The whole debugger. Every injection point renders this same component; only
 * `surface` differs. It owns the one content subscription and passes the
 * history down, so every panel sees the same view of the content.
 */
export function DebuggerApp({context, surface}: {context: ExtensionContext; surface: Surface}) {
  const [content, setContent] = useState<ContentState>(null);
  const [contentEvents, setContentEvents] = useState<ContentEvent[]>([]);

  useEffect(() => {
    let active = true;
    const record = (source: ContentEvent['source'], state: ContentState) => {
      if (!active) return;
      logGroup(`content ${source}`, state);
      setContent(state);
      setContentEvents((prev) => [{at: new Date().toISOString(), source, state}, ...prev].slice(0, MAX_CONTENT_EVENTS));
    };

    // subscribe() only reports changes, so read the current state first.
    context.content
      .get()
      .then((state) => record('get()', state))
      .catch((error: unknown) => logGroup('content get() failed', error));
    const unsubscribe = context.content.subscribe((state) => record('subscribe()', state));

    void context.extension.setReady();
    logGroup(`mounted as ${surface}`, {context});
    return () => {
      active = false;
      unsubscribe();
    };
  }, [context, surface]);

  const debug = useMemo<DebugCtx>(() => ({context, surface, content}), [context, surface, content]);
  const narrow = surface !== 'view';

  return (
    <DebugProvider value={debug}>
      <Box p={narrow ? '8' : '16'}>
        <Tabs defaultValue={surface === 'property-editor' ? 'property' : 'overview'}>
          <TabsList style={{flexWrap: 'wrap'}}>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
            {surface === 'property-editor' && <TabsTrigger value="property">Property</TabsTrigger>}
            <TabsTrigger value="bridge">Bridge</TabsTrigger>
            <TabsTrigger value="backend">Backend</TabsTrigger>
            <TabsTrigger value="cms">CMS API</TabsTrigger>
            <TabsTrigger value="graph">Graph</TabsTrigger>
            <TabsTrigger value="inbox">Inbox</TabsTrigger>
            <TabsTrigger value="env">Iframe</TabsTrigger>
          </TabsList>
          <Box pt="12">
            <TabsContent value="overview">
              <OverviewPanel />
            </TabsContent>
            <TabsContent value="content">
              <ContentPanel events={contentEvents} />
            </TabsContent>
            {surface === 'property-editor' && (
              <TabsContent value="property">
                <PropertyPanel />
              </TabsContent>
            )}
            <TabsContent value="bridge">
              <BridgePanel />
            </TabsContent>
            <TabsContent value="backend">
              <BackendPanel />
            </TabsContent>
            <TabsContent value="cms">
              <CmsApiPanel />
            </TabsContent>
            <TabsContent value="graph">
              <GraphPanel />
            </TabsContent>
            <TabsContent value="inbox">
              <InboxPanel />
            </TabsContent>
            <TabsContent value="env">
              <EnvironmentPanel />
            </TabsContent>
          </Box>
        </Tabs>
      </Box>
    </DebugProvider>
  );
}
