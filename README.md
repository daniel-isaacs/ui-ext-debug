# UI Extension Debugger (Steve)

An OCP app for Optimizely SaaS CMS that shows what a CMS UI extension can see and do. It has
a sidebar, a full-page view and three property editors (string, short string, boolean). All
of them render the same tabbed debugger. Every section explains what it tests, why it matters
and what to expect.

The property editors build and the CMS registers them, but as of October 2026 they don't
replace any property's editor yet. See `CLAUDE.md`.

| Tab | Shows |
| --- | --- |
| Overview | Extension definition, current content, installation (CMS instance, org ID, tracker/install IDs), what isn't available |
| Content | Every `content.get()` / `subscribe()` event; looks up the content by key in Graph and the CMS REST API |
| Property | (property editors only) `PropertyState` events and a raw `property.set()` test |
| Bridge | The `CMS_INIT` message, all MessagePort traffic, and raw calls and subscriptions to host methods the SDK doesn't wrap |
| Backend | `whoami` (app context, headers, JWT claims, endpoints, runtime), payload/timeout/error tests, kvStore shared between surfaces, lifecycle log |
| CMS API | Token with decoded claims; any request to the CMS REST API |
| Graph | GraphQL queries with single key, app key + secret, or the CMS API token |
| Inbox | Requests sent to the app's webhook function, polled from the UI |
| Iframe | Sandbox tests (forms, popups, clipboard, fetch), CSP violations, environment |

Everything is also written to the browser console with the prefix `[UXD]`.

## Setup

App IDs are global, so change `app_id` in `app.yml` (and `APP_ID` in `scripts/deploy.mjs`) to
your own before registering.

```bash
yarn install
yarn validate
ocp app register
ocp app prepare --bump-dev-version --publish
ocp directory install <app_id>@<version> --scope <cms-instance-uuid>
```

Always install with `--scope`. After that, `yarn deploy` validates, publishes a new dev version
and upgrades your install. It reads the CMS instance UUID from `OCP_SCOPE` or from a
`.ocp-scope` file (gitignored), or you can pass `--scope <uuid>`.

In the app settings you can optionally add:

- **CMS REST API**: client ID and secret of a CMS API key (Settings → API Keys), and optionally a
  user to impersonate (`act_as`).
- **Optimizely Graph**: the single key, and/or the app key and secret to also read drafts.

Without these, the CMS API and Graph tabs report "not configured". Everything else works.

## Testing and findings

- `TESTING.md` has the run order and what to collect for each test.
- `CLAUDE.md` holds what has been observed on a real CMS so far, the open questions,
  implementation notes and gotchas.

## License

Apache-2.0. The build setup is based on Optimizely's CMS UI extension sample.
