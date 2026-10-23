/* Bowling Tool: Night replay. Plays a saved Game Day night back shot by shot on a top-down lane:
   the ball's line (laydown → target → breakpoint → pocket), the pins it left, the spare ball, the running
   scorecard and the night's numbers so far. Like a round replay in a golf app, built only from what you logged.
   Exposes window.BTReplay.open(session). */
(function (root) {
  'use strict';
  const W = 360, H = 760, X0 = 124, X1 = 236, FOUL = 730, TOP = 30, BW = (X1 - X0) / 39, CX = (X0 + X1) / 2;
  const NS = 'http://www.w3.org/2000/svg';
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v) => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // A long, narrow lane. Length is drawn on two scales so the pin deck is readable: 0–57 ft over most of the height, 57–64 ft above it.
  const yOf = (ft) => ft <= 57 ? FOUL - ft / 57 * 530 : (FOUL - 530) - (ft - 57) / 7 * 170;
  // Pins: lateral offset from the head pin in boards (− = left as you face the pins), and distance in feet.
  const PIN = { 1: [0, 60], 2: [-5.64, 60.87], 3: [5.64, 60.87], 4: [-11.28, 61.73], 5: [0, 61.73], 6: [11.28, 61.73], 7: [-16.92, 62.6], 8: [-5.64, 62.6], 9: [5.64, 62.6], 10: [16.92, 62.6] };
  const pinX = (p) => CX + PIN[p][0] * BW;

  function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }

  function open(s, opts) {
    opts = opts || {};
    const BT = root.BT;
    const bowler = (BT && BT.lsGet(BT.KEYS.BOWLER, {})) || {};
    const lefty = String(bowler.handedness || bowler.hand || 'R').toUpperCase().startsWith('L');
    // Board (counted from your own gutter) → x on screen. Righties count from the right gutter.
    const xOf = (b) => lefty ? X0 + (b - 0.5) * BW : X1 - (b - 0.5) * BW;
    const pats = (BT && BT.lsGet(BT.KEYS.OIL_PATTERNS, [])) || [];
    const pat = (Array.isArray(pats) ? pats : []).find(p => p && p.name === s.pattern) || null;
    const patLen = pat && num(pat.length) ? num(pat.length) : null;
    const layOffDefault = num(bowler.laydownOffset) || 5;

    const chron = (s.shots || []).filter(Boolean).slice().sort((a, z) => (a.at || 0) - (z.at || 0));
    const steps = chron.filter(x => x.type !== 'gameStart');
    if (!steps.length) { alert('No shots to replay in this night.'); return; }
    const scores = (Array.isArray(s.scores) && s.scores.length) ? s.scores : (s.pinpal && s.pinpal.scores) || [];
    const gNos = [...new Set(steps.map(x => Number(x.gameNo) || 1))].sort((a, b) => a - b);
    const standing = (x) => BT.standingPins(x);
    const isX = (x) => standing(x).length === 0;

    // ---------- the ball's line for one shot ----------
    let lastLine = { feet: null, arrows: null };
    // How the line is drawn from what you logged (righties; lefties mirrored):
    //  · Your mark: hit it → the ball goes over your target. Right / left of it → about 1.5 boards off at the target.
    //  · A miss at the target carries on down the lane on the same angle, so it is off by more at the breakpoint
    //    (1.5 boards at 15 ft ≈ 4–5 boards at 45 ft). A ball that missed right can't go through your breakpoint.
    //  · "Recovered" / "held" = the lane saved it: off at the target and the breakpoint, but back in the pocket.
    //  · Hit your mark + flush pocket = the line as planned: laydown → target → breakpoint → pocket.
    //  · The pocket read decides where it enters the pins. With no pocket read: a strike is flush; a miss you
    //    didn't recover is light (missed right) or high (missed left); otherwise the pins you left decide.
    function pathFor(x) {
      const feet = num(x.feet) ?? lastLine.feet, arrows = num(x.arrows) ?? lastLine.arrows;
      if (num(x.feet) != null) lastLine.feet = num(x.feet); if (num(x.arrows) != null) lastLine.arrows = num(x.arrows);
      const tFt = num(x.targetFt) || 15, off = num(x.layOff) || layOffDefault;
      const pk = String(x.pocket || 'Unknown'), lv = standing(x), miss = String(x.miss || 'didntTrack');
      const R = lefty ? 1 : -1; // one board to the right on screen, in your own boards
      const markSide = /^right/.test(miss) ? 1 : /^left/.test(miss) ? -1 : 0; // + = right of the mark
      const saved = miss === 'rightRecovered' || miss === 'leftHeld';
      const d = markSide * 1.5 * R; // boards off at the target
      const bpFt = patLen ? clamp(patLen + 3, 36, 50) : 44;
      const lay = feet != null ? feet - off : null, tgt = arrows;
      let bpPlan = num(x.bp);
      if (bpPlan == null && lay != null && tgt != null) bpPlan = clamp(lay + (tgt - lay) * bpFt / tFt, 1, 39);
      if (bpPlan == null) bpPlan = tgt != null ? clamp(tgt - 4, 1, 39) : 8;
      const lay0 = lay != null ? lay : (tgt != null ? tgt + 3 : 15);
      const tgtPlan = tgt != null ? tgt : lay0 + (bpPlan - lay0) * tFt / bpFt;
      // Off at the target → off by more at the breakpoint (same angle from the laydown).
      const tgtHit = tgtPlan + d, bpHit = clamp(bpPlan + d * bpFt / tFt, 1, 39);
      const ENTRY = { 'Pocket flush': 17.5, 'Pocket high': 19.5, 'Pocket light': 15.5, 'Brooklyn': 22.5, 'Missed left': 17.5 - 6 * R, 'Missed right': 17.5 + 6 * R };
      let entry = ENTRY[pk], why = '';
      if (entry == null) {
        if (!lv.length) entry = 17.5;
        else if (markSide && !saved) entry = 17.5 + markSide * 2 * R; // missed and not saved: light (right) or high (left)
        else entry = (lv.includes(lefty ? 7 : 10) || lv.includes(lefty ? 4 : 6)) ? 15.5 : (lv.includes(lefty ? 6 : 4) || lv.includes(lefty ? 10 : 7)) ? 19.5 : 17.5;
      }
      if (markSide) why = `${markSide > 0 ? 'right' : 'left'} of your target → ${Math.round(Math.abs(bpHit - bpPlan))} boards ${markSide > 0 ? 'right' : 'left'} of your breakpoint${saved ? (markSide > 0 ? ', the lane brought it back' : ', the lane held it') : ''}`;
      else if (miss === 'noMiss' && pk === 'Pocket flush') why = 'on target, through your breakpoint, flush';
      else if (miss === 'noMiss') why = 'on target, through your breakpoint';
      const exitDrift = { 'Exit left': -4, 'Exit right': 4, 'Exit straight': 0 }[String(x.exit || '')] ?? 0; // screen boards (− = left)
      const pts = [];
      for (let ft = 0; ft <= 63.5; ft += 0.5) {
        let b;
        if (ft <= tFt) b = lay0 + (tgtHit - lay0) * ft / tFt;
        else if (ft <= bpFt) b = tgtHit + (bpHit - tgtHit) * (ft - tFt) / (bpFt - tFt);
        else if (ft <= 60) { const u = (ft - bpFt) / (60 - bpFt); b = bpHit + (entry - bpHit) * Math.pow(u, 1.8); }
        else b = null;
        let px = b != null ? xOf(b) : null;
        if (b == null) { const e = xOf(entry); px = e + exitDrift * BW * (ft - 60) / 3.5; }
        pts.push([clamp(px, X0 - 6, X1 + 6), yOf(ft), ft]);
      }
      const col = isX(x) ? '#4ade80' : /^Pocket|Brooklyn/.test(pk) || (pk === 'Unknown' && lv.length && lv.length <= 2) ? '#fbbf24' : /^Missed/.test(pk) ? '#f87171' : '#e5e7eb';
      return { pts, col, info: { feet, arrows, bp: num(x.bp), lay, why, tgtPlan, bpPlan, markSide, tFt, bpFt } };
    }
    const paths = steps.map(pathFor);

    // ---------- the night so far ----------
    const MARKOK = { noMiss: 1, rightRecovered: 1, leftHeld: 1 };
    function soFar(i) {
      const upto = steps.slice(0, i + 1).filter(x => !x.isFill);
      const str = upto.filter(isX).length, pocket = upto.filter(x => /^Pocket|Brooklyn/.test(String(x.pocket || '')) || isX(x)).length;
      const tr = upto.filter(x => String(x.miss || 'didntTrack') !== 'didntTrack' && x.miss !== 'na'), mk = tr.filter(x => MARKOK[x.miss]).length;
      const sp = upto.filter(x => !isX(x) && x.second && Array.isArray(x.second.left)), made = sp.filter(x => x.second.left.length === 0).length;
      return { n: upto.length, str, pocket, mark: tr.length ? Math.round(mk / tr.length * 100) : null, spares: sp.length ? `${made}/${sp.length}` : '—' };
    }
    function gameCard(i) {
      const x = steps[i], g = Number(x.gameNo) || 1;
      const gs = steps.slice(0, i + 1).filter(y => (Number(y.gameNo) || 1) === g);
      let c = null; try { c = BT.scoreGame(gs); } catch (_e) {}
      return { g, c, final: scores.length === gNos.length ? scores[gNos.indexOf(g)] : null, last: steps.slice(i + 1).every(y => (Number(y.gameNo) || 1) !== g) };
    }

    // ---------- build the screen ----------
    const wrap = document.createElement('div');
    wrap.className = 'rp-wrap'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-label', 'Night replay');
    wrap.innerHTML = `
      <div class="rp-top"><button type="button" class="rp-x" aria-label="Close replay">✕</button>
        <div class="rp-title"><div id="rpTitle">GAME 1 · FRAME 1</div><div class="rp-sub" id="rpSub"></div></div>
        <div class="rp-score"><div id="rpScore">—</div><div class="rp-sub" id="rpThru"></div></div></div>
      <div class="rp-stage"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" id="rpSvg"></svg>
        <div class="rp-side" id="rpSide"></div></div>
      <div class="rp-chip" id="rpChip"></div>
      <div class="rp-card" id="rpCard"></div>
      <div class="rp-ctl">
        <button type="button" class="rp-b" id="rpPrev" aria-label="Previous shot">⏮</button>
        <button type="button" class="rp-b rp-play" id="rpPlay" aria-label="Play or pause">⏸</button>
        <button type="button" class="rp-b" id="rpNext" aria-label="Next shot">⏭</button>
        <button type="button" class="rp-b rp-spd" id="rpSpd" aria-label="Speed">1×</button>
        <input type="range" id="rpSeek" min="0" max="${steps.length - 1}" value="0" aria-label="Shot" />
      </div>`;
    document.body.appendChild(wrap); document.body.classList.add('rp-open');
    const $ = (id) => wrap.querySelector('#' + id);
    const svg = $('rpSvg');

    // Lane
    const defs = el('defs', {}, svg);
    const lg = el('linearGradient', { id: 'rpWood', x1: '0', x2: '1', y1: '0', y2: '0' }, defs);
    [['0', '#c9a06a'], ['0.5', '#dcb98a'], ['1', '#c49a63']].forEach(([o, c]) => el('stop', { offset: o, 'stop-color': c }, lg));
    el('rect', { x: X0 - 9, y: TOP, width: X1 - X0 + 18, height: FOUL - TOP + 10, rx: 5, fill: '#2b2f36' }, svg); // gutters
    el('rect', { x: X0, y: TOP, width: X1 - X0, height: FOUL - TOP, fill: 'url(#rpWood)' }, svg);
    for (let b = 5; b < 39; b += 5) el('line', { x1: xOf(b) , x2: xOf(b), y1: TOP, y2: FOUL, stroke: 'rgba(0,0,0,.06)', 'stroke-width': 1 }, svg);
    if (patLen) { const yo = yOf(patLen); el('rect', { x: X0, y: yo, width: X1 - X0, height: FOUL - yo, fill: 'rgba(56,132,255,.13)' }, svg); el('line', { x1: X0, x2: X1, y1: yo, y2: yo, stroke: 'rgba(56,132,255,.55)', 'stroke-dasharray': '4 4' }, svg); const t = el('text', { x: X0 + 4, y: yo + 12, 'text-anchor': 'start', class: 'rp-lbl' }, svg); t.textContent = `oil ends ${patLen} ft`; }
    // Arrows (15 ft) and dots (7 ft)
    for (let b = 5; b <= 35; b += 5) { const x = xOf(b), y = yOf(15) - (Math.abs(b - 20) / 5) * 0; el('path', { d: `M${x} ${y - 6} L${x - 2.6} ${y + 3} L${x + 2.6} ${y + 3} Z`, fill: '#3b2a1a' }, svg); }
    [3, 5, 8, 11, 14, 26, 29, 32, 35, 37].forEach(b => el('circle', { cx: xOf(b), cy: yOf(7), r: 1.3, fill: '#3b2a1a' }, svg));
    el('line', { x1: X0, x2: X1, y1: FOUL, y2: FOUL, stroke: '#b91c1c', 'stroke-width': 2 }, svg);
    // Pin deck + pins
    el('rect', { x: X0, y: TOP, width: X1 - X0, height: yOf(59) - TOP, fill: 'rgba(255,255,255,.08)' }, svg);
    const pinEl = {};
    for (let p = 1; p <= 10; p++) { const g = el('g', { class: 'rp-pin' }, svg); el('circle', { cx: pinX(p), cy: yOf(PIN[p][1]), r: 8.5, fill: '#f8fafc', stroke: '#dc2626', 'stroke-width': 1.6 }, g); const tn = el('text', { x: pinX(p), y: yOf(PIN[p][1]) + 3.4, 'text-anchor': 'middle', class: 'rp-pnum' }, g); tn.textContent = String(p); pinEl[p] = g; }
    // Ball, trail, spare ball
    const trail = el('polyline', { fill: 'none', 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.95 }, svg);
    const trail2 = el('line', { stroke: '#93c5fd', 'stroke-width': 2.4, 'stroke-dasharray': '5 4', opacity: 0 }, svg);
    const ball = el('circle', { r: 5.5, fill: '#111827', stroke: '#f9fafb', 'stroke-width': 1.6 }, svg);
    const bpDot = el('circle', { r: 4.5, fill: 'none', stroke: '#1e3a8a', 'stroke-width': 1.6, 'stroke-dasharray': '2 1.5', opacity: 0 }, svg);
    const tgDot = el('circle', { r: 4.5, fill: 'none', stroke: '#1e3a8a', 'stroke-width': 1.6, 'stroke-dasharray': '2 1.5', opacity: 0 }, svg);

    // ---------- state + drawing ----------
    let i = 0, t = 0, playing = true, speed = 1, raf = 0, lastTs = 0, drawnI = -1, shownI = -1;
    const DUR = 3600;
    function setPins(up, faded) { for (let p = 1; p <= 10; p++) { const on = up.includes(p); pinEl[p].style.opacity = on ? '1' : String(faded); pinEl[p].style.transform = on ? '' : 'translateY(-6px)'; } }
    function hud(shown) {
      const j = shown ? i : i - 1; // the result, the numbers and the scorecard only change once the ball gets to the pins
      const x = steps[i], g = Number(x.gameNo) || 1, f = x.isFill ? '10 (fill)' : (x.frame || '—');
      $('rpTitle').textContent = `GAME ${g} · FRAME ${f}`;
      $('rpSub').textContent = [x.lane ? `Lane ${x.lane}` : '', s.house || '', x.added ? '＋ added later' : ''].filter(Boolean).join(' · ');
      const gc = j >= 0 && (Number(steps[j].gameNo) || 1) === (Number(x.gameNo) || 1) ? gameCard(j) : { c: null, final: null, last: false }, c = gc.c; let cum = null, thru = 0;
      if (c) c.frames.forEach(fr => { if (fr.cum != null) { cum = fr.cum; thru = fr.no; } });
      if (gc.last && gc.final != null && (cum == null || thru < 10)) { $('rpScore').textContent = gc.final; $('rpThru').textContent = 'final'; }
      else { const gap = c && c.frames.some(fr => fr.marks.includes('?') && fr.no < (x.isFill ? 10 : Number(x.frame) || 0)); $('rpScore').textContent = cum != null ? cum : '—'; $('rpThru').textContent = cum != null ? `thru ${thru}` : gap ? 'needs 2nd balls' : ''; }
      const so = j >= 0 ? soFar(j) : { n: 0, str: 0, pocket: 0, mark: null, spares: '—' };
      $('rpSide').innerHTML = `<div class="rp-k">STRIKES</div><div class="rp-v">${so.str}/${so.n}</div><div class="rp-k">POCKET</div><div class="rp-v">${so.n ? Math.round(so.pocket / so.n * 100) : 0}%</div><div class="rp-k">MARK</div><div class="rp-v">${so.mark != null ? so.mark + '%' : '—'}</div><div class="rp-k">SPARES</div><div class="rp-v">${so.spares}</div>`;
      const P = paths[i].info, lv = standing(x);
      const line = [P.feet, P.arrows].every(v => v != null) ? `${P.feet}/${P.arrows}${P.bp != null ? '/' + P.bp : ''}` : '';
      const res = isX(x) ? 'Strike' : lv.join('-') + (x.second && Array.isArray(x.second.left) ? (x.second.left.length ? ` → ${x.second.left.join('-')} left` : ' → spare') : '');
      const fault = x.fault && root.BTCoach && root.BTCoach.faultLabel ? ` · 🤔 ${root.BTCoach.faultLabel(x.fault)}` : '';
      $('rpChip').innerHTML = `<div><b>${esc(x.ball || 'Ball?')}</b>${line ? ` · ${esc(line)}` : ''}</div>` + (!shown ? '<div class="rp-dim">…</div>' : `<div><span style="color:${paths[i].col}">●</span> ${esc(res)}${x.pocket && x.pocket !== 'Unknown' ? ` · ${esc(String(x.pocket).replace(/^Pocket /, ''))}` : ''}${esc(fault)}</div>${P.why ? `<div class="rp-why">${esc(P.why)}</div>` : ''}`);
      // Mini scorecard for this game
      const cells = []; const fr = c ? c.frames.slice() : []; while (fr.length < 10) fr.push({ no: fr.length + 1, marks: [''], cum: null });
      const curF = x.isFill ? 10 : Number(x.frame) || 0;
      fr.forEach(fx => cells.push(`<div class="rp-f${fx.no === curF ? ' on' : ''}"><div class="rp-fm">${fx.marks.map(m => m === '?' ? '·' : m).join(' ')}</div><div class="rp-fc">${fx.cum ?? ''}</div></div>`));
      $('rpCard').innerHTML = cells.join('');
      $('rpSeek').value = String(i);
    }
    function frame(tt) {
      const P = paths[i], x = steps[i], lv = standing(x), sec = x.second && Array.isArray(x.second.left) ? x.second.left : null;
      if (drawnI !== i) { drawnI = i; shownI = -1; hud(false); trail.setAttribute('stroke', P.col); trail2.setAttribute('opacity', '0');
        // Rings = where you aimed: your target and your breakpoint. The line shows where the ball went.
        const I = P.info;
        if (I.arrows != null) { tgDot.setAttribute('cx', xOf(I.tgtPlan)); tgDot.setAttribute('cy', yOf(I.tFt)); tgDot.setAttribute('opacity', '0.9'); } else tgDot.setAttribute('opacity', '0');
        bpDot.setAttribute('cx', xOf(I.bpPlan)); bpDot.setAttribute('cy', yOf(I.bpFt)); bpDot.setAttribute('opacity', I.arrows != null || I.bp != null ? '0.9' : '0'); }
      // 0–8% reset · 8–60% first ball · 60–80% spare ball · then hold
      const a = clamp((tt - 0.08) / 0.52, 0, 1), k = Math.round(a * (P.pts.length - 1));
      trail.setAttribute('points', P.pts.slice(0, k + 1).map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '));
      const bp = P.pts[k]; ball.setAttribute('cx', bp[0]); ball.setAttribute('cy', bp[1]); ball.setAttribute('opacity', a > 0 && a < 1 ? '1' : '0');
      const hit = P.pts[k][2] >= 60;
      if (hit && shownI !== i) { shownI = i; hud(true); }
      if (!hit) setPins([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1);
      else if (tt < 0.6 || !sec || !lv.length) setPins(lv, 0.12);
      if (sec && lv.length && tt >= 0.6) {
        const b2 = clamp((tt - 0.6) / 0.2, 0, 1);
        const tx = lv.reduce((m, p) => m + pinX(p), 0) / lv.length, ty = lv.reduce((m, p) => m + yOf(PIN[p][1]), 0) / lv.length;
        const sx = CX - (tx - CX) * 0.9, sy = FOUL;
        trail2.setAttribute('x1', sx); trail2.setAttribute('y1', sy); trail2.setAttribute('x2', sx + (tx - sx) * b2); trail2.setAttribute('y2', sy + (ty - sy) * b2); trail2.setAttribute('opacity', '0.9');
        ball.setAttribute('cx', sx + (tx - sx) * b2); ball.setAttribute('cy', sy + (ty - sy) * b2); ball.setAttribute('opacity', b2 < 1 ? '1' : '0');
        setPins(b2 >= 1 ? sec : lv, 0.12);
      }
    }
    function loop(ts) {
      if (!lastTs) lastTs = ts; const dt = ts - lastTs; lastTs = ts;
      if (playing) { t += dt * speed / DUR; if (t >= 1) { if (i < steps.length - 1) { i++; t = 0; } else { t = 1; playing = false; $('rpPlay').textContent = '▶'; } } }
      frame(t); raf = requestAnimationFrame(loop);
    }
    const go = (n) => { i = clamp(n, 0, steps.length - 1); t = playing ? 0 : 0.999; drawnI = -1; frame(t); };
    $('rpPrev').onclick = () => go(t > 0.25 && playing ? i : i - 1);
    $('rpNext').onclick = () => go(i + 1);
    $('rpPlay').onclick = () => { if (!playing && i === steps.length - 1 && t >= 1) { i = 0; t = 0; drawnI = -1; } playing = !playing; $('rpPlay').textContent = playing ? '⏸' : '▶'; };
    $('rpSpd').onclick = () => { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; $('rpSpd').textContent = speed + '×'; };
    $('rpSeek').oninput = (e) => { playing = false; $('rpPlay').textContent = '▶'; go(Number(e.target.value)); };
    function close() { cancelAnimationFrame(raf); wrap.remove(); document.body.classList.remove('rp-open'); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); else if (e.key === ' ') { e.preventDefault(); $('rpPlay').click(); } else if (e.key === 'ArrowRight') go(i + 1); else if (e.key === 'ArrowLeft') go(i - 1); }
    wrap.querySelector('.rp-x').onclick = close; document.addEventListener('keydown', onKey);
    if (opts.start != null) { i = clamp(opts.start, 0, steps.length - 1); }
    raf = requestAnimationFrame(loop);
    return { close };
  }
  root.BTReplay = { open };
})(typeof window !== 'undefined' ? window : globalThis);
