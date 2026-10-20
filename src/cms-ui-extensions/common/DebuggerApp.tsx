import {Box, Select, SelectContent, SelectTrigger, Tabs, TabsContent, TabsList, TabsTrigger} from '@optiaxiom/react';
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
import {CompactContext} from './ui';

const MAX_CONTENT_EVENTS = 50;

const SECTIONS = [
  {value: 'property', label: 'Property', description: 'The bound property: get, set, subscribe'},
  {value: 'overview', label: 'Overview', description: 'Versions, current content, installation'},
  {value: 'content', label: 'Content', description: 'Content events and lookups'},
  {value: 'bridge', label: 'Bridge', description: 'Messages to and from the CMS, hidden methods'},
  {value: 'backend', label: 'Backend', description: 'whoami, transport limits, shared state'},
  {value: 'cms', label: 'CMS API', description: 'CMS REST API through the backend'},
  {value: 'graph', label: 'Graph', description: 'Optimizely Graph through the backend'},
  {value: 'inbox', label: 'Inbox', description: 'Requests sent to the webhook'},
  {value: 'env', label: 'Iframe', description: 'Sandbox tests, CSP violations, environment'}
];

/** Property editors are field-sized, so they only get the sections about the bound property. */
const SECTIONS_BY_SURFACE: Record<Surface, string[]> = {
  'property-editor': ['property', 'overview', 'content', 'bridge'],
  sidebar: ['overview', 'content', 'bridge', 'backend', 'cms', 'graph', 'inbox', 'env'],
  view: ['overview', 'content', 'bridge', 'backend', 'cms', 'graph', 'inbox', 'env']
};

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
  const sections = SECTIONS.filter((section) => SECTIONS_BY_SURFACE[surface].includes(section.value));
  const shown = new Set(sections.map((section) => section.value));
  const [active, setActive] = useState(sections[0].value);
  // Eight tabs wrap badly in a ~470 px sidebar; four fit in a property editor.
  const dropdown = surface === 'sidebar';
  const compact = surface === 'property-editor';

  return (
    <DebugProvider value={debug}>
      <CompactContext.Provider value={compact}>
        <Box p={compact ? '0' : dropdown ? '8' : '16'} fontSize={compact ? 'sm' : undefined}>
          <Tabs value={active} onValueChange={setActive}>
            {dropdown ? (
              <Select
                options={sections.map(({value, label, description}) => ({value, label, description}))}
                value={active}
                onValueChange={setActive}
              >
                <SelectTrigger w="full" />
                <SelectContent />
              </Select>
            ) : (
              <TabsList>
                {sections.map(({value, label}) => (
                  <TabsTrigger key={value} value={value} fontSize={compact ? 'sm' : undefined} py={compact ? '4' : undefined}>
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            )}
            <Box
              pt={compact ? '8' : '12'}
              // Under the sidebar's dropdown, indent the section with a guide line, so it reads as
              // "the content of what is selected above".
              style={
                dropdown
                  ? {borderLeft: '2px solid rgba(127, 127, 127, 0.3)', marginLeft: 8, marginTop: 8, paddingLeft: 12}
                  : undefined
              }
            >
              {shown.has('property') && (
                <TabsContent value="property">
                  <PropertyPanel />
                </TabsContent>
              )}
              <TabsContent value="overview">
                <OverviewPanel />
              </TabsContent>
              <TabsContent value="content">
                <ContentPanel events={contentEvents} />
              </TabsContent>
              <TabsContent value="bridge">
                <BridgePanel />
              </TabsContent>
              {shown.has('backend') && (
                <>
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
                </>
              )}
            </Box>
          </Tabs>
        </Box>
      </CompactContext.Provider>
    </DebugProvider>
  );
}
