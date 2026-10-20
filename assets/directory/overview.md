# UI Extension Debugger (Steve)

**Developer tool, not for production.** Shows everything a CMS UI extension can see
and do, in every injection point:

- **Sidebar**, **view** and two **property editors** (string and boolean) render the same debugger.
- The **SDK context**: extension definition, content state, property state.
- **Bridge traffic** between the CMS and the extension iframe, plus calls to host methods the SDK doesn't wrap.
- **Backend context**: OCP account, install and CMS instance, inbound headers, runtime.
- **CMS REST API** and **Optimizely Graph** calls through the backend.
- A **webhook inbox** that shows how to get outside data into an extension.
- **Iframe sandbox** tests.

Everything shown in the UI is also written to the browser console, prefixed `[UXD]`.
