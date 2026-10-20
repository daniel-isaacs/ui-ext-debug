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

**Known CMS quirk.** If the sidebar is open when the CMS page reloads (F5 or switching
language), it gets no content. Navigate to another item and back before running
content-related tests.

## 0. After every deploy (2 min)

1. `yarn deploy`, then reload the CMS and open the sidebar on a page.
2. **Overview → This extension:** "Frontend version" and "Backend version" must match. If
   they don't, wait a few minutes and reload. **Collect:** "Copy full dump" if they still
   differ, since that would be a CMS bug.
3. **Iframe → CSP violations** should be 0, and the text should render in Roboto.

## 1. Bridge: hidden host methods and events (5 min, no settings needed)

1. **Bridge → Call any host method → "Try 14 guessed methods".** Run it in the sidebar and in
   the view. **Collect:** "Copy results" from each.
2. **Bridge → Subscribe to any event:**
   1. Subscribe to every suggested name.
   2. Then in the CMS: navigate, switch theme, switch language and select a block.
   3. **Collect:** "Copy traffic".

## 2. Backend transport limits (10 min)

**Backend → Transport tests.** For each test, collect the badges (HTTP status, round trip)
and the start of the result:

| Test | Values | Question |
| --- | --- | --- |
| Echo | default | Does unicode survive? |
| Return N KB | 256, 1024, 4096 | Where does it fail? |
| Sleep N ms | 3000, 30000, 55000 | Does the CMS time out before the SDK's 60 s? |
| Return HTTP status | 418, 500 | What reaches the extension? |
| Throw | | Is it a 500 with an empty body? |
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

## 8. Property editors (10 min, new in dev.6)

The two editors (string, boolean) show a working editor with the debugger folded below it
(open question 4 in CLAUDE.md).

1. **Find out where they apply.** Open a page with string and boolean properties. Does the
   debug editor replace the editor for *every* string and boolean property, or must it be chosen
   per property in the content type settings? **Collect:** a line describing what you see.
2. Unfold "UI Extension Debugger" under one editor. Go to **Property** (the first tab).
   **Collect:** the property state (`value`, `readonly`, `settings`).
3. Type in the string editor and press Enter, then toggle the boolean. In **Content → Content
   events**, check whether editing through `property.set()` sends a content event.
   **Collect:** "Copy events", plus any error shown under the editor.
4. Run steps 0 to 1 (Overview, Bridge sweep) inside a property editor too. Its context may
   differ from the sidebar's. **Collect:** "Copy full dump".

## Already answered

These are recorded in CLAUDE.md, so you don't need to repeat them:
- The init message.
- What whoami returns and that no headers reach `debug_backend`.
- When content events fire, and the reload bug.
- The Graph auth modes.
- The CMS API content and versions endpoints.
- Storage being blocked.
- The CSP and font fix.
