/**
 * What the extension can learn about its own iframe. The CMS mounts each
 * extension in a sandboxed iframe, so several of these are expected to fail.
 * The failures are part of the answer.
 */

function attempt<T>(read: () => T): T | string {
  try {
    return read();
  } catch (error) {
    return `blocked: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export function collectEnvironment() {
  const nav = navigator as Navigator & {deviceMemory?: number};
  const doc = document as Document & {featurePolicy?: {allowedFeatures(): string[]}};
  const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;

  // Every script the iframe fetched, the bundle included. The bundle URL shows the
  // CDN path: bundles/<app_id>/<version>/<Entry>.js
  const loadedScripts = performance
    .getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((name) => /\.m?js(\?|$)/.test(name));

  return {
    bundleUrl: loadedScripts.find((name) => name.includes('/bundles/')) ?? loadedScripts[0] ?? null,
    loadedScripts,
    frame: {
      href: location.href,
      origin: location.origin,
      ancestorOrigins: attempt(() => Array.from(location.ancestorOrigins ?? [])),
      referrer: document.referrer || null,
      windowName: window.name || null,
      isTopLevel: window.top === window,
      topHref: attempt(() => window.top?.location.href),
      frameElement: attempt(() => (window.frameElement ? 'accessible' : null)),
      isSecureContext: window.isSecureContext,
      crossOriginIsolated: window.crossOriginIsolated
    },
    storage: {
      localStorage: attempt(() => {
        localStorage.setItem('uxd-test', '1');
        localStorage.removeItem('uxd-test');
        return 'ok';
      }),
      sessionStorage: attempt(() => {
        sessionStorage.setItem('uxd-test', '1');
        sessionStorage.removeItem('uxd-test');
        return 'ok';
      }),
      cookies: attempt(() => {
        document.cookie = 'uxd-test=1; SameSite=None; Secure';
        return document.cookie.includes('uxd-test') ? 'ok' : 'not stored';
      }),
      indexedDB: typeof indexedDB !== 'undefined' ? 'present' : 'missing'
    },
    browser: {
      userAgent: nav.userAgent,
      language: nav.language,
      languages: [...nav.languages],
      hardwareConcurrency: nav.hardwareConcurrency,
      deviceMemoryGb: nav.deviceMemory ?? null,
      cookieEnabled: nav.cookieEnabled,
      onLine: nav.onLine,
      clipboardApi: Boolean(nav.clipboard?.writeText)
    },
    locale: Intl.DateTimeFormat().resolvedOptions(),
    display: {
      viewport: `${window.innerWidth} × ${window.innerHeight}`,
      screen: `${screen.width} × ${screen.height}`,
      devicePixelRatio: window.devicePixelRatio,
      colorScheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches
    },
    permissionsPolicy: attempt(() => doc.featurePolicy?.allowedFeatures() ?? 'not exposed by this browser'),
    scripts: Array.from(document.scripts).map((script) => script.src || '(inline)'),
    timing: {
      timeOrigin: new Date(performance.timeOrigin).toISOString(),
      navigationType: navEntry?.type ?? null,
      domContentLoadedMs: navEntry ? Math.round(navEntry.domContentLoadedEventEnd) : null
    }
  };
}

export interface SandboxTest {
  name: string;
  result: string;
}

/** Tests that need a user action or the network. Run from a button. */
export async function runSandboxTests(graphEndpoint: string): Promise<SandboxTest[]> {
  const results: SandboxTest[] = [];

  // Form submission: the submit event never fires without allow-forms.
  const form = document.createElement('form');
  let submitted = false;
  form.addEventListener('submit', (event) => {
    submitted = true;
    event.preventDefault();
  });
  document.body.appendChild(form);
  try {
    form.requestSubmit();
  } catch {
    // ignored: reported below
  }
  form.remove();
  results.push({name: 'Form submit', result: submitted ? 'allowed' : 'blocked (no allow-forms)'});

  // Popups
  let popup: Window | null = null;
  try {
    popup = window.open('about:blank', '_blank', 'noopener');
  } catch {
    popup = null;
  }
  // With noopener, window.open returns null even when it worked, so this can't tell those apart.
  results.push({name: 'window.open', result: popup ? 'allowed' : 'returned null: blocked if no tab opened'});
  popup?.close();

  // Clipboard
  try {
    await navigator.clipboard.writeText('uxd clipboard test');
    results.push({name: 'Clipboard API', result: 'allowed'});
  } catch (error) {
    results.push({name: 'Clipboard API', result: `blocked: ${error instanceof Error ? error.message : String(error)}`});
  }

  // Network: can the browser reach Graph directly, or does CSP/CORS stop it?
  try {
    const started = performance.now();
    const response = await fetch(graphEndpoint, {method: 'GET'});
    results.push({
      name: `fetch ${graphEndpoint}`,
      result: `HTTP ${response.status} in ${Math.round(performance.now() - started)} ms`
    });
  } catch (error) {
    results.push({name: `fetch ${graphEndpoint}`, result: `failed: ${error instanceof Error ? error.message : String(error)}`});
  }

  return results;
}
