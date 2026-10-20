import robotoLatinExt from '@fontsource-variable/roboto/files/roboto-latin-ext-wght-normal.woff2?url';
import robotoLatin from '@fontsource-variable/roboto/files/roboto-latin-wght-normal.woff2?url';
import condensedLatinExt from '@fontsource-variable/roboto-condensed/files/roboto-condensed-latin-ext-wght-normal.woff2?url';
import condensedLatin from '@fontsource-variable/roboto-condensed/files/roboto-condensed-latin-wght-normal.woff2?url';
import monoLatinExt from '@fontsource-variable/roboto-mono/files/roboto-mono-latin-ext-wght-normal.woff2?url';
import monoLatin from '@fontsource-variable/roboto-mono/files/roboto-mono-latin-wght-normal.woff2?url';

/**
 * Axiom imports Fontsource's CSS, which Vite would inline as `data:` fonts. The CMS iframe CSP
 * (`font-src https:`) blocks those, so `vite.ui.config.mjs` swaps that CSS for an empty file and
 * this module declares the same families with the woff2 files served next to the bundle.
 *
 * The URLs must be absolute: CSS injected from JS resolves relative URLs against the frame
 * document on the CMS host, not the CDN. Vite emits `?url` imports as
 * `new URL('../assets/…', import.meta.url)`, which resolves against the CDN.
 *
 * Only the latin and latin-ext subsets, upright, are included. Italics are synthesized.
 */
const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

const FACES: Array<[family: string, weight: string, url: string, range: string]> = [
  ['Roboto Variable', '100 900', robotoLatin, LATIN],
  ['Roboto Variable', '100 900', robotoLatinExt, LATIN_EXT],
  ['Roboto Condensed Variable', '100 900', condensedLatin, LATIN],
  ['Roboto Condensed Variable', '100 900', condensedLatinExt, LATIN_EXT],
  ['Roboto Mono Variable', '100 700', monoLatin, LATIN],
  ['Roboto Mono Variable', '100 700', monoLatinExt, LATIN_EXT]
];

export function installFonts(): void {
  const style = document.createElement('style');
  style.dataset.uxd = 'fonts';
  style.textContent = FACES.map(
    ([family, weight, url, range]) =>
      `@font-face{font-family:'${family}';font-style:normal;font-display:swap;font-weight:${weight};` +
      `src:url(${JSON.stringify(new URL(url, document.baseURI).href)}) format('woff2-variations');unicode-range:${range};}`
  ).join('\n');
  document.head.appendChild(style);
}
