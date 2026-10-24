/* Bowling Tool: 📈 Trends. Every night on one timeline: average, repeatability, eyeball score, strikes, spares,
   pocket, carry, series, high game and the 5 Scoring Elements. Optional running average and trend line (a straight
   least-squares line through the nights shown, like Excel's: it describes the past, it never extends past your last
   night). Charts share the same nights left to right, so you can read one under another.
   Exposes window.BTTrends.render(container, { openNight }). */
(function (root) {
  'use strict';
  const KEY = 'bt_trends_v1';
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const r1 = (x) => Math.round(x * 10) / 10;
  const norm = (h) => String(h || '').toLowerCase().replace(/lanes?$/, '').replace(/[^a-z0-9]/g, '');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtD = (d) => { const [y, m, dd] = String(d).split('-').map(Number); return `${MON[m - 1]} ${dd}, ${y}`; };
  const prefs = () => { try { return Object.assign({ period: '12', house: '', lanes: '', league: '', avg: true, trend: false }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_e) { return { period: '12', house: '', lanes: '', league: '', avg: true, trend: false }; } };
  const savePrefs = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (_e) {} };

  // ---------- one row per night ----------
  function nights() {
    const BT = root.BT, S = root.BTStats, C = root.BTCoach;
    const G = S ? S.allGames() : [];
    const byWk = {}; G.forEach(g => { (byWk[g.wk] = byWk[g.wk] || []).push(g); });
    const rows = Object.values(byWk).map(gs => {
      const sm = S.summarize(gs), f = gs[0];
      return { d: f.d, h: f.h, lanes: f.lanes, lg: f.lg, games: gs.length, avg: sm.avg, high: sm.high, series: gs.length >= 3 ? gs.slice(0, 3).reduce((a, g) => a + g.s, 0) : null, strike: sm.strike, spare: sm.spare, src: f.src };
    });
    // Game Day nights: your reads (pocket, carry, repeatability, eyeball, 5 elements), matched to the same night.
    let sess = []; try { sess = BT.lsGet(BT.KEYS.GAME_SESSIONS, []) || []; } catch (_e) {}
    const bw = (BT && BT.lsGet(BT.KEYS.BOWLER, {})) || {}, pats = (BT && BT.lsGet(BT.KEYS.OIL_PATTERNS, [])) || [];
    const dOf = (x) => { if (x.date) return String(x.date).slice(0, 10); const t = new Date(x.savedAt || 0); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
    (Array.isArray(sess) ? sess : []).forEach(x => {
      const shots = (x.shots || []).filter(Boolean).slice().sort((a, b) => (a.at || 0) - (b.at || 0)), real = shots.filter(s => s.type !== 'gameStart' && !s.isFill);
      if (real.length < 3) return;
      const d = dOf(x); let row = rows.find(r => r.d === d && (norm(r.h) === norm(x.house) || norm(r.h).includes(norm(x.house)) || norm(x.house).includes(norm(r.h))));
      if (!row) { row = { d, h: x.house || '', lanes: x.lanes || '', lg: x.leagueName || '', games: 0, avg: null, high: null, series: null, strike: null, spare: null, src: 'gd' }; rows.push(row); }
      row.sid = x.id;
      const ph = real.filter(s => BT.isPocketHit(s)), px = ph.filter(s => !BT.standingPins(s).length);
      row.pocket = Math.round(ph.length / real.length * 100); row.carry = ph.length ? Math.round(px.length / ph.length * 100) : null;
      if (row.strike == null) row.strike = Math.round(real.filter(s => !BT.standingPins(s).length).length / real.length * 1000) / 10;
      try { const rp = C && C.repeatability ? C.repeatability(shots, bw) : null; row.repeat = rp ? rp.score : null; } catch (_e) {}
      try { const e = C && C.eyeballScore ? C.eyeballScore(shots, bw) : null; row.eye = e && e.n ? e.score : null; } catch (_e) {}
      try { const el = C && C.elementsReport ? C.elementsReport(shots, bw, (Array.isArray(pats) ? pats : []).find(q => q && q.name === x.pattern) || null) : null; if (el) el.elements.forEach(e => { row['el_' + e.key] = e.score; }); } catch (_e) {}
    });
    return rows.filter(r => r.d).sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
  }

  // ---------- one chart ----------
  const W = 340, H = 132, PL = 34, PR = 8, PT = 10, PB = 20;
  function fit(pts) { // least squares on (night index, value)
    const n = pts.length; if (n < 3) return null; let sx = 0, sy = 0, sxx = 0, sxy = 0;
    pts.forEach(p => { sx += p.i; sy += p.v; sxx += p.i * p.i; sxy += p.i * p.v; });
    const den = n * sxx - sx * sx; if (!den) return null; const m = (n * sxy - sx * sy) / den; return { m, b: (sy - m * sx) / n };
  }
  function chart(def, R, P, N) {
    const pts = R.map((r, i) => ({ i, v: r[def.k], r })).filter(p => p.v != null && Number.isFinite(p.v));
    if (pts.length < 2) return `<div class="panel tr-card"><div class="tr-h"><b>${def.t}</b></div><div class="small dim">${def.none || 'Not enough nights logged yet.'}</div></div>`;
    const vs = pts.map(p => p.v); let lo = Math.min(...vs), hi = Math.max(...vs);
    if (def.pct) { lo = Math.max(0, Math.floor((lo - 5) / 10) * 10); hi = Math.min(100, Math.ceil((hi + 5) / 10) * 10); } else { const pad = Math.max(2, (hi - lo) * 0.12); lo = Math.floor((lo - pad) / 10) * 10; hi = Math.ceil((hi + pad) / 10) * 10; }
    if (hi === lo) hi = lo + 10;
    const x = (i) => PL + (N <= 1 ? 0 : i / (N - 1)) * (W - PL - PR), y = (v) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);
    const ticks = [lo, (lo + hi) / 2, hi].map(v => Math.round(v));
    let svg = ticks.map(v => `<line x1="${PL}" x2="${W - PR}" y1="${y(v)}" y2="${y(v)}" class="tr-grid"/><text x="${PL - 4}" y="${y(v) + 3}" class="tr-ax" text-anchor="end">${v}${def.pct ? '%' : ''}</text>`).join('');
    // x labels: first and last night, and a middle one
    [0, Math.floor((N - 1) / 2), N - 1].filter((v, k, a) => a.indexOf(v) === k && R[v]).forEach((i, k, a) => { const [yy, mm] = R[i].d.split('-'); svg += `<text x="${x(i)}" y="${H - 5}" class="tr-ax" text-anchor="${k === 0 ? 'start' : k === a.length - 1 ? 'end' : 'middle'}">${MON[Number(mm) - 1]} '${yy.slice(2)}</text>`; });
    const path = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    svg += `<path d="${path}" class="tr-line"/>`;
    const dotR = pts.length > 60 ? 2 : pts.length > 25 ? 3 : 4;
    svg += pts.map(p => `<circle cx="${x(p.i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${dotR}" class="tr-dot"/>`).join('');
    let note = '';
    if (P.avg && pts.length >= 5) { const ra = pts.map((p, k) => { const w = pts.slice(Math.max(0, k - 4), k + 1); return { i: p.i, v: w.reduce((a, q) => a + q.v, 0) / w.length }; }).slice(4); svg += `<path d="${ra.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join('')}" class="tr-avg"/>`; }
    if (P.trend) { const f = fit(pts); if (f) { const a = pts[0].i, b = pts[pts.length - 1].i; svg += `<line x1="${x(a)}" y1="${y(f.m * a + f.b)}" x2="${x(b)}" y2="${y(f.m * b + f.b)}" class="tr-trend"/>`;
      const per = f.m * Math.max(1, Math.min(10, pts.length - 1)), span = Math.max(1, Math.min(10, pts.length - 1)), small = Math.abs(f.m * (pts.length - 1)) < (def.pct ? 2 : 2);
      note = small ? `Trend: flat over these ${pts.length} nights.` : `Trend: ${f.m > 0 ? 'up' : 'down'} ${r1(Math.abs(per))}${def.pct ? ' points' : ' pins'} per ${span} nights, over ${pts.length} nights.`; } }
    svg += `<rect x="${PL}" y="0" width="${W - PL - PR}" height="${H}" fill="transparent" class="tr-hit"/><line class="tr-x" x1="0" x2="0" y1="${PT}" y2="${H - PB}" style="display:none"/><circle class="tr-sel" r="5" style="display:none"/>`;
    const last = pts[pts.length - 1];
    return `<div class="panel tr-card" data-k="${def.k}"><div class="tr-h"><b>${def.t}</b><span class="tr-last">${def.fmt ? def.fmt(last.v) : last.v}${def.pct ? '%' : ''} <span class="small dim">last night</span></span></div>
      <svg viewBox="0 0 ${W} ${H}" class="tr-svg" role="img" aria-label="${esc(def.t)} by night, ${pts.length} nights">${svg}</svg>
      <div class="tr-tip small" aria-live="polite">${note || `${pts.length} nights. Tap the chart to see a night.`}</div></div>`;
  }

  // ---------- page ----------
  const DEFS = [
    { k: 'avg', t: 'Average per game', fmt: (v) => r1(v) },
    { k: 'repeat', t: '🔁 Repeatability', pct: 1, none: 'Comes from nights you log in Game Day.' },
    { k: 'eye', t: '👁️ Eyeball score', none: 'Comes from nights you log in Game Day: your mark, the pocket, the exit and the key pin.' },
    { k: 'strike', t: 'Strikes', pct: 1, fmt: (v) => Math.round(v) },
    { k: 'spare', t: 'Spares', pct: 1, fmt: (v) => Math.round(v) },
    { k: 'pocket', t: 'Pocket hits', pct: 1, none: 'Comes from nights you log in Game Day.' },
    { k: 'carry', t: 'Carry (strikes on pocket hits)', pct: 1, none: 'Comes from nights you log in Game Day.' },
    { k: 'series', t: 'Series (3 games)' },
    { k: 'high', t: 'High game' },
  ];
  const ELS = [['Direction', '🎯'], ['Speed', '⚡'], ['Angle', '📐'], ['Revs', '🔄'], ['Roll', '🌀']].map(([k, i]) => ({ k: 'el_' + k, t: `${i} ${k}`, pct: 1, none: 'Comes from nights you log in Game Day.' }));

  function render(box, opts) {
    opts = opts || {};
    const P = prefs(), all = nights();
    if (!all.length) { box.innerHTML = '<div class="panel small">No nights yet. Import your PinPal history (Scores → History) or save a Game Day night.</div>'; return; }
    const opt = (vals, cur, any) => `<option value="">${any}</option>` + vals.map(v => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
    const cnt = (f) => { const m = {}; all.forEach(r => { const k = f(r); if (k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).map(e => e[0]); };
    const years = [...new Set(all.map(r => r.d.slice(0, 4)))].sort().reverse();
    const today = new Date(), cut = (mo) => { const t = new Date(today); t.setMonth(t.getMonth() - mo); return t.toISOString().slice(0, 10); };
    let R = all.filter(r => !P.house || r.h === P.house).filter(r => !P.lanes || r.lanes === P.lanes).filter(r => !P.league || r.lg === P.league);
    if (/^\d{4}$/.test(P.period)) R = R.filter(r => r.d.startsWith(P.period)); else if (P.period) R = R.filter(r => r.d >= cut(Number(P.period)));
    const N = R.length;
    box.innerHTML = `<div class="panel tr-filters">
        <div class="tr-frow">
          <label>Period<select class="input" id="trPeriod"><option value="3"${P.period === '3' ? ' selected' : ''}>Last 3 months</option><option value="6"${P.period === '6' ? ' selected' : ''}>Last 6 months</option><option value="12"${P.period === '12' ? ' selected' : ''}>Last 12 months</option>${years.map(y => `<option value="${y}"${P.period === y ? ' selected' : ''}>${y}</option>`).join('')}<option value=""${!P.period ? ' selected' : ''}>All time</option></select></label>
          <label>House<select class="input" id="trHouse">${opt(cnt(r => r.h), P.house, 'All houses')}</select></label>
          <label>Lanes<select class="input" id="trLanes">${opt(cnt(r => (!P.house || r.h === P.house) ? r.lanes : ''), P.lanes, 'All pairs')}</select></label>
          <label>League<select class="input" id="trLeague">${opt(cnt(r => r.lg), P.league, 'All leagues')}</select></label>
        </div>
        <div class="tr-checks"><label><input type="checkbox" id="trAvg"${P.avg ? ' checked' : ''}/> Running average (last 5 nights)</label><label><input type="checkbox" id="trTrend"${P.trend ? ' checked' : ''}/> Trend line</label></div>
        <div class="small dim">${N} night${N === 1 ? '' : 's'}${N ? `, ${fmtD(R[0].d)} → ${fmtD(R[N - 1].d)}` : ''}. Nights are evenly spaced left to right, the same in every chart, so you can read one under another. The trend line only describes these nights; it doesn't guess ahead.</div>
        <div class="tr-key small"><span><i class="k-line"></i>each night</span><span><i class="k-avg"></i>running average</span><span><i class="k-trend"></i>trend line</span></div>
      </div>
      ${N ? DEFS.map(d => chart(d, R, P, N)).join('') + `<div class="tr-sub"><b>🎳 5 Scoring Elements</b> <span class="small dim">(Game Day nights)</span></div><div class="tr-grid2">${ELS.map(d => chart(d, R, P, N)).join('')}</div>` : '<div class="panel small">No nights match these filters.</div>'}`;
    const set = (k, v) => { const p = prefs(); p[k] = v; if (k === 'house') p.lanes = ''; savePrefs(p); render(box, opts); };
    box.querySelector('#trPeriod').onchange = (e) => set('period', e.target.value);
    box.querySelector('#trHouse').onchange = (e) => set('house', e.target.value);
    box.querySelector('#trLanes').onchange = (e) => set('lanes', e.target.value);
    box.querySelector('#trLeague').onchange = (e) => set('league', e.target.value);
    box.querySelector('#trAvg').onchange = (e) => set('avg', e.target.checked);
    box.querySelector('#trTrend').onchange = (e) => set('trend', e.target.checked);
    // Tap / drag on a chart: the nearest night, with its value, and a link to its review.
    box.querySelectorAll('.tr-card[data-k]').forEach(card => {
      const k = card.dataset.k, def = DEFS.concat(ELS).find(d => d.k === k), svg = card.querySelector('svg'), tip = card.querySelector('.tr-tip');
      const pts = R.map((r, i) => ({ i, v: r[k], r })).filter(p => p.v != null && Number.isFinite(p.v)); if (!svg || pts.length < 2) return;
      const base = tip.innerHTML;
      const pick = (ev) => { const bb = svg.getBoundingClientRect(), vx = (ev.clientX - bb.left) / bb.width * W; const fi = (vx - PL) / (W - PL - PR) * (N - 1);
        const p = pts.reduce((m, q) => Math.abs(q.i - fi) < Math.abs(m.i - fi) ? q : m, pts[0]);
        const dots = svg.querySelectorAll('.tr-dot'), c = dots[pts.indexOf(p)]; if (!c) return;
        const cx = c.getAttribute('cx'), cy = c.getAttribute('cy'), xl = svg.querySelector('.tr-x'), sel = svg.querySelector('.tr-sel');
        xl.setAttribute('x1', cx); xl.setAttribute('x2', cx); xl.style.display = ''; sel.setAttribute('cx', cx); sel.setAttribute('cy', cy); sel.style.display = '';
        tip.innerHTML = `<b>${fmtD(p.r.d)}</b> · ${esc(p.r.h)}${p.r.lanes ? ' ' + esc(p.r.lanes) : ''} · <b>${def.fmt ? def.fmt(p.v) : p.v}${def.pct ? '%' : ''}</b>${p.r.sid && opts.openNight ? ` · <button type="button" class="cl-link" data-open="${esc(p.r.sid)}">Open night</button>` : ''}`;
        const ob = tip.querySelector('[data-open]'); if (ob) ob.onclick = () => opts.openNight(ob.dataset.open); };
      svg.addEventListener('pointerdown', pick); svg.addEventListener('pointermove', (ev) => { if (ev.buttons || ev.pointerType === 'mouse') pick(ev); });
      svg.addEventListener('mouseleave', () => { svg.querySelector('.tr-x').style.display = 'none'; svg.querySelector('.tr-sel').style.display = 'none'; tip.innerHTML = base; });
    });
  }
  root.BTTrends = { render, nights };
})(typeof window !== 'undefined' ? window : globalThis);
