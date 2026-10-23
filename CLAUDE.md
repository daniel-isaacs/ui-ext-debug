# UI Extension Debugger (Steve): OCP app for exploring CMS UI extensions

An OCP app (`app_id: steve_ui_ext_debug`) that reports everything a CMS UI extension can
see and do. Every injection point renders the same debugger (`src/cms-ui-extensions/common/DebuggerApp.tsx`):

| Entry | Injection point | File |
| --- | --- | --- |
| DebugSidebar | sidebar | `src/cms-ui-extensions/debugger/DebugSidebar.sidebar.tsx` |
| DebugView | view | `DebugView.view.tsx` |
| DebugStringEditor | property-editor (string) | `DebugStringEditor.property-editor.tsx` |
| DebugShortStringEditor | property-editor (string, `property_format: shortstring`) | `DebugShortStringEditor.property-editor.tsx` |
| DebugBooleanEditor | property-editor (boolean) | `DebugBooleanEditor.property-editor.tsx` |

The property editors show a working editor first and the debugger underneath, folded.

Backend:
- `debug_backend` (`src/backend/functions/DebugBackend.ts`, `accepts: cms_ui_extension`) handles
  every action listed in `src/shared/protocol.ts`.
- `debug_webhook` (`DebugWebhook.ts`) is a plain HTTP function. It writes each request to
  kvStore, and the Inbox tab polls it.

Build setup was copied from `D:\Dev\ui-ext-unsplash`, which is based on Optimizely's sample
(Apache-2.0). That repo's CLAUDE.md covers the shared OCP CLI workflow and Yarn gotchas.

## Commands

```bash
yarn install
yarn validate   # lint + typecheck + build + ocp-app-sdk validate. Run before every publish.
yarn deploy     # validate + prepare --bump-dev-version --publish (scripts/deploy.mjs), then
                # report whether the installs moved to the new version by themselves.
                # It doesn't upgrade: an extra upgrade on top of the move ran the hooks twice.
                # --upgrade-only upgrades the install (scope: --scope, OCP_SCOPE or .ocp-scope).
                # Never pass --no-progress to prepare: without it prepare waits for the
                # publish to finish; with it, prepare returned while the version was BUILT.
                # Commit afterwards: it changes the version in app.yml.
ocp app register                                   # once; app ID must match app.yml
ocp app prepare --bump-dev-version --publish
ocp directory install steve_ui_ext_debug@<version> --scope <cms-instance-uuid>
ocp directory upgrade steve_ui_ext_debug -v <version> --scope <cms-instance-uuid>
ocp app logs --appId steve_ui_ext_debug --scope <cms-instance-uuid> --tail   # app ID is a flag, not positional
```

**Never install without `--scope` before the first publish.** That would permanently classify
the app as account-scoped (see the Unsplash repo's CLAUDE.md).

## How it gets its data

- **Bridge spy** (`common/bridgeSpy.ts`): the SDK talks to the CMS over a private MessagePort
  that arrives in a `CMS_INIT` window message. The spy listens for the same message, keeps the
  port, patches `MessagePort.prototype.postMessage` and logs traffic in both directions. It can
  also send raw `CMS_CALL` and `CMS_SUBSCRIBE` messages for methods the SDK doesn't wrap.
  Probe IDs start at 1,000,000 so the SDK ignores the replies. **`installBridgeSpy()` must run
  before `register()`** in every entry file.
- **Backend context**: `getAppContext()` returns `trackerId`, `installId`, `scope` (the CMS
  instance UUID) and `account`. `account` is `null` for a CMS-scoped install. `whoami` also returns the inbound
  headers (secrets masked, JWT claims decoded), `functions.getEndpoints()`, runtime info and
  environment variable names.
- **CMS REST API and Graph** use keys from the settings form (`forms/settings.yml`, sections
  `cms_api` and `graph`). No documented way exists to reuse the editor's own auth. The
  `probeForwardedAuth` action checks whether a bearer token reaches the function anyway.
- Everything is logged to the browser console with the prefix `[UXD]`.

## What's known (from SDK 1.1.0 source and the docs, Oct 2026)

- **Frontend context is small.** It has `getDefinition()` (`id`, `displayName`, `type`,
  `iconUrl?`, `configuration?`), content `{key, version, locale, publicUrl}`, and, in property
  editors only, property `{value, readonly, settings?}`. The SDK has no user, role, org name,
  CMS host URL, content type or property values. The content key is a GUID, not a name.
- **Org and instance IDs are backend-only**, from `getAppContext()`. The browser never gets them
  unless the backend returns them.
- **Reusing the editor's auth isn't documented.** The CMS API and Graph need the app's own keys.
- **The backend can't push to an extension.** The extension polls (see the Inbox tab and kvStore).
  Extensions also can't talk to each other directly. They share state through the backend's kvStore.
- **`invokeFunction` limits:** the SDK times out every bridge call after 60 s, but the CMS gives
  up first, at about 59 s. The response limit is 4 MiB.
  - The SDK source suggested an exception thrown in `perform()` would arrive as
    `statusCode: 500` with an empty body. **Measured on a real CMS, it doesn't** (dev.10):
    `invokeFunction` rejects with the generic `[ExtensionService] Failed to invoke function:`,
    the same as a timeout or a too-large response.
  - Statuses and bodies the function returns itself (418, 500) arrive unchanged.
  - Functions with `accepts: cms_ui_extension` can't be global or use `installation_resolution`.
- **The extension runs in a sandboxed iframe without `allow-forms`.** Never rely on `<form>`
  submit. Popups and the clipboard may be blocked too (Iframe tab).

## Observed on a real CMS (view extension, 1.0.0-dev.3, 2026-10-20)

- **`CMS_INIT` is just `{type: 'CMS_INIT'}` plus one MessagePort.** It comes from the CMS
  instance origin (`https://app-<id>.cms.optimizely.com`).
- **`getDefinition()` returns more than the SDK types declare**: `sdkVersion` ("1.1.0"),
  `isDeprecated` and `moduleId`, which is the OCP app ID. `configuration` was `{}`. `id` is the
  extension's GUID and appears in the frame URL.
- **Frame**: `<cms-origin>/api/cms/extensions/<app_id>/frame/<extension-id>`. The referrer is
  `<cms-origin>/ui/extensions`. The sandbox has no `allow-same-origin`, so the origin is `"null"`,
  and `localStorage`, `sessionStorage` and cookies throw. `indexedDB` exists but is probably
  unusable for the same reason.
- **CDN layout**: bundles are at
  `https://apps.global.ocp.optimizely.com/bundles/<app_id>/<version>/<Entry>.js`, with chunks under
  `shared/`. The icon is at `https://apps.global.ocp.optimizely.com/<app_id>/<version>/assets/icon.svg`.
  Note that the icon path has no `bundles/`.
- **CSP**: `default-src 'none'; script-src 'nonce-…' https:; style-src 'unsafe-inline' https:;
  connect-src https:; img-src https: data:; font-src https:; frame-ancestors 'self'`.
  **`data:` fonts are blocked.** All 44 inlined Roboto `@font-face` rules fail, and the UI falls
  back to system fonts. `img-src` does allow `data:`.
- **A view never has a current content item.** `content.get()` always returns `null` there:
  at load, and when called again later (confirmed 2026-10-21). A view is a standalone page under
  `/ui/extensions`, not tied to what the editor has open. Only the sidebar and property editors
  get content. A view that needs content must let the user pick it, for example through Graph or
  the CMS API.
- **The sidebar's definition `type` is `"content"`, not `"sidebar"`.** The view's is `"view"`.
  The sidebar frame's referrer is `<cms-origin>/ui/cms`.
- **The sidebar can be resized from about 300 px to 550 px wide.** Chrome DevTools (Computed)
  shows 299 px at the narrowest and 549 px at the widest, likely a CSS `min-width: 300px` and
  `max-width: 550px` minus a 1 px border. Earlier dumps measured 472 and 521 px. Design sidebar
  extensions for 300 px first: no wide tables, and controls that wrap or stack.
- **Content in the sidebar: `content.get()` returns the current content straight away. Whether
  `subscribe()` also sends it changed during the day.**
  - Morning tests (dev.3): the subscription sent nothing at load, only on changes.
  - Evening (dev.9, 18:28 UTC): every new `content` subscription got the current state about
    20 ms after subscribing. That held for the SDK's at load and for a raw one added later.
  - The CMS may have changed in between. Keep using both: `get()` for the first value and
    `subscribe()` for changes, and ignore duplicates.

  The state looks like
  `{key: "<32-hex, no dashes>", version: "472", locale: "en", publicUrl}`. `version` is a
  string, and it looks like a global version ID, not a per-item counter. `publicUrl` is the
  page's URL on the **front-end site** (e.g. `https://test.contentgurus.no/en/blog/…/`), so
  the extension does learn the site's host this way.
- **The bridge offers only the SDK's methods.** The 14-method sweep (dev.9, sidebar) found
  three that answer: `extension.getDefinition`, `content.get` and `property.get`. In the
  sidebar, `property.get` returns `{readonly: true}` with no value: it isn't bound. Every guess
  (`user.get`, `auth.getToken`, `theme.get`, `locale.get`, `content.getType` and more) returns
  `CMS_ERROR "Unknown method: <name>"` within about 10 ms. The error text doesn't list the
  supported methods.
- **Unknown events are accepted silently and never fire.** Subscribing to `user`, `theme`,
  `locale`, `selection`, `navigation` or `property` (in the sidebar) returns no error. None of
  them sent an event while navigating pages, versions and blocks. Only `content` produces events.
- **The `content` event follows whatever is selected, blocks included.**
  - Selecting a block sends its `key`, `version` and `locale`, with **no `publicUrl`** (blocks
    have no URL).
  - Opening an older version of a page sends that version (469 → 346), so `version` is the
    version being viewed, not the latest.
  - Several subscriptions on one port each get every event (the SDK's id 4 and a raw one).
- **The `content` event fires on version and status changes, not on edits.** Tested in the
  sidebar on one page:
  - Editing a property in an existing draft: no event. Autosave keeps the same version.
  - "Ready to publish": event, same version (`472`).
  - Publish: event, same version (`472`).
  - The first edit after publishing: event, new version (`486`). This creates a new draft.
  - Scheduling a publish (2026-10-21, another page): event, same version (`485`).
  - **Deleting a page** (2026-10-21) moves it to the **waste basket**: it isn't deleted
    straight away. A background job deletes it after a configurable period, about 30 days by
    default. The waste basket is a container with its own ID.
    - After the delete, the CMS opens the deleted page's **parent**, and the only event is for
      that parent. Tested twice: once the parent was the start page (`…/en/`), once
      `…/en/examples/`.
    - **There's no event for the delete itself.** The extension only sees ordinary navigation
      to the parent.
    - **The CMS REST API hides waste-basket content.** `GET /v1/content/{key}` returned 200 with
      `container` = the parent's key before the delete. Straight after, it returned
      **404 Not Found** (`application/problem+json`, RFC 9110 type link). So `container` never
      shows the waste basket, and a 404 can't be told from "never existed".
    - **Graph drops it too.** With the app key and secret, which sees drafts and old versions,
      the deleted key returns `total: 0` about 2.5 minutes after the delete. Neither API can tell
      "in the waste basket" from "never existed".
- **The CMS REST API was updated overnight:** `cms-api-version` went from `v1-2026.10.1`
  (2026-10-20) to `v1-2026.10.8` (2026-10-21). That fits the other overnight changes:
  short-string editors started being offered, and `subscribe()` started sending the current
  state straight away.

  The payload has no status field, so the "ready to publish", "publish" and "scheduled"
  events are identical. To find out what changed, look the version up in Graph with the app
  key; the CMS REST API's versions endpoint only lists published versions. The version
  jumped from 472 to 486 on one page, which confirms it's an instance-wide version ID.
- **CMS bug: after a full page reload, extensions get no content until you navigate.**
  Switching locale reloads the whole CMS page, extension frames included. F5 does the same.
  - Morning (dev.3): with the sidebar open during the reload, `content.get()` returned `null`,
    still `null` 18 s later, and no `content` event arrived.
  - Evening retest (dev.9, 19:02 UTC): after F5 the CMS reopened the page with the sidebar
    **closed**. Opening it then gave `get()` → `null` *and* an immediate `subscribe()` event →
    `null`. So it's not about when the sidebar opens: the CMS itself has no current content
    after a reload. The new immediate `subscribe()` event just repeats that `null`.
  - Navigating to another item and back fixes it: both navigations send events. Confirmed again
    on dev.9: about 8 minutes of `null`, then two events about 3.5 s apart, with the original
    page last.
  - Opening the sidebar after *navigating* (not reloading) gives the content straight away.

  Extensions must handle `null` and should tell the user to reselect the content. Not reported
  to the CMS team yet.
- **The CMS doesn't remember an open sidebar across a reload.** After F5 the page came back with
  the sidebar closed.
- **Locales share the content `key`, but each language has its own `version`.** The same key
  had `"en"` at version 486 and `"no"` at version 395. The Norwegian locale code is `no`, not
  `nb`.
- **CMS REST `GET /v1/content/{key}`** returns metadata for the item as a whole. That's
  `contentType`, `container` (the parent key), `created` and `createdBy`, `lastModified` and
  `lastModifiedBy`, `locales` and `primaryLocale`. `createdBy` and `lastModifiedBy` are editors'
  email addresses. The response has no version or status. It takes about 430 ms.
- **Graph can tell you a version's status.**
  - With **basic auth (app key + secret)**, `_Content(where: {_metadata: {key: {eq}}})`
    returns every version in every locale, with `status` set to `Published`, `Draft` or
    `Previous`.
  - With the **single key** it returns only the published versions, one per locale.
  - To find out what a `content` event meant, look up `(key, locale, version)` with basic auth.
  - After a publish, the same `version` appears twice, once as `Draft` and once as
    `Published`. Prefer `Published`, or the record with the newest `lastModified`.
  - Graph had indexed the publish within 12 s.
  - **A page that has never been published** (2026-10-21):
    - With the single key, the result is `total: 0` and no items. That's not an error, so an
      extension can't tell "not published yet" from "doesn't exist".
    - With the app key, the page comes back with `status: "Draft"`, `published: null`, and a
      `url` with no `base`.
    - That single-key call took 1.7 s inside Graph (`x-response-time: 1664`), against 0.2 s
      for the app-key call. It may have been a cold cache.
  - **Look up the exact version from a `content` event** by filtering on `key`, `locale` and
    `version` together: `_metadata: {key: {eq}, locale: {eq}, version: {eq}}`. The Content tab
    ("Graph: this version") and the Graph tab ("This version" preset) do this from dev.11.
    Filtering on the key alone returns every version in every language. **Graph accepts the
    `version` filter** (confirmed 2026-10-21): it returned exactly one item, `total: 1`. Each
    filter adds 2 to the query cost (36 with three filters, against 32 with one).
    - **For a draft, use the app key.** The single key returns `total: 0` for a draft version.
      The app key returns it with `status: "Draft"`.
    - **`published` on a draft is the item's publish date,** not the version's. Draft 489
      showed `published: 2026-05-22`, the date of an earlier published version. Use `status`
      to tell drafts from published versions, not `published`.
  - Limits: `x-ratelimit-limit: 2500` per 10 s window. The response's `extensions.cost`
    gives each query's cost (33 for this one).
- **Graph rejects the CMS API token as a bearer.** It returns `401 AUTHENTICATION_ERROR` with
  `"Missing tenant_id"`, in about 0 ms. Graph reads the JWT but expects a `tenant_id` claim
  that the CMS client-credentials token doesn't carry. Use the Graph single key (published
  only) or the app key + secret (all versions).
- **After `ocp directory upgrade`, the backend switches right away, but the UI bundles may not.**
  The sidebar opened 1 s after the upgrade to dev.4. Its backend was already dev.4, with a new
  container, but the CMS still served the dev.3 bundles and icon. The CMS generates the frame
  HTML on each load, so the bundle URL is decided by the CMS, not by the browser cache. A
  while later (dev.5) the frontend and backend matched. So the CMS does pick up upgrades, just
  with a delay. Check the versions in the Overview tab after every upgrade.
- **The extension definition `id` changes when the CMS registers a new version.** The sidebar
  was `8ae2c648-…` on dev.3 and dev.4 and `58dccb44-…` on dev.5. Don't key stored state on it;
  use the app ID plus the entry point.
- **The font fix works on the real CDN.** dev.5 has 0 CSP violations, so
  `bundles/<app>/<version>/assets/` is served.
- **Transport tests (dev.9, sidebar, 2026-10-20):**
  - **Echo:** the body arrives intact, including `æøå 🐞`, nested objects and arrays (425
    bytes, content type `null`).
    - **Object keys come back sorted alphabetically.** The client sent `action, params,
      client`, and it came back as `action, client, params`; the content state's keys were
      sorted too. The body is re-serialized on the way, so don't rely on key order. The same
      sorting shows in whoami's manifest.
  - **Return N KB:** 256 KB took 1,265 ms round trip, and 1,024 KB took 1,437 ms. The
    function took 0 to 1 ms both times, and both arrived whole. A warm whoami (about 5 KB) takes
    about 250 ms. So a large response costs about 1 s, plus a little per MB: the overhead is
    mostly fixed, not proportional to size.
    - **4,096 KB fails.** The extension gets a transport error from the CMS: `[ExtensionService]
      Failed to invoke function:` (empty reason), with `payload: null`, after 1,338 ms. So the
      response limit is between 1 MB and 4 MB.
    - **4,000 KB works:** 4,096,000 bytes of data, 2,351 ms round trip. So the limit is between
      about 4.0 MB and 4.2 MB, which fits a **4 MiB (4,194,304 bytes) response limit**, most
      likely gRPC's default. Keep `invokeFunction` responses well under 4 MB, and page anything
      larger. 4,090 KB would pin it down further; it's not needed.
  - **Sleep N ms:**

    | Sleep | Round trip | Function | Overhead |
    | --- | --- | --- | --- |
    | 3,000 ms | 3,599 ms | 3,002 ms | about 600 ms |
    | 30,000 ms | 30,192 ms | 29,999 ms | about 190 ms |
    | 55,000 ms | 55,638 ms | 55,005 ms | about 630 ms |

    | 65,000 ms | **fails at 59,294 ms** | unknown | |

    Up to 55 s works, and the overhead is fixed at about 200 to 650 ms per call, whatever the
    duration.
    - **65 s fails before the 60 s mark**, with the same message as the 4 MiB failure:
      `[ExtensionService] Failed to invoke function:` and `null`. It comes from the CMS's
      extension service, not the SDK's own timeout, so the server side gives up at about 59 to
      60 s. Keep calls well under that.
    - **An extension can't tell a timeout from a too-large response,** or from any other
      platform failure: all give the same empty error.
    - **The function keeps running after the cut-off** (retested 2026-10-23, dev.12). The
      extension got the error after 59,277 ms. The server log shows the sleep starting at
      16:00:06.414 and `sleep finished 65000 ms` at 16:01:11.418. So when the extension gives
      up, the backend isn't stopped. A slow write can still complete after the user saw an
      error, so long-running backend work must be safe to retry, or must report its result
      some other way (for example kvStore plus polling).
    - The same log had two `whoami invocation 1` lines 19 ms apart. Two frames loaded at once
      (the sidebar and a property editor), and each got a fresh container.
  - **Return HTTP status:**
    - **418:** reaches the extension unchanged. `statusCode` is 418, and the JSON body (the error
      envelope) arrives whole. The call doesn't reject. Round trip 635 ms. So status codes and
      error bodies a function sets on purpose pass straight through.
    - **500:** the same. The returned 500 keeps its JSON body (`requested_error`), so the CMS
      doesn't replace 5xx bodies either.
    - **Throw (caught):** HTTP 500 with the JSON body, in 545 ms. This doesn't test an uncaught
      exception: `DebugBackend.perform()` catches errors and returns its own 500 envelope. It
      only shows that a returned 500 also keeps its body. From dev.10, "Throw (uncaught)"
      throws before the try/catch, to test the claim in the known-facts section (500 with an
      empty body).
    - **Throw (uncaught), dev.10:** no status code. `invokeFunction` rejects with
      `[ExtensionService] Failed to invoke function:` and `null`, in 266 ms. That's the same
      error as the timeout and the 4 MiB failure. So the known-facts claim ("500 with an empty
      body") is wrong for this runtime. **Always catch errors in `perform()` and return your
      own status and body.** Otherwise the extension only gets the generic error.
  - **Shared state through kvStore works across surfaces and lasts** (2026-10-21, dev.10). A note
    written in the sidebar at 06:10 UTC was read in the view at 17:55 UTC, almost 12 hours
    later, by a freshly started container (`invocation: 1`). kvStore belongs to the install, not
    to a container. That read took 168 ms inside the function, on a cold start.
  - **Lifecycle hooks** (log read 2026-10-21; it keeps the last 25 entries, so `onInstall` has
    rolled off):
    - **An upgrade runs three hooks in order:** `onUpgrade(fromVersion)` →
      `onFinalizeUpgrade(fromVersion)` → `onAfterUpgrade()`, within about 0.3 to 0.8 s.
      `onAfterUpgrade` gets no version.
    - **The hooks can run more than once per deploy. Make them idempotent.**
      - The dev.10 deploy logged two full runs, one second apart: "from dev.9", then "from
        dev.10". The dev.8 deploy did the same ("from dev.7", then "from dev.8"). Publishing a
        dev version seems to move the install by itself, and the explicit
        `ocp directory upgrade` then runs the hooks again, from a version to itself.
      - The dev.6 deploy (14:12) ran the whole sequence **twice at the same time**, both "from
        dev.5", interleaved.
      - **Confirmed (2026-10-23):** without the explicit upgrade, dev.11 and dev.12 each logged
        exactly **one** run ("from dev.10" and "from dev.11"). So the sequential double runs
        came from our extra `ocp directory upgrade`. The concurrent pair on dev.6 is still
        unexplained, so keep the hooks idempotent anyway.
    - `onSettingsForm` also logs the "Save and test" button, as `cms_api/test`.
    - **`onSettingsForm` runs once per saved section,** with `detail` = `<section>/<action>`. For
      example, `cms_api/save` when one CMS API setting changed.
    - The hooks get the same context as the functions: `account: null`, `installId`, `scope` and
      `trackerId`.
  - **The webhook function (`debug_webhook`) gets normal HTTP headers** (2026-10-21), unlike
    `debug_backend`, which gets none. So `accepts: cms_ui_extension` calls don't arrive as HTTP
    requests at all.
    - A `curl` POST reached the Inbox with `host: function.zaius.app`, `content-type`,
      `user-agent`, `x-request-id` and the client's public IP in `x-forwarded-for`.
    - The proxy layer is Envoy/Istio: `x-envoy-*` headers, plus `x-forwarded-client-cert` naming
      the Istio ingress gateway. `x-forwarded-proto` is `http`, because TLS ends at the gateway.
    - **There's no authentication.** Anyone with the URL can post to it, so a real app must
      check a shared secret or signature itself.
    - Shell quoting matters. Run from Windows, the debugger's bash-style `curl` command arrived
      as `'{hello:from curl again}'`: invalid JSON, with the single quotes kept and the inner
      double quotes lost. The Inbox now also shows a PowerShell command (`Invoke-RestMethod`).
      Sent from PowerShell 7, the body arrived as valid JSON: `{"hello":"from PowerShell"}`.
      The `x-envoy-external-address` differed between the two calls (10.18.11.171 and
      10.18.6.9), so requests pass through more than one gateway instance.
    - **Outside to UI works through polling:** the request showed up in the Inbox within the
      5 s polling interval. The webhook writes to kvStore and the extension polls it through
      `debug_backend`.
  - **Sandbox tests** (sidebar, dev.10, 2026-10-21):
    - **Form submit is blocked** (no `allow-forms`). Drive saves from click and change handlers.
    - **Popups are blocked.** `window.open` returns `null`, and no tab opened, so the sandbox has
      no `allow-popups`. An extension can't open a new tab or window. Show links as text to
      copy, or link to the public URL some other way.
    - **The Clipboard API is blocked by the permissions policy** ("The Clipboard API has been
      blocked because of a permissions policy applied to the current document"). The iframe
      isn't granted `clipboard-write`. The debugger's copy buttons still work, through the
      `document.execCommand('copy')` fallback in `common/clipboard.ts`, so keep that fallback.
    - **`fetch` to Optimizely Graph from the browser works:** HTTP 401 in 31 ms, an answer that
      can be read despite the sandbox's `null` origin. The CSP's `connect-src https:` and Graph's
      `access-control-allow-origin: *` allow it. So an extension can query Graph directly with
      the public single key (published content only), without going through its backend. Keep
      the app key and secret on the backend.
  - **OCP notifications go to the OCP Activity Log, not the CMS** (2026-10-23, CMS-scoped
    install). `notifications.info('UI Extension Debugger', 'Debugger notification', message)`
    appears under OCP → Settings (cogwheel) → History → **Activity Log**:
    - status: an "i" for info;
    - category: the app ID (`steve_ui_ext_debug`);
    - activity: the first argument ("UI Extension Debugger");
    - details: title plus summary. "View Details" shows the same in a popup.

    It doesn't appear in `ocp app logs`, in the Event Inspector, or anywhere in the CMS. So
    notifications reach whoever administers the OCP account, never the editor. Use them for
    install-level problems (a failing background job, an expired key), and use the extension
    UI for anything the editor should see.
  - **Iframe environment** (view, dev.12, 2026-10-23). What the browser allows inside an
    extension frame:
    - **Origin `null`:** the sandbox has no `allow-same-origin`. Reading `window.top.location`
      is blocked, `frameElement` is `null`, and `window.name` is `null`.
    - **Storage:** `localStorage`, `sessionStorage` and cookies all throw. `indexedDB` exists,
      but is most likely unusable for the same reason (untested). Use the backend's kvStore.
    - **Permissions policy:** only these features are allowed: client hints (`ch-*`),
      `gamepad`, `picture-in-picture`, `sync-xhr`, `storage-access`, `browsing-topics`,
      `interest-cohort`, private state tokens, `aria-notify`, `deferred-fetch-minimal` and
      `media-playback-while-not-visible`. **Not allowed:** clipboard read and write (the API
      exists, but `writeText` throws), camera, microphone, geolocation, fullscreen, payment,
      screen capture, USB and the like.
    - **`crossOriginIsolated: false`,** so no `SharedArrayBuffer` or high-resolution timers.
    - **What an extension can learn about the editor comes from the browser, not the CMS:**
      - `navigator.language` (here `en-US`), and `Intl`'s default locale (here `nb`,
        which follows the OS);
      - the time zone (`Europe/Oslo`);
      - `prefers-color-scheme` (here `dark`, which is the OS or browser setting, not
        necessarily the CMS theme);
      - screen size and pixel ratio.

      None of it is the CMS UI language or theme.
    - Scripts load from the OCP CDN (`apps.global.ocp.optimizely.com/bundles/…`), plus one
      inline script that the CMS's frame page adds.
  - **Containers are short-lived.** The container had started 85 s before the echo call
    (19:13:07). The 18:28 container was gone after about 45 minutes, so containers are recycled
    or scaled down quickly.
  - The debugger cuts strings over 500 characters in displays and copies (dev.10), so payload
    results stay pasteable. The debugger's sleep cap (`MAX_SLEEP_MS`) is 70 s from dev.10.
- **A warm `invokeFunction` call takes about 260 ms round trip**, when the function itself runs
  in about 28 ms. One container served both the view and the sidebar.
- The first whoami of each surface sends `client.content: null`, even in the sidebar. It's sent
  before `content.get()` resolves, so don't read anything into it.
- **`debug_backend` gets no HTTP headers at all**: no auth, no JWT and no content type. The
  path is `/`. The editor's identity never reaches the function, so `probeForwardedAuth`
  will always find nothing.
- **`getAppContext().account` is `null`.** `scope` is the CMS instance UUID, and `trackerId` and
  `installId` are set.
- **Cold start ≈ 29 s.** The first `invokeFunction` after the deployment had scaled down took
  29 s, but the function itself ran in 126 ms. That's within the SDK's 60 s bridge timeout, but
  slow calls should show a loading state.
- **`functions.getEndpoints()` lists only `debug_webhook`.** It's a `function.zaius.app` URL.
  `cms_ui_extension` functions have no public URL. The environment variables are `ENVIRONMENT`,
  `REGION` and `SHARD`. The runtime is Node v22.14.0 on linux x64, with UTC as the time zone.

## Open questions (answer these after the first install, then update this file)

`TESTING.md` is the run order for these. Each section's in-app guide (`Section` `guide` prop in
`common/ui.tsx`) has the same steps and a short "Found" line. Update both when a question is
answered.

1. Answered: no host methods beyond the SDK's, and no events beyond `content` (see above). The
   null-content bug was retested and is still there. The sweep gave the same result in the
   sidebar, the view and a property editor.
2. Answered: yes, `debug_webhook` gets normal HTTP headers (see the webhook notes above).
3. Partly answered: scheduling sends an event, and deleting only shows up as navigation (see
   above). Still open: does the null-content bug also hit a property editor? (A view never has content, so the bug doesn't
   apply there.) Does a property editor see live edits through `property` events, even though
   `content` doesn't fire for them?
4. What does `PropertyState.settings` hold, and what does `property.set()` reject for each type?
   Why is no editor offered for boolean properties (short string started working by itself
   on 2026-10-20)? Our metadata reaches OCP
   (whoami's manifest lists `property_type` and `property_format`), but the CMS's extension
   list showed `configuration: {}`.
5. Answered (2026-10-21): the settings form is **only in the OCP App Directory**. The app shows
   there as installed, and its settings can be edited there. The CMS has no settings UI for it.
6. Can `/v1/content/{key}/versions` list drafts and earlier versions (a status or paging
   parameter)?

## Gotchas

- **The install may already be on the new version when the upgrade runs.** For dev.7, `ocp directory
  upgrade` said "already set to …dev.7", so publishing a dev version seems to move a dev install
  along with it. The upgrade step is harmless either way.
- **A property editor is chosen per property, in CMS Settings → Content Types.** When you
  create a property and pick its type, an editor dropdown lists the matching extensions.
  - It works for the **long string** (`property_type: string`, no format): "Debug String
    Editor" can be chosen there and then renders.
  - **Short string:** the dropdown didn't appear in dev.7 or dev.8. By the evening of
    2026-10-20 (dev.10) it did, for both string types, though nothing in the app changed for it.
    Probably a CMS-side change or delay.
  - **Boolean:** still no editor dropdown (dev.10), although `property_type: boolean` is
    declared and valid.
- **The CMS doesn't echo `property.set()` back to the editor.** After a successful `set()` the
  value is saved, and a page reload shows it, but no `subscribe()` event arrives. The editor has
  to update its own UI. `PropertyEditorShell` wraps `context.property.set` so every successful
  `set()`, including the one in the debugger's Property tab, updates the input.
- **A property editor gets the page context and can call the backend.** `context.content` gives
  the content being edited, the same as the sidebar, and `invokeFunction` works. So the debugger in
  a property editor shows only Property and Bridge; versions and backend tests live in the
  sidebar and view.
- **Every extension frame has its own bridge.** Each iframe (sidebar, view, each property editor)
  gets its own `CMS_INIT` and its own MessagePort, and the spy only sees its own frame's traffic.
  Nothing a property editor does shows in the sidebar's Bridge tab. In the sidebar,
  `context.property` is unbound (empty and read-only), so the CMS bridge can't set another
  frame's property.
- **`PropertyState`, tested 2026-10-23 (string property, dev.12):**
    - **`settings` is always `{}`.** It stayed empty after the property got a max length, was
      made required, got a default value and more in Settings → Content Types. The editor
      learns nothing about the property's configuration, so it can't enforce limits or show
      that a field is required.
    - **A new property's `value` is `null`,** even with a default value set in the content type.
      The default doesn't show up in the editor for existing content.
    - **`readonly` works.** The property isn't localized. In another language, the editor got
      `{value: "AS", readonly: true}`, which is the shared value, marked read-only.
- **`property.set()` with raw values on a string property** (2026-10-23):
    - `"Value 2"` → `{success: true}`, and the input shows it.
    - `null` → `{success: true}`, and the value is cleared.
    - `42` and `true` → **the CMS shows its own popup**, outside the iframe: "Could not save
      property, and it has been reverted. Please try again." with the raw .NET error ("The
      JSON value could not be converted to System.String … token type 'Number' / 'True'").
      So the CMS doesn't validate the type before saving, and it shows the server error to the
      editor.
    - **`set()` returned `{success: true}` for `42` and `true`,** before the popup appeared. So
      `success` only means the CMS editor accepted the value. It says nothing about whether
      the save worked.
    - **The revert works.** Tested with `"Before"`, then `set(42)`: while the popup was open,
      our textbox was empty (our sync applied the "successful" non-string value). When the
      editor clicked OK, `"Before"` came back into the textbox, and a reload showed `"Before"`
      as the stored value. So the CMS hands the reverted value back to the editor, either
      through `subscribe()` or by remounting it; the Property events list would show which.
    - **`subscribe()` did fire for `set(null)`,** once per write (the two `null` events at
      14:12:01 and 14:13:12 were two `null` writes), but not for `set("Value 2")`. So the echo
      is inconsistent: a cleared value comes back, a string value doesn't.
- **The view's bridge has the same methods too** (2026-10-23, dev.12): `content.get` returns
  `null`, `property.get` returns `{readonly: true}`, and the other 11 guesses are "Unknown
  method". All three surfaces share one host API. Only the data differs: content for the
  sidebar and property editors, and a bound property for property editors only.
- **A property editor's bridge has the same methods as the sidebar's** (2026-10-23, dev.12).
  `extension.getDefinition`, `content.get` and `property.get` answer, and the other 11 guesses
  are "Unknown method". There's nothing extra for editors.
  - The definition `type` is `"property-editor"`.
  - `content.get` gives the page, including `publicUrl`.
  - `property.get` is bound (`{value, readonly, settings}`), unlike the sidebar's
    `{readonly: true}`.
  - **The editor isn't told which property it edits.** The definition, the `PropertyState`
    and the content state carry no property name or display name. An editor used on several
    properties can't tell them apart.
- **The reload bug also hits property editors.** After a full page reload, the editor's
  `context.content` had no key or locale until the user navigated in the page tree, the same as
  the sidebar.
- **The property editor iframe has a fixed height.** The shell pins the editor at the top and
  scrolls only the debugger. It uses its own toggle and scroll box, not Axiom's `Disclosure`.
  `DisclosureContent` puts the content in wrappers with `overflow: hidden` and no height limit,
  so styles passed to it reach only the innermost box, and nothing scrolls (dev.8). In a property editor, the debugger shows only Property, Overview,
  Content and Bridge.
- **Earlier: property editors didn't appear on any property** (dev.6 and dev.7: string, string with
  `shortstring`, and boolean), because no editor had been chosen in the content type settings. New test properties on ArticlePage still use the default editors.
  The format and the subfolder (`debugger/`) aren't the cause. The bundles are flat
  (`dist/cms-ui-extensions/DebugStringEditor.js`), and the build would fail if one were missing.
  The OCP docs don't explain how the CMS attaches an editor to a property. This is open with the
  OCP team.
  - The CMS's extension list (the request the CMS UI makes, found in the browser's Network tab)
    **does** contain all three editors with `type: "property-editor"`. So they're registered.
  - But every entry has `configuration: {}`, and nothing shows the `property_type` or
    `property_format` from `app.yml`. We can't tell whether the metadata reached the CMS.
  - The same list includes another app on the instance (`steve_unsplash_ui`), and gives
    `functions` only for `accepts: cms_ui_extension` functions.
- **`ocp app prepare --publish` with `--no-progress` returned while the version was still
  `BUILT`.** Upgrading right away failed with "App version … is not running". Run by hand,
  without that flag, prepare waits until the version is published. `yarn deploy` no longer
  passes it, and no longer polls `ocp directory status`. Confirmed with dev.11: prepare
  watched the build (NEW → QUEUED → BUILDING), then each region in turn (us, au, eu: BUILT →
  PUBLISHING → "has been published") before returning.
- **`ocp app prepare` stops to ask when OCP dependencies are out of date.** When
  `@zaiusinc/app-sdk` 3.5.2 came out, it asked whether to upgrade from 3.5.1 (2026-10-23).
  Without an interactive terminal (a tool or CI), that prompt crashes with the misleading
  **"Terminal is not capable"** (terminal-kit can't read the cursor position). The crash comes
  after `app.yml` is bumped and before anything is uploaded, so reset the version before
  retrying. Run `yarn deploy` from a terminal.
- **Don't accept upgrades to brand-new OCP dependency versions.** Answering yes upgraded
  `@zaiusinc/app-sdk` to 3.5.2, released that day. OCP's builder then failed (`BUILD_FAILED`)
  with `YN0016: @zaiusinc/app-sdk@npm:3.5.2: All versions satisfying "3.5.2" are quarantined`.
  The builder's Yarn refuses packages younger than its minimum age.
  - **Declining doesn't work either:** with 3.5.1, `prepare` refuses to upload ("OCP apps always
    build and run against the current versions of the SDKs. You must update your
    dependencies"). The CLI compares the *installed* version (`yarn info`) with OCP's current
    one, and requires an exact match.
  - **So nobody can deploy until 3.5.2 is out of quarantine.** The CLI demands it and the
    builder refuses it.
  - 1.0.0-dev.13 is registered in OCP as `BUILD_FAILED`, so the next deploy becomes dev.14.
    The refused attempt bumped `app.yml` to dev.14 locally; it was reset to dev.13.
- **Publishing a dev version moves the dev install to it, with no upgrade command.** dev.11
  was published without `ocp directory upgrade`, and `list-installs` showed the install on
  dev.11 as soon as prepare returned. The extra upgrade was what made the hooks run twice.

- **`@shared/*` must be bundled into the backend.** The sample's `vite.backend.config.mjs`
  marks every bare import as external, and that includes the `@shared/` alias. The backend
  then failed at load with "Cannot find module '@shared/constants'", and validate reported
  "Error loading function class … not found". Fixed in this repo's `external` function.
- **No `import.meta` in UI code.** `tsconfig.json` uses `module: commonjs` for the backend, so
  typecheck rejects it. The bundle URL comes from `performance.getEntriesByType('resource')`.
- **No `entries()` on fetch `Headers`.** `lib` has `dom` but not `dom.iterable`. Use `forEach`.
- `storage.settings.get<T>` needs `T extends ValueHash`. `Record<string, unknown>` doesn't typecheck.
- The UI build puts Axiom in one shared chunk of about 560 kB (`dist/cms-ui-extensions/shared/`).
  That's expected.
- **Fonts must be served over `https:`, never inlined.** Axiom's `Box` imports
  `@optiaxiom/globals/fonts`, which pulls in Fontsource's CSS. Vite inlined those fonts as
  `data:` URLs, and the CMS CSP blocked all of them. `vite.ui.config.mjs` now aliases the
  Fontsource `index.css` files to `common/empty.css` and never inlines fonts.
  `common/fonts.ts` (`installFonts()`, called in every entry) declares the same family names with
  absolute CDN URLs from `?url` imports. Relative `url()` in JS-injected CSS resolves against the
  CMS frame, not the CDN. Axiom's first-choice brand fonts (Die Grotesk B, VC Nudge) aren't
  shipped, so Roboto is what renders.
- **Property editors need `ocp-cms-ui-extensions-sdk` 1.1.0 (beta), and an up-to-date OCP
  builder.** Stable 1.0.0 knows only `sidebar` and `view`. Until 2026-10-20 the production OCP
  builder lacked property-editor support. `ocp app prepare` then failed with `declares
  ui_extensions entry 'DebugStringEditor' but the builder did not emit a bundle URL/hash`, while
  local build, validate and `ocp dev` all worked. The OCP team deployed the fixed builder that
  day. If the error comes back, the builder is the first suspect, not the app.
- **The property editors are a working editor first, with the debugger folded below.** If the CMS
  applies them to every property of that type, editors will see them everywhere. Keep the
  editor fully functional, or remove the property editors on shared instances.
- **The CMS REST API presets partly guess at the routes.** v1 (`/v1/...`, live since April 2026)
  replaces `preview3`. `/v1/contenttypes` and `/v1/contentsources` are documented, but
  `/v1/content/{key}` is now confirmed (200; header `cms-api-version: v1-2026.10.1`).
  `/v1/content/{key}/versions` also works (about 900 ms). By default it returns only the
  **published** version in each locale, each with all its `properties` (rich text as `html`,
  references as `cms://content/<key>`), `status` (lowercase, `"published"`), `routeSegment`,
  `published` and `lastModifiedBy`. It's paged with `pageIndex` and `pageSize` (100).
  Query parameters, tested 2026-10-21:
  - **`?statuses=draft` is applied, but returns nothing:** `items: []`, although Graph (app key)
    shows draft 489 for the same key. So `statuses` is a real filter, since unknown parameters
    are ignored. Either draft versions aren't served here, our API key lacks the right to see
    them, or the value has another name.
  - **`?locale=en` is ignored:** all three locales came back.
  - **The API reference gives the syntax:** `?locales=fr,de&statuses=draft,ready`. So the
    locale parameter is the plural `locales`, both take comma-separated lists, and "ready to
    publish" is `ready`. That `statuses=draft` still returned nothing is unexplained so far.
  - **`?statuses=published` returns the same three published versions,** and
    `?locales=en&statuses=draft` returns nothing. So the filters work, but **this API key sees
    no drafts at all.** Draft 489 exists: Graph with the app key shows it.
  - **It was a permission.** After the API key was given admin rights in the CMS, the same
    `?locales=en&statuses=draft,ready` returned draft 489 (`status: "draft"`), including the
    draft's property values (`TestPropertyString: "Wow!?!"` against `"Wow!"` in the published
    version 488).
  - **The token doesn't carry content rights.** Before and after the change, the token claims
    were the same:
    - `scope: "api:admin"` (which API calls are allowed);
    - `sub` and `name` = the client ID;
    - `instanceId` = the CMS instance UUID, and `siteUrl` = the CMS host;
    - `iss` and `aud` = `opti-content-api`, HS256, a 5-minute lifetime.

    What changed was the key's access rights in the CMS, which the CMS checks on each request.
    That's why a cached token picked up the change at once.
  - **Without the permission, the API says nothing:** it returns 200 with `items: []`, not 403.
    An app can't tell "no drafts" from "not allowed to see drafts".
  - **Which access rights show drafts** (each right tested on its own, 2026-10-21):
    - The rights on offer are Read, Create, Change, Delete, Publish and Administer.
    - **Read alone shows only published versions.** Every other right on its own (Create,
      Change, Delete, Publish, Administer) also shows drafts.
    - So a backend that only needs to *read* drafts must hold a right that also lets it
      write. Create is the least of them, and it still allows creating content. There's no
      read-only way to see drafts.
- **The CMS API token** comes from `<base>/oauth/token` with Basic auth and a form body
  (`grant_type=client_credentials`). Tokens last about 5 minutes and are cached per container.
- **Impersonation (`act_as`) isn't available for API keys, so don't design around it.**
  - The token endpoint answers 400 `"Client is not authorized to act as another user."`.
    The option to allow it on an API key is no longer in the UI.
  - **The CMS team's plan** (2026-10-22):
    - Acting as a user will use the standard **OAuth token exchange** with the user's Opti ID
      token, so the user must really be logged in. That work has been **deprioritized and
      isn't expected soon**, and it doesn't cover the OCP UI-extension case yet.
    - **Scopes for API keys may come first.** They would limit which REST API areas a key can
      reach, even without acting as a user.
    - The preview3 API, where `act_as` took a free-text user name, is due to be removed.
  - **What that means for extensions:** today an extension backend always acts as the app,
    never as the editor. And extensions have no way to get the editor's token: the bridge
    offers none, and the backend receives no headers.
  - **The debugger no longer supports `act_as`** (removed 2026-10-22): no settings field, and no
    `act_as` token request. If it comes back, note that the `act_as` token request takes a JSON
    body, and Basic auth is ignored there. `client_id` and `client_secret` must be in the body,
    or the endpoint answers 400 `"client_id is required."`.
- **`cmsRequest` and `graphQuery` only call the configured base URL or endpoint.** Keep it that
  way, so the backend can't be used as an open proxy.
- The bridge "guessed methods" sweep is read-only by design. Don't add methods that change
  CMS state, such as `property.set` or navigation.
