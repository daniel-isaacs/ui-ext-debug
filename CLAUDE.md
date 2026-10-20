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
yarn deploy     # validate, prepare --bump-dev-version --publish, then directory upgrade on the
                # dev CMS (scripts/deploy.mjs). Waits for PUBLISHED before upgrading.
                # Flags: --scope <uuid>, --skip-validate, --upgrade-only (resume).
                # Default scope: OCP_SCOPE, else the gitignored .ocp-scope file.
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
- **`invokeFunction` limits:** the SDK times out every bridge call after 60 s. An exception thrown
  in `perform()` reaches the frontend as `statusCode: 500` with an empty body. Functions with
  `accepts: cms_ui_extension` can't be global or use `installation_resolution`.
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
- **In a view, `content.get()` returns `null` and the `content` subscription sends no event at
  load.**
- **The sidebar's definition `type` is `"content"`, not `"sidebar"`.** The view's is `"view"`.
  The sidebar frame's referrer is `<cms-origin>/ui/cms`, and it's about 472 px wide.
- **Content in the sidebar: `content.get()` returns the current content straight away. The
  `content` subscription fires only on changes**, with no initial event. Use both: `get()`
  for the first value and `subscribe()` for navigation. The state looks like
  `{key: "<32-hex, no dashes>", version: "472", locale: "en", publicUrl}`. `version` is a
  string, and it looks like a global version ID, not a per-item counter. `publicUrl` is the
  page's URL on the **front-end site** (e.g. `https://test.contentgurus.no/en/blog/…/`), so
  the extension does learn the site's host this way.
- **The `content` event fires on version and status changes, not on edits.** Tested in the
  sidebar on one page:
  - Editing a property in an existing draft: no event. Autosave keeps the same version.
  - "Ready to publish": event, same version (`472`).
  - Publish: event, same version (`472`).
  - The first edit after publishing: event, new version (`486`). This creates a new draft.

  The payload has no status field, so the "ready to publish" and "publish" events are
  identical. To find out what changed, look the version up in the CMS REST API. The version
  jumped from 472 to 486 on one page, which confirms it's an instance-wide version ID.
- **CMS bug: a sidebar that loads with the page never gets the content.** Switching locale
  reloads the whole CMS page, extension frames included. F5 does the same.
  - If the sidebar was already open when the page loaded, `content.get()` returns `null`
    straight away. It still returned `null` when called again 18 s later.
  - No `content` event arrives, however long you wait.
  - Navigating to another item and back fixes it: both navigations send events.
  - By contrast, opening the sidebar *after* the page has loaded gives the content straight
    away.

  Extensions must handle `null` and should tell the user to reselect the content. Not reported to the CMS team yet.
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

1. Which host methods exist beyond the SDK's six? Does the error text for an unknown method list
   them? (Bridge → "Try 14 guessed methods")
2. Do headers reach `debug_webhook` normally? This is expected, since it's a plain HTTP function.
   Compare it with `debug_backend`, which gets none.
3. Does the `content` event fire when you schedule a publish or delete content? Does the
   null-content bug also hit a view, or a property editor?
   Does a property editor see live edits through `property` events, even though `content`
   doesn't fire for them?
4. What does `PropertyState.settings` hold, and what does `property.set()` reject for each type?
   (Blocked: property editors are disabled.)
5. Where does the settings form appear for a CMS-scoped install?
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
  - As of dev.7, the dropdown doesn't appear for **boolean** or **short string**
    (`shortstring`). That's still to investigate.
- **The CMS doesn't echo `property.set()` back to the editor.** After a successful `set()` the
  value is saved, and a page reload shows it, but no `subscribe()` event arrives. The editor has
  to update its own UI. `PropertyEditorShell` wraps `context.property.set` so every successful
  `set()`, including the one in the debugger's Property tab, updates the input.
- **The property editor iframe has a fixed height.** The shell pins the editor at the top and
  scrolls only the debugger. In a property editor, the debugger shows only Property, Overview,
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
- **`ocp app prepare --publish` returns while the version is still `PUBLISHING`.** Upgrading
  right away fails with "App version … is not running". `yarn deploy` polls
  `ocp directory status` until the state is `PUBLISHED`.

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
  `published` and `lastModifiedBy`. It's paged with `pageIndex` and `pageSize` (100). We
  haven't found how to list drafts or earlier versions; Graph with basic auth shows them. The
  token comes from `<base>/oauth/token` with Basic
  auth. It uses a form body (`grant_type=client_credentials`) normally, and a JSON body when
  `act_as` is set. Tokens last about 5 minutes and are cached per container.
- **`cmsRequest` and `graphQuery` only call the configured base URL or endpoint.** Keep it that
  way, so the backend can't be used as an open proxy.
- The bridge "guessed methods" sweep is read-only by design. Don't add methods that change
  CMS state, such as `property.set` or navigation.
