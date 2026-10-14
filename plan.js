/* Bowling Tool: Pregame Game Plan.
   Builds tonight's plan from PinPal history (BTHistory), Game Day sessions, the arsenal, the bag and the bowler.
   Every line comes from the bowler's own data; a section with too little data says so instead of guessing.
   Exposes window.BTPlan. */
(function (root) {
  'use strict';
  const MIN_HOUSE = 9, MIN_BALL = 6, MIN_PAIR = 6, MIN_SPARE = 15;
  const r1 = (x) => Math.round(x * 10) / 10;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MIRROR = { 1: 1, 2: 3, 3: 2, 4: 6, 5: 5, 6: 4, 7: 10, 8: 9, 9: 8, 10: 7 };
  // Leave signatures for a right-hander (mirrored for lefties).
  const LIGHT_R = ['10', '6-10', '1-2-4-10', '1-2-4-7', '2-4-5-8', '2-8', '1-2-10', '1-2-4-7-10'];
  const HIGH_R = ['4', '4-9', '4-6', '4-6-7-10', '4-6-10', '4-7-10', '4-6-7', '8-10', '4-10', '4-7-9'];
  const mirrorLeave = (k) => k.split('-').map(Number).map(p => MIRROR[p]).sort((a, b) => a - b).join('-');
  // "13-14", "13 & 14", "13/14" → "13-14". The iPhone number pad has no dash, so "1314" → "13-14" (split where the
  // second lane = first + 1) and a single lane "13" or "14" → its pair "13-14".
  const pairKey = (s) => {
    const k = String(s || '').trim().replace(/\s*(?:[\/&,.]|and)\s*|\s+/gi, '-').replace(/[^0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!/^\d+$/.test(k)) return k;
    for (let i = 1; i < k.length; i++) { const a = Number(k.slice(0, i)), b = Number(k.slice(i)); if (k[i] !== '0' && b === a + 1) return `${a}-${b}`; }
    const n = Number(k); if (k.length <= 3 && n > 0) return n % 2 ? `${n}-${n + 1}` : `${n - 1}-${n}`;
    return k;
  };
  const fmtDate = (d) => { if (!d) return ''; const [y, m, dd] = d.split('-').map(Number); return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${dd}, ${y}`; };
  const BT = () => root.BT, H = () => root.BTHistory;

  function bowler() { try { return BT().lsGet(BT().KEYS.BOWLER, {}) || {}; } catch (_e) { return {}; } }
  function isLefty(b) { return String(b.handedness || b.hand || 'R').toUpperCase().startsWith('L'); }
  function arsenalNames() {
    try { const c = BT().lsGet(BT().KEYS.CSV_CACHE, null); return BT().withCustomBalls((c && c.rows) || []).map(r => BT().ballName(r)).filter(Boolean); } catch (_e) { return []; }
  }
  function arsenalRows() {
    try { const c = BT().lsGet(BT().KEYS.CSV_CACHE, null); return BT().withCustomBalls((c && c.rows) || []).filter(r => BT().ballName(r) && !BT().isRetired(r)); } catch (_e) { return []; }
  }
  // Ball traits used to look for patterns: cover family, core, layout type, Barnes box.
  function traitsOf(row, b) {
    const cov = String(BT().ballCover(row) || '').toLowerCase();
    const cover = /ure/.test(cov) ? 'Urethane' : /pearl/.test(cov) ? 'Pearl' : /hybrid/.test(cov) ? 'Hybrid' : /solid/.test(cov) ? 'Solid' : '';
    const coreS = String(BT().getField(row, ['Core'], '') || '').toLowerCase();
    const core = /asym/.test(coreS) ? 'Asymmetric' : /sym/.test(coreS) ? 'Symmetric' : '';
    const v = BT().motionVector(row, b);
    const layout = { short: 'Short pin', long: 'Long pin', control: 'Pin down', benchmark: 'Benchmark' }[v.layoutType] || '';
    let box = '', x = null;
    try { const p = root.BTChart.place([row], b)[0]; box = root.BTChart.label(p.rowKey); x = p.x; } catch (_e) {}
    return { cover, core, layout, box, x, v };
  }

  // Recommended bag for this house / pair: how have your covers, cores and layouts done here, then pick N balls
  // that score well AND cover different timings (Early → Late), so there's a ball to start with and one to move to.
  function recommendBag(ctx) {
    const { hist, G, lanes, S, b, count, lean, today } = ctx;
    const rows = arsenalRows(); if (!rows.length) return null;
    const names = rows.map(r => BT().ballName(r));
    const map = hist.ballMap(names);
    const byName = {}; rows.forEach(r => { byName[BT().ballName(r)] = { row: r, t: traitsOf(r, b) }; });
    const pairG = lanes ? G.filter(g => g.lanes === lanes) : [];
    const K = 8, MIN_OWN = 3, TR = ['cover', 'core', 'layout', 'box'];
    const LBL = { cover: 'Cover', core: 'Core', layout: 'Layout', box: 'Barnes box' };
    const tag = (gs) => gs.map(g => { const ar = map[hist.mainBall(g)]; return ar && byName[ar] ? { g, ar, t: byName[ar].t } : null; }).filter(Boolean);
    // Trait patterns: average by cover / core / layout / box, pulled toward the overall average for small groups.
    function patterns(gs) {
      const tg = tag(gs), base = gs.length ? hist.summary(gs).avg : null, eff = {}, lines = [];
      if (tg.length < 12 || base == null) return { tg, base, eff, lines };
      for (const tr of TR) {
        const m = {}; tg.forEach(x => { const k = x.t[tr]; if (k) (m[k] = m[k] || []).push(x.g); });
        const groups = Object.entries(m).filter(([, x]) => x.length >= 6).map(([k, x]) => { const s = hist.summary(x); return { k, n: x.length, avg: s.avg, strike: s.strike, eff: (s.avg - base) * x.length / (x.length + K) }; }).sort((p, q) => q.avg - p.avg);
        eff[tr] = {}; groups.forEach(gp => { eff[tr][gp.k] = gp; });
        if (groups.length >= 2 && groups[0].avg - groups[groups.length - 1].avg >= 5) lines.push(`<b>${LBL[tr]}:</b> ${groups.map(gp => `${esc(gp.k)} ${gp.avg} (${gp.n} games, ${gp.strike}% strikes)`).join(' · ')}.`);
      }
      return { tg, base, eff, lines };
    }
    const H = patterns(G), P = pairG.length >= 12 ? patterns(pairG) : null;
    const items = [];
    const pairNote = lanes ? (P && P.tg.length >= 12 ? '' : ` Lanes ${lanes.replace('-', ' & ')} have ${pairG.length} game${pairG.length === 1 ? '' : 's'}${pairG.length ? ` (${tag(pairG).length} with balls in your arsenal)` : ''}, so patterns come from the whole house and the pair only adjusts them.`) : '';
    items.push(`${H.tg.length} of ${G.length} games here were thrown with balls matched to your arsenal.${pairNote}`);
    if (P && P.lines.length) { items.push(`On lanes ${lanes.replace('-', ' & ')}:`); P.lines.forEach(l => items.push(l)); }
    if (H.lines.length) { if (P && P.lines.length) items.push('Across the house:'); H.lines.forEach(l => items.push(l)); }
    if (!H.lines.length && !(P && P.lines.length)) items.push(H.tg.length >= 12 ? 'No strong cover, core or layout pattern here: your results are about the same across them.' : 'Not enough games with your current balls here to read cover / core / layout patterns yet. Matching more names under Scores → History → Ball names helps.');
    // Score: what the traits predict at the house (+ pair where it has data), blended with the ball's own record.
    const yrCut = new Date(Date.parse(today) - 365 * 864e5).toISOString().slice(0, 10);
    const predict = (pt, t) => { if (!pt || pt.base == null) return null; const e = TR.map(tr => pt.eff[tr] && pt.eff[tr][t[tr]] ? pt.eff[tr][t[tr]].eff : null).filter(x => x != null); return { v: pt.base + (e.length ? e.reduce((a, x) => a + x, 0) / e.length : 0), k: e.length }; };
    const scored = names.map(n => {
      const t = byName[n].t, pps = Object.keys(map).filter(p => map[p] === n);
      const ph = predict(H, t); const pred = ph ? ph.v : (S ? S.avg : 0);
      const own = G.filter(g => pps.includes(hist.mainBall(g))), os = own.length >= MIN_OWN ? hist.summary(own) : null;
      const rec = own.filter(g => g.d >= yrCut), rs = rec.length >= MIN_OWN && rec.length < own.length ? hist.summary(rec) : null;
      let score = pred;
      if (os) { const sh = (os.avg * os.n + pred * K) / (os.n + K); score = rs ? (sh + (rs.avg * rs.n + pred * K) / (rs.n + K)) / 2 : sh; }
      // Pair adjustment: how this ball (or its traits) did on the pair compared with the pair's own average.
      let pAdj = 0, po = null;
      if (pairG.length >= 6) {
        const pbase = hist.summary(pairG).avg, mine = pairG.filter(g => pps.includes(hist.mainBall(g)));
        if (mine.length >= MIN_OWN) { po = hist.summary(mine); pAdj += (po.avg - pbase) * mine.length / (mine.length + K) * 0.6; }
        const pp = P ? predict(P, t) : null; if (pp && pp.k) pAdj += (pp.v - P.base) * 0.4;
      }
      return { n, t, os, rs, po, pred, predK: ph ? ph.k : 0, score: score + pAdj };
    }).sort((p, q) => q.score - p.score);
    if (!scored.length) return null;
    // Pick: the best ball first, then alternate sides of it (what the lanes need first), each at least 10 points
    // apart on the Early → Late scale from everything picked, so every ball has its own job.
    const picked = [scored[0]], x0 = scored[0].t.x ?? 50;
    const order = lean === 1 ? ['earlier', 'later'] : ['later', 'earlier'];
    while (picked.length < Math.min(count, scored.length)) {
      const want = order[(picked.length - 1) % 2];
      const ok = scored.filter(s => !picked.includes(s) && s.t.x != null && Math.min(...picked.map(p => Math.abs((p.t.x ?? 50) - s.t.x))) >= 10);
      const side = ok.filter(s => want === 'earlier' ? s.t.x < x0 : s.t.x > x0);
      const pool = side.length ? side : ok; if (!pool.length) break;
      pool.sort((p, q) => (q.score + (picked.some(z => z.t.box === q.t.box) ? 0 : 2)) - (p.score + (picked.some(z => z.t.box === p.t.box) ? 0 : 2)));
      picked.push(pool[0]);
    }
    const first = picked[0];
    const ordered = picked.slice().sort((p, q) => (p.t.x ?? 50) - (q.t.x ?? 50));
    const role = (p) => p === first ? 'Start with' : (p.t.x ?? 50) < x0 ? 'Earlier / more ball' : 'Later / cleaner (transition)';
    const gm = (n) => `${n} game${n === 1 ? '' : 's'}`;
    const why = (p) => [p.os ? `${p.os.avg} over ${gm(p.os.n)} here${p.rs ? ` (${p.rs.avg} in the last 12 months)` : ''}` : `${p.predK ? `its cover / core / layout average about ${Math.round(p.pred)} here` : 'no record here yet'}`, p.po ? `${p.po.avg} over ${gm(p.po.n)} on this pair` : ''].filter(Boolean).join('; ');
    items.push('<b>The bag (Early → Late):</b>');
    ordered.forEach(p => items.push(`<b>${role(p)}: ${esc(p.n)}</b> · ${[p.t.cover, p.t.core && p.t.core + ' core', p.t.layout, p.t.box].filter(Boolean).map(esc).join(', ')}. ${why(p)}.`));
    if (picked.length < count) items.push(`Only ${picked.length} of your balls read far enough apart to be worth bringing; more would overlap.`);
    items.push('Plus your spare ball.');
    return { items, picked: ordered.map(p => p.n), first: first.n };
  }

  function sets() { try { return BT().lsGet(BT().KEYS.ARSENAL_SETS, []) || []; } catch (_e) { return []; } }
  function setBalls(name) {
    const s = sets().find(x => x.name === name); if (!s || !Array.isArray(s.balls)) return [];
    return s.balls.map(b => typeof b === 'string' ? b : (b && b.name) || '').map(x => String(x).trim()).filter(Boolean).filter(n => !BT().isRetired(n));
  }
  function patterns() { try { return BT().lsGet(BT().KEYS.OIL_PATTERNS, []) || []; } catch (_e) { return []; } }
  function sessionsAt(house) {
    const k = String(house || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let all = []; try { all = BT().lsGet(BT().KEYS.GAME_SESSIONS, []) || []; } catch (_e) {}
    return all.filter(s => { const h = String(s.house || '').toLowerCase().replace(/[^a-z0-9]/g, ''); return h && k && (h === k || h.startsWith(k) || k.startsWith(h)); });
  }

  // Houses the bowler can pick: PinPal houses (by games) + houses saved in the app.
  function houseOptions() {
    const out = [];
    if (H() && H().has()) H().groupBy(H().filter({}), 'house', 1).sort((a, b) => b.n - a.n).forEach(r => out.push({ name: r.key, n: r.n }));
    try { (BT().lsGet(BT().KEYS.HOUSES, []) || []).forEach(h => { const n = typeof h === 'string' ? h : (h && h.name) || ''; if (n && !out.some(o => o.name.toLowerCase() === n.toLowerCase())) out.push({ name: n, n: 0 }); }); } catch (_e) {}
    return out;
  }

  function build(opts) {
    opts = opts || {};
    const b = bowler(), lefty = isLefty(b);
    const hist = H() && H().has() ? H() : null;
    const house = hist ? (hist.matchHouse(opts.house) || '') : '';
    const houseLabel = house || String(opts.house || '').trim();
    const lanes = pairKey(opts.lanes);
    const event = opts.event === 'tournament' ? 'tournament' : 'league';
    const today = opts.date || new Date().toISOString().slice(0, 10);
    const sess = sessionsAt(houseLabel);
    const out = { title: `Game Plan: ${houseLabel || 'pick a house'}`, sub: [], sections: [], house: houseLabel, lefty };
    const sec = (icon, h, items, lead) => { if ((items && items.length) || lead) out.sections.push({ icon, h, lead: lead || '', items: items || [] }); };

    const G = house ? hist.filter({ house }) : [];
    out.games = G.length;
    if (lanes) out.sub.push(`Lanes ${lanes.replace('-', ' & ')}`);
    if (opts.league) out.sub.push(opts.league);
    out.sub.push(event === 'tournament' ? 'Tournament' : 'League night');
    out.sub.push(fmtDate(today));

    if (!houseLabel) { out.empty = 'Pick where you\'re bowling.'; return out; }
    if (G.length < MIN_HOUSE && !sess.length) {
      out.empty = hist ? `${G.length ? `Only ${G.length}` : 'No'} PinPal game${G.length === 1 ? '' : 's'} at ${esc(houseLabel)} so far, so there's no house history to plan from yet. Use the general starting plan below and log tonight in Game Day.` : 'Import your PinPal history (Scores → History) or log nights in Game Day, and Coach can plan from them.';
    }

    const all = hist ? hist.filter({}) : [];
    const S = G.length ? hist.summary(G) : null;
    const life = all.length ? hist.summary(all) : null;

    // ---- Where you stand
    if (G.length >= MIN_HOUSE) {
      const items = [];
      const others = hist.groupBy(all, 'house', 30).filter(r => r.key !== house).sort((a, b) => b.n - a.n).slice(0, 4);
      const rank = others.length ? (S.avg < Math.min(...others.map(o => o.avg)) - 3 ? 'toughest' : S.avg > Math.max(...others.map(o => o.avg)) + 3 ? 'best' : '') : '';
      items.push(`${rank ? `${esc(house)} is your <b>${rank}</b> regular house: ` : `${esc(house)}: `}<b>${S.avg}</b> average over ${S.n} games, ${S.strike}% strikes, ${S.spare}% spares${others.length ? ` (${others.map(o => `${esc(o.key.replace(/ Lanes?$/, ''))} ${o.avg}`).join(', ')})` : ''}.`);
      // This season = the latest league here (6+ games), else the last 12 months.
      const latest = G.slice().sort((a, b) => (a.d < b.d ? 1 : -1))[0];
      let season = latest && latest.lg ? G.filter(g => g.lg === latest.lg) : [];
      let seasonLabel = latest && latest.lg ? `This season (${esc(latest.lg)})` : '';
      if (season.length < 6) { const cut = new Date(Date.parse(today) - 365 * 864e5).toISOString().slice(0, 10); season = G.filter(g => g.d >= cut); seasonLabel = 'The last 12 months'; }
      if (season.length >= 6 && season.length < G.length) {
        const s2 = hist.summary(season), d = r1(s2.avg - S.avg);
        items.push(`${seasonLabel}: <b>${s2.avg}</b> over ${s2.n} games, ${s2.strike}% strikes${Math.abs(d) >= 4 ? ` (${d > 0 ? '+' : ''}${d} vs your ${esc(house)} average)` : ''}.`);
        out.season = { games: season, label: seasonLabel, sum: s2 };
      }
      const lastDate = latest && latest.d; if (lastDate) { const last = G.filter(g => g.d === lastDate).sort((a, b) => a.gn - b.gn); items.push(`Last time here (${fmtDate(lastDate)}${last[0].lanes ? `, lanes ${last[0].lanes.replace('-', ' & ')}` : ''}): ${last.map(g => g.s).join(', ')}.`); }
      const gm = hist.groupBy(G, 'gn', 6).filter(r => /Game [123]$/.test(r.key)).sort((a, b) => a.key.localeCompare(b.key));
      if (gm.length >= 2) {
        const spread = Math.max(...gm.map(r => r.avg)) - Math.min(...gm.map(r => r.avg));
        const d31 = r1(gm[gm.length - 1].avg - gm[0].avg);
        if (spread < 4) items.push(`Games 1, 2 and 3 all average about ${Math.round(S.avg)} here, so the lanes changing isn't the problem. <b>The start is: get the right ball and line from frame 1.</b>`);
        else if (d31 <= -5) items.push(`Your last game here averages <b>${Math.abs(d31)} pins below game 1</b> (${gm.map(r => `G${r.key.slice(5)} ${r.avg}`).join(', ')}). The lanes transition on you: plan your first move early.`);
        else if (d31 >= 5) items.push(`You finish stronger than you start here (${gm.map(r => `G${r.key.slice(5)} ${r.avg}`).join(', ')}). Use practice to find the line faster.`);
        else items.push(`By game: ${gm.map(r => `G${r.key.slice(5)} ${r.avg}`).join(', ')}.`);
        out.flat = spread < 4; out.drop = d31 <= -5;
      }
      sec('📊', 'Where you stand', items);
    }

    // ---- What the lanes are telling you (leave signatures here vs everywhere)
    let lean = 0; // +1 arriving weak (needs more), -1 arriving strong (needs less)
    if (G.length >= 30 && all.length > G.length) {
      const LIGHT = lefty ? LIGHT_R.map(mirrorLeave) : LIGHT_R, HIGH = lefty ? HIGH_R.map(mirrorLeave) : HIGH_R;
      const lvH = hist.leaves(G, 400), lvA = hist.leaves(all, 600);
      const rate = (lv, keys, n) => keys.reduce((a, k) => a + ((lv.find(x => x.leave === k) || {}).n || 0), 0) / n;
      const lh = rate(lvH, LIGHT, G.length), la = rate(lvA, LIGHT, all.length), hh = rate(lvH, HIGH, G.length), ha = rate(lvA, HIGH, all.length);
      const items = [];
      // The single most over-represented signature leave (5+ times here).
      const sig = [...LIGHT.map(k => [k, 'light']), ...HIGH.map(k => [k, 'high'])].map(([k, t]) => { const h = lvH.find(x => x.leave === k), a = lvA.find(x => x.leave === k); return h && a && h.n >= 8 && h.n / G.length >= 0.08 ? { k, t, h: h.n / G.length, a: a.n / all.length, pct: h.pct } : null; }).filter(Boolean).sort((x, y) => (y.h / y.a) - (x.h / x.a))[0];
      const washout = lefty ? mirrorLeave('1-2-4-10') : '1-2-4-10';
      const nm = (k) => k === washout ? `${k} washout` : k === '10' || k === '7' ? `${k} pin` : k;
      if (lh > la * 1.12 && lh - la > 0.08 && lh / la > hh / Math.max(ha, 0.01)) {
        lean = 1;
        items.push(`Your leaves here point to the ball <b>arriving weak</b>: light-hit leaves come up ${r1(lh)} a game here vs ${r1(la)} everywhere else.`);
      } else if (hh > ha * 1.12 && hh - ha > 0.06) {
        lean = -1;
        items.push(`Your leaves here point to the ball <b>arriving too strong</b> (high hits): ${r1(hh)} a game here vs ${r1(ha)} everywhere else.`);
      } else items.push('Your leaves here look like your leaves everywhere else: no strong high or light signature. Read the first few shots before deciding.');
      if (sig && sig.h / sig.a >= 1.4) items.push(`The ${nm(sig.k)} shows up <b>${r1(sig.h / sig.a)}×</b> as often here as anywhere else (${sig.h.toFixed(2)} a game vs ${sig.a.toFixed(2)}).`);
      if (out.season && out.season.games.length >= 6) {
        const lvS = hist.leaves(out.season.games, 60).filter(l => LIGHT.concat(HIGH).includes(l.leave) && l.n >= 4).slice(0, 3);
        if (lvS.length) items.push(`${out.season.label.replace(/ \(.*\)$/, '')}: ${lvS.map(l => `${nm(l.leave)} ${l.pct}% made (${l.n})`).join(', ')}.`);
      }
      // Game Day pocket reads at this house back it up (or not).
      const shots = sess.flatMap(s => s.shots || []).filter(s => s && s.type !== 'gameStart');
      const hi = shots.filter(s => /high|Missed left/.test(s.pocket || '')).length, lt = shots.filter(s => /light|Missed right/.test(s.pocket || '')).length;
      if (hi + lt >= 8) items.push(`Game Day reads here: ${hi} high, ${lt} light${(lean === 1 && lt > hi) || (lean === -1 && hi > lt) ? ', which agrees' : ''}.`);
      if (lean === 1) items.push('<b>Start with more ball, not less.</b>');
      if (lean === -1) items.push('<b>Start with a smoother, later ball and be ready to move left.</b>');
      sec('🛣️', 'What the lanes are telling you', items);
    }
    out.lean = lean;

    // ---- Ball
    const arsenal = arsenalNames();
    const bag = opts.setName ? setBalls(opts.setName) : [];
    if (G.length >= MIN_HOUSE) {
      const map = hist.ballMap(arsenal);
      const owned = (pp) => { const a = map[pp]; return a && !BT().isRetired(a) ? a : ''; };
      // Rank: all-time average here, pulled toward the house average for small samples, blended 50/50 with the
      // last 12 months when the ball has 3+ recent games here (so a ball that's fallen off doesn't lead).
      const K = 6, shrunk = (avg, n) => (avg * n + S.avg * K) / (n + K);
      const yrCut = new Date(Date.parse(today) - 365 * 864e5).toISOString().slice(0, 10);
      const lately = (r) => { const gs = G.filter(g => g.d >= yrCut && hist.mainBall(g) === r.key); return gs.length >= 3 && gs.length < r.n ? hist.summary(gs) : null; };
      const score = (r) => { const a = shrunk(r.avg, r.n), l = lately(r); return l ? (a + shrunk(l.avg, l.n)) / 2 : a; };
      const byBall = hist.groupBy(G, 'ball', MIN_BALL).sort((a, b) => score(b) - score(a));
      const items = [];
      let pool = byBall.map(r => ({ ...r, ar: owned(r.key) })).filter(r => r.ar || !arsenal.length);
      if (bag.length) { const inBag = pool.filter(r => bag.includes(r.ar)); if (inBag.length) pool = inBag; else items.push(`None of tonight's bag (${bag.map(esc).join(', ')}) has ${MIN_BALL}+ games here, so these come from your whole arsenal.`); }
      const recentCut = out.season ? out.season.games : [];
      const usedRecently = new Set(recentCut.map(g => hist.mainBall(g)));
      if (pool.length) {
        const first = pool[0], fl = lately(first);
        out.firstBall = first.ar || first.key;
        items.push(`<b>First ball: ${esc(first.ar || first.key)}.</b> Strongest record here: ${first.avg} over ${first.n} games, ${first.strike}% strikes${fl ? `; ${fl.avg} in its ${fl.n} games here in the last 12 months` : ''}${recentCut.length && !usedRecently.has(first.key) ? `. <b>You haven't thrown it ${out.season.label.toLowerCase().startsWith('this season') ? 'this season' : 'in the last 12 months'}.</b>` : '.'}`);
        const second = pool[1];
        if (second) {
          const rs = lately(second);
          items.push(`<b>Backup: ${esc(second.ar || second.key)}</b> (${second.avg} over ${second.n} games${rs ? `; ${rs.avg} in its ${rs.n} games here in the last 12 months` : ''}).`);
        }
        const avoid = hist.groupBy(G, 'ball', 4).filter(r => r.avg <= S.avg - 12 && owned(r.key) && (!bag.length || bag.includes(owned(r.key)))).sort((a, b) => a.avg - b.avg).slice(0, 2);
        if (avoid.length) items.push(`Avoid opening with ${avoid.map(r => `${esc(owned(r.key))} (${r.avg} over ${r.n})`).join(' or ')}: ${avoid.length > 1 ? 'both have' : 'it has'} struggled here.`);
      } else if (byBall.length) items.push(`Your best balls here (${byBall.slice(0, 3).map(r => `${esc(r.key)} ${r.avg}`).join(', ')}) aren't matched to balls in your arsenal yet. Match them under Scores → History → Ball names.`);
      if (bag.length && pool.length) {
        const rows = bag.map(n => { const pps = Object.keys(map).filter(p => map[p] === n); const gs = G.filter(g => pps.includes(hist.mainBall(g))); return { n, s: gs.length ? hist.summary(gs) : null }; });
        const none = rows.filter(x => !x.s).map(x => x.n);
        if (none.length) items.push(`No games here matched to ${none.map(esc).join(", ")}. If PinPal calls it something else, match it under Scores → History → Ball names.`);
      }
      sec('🎳', 'Ball', items);
    } else if (bag.length) sec('🎳', 'Ball', [`Tonight's bag: ${bag.map(esc).join(', ')}. No history here yet to rank them; start with the ball that matches the pattern length and adjust from your first reads.`]);

    // ---- Recommended bag (count balls) for this house / pair
    if (opts.count && G.length >= MIN_HOUSE && hist) {
      try {
        const rb = recommendBag({ hist, G, lanes, S, b, count: Math.max(1, Math.min(6, Number(opts.count) || 3)), lean, today });
        if (rb) { sec('🎒', `Your ${Math.max(1, Math.min(6, Number(opts.count) || 3))}-ball bag for ${lanes ? 'lanes ' + lanes.replace('-', ' & ') : 'this house'}`, rb.items); out.recBag = rb.picked; }
      } catch (e) { console.error(e); }
    }

    // ---- Starting line
    {
      const items = [];
      const pat = (opts.patternName && patterns().find(p => p.name === opts.patternName)) || null;
      const len = Number(opts.patLen) || (pat && Number(pat.length)) || null;
      // Game Day: the line that opened game 1 last time, and the line in the best game here.
      const withLine = sess.map(s => ({ s, shots: (s.shots || []).filter(x => x && x.type !== 'gameStart' && Number.isFinite(x.feet) && Number.isFinite(x.arrows)).slice().reverse() })).filter(x => x.shots.length);
      if (withLine.length) {
        const last = withLine[0], f = last.shots[0], end = last.shots[last.shots.length - 1];
        const d = new Date(last.s.savedAt || f.at || Date.now()).toISOString().slice(0, 10);
        items.push(`Game Day, ${fmtDate(d)}: you started at slide ${f.feet}, target ${f.arrows}${Number.isFinite(f.bp) ? `, breakpoint ${f.bp}` : ''}${f.ball ? ` with ${esc(f.ball)}` : ''} and finished at slide ${end.feet}, target ${end.arrows}${Number.isFinite(end.bp) ? `, breakpoint ${end.bp}` : ''}.`);
      }
      const lines = G.filter(g => g.lines && g.lines.length).sort((a, b) => (a.d < b.d ? 1 : -1));
      if (lines.length) {
        const seen = []; lines.forEach(g => g.lines.forEach(l => { const k = l.join('/'); if (!seen.some(x => x.k === k) && seen.length < 3) seen.push({ k, l, d: g.d }); }));
        const yr = lines[0].d.slice(0, 4);
        items.push(`Lines in your PinPal notes here (latest ${yr}): ${seen.map(x => `${x.l[0]} over ${x.l[1]}`).join(', ')}.${Number(yr) < Number(today.slice(0, 4)) - 1 ? ' Older lines with different balls: use them as a reference only.' : ''}`);
      }
      if (len) items.push(`Rule of 31: a ${len} ft pattern puts your breakpoint near <b>board ${Math.max(1, Math.round(len - 31))}</b>. Line your slide, target and breakpoint up through it (Game Day's line check does the math).`);
      else items.push('Rule of 31: pattern length − 31 = breakpoint board. If the house shot is around 40 ft, that\'s near <b>board 9</b>. Confirm it in practice before you move.');
      items.push('Alignment check before shot 1: slide finish (inside of your slide foot), target, breakpoint, all on one line.');
      sec('🎯', 'Starting line', items);
    }

    // ---- If / then
    {
      const fb = out.firstBall ? esc(out.firstBall) : 'your first ball';
      const items = [];
      if (lean === 1) {
        items.push('<b>Light hits keep coming</b> (10s, washouts, buckets): don\'t chase it with your feet first. Play a stronger line in, or keep ' + fb + ' and move right 1–2.');
        items.push('<b>' + fb + ' reads early</b> (high, left of the pocket, on shots where you hit your mark): move 2 left with your feet and 1 with your eyes. Still early: go to the backup.');
      } else if (lean === -1) {
        items.push('<b>High hits</b> (4 pins, splits) on good shots: move 2 left and 1 with your eyes, or go to a smoother, later ball.');
        items.push('<b>Ball starts going long</b>: come back right half the move, or go to the stronger ball.');
      } else {
        items.push('<b>Reads early</b> (high, left of the pocket, on shots where you hit your mark): 2 left with your feet, 1 with your eyes.');
        items.push('<b>Goes long</b> (light, right of the pocket): 2 right and 1, or a stronger ball.');
      }
      items.push('<b>Hitting the pocket but not carrying</b>: change ball or surface. Don\'t move your feet.');
      items.push('<b>Missed your mark</b>: that\'s you, not the lane. Repeat the shot.');
      const mv = sess.map(s => s.summary && s.summary.moves && s.summary.moves.text).filter(Boolean)[0];
      if (mv) items.push(`Last Game Day night here: ${esc(mv)}`);
      if (out.drop) items.push('Your scores drop as the night goes here: make your first move a frame early rather than a frame late.');
      sec('🔀', 'If / then', items);
    }

    // ---- Spares
    if (G.length >= MIN_HOUSE) {
      const lv = hist.leaves(G, 200);
      const singles = lv.filter(l => l.n >= MIN_SPARE && !l.leave.includes('-')).map(l => ({ ...l, miss: l.n - l.made })).sort((a, b) => b.miss - a.miss);
      const lifeLv = hist.leaves(all, 400);
      const items = [];
      const top = singles[0];
      if (top && top.pct < 85) {
        const lifeTop = lifeLv.find(x => x.leave === top.leave);
        items.push(`<b>${top.leave} pin: ${top.pct}% here</b> (${top.made} of ${top.n})${lifeTop && lifeTop.pct - top.pct >= 3 ? ` vs ${lifeTop.pct}% everywhere` : ''}. Your most expensive spare here: each one converted is worth about 10 pins. <b>Make it tonight's spare practice.</b>`);
      }
      const combos = lv.filter(l => l.n >= MIN_SPARE && l.leave.includes('-') && l.pct < 65 && l.pct >= 20).sort((a, b) => (b.n - b.made) - (a.n - a.made)).slice(0, 2);
      combos.forEach(c => items.push(`${c.leave}: ${c.pct}% (${c.made} of ${c.n}).`));
      if (S) items.push(`Single-pin spares here: ${S.single}% · all spares: ${S.spare}%.`);
      sec('🧹', 'Spares', items);
    }

    // ---- Lanes
    if (G.length >= MIN_HOUSE) {
      const items = [];
      const pairs = hist.groupBy(G, 'lanes', MIN_PAIR).sort((a, b) => b.avg - a.avg);
      if (lanes) {
        const L = G.filter(g => g.lanes === lanes);
        if (L.length >= MIN_PAIR) {
          const s = hist.summary(L), d = r1(s.avg - S.avg);
          items.push(`Lanes ${lanes.replace('-', ' & ')}: <b>${s.avg}</b> over ${s.n} games (${Math.abs(d) < 3 ? 'about your house average' : `${d > 0 ? '+' : ''}${d} vs your house average`}), ${s.strike}% strikes.`);
          const st = hist.groupBy(L, 'start', 3).sort((a, b) => b.avg - a.avg);
          if (st.length === 2 && st[0].avg - st[1].avg >= 6) items.push(`Starting on ${st[0].key}: ${st[0].avg} vs starting on ${st[1].key}: ${st[1].avg}.`);
        } else items.push(`Only ${L.length} game${L.length === 1 ? '' : 's'} on lanes ${lanes.replace('-', ' & ')} so far: not enough to read.`);
      }
      if (pairs.length >= 3) items.push(`Best pairs here: ${pairs.slice(0, 2).map(r => `${r.key.replace('-', ' & ')} (${r.avg})`).join(', ')}. Toughest: ${pairs.slice(-2).reverse().map(r => `${r.key.replace('-', ' & ')} (${r.avg})`).join(', ')}.`);
      if (!lanes && pairs.length) items.push('Enter tonight\'s pair to see your record on it.');
      sec('↔️', 'Lanes', items);
    }

    // ---- Tournament: practice plan
    if (event === 'tournament') {
      sec('⏱️', 'Practice session', [
        `2 shots with ${out.firstBall ? esc(out.firstBall) : 'your first ball'} on the starting line. Find the breakpoint before you move.`,
        '1 shot with the backup on the same line, to see the difference.',
        'Last 2 shots: your two most-missed spares.',
      ]);
    }

    // ---- Focus
    sec('🧠', 'Focus', [
      'Hit your mark; after 15 feet you only observe.',
      lean === 1 ? 'Watch the exit off the deck: is it arriving weak? That\'s the read tonight.' : lean === -1 ? 'Watch where it reads: early means move left before it costs you.' : 'Watch the exit off the deck: it tells you ball vs line.',
    ]);

    out.basedOn = [G.length ? `${G.length} PinPal games at ${house}` : '', sess.length ? `${sess.length} Game Day night${sess.length === 1 ? '' : 's'} here` : '', arsenal.length ? `${arsenal.length} balls in your arsenal` : '', bag.length ? `bag "${opts.setName}"` : ''].filter(Boolean);
    return out;
  }

  // Plain text (for sharing / copying).
  function toText(p) {
    const strip = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    const lines = [p.title, p.sub.join(' · '), ''];
    if (p.empty) lines.push(strip(p.empty), '');
    p.sections.forEach(s => { lines.push(`${s.icon} ${s.h.toUpperCase()}`); if (s.lead) lines.push(strip(s.lead)); s.items.forEach(i => lines.push('• ' + strip(i))); lines.push(''); });
    if (p.basedOn && p.basedOn.length) lines.push('Based on ' + p.basedOn.join(', ') + '.');
    return lines.join('\n');
  }

  root.BTPlan = { build, toText, houseOptions, sets, patterns, pairKey };
})(typeof window !== 'undefined' ? window : globalThis);
