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

**Known CMS quirk.** After a slow full page reload (F5 or switching language), extensions get
no content. It shows up with DevTools open and "Disable cache" on; with the cache on, or
DevTools closed, the content usually arrives. If it's `null`, navigate to another item and
back before running content-related tests.

**After every deploy,** check in Settings → Content Types that the debug editors are still
chosen for the test properties. The selection was lost after dev.14 and dev.15. Also note the
extension IDs from the CMS console (`[ExtensionRegistry] Registering extension '<id>'`)
before and after the deploy: the theory is that the selection is lost only when the IDs change.

Finished tests are ~~struck through~~. Their results are in CLAUDE.md.

## 0. After every deploy (2 min)

1. `yarn deploy`, then reload the CMS and open the sidebar on a page.
2. **Overview → This extension:** "Frontend version" and "Backend version" must match. If
   they don't, wait a few minutes and reload. **Collect:** "Copy full dump" if they still
   differ, since that would be a CMS bug.
3. **Iframe → CSP violations** should be 0. The text renders in the browser's fallback fonts:
   the debugger ships no fonts (see CLAUDE.md).

## 1. Bridge: hidden host methods and events

1. ~~**Sidebar:** "Try 14 guessed methods", and subscribe to every suggested event.~~ Done
   2026-10-20: only the SDK's methods answer, and only `content` produces events.
2. ~~Retest the reload bug.~~ Done 2026-10-20: still there.
3. ~~Run "Try 14 guessed methods" in the **view** and in a **property editor**.~~ Done
   2026-10-23: the same three methods everywhere. Only the data differs.

## 2. Backend transport limits

**Backend → Transport tests.** For each test, collect the HTTP status and round trip, and
the start of the result:

| Test | Values | Question |
| --- | --- | --- |
| ~~Echo~~ | ~~default~~ | Done: unicode survives, but object keys come back sorted |
| ~~Return N KB~~ | ~~256, 1024, 4000, 4096~~ | Done: the limit is 4 MiB |
| ~~Sleep N ms~~ | ~~3000, 30000, 55000, 65000~~ | Done: 65 s fails at about 59.3 s, but the function keeps running and finishes at 65 s |
| ~~Return HTTP status~~ | ~~418, 500~~ | Done: status and JSON body arrive unchanged |
| ~~Throw (caught)~~ | | Done: 500 with the JSON body (the function catches it) |
| ~~Throw (uncaught)~~ | | Done: no status. The call rejects with "Failed to invoke function:", like a timeout |
| ~~OCP notification~~ | | Done: in OCP → Settings → History → Activity Log. Not in the CMS, `ocp app logs` or the Event Inspector |

## 3. Shared state and lifecycle (3 min)

1. ~~**Backend → Shared state:** Write in the sidebar, then Read in the view.~~ Done
   2026-10-21: works, and the value survives for hours and across containers.
2. ~~**Backend → Lifecycle log:** load it, save the app settings, load it again.~~ Done
   2026-10-21: upgrades run onUpgrade → onFinalizeUpgrade → onAfterUpgrade. Settings saves
   run onSettingsForm once per section. Rechecked 2026-10-23: without the explicit upgrade,
   dev.11 and dev.12 each ran the hooks once.
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

~~**Iframe → Iframe environment.**~~ Done 2026-10-23: origin `null`, storage blocked, and a
short permissions-policy list (no clipboard, camera, microphone, geolocation or fullscreen).
Language, time zone and color scheme come from the browser, not the CMS.

~~**Iframe → Sandbox tests → Run tests** again on dev.15: the new IndexedDB and Cache API
rows.~~ Done 2026-10-27: both blocked (`indexedDB.open()` is denied, `caches` is disabled
without `allow-same-origin`). No browser storage works.

## 5b. ~~Frame to frame (5 min, dev.15)~~

Done 2026-10-27: `postMessage` through `window.top.frames` works between extension frames (7
windows found, both editors replied within 13 ms, a saved value reached the sidebar in 5 ms).
`BroadcastChannel` doesn't cross frames. Details in CLAUDE.md.

Can extension frames talk to each other without the backend? Every entry listens for tagged
`postMessage`s from other frames and on a `BroadcastChannel`, and answers pings.
1. Open a page that shows one or more debug property editors, and open the sidebar.
2. **Sidebar → Bridge → Frame to frame → Ping all frames.** Each extension frame that answers
   shows as a `reply`, with its label (string editor, short string editor…).
3. Change a value in a debug property editor (type and press Enter). The sidebar should get a
   `property` message with the new value.
4. Unfold a property editor, open its Bridge tab and click **Send note**. Check the sidebar and
   the other editors.

**Collect:** "Copy ping result" and "Copy messages" from the sidebar, plus which editors were on
the page.

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
5. ~~`act_as` (acting as an editor with a Read-only key).~~ Closed 2026-10-22: impersonation
   isn't available for API keys. The CMS team plans scoped keys combined with the user's own
   Opti ID token instead.

## 8. Property editors

Three editors (string, short string, boolean) show a working editor with the debugger folded
below it. In a property editor the debugger has only Property and Bridge (open question 4 in
CLAUDE.md).

1. ~~**Choose the editor.**~~ Done: in CMS Settings → Content Types, the editor dropdown
   offers the debug editors for long and short strings (short string since the evening of
   2026-10-20, with no change on our side). Still open: why not for boolean.
2. ~~Check that `set()` updates the input.~~ Done: the CMS doesn't echo it back, so the editor
   updates itself (dev.8).
3. ~~Collect `settings` before and after changing the property's settings.~~ Done 2026-10-23:
   always `{}`, and `readonly` works for non-localized properties in another language.
4. ~~**Property → Write a raw value:** `"text"`, `42`, `true`, `null`.~~ Done 2026-10-23:
   strings and `null` succeed. `42` and `true` make the CMS show a "could not save, reverted"
   popup with a .NET error, yet `set()` returned `success: true` for both. The revert works:
   the previous value comes back when the popup is closed. `set(null)` was echoed through
   `subscribe()`; `set("Value 2")` wasn't. Rechecked 2026-10-27: the reverted value arrives
   as a `property` event on every subscription, with no reload of the frame.
5. ~~**Bridge** in the property editor: "Try 14 guessed methods".~~ Done 2026-10-23: the same
   three methods as the sidebar, and `property.get` is bound. Nothing names the property.

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
