import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mix } from './spec.js';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(here, 'assets/explainer.css'), 'utf8');
const RUNTIME = readFileSync(join(here, 'assets/runtime.js'), 'utf8');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lighten = (hex) => mix(hex, '#ffffff', 0.28);

/**
 * Render a normalised spec to one self-contained HTML document.
 * @param {object} spec output of normalizeSpec().spec
 * @param {{theme?: 'light'|'dark'|'auto', header?: boolean}} [opts]
 */
export function renderHtml(spec, opts = {}) {
  const { base, accent } = spec.brand;
  const theme = opts.theme === 'light' || opts.theme === 'dark' ? ` data-theme="${opts.theme}"` : '';
  const vars = `:root{--base:${base.color};--accent-c:${accent.color};--base-n:${base.color};--accent-n:${accent.color};--base-d:${lighten(base.color)};--accent-d:${lighten(accent.color)}}`;
  const json = JSON.stringify(spec).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, '');
  const outline = spec.steps.map((s) => `<li><b>${esc(s.n)} ${esc(s.title)}</b>. ${esc(s.say)}</li>`).join('');
  return `<!DOCTYPE html>
<html lang="en"${theme}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="generator" content="lens-process-explainer/${spec.version}">
<title>${esc(spec.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@400;500;600;700&family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
<style>
${vars}
${CSS}
</style>
</head>
<body${opts.header === false ? ' class="nohead"' : ''}>
<div class="wrap">
  <header class="top">
    <div>
      <h1>${esc(spec.title)}</h1>
      ${spec.subtitle ? `<p>${esc(spec.subtitle)}</p>` : ''}
    </div>
    <div class="controls" role="group" aria-label="Playback">
      <button id="prev" aria-label="Previous step">Back</button>
      <button id="play" class="primary" aria-pressed="true">Pause</button>
      <button id="next" aria-label="Next step">Next</button>
    </div>
  </header>
  <div class="stage">
    <div class="device" id="device"><div class="screen" id="screen" aria-hidden="true"></div></div>
    <section class="narr" aria-live="polite">
      <div class="head">
        <div class="num" id="num">01</div>
        <div class="phase" id="phase"></div>
        <h2 id="title"></h2>
      </div>
      <p class="say" id="say"></p>
      <div id="badge"></div>
      <ul class="rules" id="rules"></ul>
      <div class="srcs" id="srcs"></div>
      <div class="legend">
        <span><i class="g"></i>Gate: must be met to continue</span>
        <span><i class="d"></i>Data carried forward</span>
        <span><i></i>Rule</span>
        <span><i class="q"></i>Open question</span>
      </div>
      <div class="carry">
        <h3>What the application is carrying</h3>
        <p id="carryNote"></p>
        <div class="chips" id="chips"></div>
      </div>
    </section>
  </div>
  <nav class="track" id="track" aria-label="Steps"></nav>
  ${spec.footnote ? `<p class="foot">${esc(spec.footnote)}</p>` : ''}
</div>
<noscript><div class="nojs"><h1>${esc(spec.title)}</h1><ol>${outline}</ol></div></noscript>
<script type="application/json" id="spec">${json}</script>
<script>
${RUNTIME}
</script>
</body>
</html>
`;
}
