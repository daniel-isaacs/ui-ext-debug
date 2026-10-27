import {existsSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {UI_EXTENSION_INJECTION_POINTS} from '@optimizely/ocp-cms-ui-extensions-sdk';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';

const cwd = path.dirname(fileURLToPath(import.meta.url));

const UI_SRC_ROOT = 'src/cms-ui-extensions';
const SHARED_ROOT = 'src/shared';
const UI_OUT_DIR = 'dist/cms-ui-extensions';
// Pattern: <basename>.<injection-point>.<ts|tsx|js|jsx> — e.g.
// `analytics-dashboard.sidebar.tsx`. The injection-point list is the SDK's
// source of truth so this regex stays in sync as new surfaces are added.
const ENTRY_PATTERN = new RegExp(
  `\\.(${UI_EXTENSION_INJECTION_POINTS.join('|')})\\.(tsx?|jsx?)$`
);

function discoverEntries() {
  const absRoot = path.resolve(cwd, UI_SRC_ROOT);
  if (!existsSync(absRoot)) return {};

  const entries = {};
  const dirents = readdirSync(absRoot, {recursive: true, withFileTypes: true});
  for (const dirent of dirents) {
    if (!dirent.isFile() || !ENTRY_PATTERN.test(dirent.name)) continue;
    const basename = dirent.name.replace(ENTRY_PATTERN, '');
    const fullPath = path.join(dirent.parentPath, dirent.name);
    if (entries[basename]) {
      throw new Error(`Duplicate UI extension entry point '${basename}': ${entries[basename]} and ${fullPath}`);
    }
    entries[basename] = fullPath;
  }
  return entries;
}

export default defineConfig({
  // Asset URLs are emitted as `new URL('./assets/foo-<hash>.svg', import.meta.url).href`
  // so each bundle resolves them against whatever CDN it's served from. `base`
  // alone doesn't achieve this in JS bundles, so renderBuiltUrl (officially
  // supported, namespaced as experimental) forces relative URLs.
  base: './',
  plugins: [react(), cssInjectedByJsPlugin({ relativeCSSInjection: true })],
  experimental: {
    renderBuiltUrl: () => ({relative: true})
  },
  resolve: {
    alias: [
      {find: '@shared', replacement: path.resolve(cwd, SHARED_ROOT)},
      // Axiom imports Fontsource's CSS, whose fonts would be inlined as data: URLs, and the CMS CSP
      // (`font-src https:`) blocks those. The OCP CDN doesn't serve font files either (403), so
      // the debugger ships no fonts and renders in the browser's fallback fonts.
      {
        find: /^@fontsource-variable\/[^/]+\/index\.css$/,
        replacement: path.resolve(cwd, UI_SRC_ROOT, 'common/empty.css')
      }
    ]
  },
  build: {
    outDir: path.resolve(cwd, UI_OUT_DIR),
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      preserveEntrySignatures: 'strict',
      input: discoverEntries(),
      external: ['@tiptap/extension-table-row', '@tiptap/extension-table-header', '@tiptap/extension-table-cell', '@tiptap/extension-table', '@tiptap/extension-link','@tiptap/extension-placeholder', '@tiptap/react', '@tiptap/starter-kit'],
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'shared/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});
