/* Bowling Tool: 🏠 House & pair card (Plan). One look at what has worked here: by game, ball × game, where your feet went,
   conditions, and one clearly-labeled forecast (the only place the app models ahead). Built from your Game Day nights. */
(function (root) {
  'use strict';
  const BT = () => root.BT, E = () => root.BTEyes;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const k = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const avg = (a) => { const v = a.filter(Number.isFinite); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
  const md = (a) => { const v = a.filter(Number.isFinite).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
  const sd = (a) => { const v = a.filter(Number.isFinite); if (v.length < 2) return null; const m = avg(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) * (x - m), 0) / (v.length - 1)); };
  const r0 = (x) => Math.round(x);
  const scoresOf = (s) => (Array.isArray(s.scores) && s.scores.length) ? s.scores : ((s.pinpal && s.pinpal.scores) || []);

  function build(house, lanes, sessions, lefty) {
    const all = (sessions || []).filter(s => s && Array.isArray(s.shots) && s.shots.some(z => z && z.type !== 'gameStart'));
    const at = all.filter(s => { const a = k(s.house), b = k(house); return a && b && (a === b || a.startsWith(b) || b.startsWith(a)); });
    if (!at.length) return null;
    const pairN = lanes ? at.filter(s => s.lanes === lanes) : [];
    const use = pairN.length >= 3 ? pairN : at, scope = pairN.length >= 3 ? 'pair' : 'house';
    const X = (z) => !BT().standingPins(z).length;
    const shotsOf = (s) => (s.shots || []).filter(z => z && z.type !== 'gameStart');
    const gOf = (z) => Number(z.gameNo) || 1;
    // by game vs your overall
    const G = { 1: [], 2: [], 3: [] }, GA = { 1: [], 2: [], 3: [] };
    use.forEach(s => scoresOf(s).forEach((v, i) => { if (G[i + 1] && Number(v)) G[i + 1].push(Number(v)); }));
    all.forEach(s => scoresOf(s).forEach((v, i) => { if (GA[i + 1] && Number(v)) GA[i + 1].push(Number(v)); }));
    const overall = avg([].concat(GA[1], GA[2], GA[3]));
    const byGame = [1, 2, 3].map(g => ({ g, avg: avg(G[g]), n: G[g].length }));
    // ball × game strike %
    const sh = use.flatMap(s => shotsOf(s));
    const allX = sh.length ? sh.filter(X).length / sh.length : 0;
    const balls = {};
    sh.forEach(z => { const b = z.ball || '?', o = balls[b] = balls[b] || { ball: b, n: 0, x: 0, g: { 1: { n: 0, x: 0 }, 2: { n: 0, x: 0 }, 3: { n: 0, x: 0 } } }; o.n++; if (X(z)) o.x++; const c = o.g[Math.min(3, gOf(z))]; c.n++; if (X(z)) c.x++; });
    const grid = Object.values(balls).filter(o => o.n >= 6).sort((a, b) => b.n - a.n).slice(0, 5);
    // where your feet went: median feet per game (and G1's first 3 shots)
    const feet = [1, 2, 3].map(g => ({ g, f: md(sh.filter(z => gOf(z) === g).map(z => Number(z.feet))) })).filter(o => o.f != null);
    const f0 = md(use.map(s => { const a = shotsOf(s).filter(z => gOf(z) === 1).slice(0, 3); return md(a.map(z => Number(z.feet))); }));
    // conditions
    let hb = null; try { hb = E().houseBook(house, scope === 'pair' ? lanes : '', all, lefty); } catch (_e) {}
    const chips = [];
    try { const hr = BT().houseRead ? BT().houseRead(house, '') : ''; const O = BT().houseReadOptions ? BT().houseReadOptions(lefty) : []; const t = (O.find(o => o[0] === hr) || [])[1]; if (hr && t) chips.push({ t: t.replace(/\s*\(.*\)/, ''), k: '' }); } catch (_e) {}
    try { const pn = (use.slice().sort((a, b) => b.savedAt - a.savedAt).find(s => s.pattern) || {}).pattern; const P = BT().lsGet('bt_oil_patterns_v1', []) || []; const p = P.find(x => x.name === pn && x.length); if (p) chips.push({ t: `${p.length} ft · exit ${Math.max(3, Math.round(p.length - 31))}`, k: '' }); } catch (_e) {}
    if (hb && hb.mix) chips.push({ t: 'Carry over/under', k: 'warn' });
    if (hb && hb.cd && hb.cd.signs) chips.push({ t: `Carrydown (${hb.cd.plastic ? 'plastic' : 'urethane'} on pair)`, k: 'warn' });
    if (hb && hb.tough && hb.tough.tough) chips.push({ t: `${hb.tough.tough.l} tougher`, k: '' });
    const ph = sh.filter(z => BT().isPocketHit(z)); if (sh.length >= 20) chips.push({ t: `Pocket ${r0(ph.length / sh.length * 100)}% · carry ${ph.length ? r0(ph.filter(X).length / ph.length * 100) : 0}%`, k: '' });
    // 🔮 forecast (theory): best G1 ball and its usual start, first move timing, a shrunk G1 range
    let fc = null;
    { const g1 = grid.map(o => ({ o, c: o.g[1] })).filter(x => x.c.n >= 4).sort((a, b) => (b.c.x + 0.5) / (b.c.n + 1) - (a.c.x + 0.5) / (a.c.n + 1))[0];
      const ball = g1 ? g1.o.ball : (grid[0] && grid[0].ball);
      const st = ball ? sh.filter(z => z.ball === ball && gOf(z) === 1) : [];
      const line = st.length ? `${md(st.map(z => Number(z.feet)))}/${md(st.map(z => Number(z.arrows)))}` : null;
      const mv = hb && hb.moves && hb.moves.length ? hb.moves : [];
      const mG = mv.length ? r0(avg(mv.map(r => r.mv.g))) : null, mF = mv.length ? r0(avg(mv.map(r => Number(r.mv.f) || 0))) : null;
      const deeper = mv.filter(r => hb.deep(r.mv.d) === 'deeper').length, dir = mv.length ? (deeper * 2 >= mv.length ? (lefty ? 'right' : 'left') : (lefty ? 'left' : 'right')) : null;
      const boards = mv.length ? Math.max(1, r0(avg(mv.map(r => r.mv.boards || 1)))) : null;
      const m = avg(G[1]), s = sd(G[1]), n = G[1].length, base = overall;
      const est = m != null && base != null ? (n * m + 3 * base) / (n + 3) : null, w = Math.min(20, Math.max(10, s || 0));
      fc = { ball, line, mG, mF, dir, boards, lo: est != null ? r0(est - w) : null, hi: est != null ? r0(est + w) : null, n: use.length };
    }
    return { house, lanes, scope, nights: use.length, overall, byGame, grid, allX, feet, f0, chips, fc };
  }

  function html(C, lefty) {
    if (!C) return '';
    const cell = (c, base) => { if (!c || c.n < 3) return '<div class="hc-c hc-na">–</div>'; const p = c.x / c.n, d = p - base; return `<div class="hc-c ${d >= 0.08 ? 'hc-up' : d <= -0.08 ? 'hc-dn' : ''}" title="${c.x} of ${c.n}">${r0(p * 100)}<small>${c.x}/${c.n}</small></div>`; };
    const gb = C.byGame.filter(o => o.avg != null);
    const lo = gb.length ? Math.min(...gb.map(o => o.avg)) : null;
    const games = gb.length ? `<div class="hc-lbl">By game <span class="dim">(vs your Game Day average ${C.overall != null ? r0(C.overall) : "–"})</span></div><div class="hc-games">${gb.map(o => { const d = C.overall != null ? r0(o.avg - C.overall) : 0; return `<div class="hc-g ${d >= 4 ? 'hc-up' : d <= -4 ? 'hc-dn' : ''}${o.avg === lo && gb.length > 1 ? ' hc-lo' : ''}"><div class="hc-gl">G${o.g}</div><div class="hc-gv">${r0(o.avg)} <span>${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d) || ''}</span></div></div>`; }).join('')}</div>` : '';
    const grid = C.grid.length ? `<div class="hc-lbl">Ball × game <span class="dim">(strike %, strikes / shots)</span></div><div class="hc-t"><div></div><div class="hc-h">G1</div><div class="hc-h">G2</div><div class="hc-h">G3</div>${C.grid.map(o => `<div class="hc-b">${esc(o.ball)}</div>${[1, 2, 3].map(g => cell(o.g[g], C.allX)).join('')}`).join('')}</div>` : '';
    let drift = '';
    if (C.feet.length >= 2) {
      const pts = (C.f0 != null ? [{ g: 'start', f: C.f0 }] : []).concat(C.feet.map(o => ({ g: 'G' + o.g, f: o.f })));
      const fs = pts.map(p => p.f), mn = Math.min(...fs), mx = Math.max(...fs), span = Math.max(2, mx - mn), W = 330, x = (i) => 30 + i * (W - 60) / Math.max(1, pts.length - 1), y = (f) => 40 - (f - mn) / span * 28;
      // higher board = deeper (left for a righty): drawn higher on the chart
      drift = `<div class="hc-lbl">Where your feet went <span class="dim">(board; up = ${lefty ? 'right' : 'left'})</span></div><svg viewBox="0 0 ${W} 58" class="hc-svg" role="img" aria-label="Feet by game"><polyline points="${pts.map((p, i) => `${x(i).toFixed(1)},${y(p.f).toFixed(1)}`).join(' ')}" fill="none" stroke="#5fd3b5" stroke-width="2"/>${pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.f).toFixed(1)}" r="3" fill="#5fd3b5"/><text x="${x(i).toFixed(1)}" y="56" text-anchor="middle" class="tr-ax">${p.g} · ${p.f}</text>`).join('')}</svg>`;
    }
    const chips = C.chips.length ? `<div class="hc-chips">${C.chips.map(c => `<span class="hc-chip ${c.k === 'warn' ? 'hc-warn' : ''}">${esc(c.t)}</span>`).join('')}</div>` : '';
    const f = C.fc; const fcH = f && f.ball ? `<div class="hc-fc"><div class="hc-fcl">🔮 Forecast · theory, not history <span class="dim">(${f.n} night${f.n === 1 ? '' : 's'})</span></div>Open ${esc(f.ball)}${f.line ? ` at ${esc(f.line)}` : ''}.${f.mG ? ` Expect your first move ${f.mF ? `around game ${f.mG} frame ${f.mF}` : `in game ${f.mG}`}, about ${f.boards} ${f.dir}.` : ''}${f.lo != null ? ` Likely game 1: ${f.lo}–${f.hi}.` : ''}</div>` : '';
    return `<div class="panel hc"><div class="hc-top"><b>🏠 ${esc(C.house)}${C.scope === 'pair' && C.lanes ? ` · ${esc(C.lanes)}` : ''}</b><span class="small dim">${C.nights} night${C.nights === 1 ? '' : 's'}${C.scope === 'house' && C.lanes ? ` · whole house (under 3 on ${esc(C.lanes)})` : ''}</span></div>${games}${grid}${drift}${chips}${fcH}</div>`;
  }

  root.BTHouseCard = { build, html };
})(typeof window !== 'undefined' ? window : globalThis);
