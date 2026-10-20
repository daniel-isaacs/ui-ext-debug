# UI Extension Debugger

## Setup

1. Install the app on a CMS instance.
2. Optional: in the app settings, add a CMS API key (client ID and secret) and Graph keys.
   Without them, the CMS API and Graph tabs return a "not configured" error. Everything else works.
3. Reload the CMS. The debugger appears as a sidebar panel and as a full-page view.
4. To try the property editors, select **Debug String Editor** or **Debug Boolean Editor**
   as the editor for a string or boolean property.

## Console

Every panel logs to the browser console with the prefix `[UXD]`. Filter the console on that
prefix, and select the extension's iframe as the console context if your browser asks.
