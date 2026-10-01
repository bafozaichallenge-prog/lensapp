/*! <process-explainer> — embed the Lens process-explainer generator in any web app. No dependencies, no build.
 *
 *   <script type="module" src="https://EXPLAINER_HOST/embed.js"></script>
 *   <process-explainer endpoint="https://EXPLAINER_HOST" process-id="new-business" autogenerate
 *       prompt="Explain how this requirement flows through the process"></process-explainer>
 *
 * Attributes: endpoint, prompt, process-id, theme (auto|light|dark), show-prompt, hide-header, autogenerate, token
 * Properties: context (object sent as host context), headers (extra request headers), fetch (custom fetch for auth), spec (read), meta (read)
 * Methods:    generate({prompt, processId, context}), load(spec), abort()
 * Events:     explainer-stage, explainer-progress, explainer-ready (detail {spec, meta}), explainer-error (detail {code, message})
 * Styling:    --pe-border, --pe-radius, --pe-font, --pe-accent on the element. The explainer itself renders in a sandboxed iframe.
 */
const SCRIPT_ORIGIN = (() => { try { return new URL(import.meta.url).origin; } catch { return ''; } })();

const CSS = `
:host{display:block;font-family:var(--pe-font,system-ui,sans-serif);color:inherit;--a:var(--pe-accent,#0A5BC4)}
*{box-sizing:border-box}
.bar{display:none;gap:8px;margin:0 0 10px}
:host([show-prompt]) .bar{display:flex}
textarea{flex:1;min-height:44px;max-height:160px;resize:vertical;font:inherit;font-size:14px;padding:10px 12px;border:1px solid var(--pe-border,#C9CED4);border-radius:var(--pe-radius,8px);background:transparent;color:inherit}
button{font:inherit;font-size:14px;font-weight:600;border:0;border-radius:var(--pe-radius,8px);padding:0 18px;background:var(--a);color:#fff;cursor:pointer}
button:disabled{opacity:.5;cursor:default}
:focus-visible{outline:3px solid var(--a);outline-offset:2px}
.status{display:none;align-items:center;gap:10px;padding:14px 16px;border:1px solid var(--pe-border,#C9CED4);border-radius:var(--pe-radius,8px);font-size:14px;margin-bottom:10px}
.status.on{display:flex}
.status.err{border-color:#C62828;color:#C62828}
.dot{width:10px;height:10px;border-radius:50%;background:var(--a);animation:p 1s ease-in-out infinite;flex:none}
.err .dot{display:none}
@keyframes p{50%{transform:scale(.5);opacity:.5}}
iframe{display:none;width:100%;border:1px solid var(--pe-border,#C9CED4);border-radius:var(--pe-radius,8px);min-height:640px;background:transparent}
iframe.on{display:block}
.empty{padding:28px;text-align:center;border:1px dashed var(--pe-border,#C9CED4);border-radius:var(--pe-radius,8px);font-size:14px;opacity:.75}
@media (prefers-reduced-motion:reduce){.dot{animation:none}}
`;

class ProcessExplainer extends HTMLElement {
  static get observedAttributes() { return ['theme', 'prompt']; }
  constructor() {
    super();
    this.context = undefined; this.headers = {}; this.fetch = null; this.spec = null; this.meta = null; this._ac = null; this._h = 640;
    const r = this.attachShadow({ mode: 'open' });
    r.innerHTML = `<style>${CSS}</style>
      <div class="bar"><textarea aria-label="Describe the process to explain" placeholder="Describe the process to explain, for example: how a new policy is activated and what validation runs first"></textarea><button type="button">Generate</button></div>
      <div class="status" role="status" aria-live="polite"><span class="dot"></span><span class="msg"></span></div>
      <div class="empty">Nothing generated yet.</div>
      <iframe title="Process explainer" sandbox="allow-scripts"></iframe>`;
    this.$ = (s) => r.querySelector(s);
    this.$('button').onclick = () => this.generate({ prompt: this.$('textarea').value });
    this.$('textarea').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) this.$('button').click(); });
    this._onMsg = (e) => {
      const f = this.$('iframe'), d = e.data;
      if (e.source !== f.contentWindow || !d || d.source !== 'process-explainer' || d.type !== 'height') return;
      this._h = Math.max(300, Math.min(4000, Math.ceil(+d.height) || 640)); f.style.height = this._h + 'px';
    };
  }
  connectedCallback() {
    addEventListener('message', this._onMsg);
    if (this.hasAttribute('prompt')) this.$('textarea').value = this.getAttribute('prompt');
    if (this.hasAttribute('autogenerate') && (this.getAttribute('prompt') || this.hasAttribute('process-id'))) queueMicrotask(() => this.generate());
  }
  disconnectedCallback() { removeEventListener('message', this._onMsg); this.abort(); }
  attributeChangedCallback(n, _o, v) {
    if (n === 'theme') this.$('iframe').contentWindow?.postMessage({ source: 'process-explainer-host', type: 'theme', theme: v }, '*');
    if (n === 'prompt' && v != null) this.$('textarea').value = v;
  }
  get endpoint() { return (this.getAttribute('endpoint') || SCRIPT_ORIGIN).replace(/\/$/, ''); }
  _status(msg, err) { const s = this.$('.status'); s.classList.toggle('on', !!msg); s.classList.toggle('err', !!err); this.$('.msg').textContent = msg || ''; }
  _emit(name, detail) { this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true })); }
  abort() { this._ac?.abort(); this._ac = null; }

  /** Show a spec that is already built (no AI call): renders it through the server. */
  async load(spec) {
    return this._run('/api/render', { spec, theme: this._theme(), header: !this.hasAttribute('hide-header') }, false);
  }
  async generate(opts = {}) {
    const prompt = (opts.prompt ?? this.$('textarea').value ?? this.getAttribute('prompt') ?? '').trim();
    const processId = opts.processId ?? this.getAttribute('process-id') ?? undefined;
    if (prompt.length < 3 && processId) opts = { ...opts, prompt: `Explain the ${processId} process` };
    return this._run('/api/explain', { prompt: prompt.length >= 3 ? prompt : opts.prompt, processId, context: opts.context ?? this.context, theme: this._theme(), header: !this.hasAttribute('hide-header'), noCache: opts.noCache }, true);
  }
  _theme() { const t = this.getAttribute('theme'); return t === 'light' || t === 'dark' ? t : undefined; }

  async _run(path, body, stream) {
    this.abort(); const ac = (this._ac = new AbortController());
    const btn = this.$('button'); btn.disabled = true; this._status('Starting…');
    const headers = { 'content-type': 'application/json', ...(stream ? { accept: 'text/event-stream' } : {}), ...this.headers };
    if (this.getAttribute('token')) headers.authorization = `Bearer ${this.getAttribute('token')}`;
    try {
      const res = await (this.fetch || fetch)(this.endpoint + path, { method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw Object.assign(new Error(j.error?.message || `Request failed (${res.status})`), { code: j.error?.code || 'http_' + res.status }); }
      let result;
      if (stream && (res.headers.get('content-type') || '').includes('text/event-stream')) result = await this._readSse(res);
      else result = await res.json();
      this._show(result);
      return result;
    } catch (e) {
      if (ac.signal.aborted) return null;
      this._status(e.message, true); this._emit('explainer-error', { code: e.code || 'error', message: e.message });
      return null;
    } finally { btn.disabled = false; }
  }
  async _readSse(res) {
    const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '', result = null, error = null;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const type = /^event: (.*)$/m.exec(block)?.[1], data = /^data: (.*)$/m.exec(block)?.[1]; if (!type || !data) continue;
        const d = JSON.parse(data);
        if (type === 'stage') { this._status(d.message); this._emit('explainer-stage', d); }
        else if (type === 'progress') { this._status(`Writing the explainer… ${Math.round(d.chars / 1000)}k characters`); this._emit('explainer-progress', d); }
        else if (type === 'result') result = d;
        else if (type === 'error') error = d;
      }
    }
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    if (!result) throw new Error('The generator closed the connection before finishing.');
    return result;
  }
  _show(r) {
    this.spec = r.spec; this.meta = r.meta || { warnings: r.warnings };
    const f = this.$('iframe'); f.style.height = this._h + 'px'; f.srcdoc = r.html; f.classList.add('on'); this.$('.empty').style.display = 'none';
    this._status(''); this._emit('explainer-ready', { spec: r.spec, meta: this.meta });
  }
}
if (!customElements.get('process-explainer')) customElements.define('process-explainer', ProcessExplainer);
export { ProcessExplainer };
