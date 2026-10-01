/* Process explainer player. Reads #spec (validated by spec.js) and builds every screen from it.
   Nothing in the spec is ever inserted as HTML: all text goes through esc() or textContent. */
(function () {
'use strict';
const SPEC = JSON.parse(document.getElementById('spec').textContent);
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = SPEC.steps, PH = SPEC.phases, BASE = SPEC.brand.base, ACC = SPEC.brand.accent;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- timeline helpers: acts are [ms, fn(root)] ---------- */
function Ctx() { return { n: 0, t: 400, acts: [], gate: false, id() { return 'c' + this.n++; }, at(ms, fn) { this.acts.push([ms, fn]); }, sel(id) { return `[data-a=${id}]`; } }; }
const q = (r, id) => r.querySelector(`[data-a=${id}]`);
function typeAct(x, id, text, speed) {
  const sp = Math.max(18, Math.min(speed || 55, 1700 / Math.max(1, text.length)));
  x.at(x.t, (r) => { const e = q(r, id); e.classList.add('on', 'caret'); e.textContent = ''; });
  [...text].forEach((_, i) => x.at(x.t + (i + 1) * sp, (r) => { const e = q(r, id); e.textContent = text.slice(0, i + 1); if (i === text.length - 1) e.classList.remove('caret'); }));
  x.t += 250 + text.length * sp + 200;
}
function tapAct(x, id, at) { const t = at ?? x.t; x.at(t, (r) => q(r, id)?.classList.add('tap')); x.at(t + 220, (r) => q(r, id)?.classList.remove('tap')); }
function parseAmt(s) {
  const m = String(s).match(/-?\d[\d\s,]*(?:\.(\d+))?/); if (!m) return null;
  const num = parseFloat(m[0].replace(/[\s,]/g, '')); if (!isFinite(num)) return null;
  const i = s.indexOf(m[0]); return { num, dec: m[1] ? m[1].length : 0, pre: s.slice(0, i), post: s.slice(i + m[0].length) };
}
const fmtAmt = (a, v) => a.pre + v.toFixed(a.dec) + a.post;
function tween(el, a, from, to, ms) {
  const t0 = performance.now(); el.classList.add('bump');
  const step = (now) => { const k = Math.min(1, (now - t0) / ms); el.textContent = fmtAmt(a, from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step); else setTimeout(() => el.classList.remove('bump'), 250); };
  requestAnimationFrame(step);
}

/* ---------- components: each returns html and schedules acts on x ---------- */
const lbl = (t) => `<label>${esc(t)}</label>`;
const BUILD = {
  field(c, x) {
    const id = x.id();
    if (c.mode === 'type' && c.value) { const h = `<div class="fld">${lbl(c.label)}<div class="in" data-a="${id}"></div></div>`; typeAct(x, id, c.value); return h; }
    const lock = c.mode === 'locked' ? `<span class="lock">${esc(c.lockLabel || 'verified')}</span>` : '';
    if (c.mode === 'fill') {
      x.at(x.t, (r) => { const e = q(r, id); e.textContent = c.value; if (c.lockLabel) { const s = document.createElement('span'); s.className = 'lock'; s.textContent = c.lockLabel; e.appendChild(s); } });
      x.t += 350; return `<div class="fld">${lbl(c.label)}<div class="in" data-a="${id}"></div></div>`;
    }
    return `<div class="fld">${lbl(c.label)}<div class="in">${esc(c.value)}${lock}</div></div>`;
  },
  verify(c, x) {
    const id = x.id(), sh = id + 's', vt = id + 't';
    const h = `<div style="display:flex;gap:10px;align-items:flex-end"><div style="flex:1"><div class="fld">${lbl(c.label)}<div class="in" data-a="${id}"></div></div></div>
      <div style="text-align:center"><div class="shield" data-a="${sh}">!</div></div></div><div class="vtext" data-a="${vt}" style="margin:-4px 0 8px">Not verified</div>`;
    if (c.value) typeAct(x, id, c.value, 50); else x.t += 300;
    x.t += 300; tapAct(x, sh);
    x.at(x.t + 600, (r) => { q(r, sh).classList.add('ok'); q(r, sh).textContent = '✓'; const v = q(r, vt); v.classList.add('ok'); v.textContent = c.okText; });
    x.t += 1100; return h;
  },
  choice(c, x) {
    const ids = c.options.map(() => x.id());
    ids.forEach((id, i) => { if (i === c.selected) x.at(x.t + 600, (r) => q(r, id).classList.add('sel')); });
    x.t += 1300;
    return c.options.map((o, i) => `<div class="opt ${o.disabled ? 'off' : ''}" data-a="${ids[i]}"><b>${esc(o.label)}</b>${o.sub ? `<small style="color:#8A8A8A">${esc(o.sub)}</small>` : ''}</div>`).join('');
  },
  segment(c, x) {
    const ids = c.options.map(() => x.id());
    x.at(x.t + 500, (r) => q(r, ids[c.selected]).classList.add('sel')); x.t += 1100;
    return `${c.label ? `<div style="font-size:12px;margin:4px 0">${esc(c.label)}</div>` : ''}<div class="seg" style="margin-bottom:8px">${c.options.map((o, i) => `<span data-a="${ids[i]}">${esc(o.label)}</span>`).join('')}</div>`;
  },
  rows(c, x) {
    const ids = c.items.map(() => x.id()), amt = x.id(), acc = x.id();
    const nums = c.items.map((i) => parseAmt(i.amount)), tot = c.total ? parseAmt(c.total.value) : null;
    let run = 0; const step = c.total ? 1100 : 600;
    c.items.forEach((it, i) => {
      x.at(x.t, (r) => q(r, ids[i]).classList.add('in'));
      if (tot) { const add = nums[i]?.num ?? 0, from = run; run += add; const last = i === c.items.length - 1;
        x.at(x.t + 200, (r) => tween(q(r, amt), tot, from, last ? tot.num : run, 600)); }
      x.t += step;
    });
    c.items.forEach((it, i) => { if (it.fixedSub) x.at(x.t, (r) => { const e = q(r, ids[i]); e.style.borderLeftColor = ''; e.querySelector('small').style.color = ''; e.querySelector('small').textContent = it.fixedSub; }); });
    if (c.items.some((i) => i.fixedSub)) x.t += 700;
    let html = c.items.map((it, i) => `<div class="life" data-a="${ids[i]}" ${it.warn ? 'style="border-left-color:#E0A000"' : ''}><b>${esc(it.title)}</b><span class="p">${esc(it.amount)}</span><small ${it.warn ? 'style="color:#B26B00"' : ''}>${esc(it.sub)}</small></div>`).join('');
    if (c.total) {
      const hasAct = !!c.action; if (hasAct) { x.at(x.t, (r) => q(r, acc).classList.remove('off')); tapAct(x, acc, x.t + 600); x.t += 1000; }
      html += `<div class="qbar"><div><small>${esc(c.total.label)}</small><span class="amt" data-a="${amt}">${esc(tot ? fmtAmt(tot, 0) : c.total.value)}</span></div>
        ${hasAct ? `<div class="btn go off" data-a="${acc}" style="width:auto;margin:0;padding:8px 12px">${esc(c.action)}</div>` : ''}</div>`;
    }
    return html;
  },
  checklist(c, x) {
    const ids = c.items.map(() => x.id());
    ids.forEach((id) => { x.at(x.t + 900, (r) => q(r, id).classList.add('on')); x.t += 1000; });
    if (c.gate) x.gate = true;
    return c.items.map((t, i) => `<div class="chk" data-a="${ids[i]}"><i></i>${esc(t)}</div>`).join('');
  },
  signature(c, x) {
    const id = x.id(); x.at(x.t, (r) => q(r, id).classList.add('draw')); x.t += 2800;
    return `${c.caption ? `<div style="font-size:11px;color:#8A8A8A;margin-bottom:4px">${esc(c.caption)}</div>` : ''}<div class="pad" data-a="${id}"><svg viewBox="0 0 260 150"><path d="M20 105 C40 40, 60 40, 55 95 S 80 120, 95 70 S 115 40, 120 90 C 125 115, 140 60, 150 80 S 170 110, 180 70 C 186 55, 200 60, 196 90 S 215 100, 240 60"/></svg></div>`;
  },
  document(c, x) {
    const id = x.id(); x.at(x.t + 300, (r) => q(r, id).classList.add('in')); x.t += 1200;
    const w = [100, 85, 92, 70];
    return `<div class="doc" data-a="${id}"><h5>${esc(c.title)}</h5>${c.lines.map((l) => `<div>${esc(l)}</div>`).join('')}${w.map((p) => `<div class="line" style="width:${p}%"></div>`).join('')}${c.signed ? `<div class="sig">${esc(c.signed)}</div>` : ''}</div>`;
  },
  otp(c, x) {
    const sms = x.id(), ids = [...c.code].map(() => x.id());
    x.at(x.t, (r) => q(r, sms).classList.add('in')); x.t += 1500;
    [...c.code].forEach((d, i) => { x.at(x.t + i * 350, (r) => { const e = q(r, ids[i]); e.textContent = d; e.classList.add('f'); }); });
    x.t += c.code.length * 350 + 300;
    return `${c.message ? `<div class="msg" data-a="${sms}">${esc(c.message)}</div>` : `<div data-a="${sms}"></div>`}<div class="otp">${ids.map((id) => `<span data-a="${id}"></span>`).join('')}</div>`;
  },
  table(c, x) { x.t += 300; return `<table class="mt">${c.rows.map((r) => `<tr><td>${esc(r.k)}</td><td class="${r.tone || ''}">${esc(r.v)}</td></tr>`).join('')}</table>`; },
  decision(c, x) {
    const id = x.id(), ask = x.id(), pick = x.id(), then = x.id();
    x.t += 1200; tapAct(x, pick);
    if (c.then) { x.at(x.t + 300, (r) => { q(r, ask).style.display = 'none'; q(r, then).style.display = 'block'; }); tapAct(x, then, x.t + 1500); x.t += 2000; } else x.t += 600;
    return `<div class="ask" data-a="${ask}">${esc(c.text)}<div style="display:flex;gap:8px">${c.options.map((o, i) => `<div class="btn ${i === c.pick ? 'go' : 'ghost'}" ${i === c.pick ? `data-a="${pick}"` : ''}>${esc(o.label)}</div>`).join('')}</div></div>
      ${c.then ? `<div class="btn" data-a="${then}" style="display:none">${esc(c.then)}</div>` : ''}<span data-a="${id}"></span>`;
  },
  carryover(c, x) {
    const ids = c.items.map(() => x.id());
    ids.forEach((id) => { x.at(x.t, (r) => q(r, id).classList.add('in')); x.t += 320; });
    return c.items.map((it, i) => `<div class="carryrow" data-a="${ids[i]}"><span>${esc(it.label)}</span><span class="${it.state === 'copied' ? 'c' : 'x'}">${it.state === 'copied' ? 'Copied' : 'Recapture'}</span></div>`).join('');
  },
  notice(c, x) { const id = x.id(); x.at(x.t, (r) => q(r, id).classList.add('in')); x.t += 700; return `<div class="note ${c.kind}" data-a="${id}">${esc(c.text)}</div>`; },
  text(c, x) { x.t += 150; return `<p class="txt">${esc(c.text)}</p>`; },
  buttons(c, x) {
    const ids = c.items.map(() => x.id()); x.t += 500; if (c.tap >= 0) { tapAct(x, ids[c.tap]); x.t += 500; }
    return `<div class="row2">${c.items.map((b, i) => `<div class="btn ${b.style === 'primary' ? 'go' : b.style === 'grey' ? 'grey' : 'ghost'}" data-a="${ids[i]}">${esc(b.label)}</div>`).join('')}</div>`;
  },
  tiles(c, x) { const ids = c.items.map(() => x.id()); x.t += 1500; tapAct(x, ids[c.tap]); x.t += 400;
    return c.items.map((t, i) => `<div class="homebtn" data-a="${ids[i]}"><i></i>${esc(t)}</div>`).join(''); },
  toast(c, x) { const t = x.t; x.at(t, (r) => { const e = q(r, 'toast'); e.textContent = c.text; e.classList.add('in'); }); x.at(t + 2200, (r) => q(r, 'toast').classList.remove('in')); x.t += 900; return ''; },
  card(c, x) { return `<div class="card"><header>${esc(c.title)}</header><div class="bd">${c.children.map((k) => BUILD[k.type](k, x)).join('')}</div></div>`; },
};

function screenOf(s) {
  const x = Ctx(), sc = s.screen;
  const body = sc.components.map((c) => BUILD[c.type](c, x)).join('');
  let nav = '';
  if (sc.next) {
    nav = `<div class="navb"><div class="btn ghost">Back</div><div class="btn go ${x.gate ? 'off' : ''}" data-a="next">${esc(sc.next)}</div></div>`;
    if (x.gate) x.at(x.t, (r) => q(r, 'next').classList.remove('off'));
    x.t += 500; tapAct(x, 'next');
  }
  const plain = sc.chrome === 'plain';
  const html = `<div class="sb ${plain ? 'plain' : ''}"><span>12:14</span><span>●●● ■</span></div>
    ${plain ? '' : `<div class="ab"><span class="burger"></span><b>${esc(sc.title)}</b>${sc.lead ? `<span class="lead">${esc(sc.lead)}</span>` : ''}</div>`}
    <div class="band"><span class="wm-base">${esc(BASE.name)}</span><span class="wm-acc">${esc(ACC.name)}</span></div>
    <div class="vp" style="display:flex;flex-direction:column">${body}</div>${nav}<div class="toast" data-a="toast"></div>`;
  x.acts.sort((a, b) => a[0] - b[0]);
  return { html, acts: x.acts, dur: Math.min(16000, Math.max(5000, x.t + 1700)) };
}
S.forEach((s) => { s._scr = screenOf(s); });

/* ---------- narration ---------- */
const CROSS_TXT = 'Green ticks carry into the next application. Struck-through items must be captured again.';
function renderChips(i) {
  const all = []; S.slice(0, i + 1).forEach((x, xi) => x.carries.forEach((c) => all.push({ k: c.key, t: c.text, isNew: xi === i })));
  const box = $('#chips'), h = S[i].handoff, note = $('#carryNote'); box.textContent = '';
  note.textContent = h ? (h.note || CROSS_TXT) : (all.length ? 'Everything captured so far travels with the sale.' : 'Nothing captured yet.');
  all.forEach((c) => {
    const st = h && h.states[c.k], e = document.createElement('span');
    e.className = 'chip ' + (h ? (st === 'cleared' ? 'cleared' : st === 'copied' ? 'copied' : st === 'parent' ? 'parent' : '') : (c.isNew ? 'new' : ''));
    if (!h && !c.isNew) e.style.animation = 'none';
    e.textContent = (h && h.labels[c.k]) || c.t; box.appendChild(e);
  });
}
function narrate(i) {
  const s = S[i];
  $('#num').textContent = s.n; $('#phase').textContent = PH[s.phase]; $('#title').textContent = s.title; $('#say').textContent = s.say;
  const bd = $('#badge'); bd.textContent = '';
  if (s.badge) { const d = document.createElement('div'); d.className = 'badge'; const b = document.createElement('b'); b.textContent = s.badge.kind; const t = document.createElement('span'); t.textContent = s.badge.text; d.append(b, t); bd.appendChild(d); }
  const ul = $('#rules'); ul.textContent = '';
  s.rules.forEach((r) => { const li = document.createElement('li'); li.className = r.kind === 'question' ? 'q' : r.kind; li.textContent = (r.kind === 'question' && !/^open question/i.test(r.text) ? 'Open question: ' : '') + r.text; ul.appendChild(li); });
  const sr = $('#srcs'); sr.textContent = '';
  if (s.sources.length) { const l = document.createElement('span'); l.textContent = 'Based on'; sr.appendChild(l); s.sources.slice(0, 4).forEach((o) => { const c = document.createElement('code'); c.textContent = o.kind === 'code' ? o.ref.split('/').pop() : o.ref; c.title = o.kind + ': ' + o.ref; sr.appendChild(c); }); }
  renderChips(i);
}

/* ---------- player ---------- */
let cur = 0, playing = !reduced, elapsed = 0, last = 0, fired = 0, sceneEl = null, acts = [];
const track = $('#track');
track.style.gridTemplateColumns = PH.map((_, pi) => Math.max(1.4, S.filter((s) => s.phase === pi).length) + 'fr').join(' ');
track.innerHTML = PH.map((p, pi) => `<div class="ph" data-ph="${pi}"><h4>${esc(p)}</h4><div class="ticks">${
  S.map((s, i) => (s.phase === pi ? `<button class="tick" data-i="${i}" aria-label="Step ${esc(s.n)}: ${esc(s.title)}"><div class="fill"></div><span>${esc(s.n)}</span></button>` : '')).join('')}</div></div>`).join('');
track.addEventListener('click', (e) => { const b = e.target.closest('.tick'); if (b) show(+b.dataset.i); });

function setTone(on) { document.body.classList.toggle('ac', on); $('#device').classList.toggle('ac', on); }
function show(i) {
  cur = (i + S.length) % S.length; elapsed = 0; fired = 0;
  const s = S[cur]; narrate(cur);
  setTone(s.tone === 'accent');
  const scr = $('#screen'), el = document.createElement('div');
  el.className = 'scene enter'; el.innerHTML = s._scr.html;
  if (sceneEl) { const old = sceneEl; old.classList.add('leave'); setTimeout(() => old.remove(), 500); }
  scr.appendChild(el); sceneEl = el;
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('enter')));
  acts = s._scr.acts;
  if (reduced) { acts.forEach((a) => a[1](el)); fired = acts.length; }
  document.querySelectorAll('.tick').forEach((t) => { const ti = +t.dataset.i;
    t.classList.toggle('done', ti < cur); t.classList.toggle('cur', ti === cur); t.querySelector('.fill').style.width = ti < cur ? '100%' : '0';
    if (ti === cur) t.setAttribute('aria-current', 'step'); else t.removeAttribute('aria-current'); });
  document.querySelectorAll('.ph').forEach((p) => p.classList.toggle('cur', +p.dataset.ph === s.phase));
  setPlaying(playing);
}
function loop(now) {
  const dt = last ? Math.min(100, now - last) : 0; last = now;
  if (playing) {
    const s = S[cur]; elapsed += dt;
    while (fired < acts.length && acts[fired][0] <= elapsed) { acts[fired][1](sceneEl); fired++; }
    const f = document.querySelector(`.tick[data-i="${cur}"] .fill`); if (f) f.style.width = Math.min(100, elapsed / s._scr.dur * 100) + '%';
    if (elapsed >= s._scr.dur) { if (cur === S.length - 1) setPlaying(false); else show(cur + 1); }
  }
  requestAnimationFrame(loop);
}
const atEnd = () => cur === S.length - 1 && elapsed >= S[cur]._scr.dur;
function setPlaying(p) { playing = p; const b = $('#play'); b.textContent = p ? 'Pause' : (atEnd() ? 'Replay' : 'Play'); b.setAttribute('aria-pressed', p); }
$('#play').onclick = () => { if (!playing && atEnd()) show(0); setPlaying(!playing); };
$('#next').onclick = () => show(cur + 1);
$('#prev').onclick = () => show(cur - 1);
document.addEventListener('keydown', (e) => {
  if (e.target.closest('button') && (e.key === ' ' || e.key === 'Enter')) return;
  if (e.key === 'ArrowRight') show(cur + 1); else if (e.key === 'ArrowLeft') show(cur - 1);
  else if (e.key === ' ') { e.preventDefault(); $('#play').click(); }
});

/* ---------- embedding: stable height, theme, host messages ---------- */
let maxNarr = 0;
for (let i = 0; i < S.length; i++) { narrate(i); maxNarr = Math.max(maxNarr, $('.narr').offsetHeight); }
$('.narr').style.setProperty('--narr-min', Math.max(640, maxNarr) + 'px');
let maxH = 0, lastW = 0;
const post = () => { const w = innerWidth; if (w !== lastW) { lastW = w; maxH = 0; } maxH = Math.max(maxH, Math.ceil(document.querySelector('.wrap').getBoundingClientRect().height)); try { parent.postMessage({ source: 'process-explainer', type: 'height', height: maxH }, '*'); } catch (e) { /* standalone */ } };
if (parent !== window) { new ResizeObserver(post).observe(document.body); post(); }
addEventListener('message', (e) => { const d = e.data; if (!d || d.source !== 'process-explainer-host') return;
  if (d.type === 'theme') { if (d.theme === 'light' || d.theme === 'dark') document.documentElement.dataset.theme = d.theme; else delete document.documentElement.dataset.theme; }
  if (d.type === 'play') setPlaying(true); if (d.type === 'pause') setPlaying(false); if (d.type === 'step') show(+d.index || 0); });

show(0); requestAnimationFrame(loop);
})();
