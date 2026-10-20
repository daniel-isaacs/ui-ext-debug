# Testing the UI Extension Debugger

This is a run order for finding out what a CMS UI extension can see and do. Each section in
the extension has its own "How to test · what to expect" panel, with the same steps and
what earlier runs found. This file puts them in order and says what to collect.

**How to report.** Use the copy buttons, not screenshots:
- "Copy full dump" (Overview tab) captures everything.
- "Copy traffic" (Bridge tab) captures the message log. Click Clear before a test to keep it short.
- Each result block has its own Copy button.

Add one line saying what you did in the CMS. Prefix it with the surface (sidebar or view) and
the version shown in Overview.

**Known CMS quirk.** After a full page reload (F5 or switching language), extensions get no
content. Navigate to another item and back before running content-related tests.

Finished tests are ~~struck through~~. Their results are in CLAUDE.md.

## 0. After every deploy (2 min)

1. `yarn deploy`, then reload the CMS and open the sidebar on a page.
2. **Overview → This extension:** "Frontend version" and "Backend version" must match. If
   they don't, wait a few minutes and reload. **Collect:** "Copy full dump" if they still
   differ, since that would be a CMS bug.
3. **Iframe → CSP violations** should be 0, and the text should render in Roboto.

## 1. Bridge: hidden host methods and events

1. ~~**Sidebar:** "Try 14 guessed methods", and subscribe to every suggested event.~~ Done
   2026-10-20: only the SDK's methods answer, and only `content` produces events.
2. ~~Retest the reload bug.~~ Done 2026-10-20: still there.
3. Run "Try 14 guessed methods" in the **view** and in a **property editor**. **Collect:** "Copy
   results" from each.

## 2. Backend transport limits

**Backend → Transport tests.** For each test, collect the HTTP status and round trip, and
the start of the result:

| Test | Values | Question |
| --- | --- | --- |
| ~~Echo~~ | ~~default~~ | Done: unicode survives, but object keys come back sorted |
| ~~Return N KB~~ | ~~256, 1024, 4000, 4096~~ | Done: the limit is 4 MiB |
| Sleep N ms | ~~3000, 30000, 55000, 65000~~ | Done: 65 s fails at 59.3 s with "Failed to invoke function:". Still open: did the function finish (check `ocp app logs`)? |
| ~~Return HTTP status~~ | ~~418, 500~~ | Done: status and JSON body arrive unchanged |
| ~~Throw (caught)~~ | | Done: 500 with the JSON body (the function catches it) |
| ~~Throw (uncaught)~~ | | Done: no status. The call rejects with "Failed to invoke function:", like a timeout |
| OCP notification | | Where does it show up, if anywhere? |

## 3. Shared state and lifecycle (3 min)

1. **Backend → Shared state:** Write in the sidebar, then Read in the view. **Collect:** the
   Read result.
2. **Backend → Lifecycle log:**
   1. Load it.
   2. Save the app settings once.
   3. Load it again.
   4. **Collect:** both results. This shows whether onUpgrade ran for each deploy.
3. Note where you found the settings form for this CMS-scoped install (open question 5 in
   CLAUDE.md).

## 4. Webhook inbox (3 min)

1. **Inbox:** turn on polling.
2. Run the shown `curl` command in Git Bash.
3. **Collect:** the received request. Compare its headers with whoami, where `debug_backend`
   received none.

## 5. Sandbox (2 min)

**Iframe → Sandbox tests → Run tests.** **Collect:** "Copy results".

## 6. Content events, remaining cases (5 min)

**Content → Content events** (Clear the Bridge traffic first):
1. In the **view**: reload the CMS with the view open, then open content. Does it get content?
2. Schedule a publish, and delete a test item. Does either send an event?
3. **Collect:** "Copy events", with a line for each action.

## 7. CMS REST versions (2 min)

**CMS API → Request:**
1. Use the "This content, versions" preset.
2. Add `?statuses=draft`, then `?locale=en`.
3. **Collect:** the status badge and item count for each.

## 8. Property editors

Three editors (string, short string, boolean) show a working editor with the debugger folded
below it. In a property editor the debugger has only Property and Bridge (open question 4 in
CLAUDE.md).

1. ~~**Choose the editor.**~~ Done: in CMS Settings → Content Types, the editor dropdown
   offers the debug editors for long and short strings (short string since the evening of
   2026-10-20, with no change on our side). Still open: why not for boolean.
2. ~~Check that `set()` updates the input.~~ Done: the CMS doesn't echo it back, so the editor
   updates itself (dev.8).
3. Unfold "▸ UI Extension Debugger" and open **Property**. **Collect:** the "settings" section
   ("Copy settings"), then change the property's settings in the content type (required,
   help text, limits), reload, and collect it again.
4. **Property → Write a raw value:** try `"text"`, `42`, `true` and `null`. **Collect:** the
   `set()` result for each.
5. **Bridge** in the property editor: "Try 14 guessed methods". **Collect:** "Copy results".

## Already answered

These are recorded in CLAUDE.md, so you don't need to repeat them:
- The init message.
- The host methods and events in the sidebar.
- What whoami returns and that no headers reach `debug_backend`.
- When content events fire (including blocks and older versions), and the reload bug.
- The transport limits: 4 MiB responses, 55 s calls, status codes passing through.
- The sidebar's width: 300 to 550 px.
- The Graph auth modes.
- The CMS API content and versions endpoints.
- Storage being blocked.
- The CSP and font fix.
