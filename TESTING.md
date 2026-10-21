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

1. ~~**Backend → Shared state:** Write in the sidebar, then Read in the view.~~ Done
   2026-10-21: works, and the value survives for hours and across containers.
2. ~~**Backend → Lifecycle log:** load it, save the app settings, load it again.~~ Done
   2026-10-21: upgrades run onUpgrade → onFinalizeUpgrade → onAfterUpgrade, sometimes twice
   per deploy. Settings saves run onSettingsForm once per section.
3. ~~Note where you found the settings form.~~ Done 2026-10-21: only in the OCP App
   Directory, not in the CMS.

## 4. Webhook inbox

1. ~~**Inbox:** turn on polling, send a request, and compare its headers with whoami's.~~
   Done 2026-10-21: normal HTTP headers arrive, and there's no authentication.
2. ~~Send valid JSON from PowerShell, and time the polling.~~ Done 2026-10-21:
   `Invoke-RestMethod` works, the body arrives intact, and the Inbox showed it within 5 s.

## 5. Sandbox

~~**Iframe → Sandbox tests → Run tests.**~~ Done 2026-10-21: forms, popups and the Clipboard
API are blocked. Direct `fetch` to Graph works.

## 6. Content events, remaining cases (5 min)

**Content → Content events** (Clear the Bridge traffic first):
1. ~~In the **view**: does it ever get content?~~ Done 2026-10-21: never. A view is a
   standalone page with no current content: `content.get()` is always `null`. Only the sidebar
   and property editors have content.
2. ~~In the **sidebar**: schedule a publish, then delete a test item.~~ Done 2026-10-21:
   scheduling sends an event with the same version. Deleting moves the page to the waste
   basket, and the CMS opens the parent. The only event is for the parent, so there's no
   "deleted" signal.
3. ~~After a delete, does `GET /v1/content/{deleted key}` show the waste basket?~~ Done
   2026-10-21: no, it returns 404, and Graph (app key) returns nothing for it either.

## 7. CMS REST versions

**CMS API → Request**, with the "This content, versions" preset:
1. ~~Plain, `?statuses=draft` and `?locale=en`.~~ Done 2026-10-21: plain returns only
   published versions; `statuses=draft` returns nothing (so the filter exists); `locale=en` is
   ignored.
2. ~~Per the API reference, try `?locales=en&statuses=draft` and `?statuses=published`.~~ Done
   2026-10-21: the filters work, but the API key sees no drafts.
3. ~~Give the API key more rights and repeat.~~ Done 2026-10-21: with admin rights, draft
   489 appears, with its draft property values.
4. ~~Find the smallest right that shows drafts.~~ Done 2026-10-21: Read alone doesn't. Any
   other right on its own does (Create is the least).
5. Blocked: `act_as` (acting as an editor with a Read-only key). The token endpoint says the
   client isn't authorized, and the impersonation checkbox is gone from the API key UI. Retry
   when the CMS team answers.

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
