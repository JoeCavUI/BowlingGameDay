/* Bowling Tool — History (imported PinPal games): storage, queries and insights for Scores + Coach.
   Needs BTPinPal (pinpal.js) for frame stats. Exposes window.BTHistory. */
(function (root) {
  'use strict';
  const KEY = 'bt_history_v1';
  const MAP_KEY = 'bt_history_ballmap_v1';
  let cache = null;

  function load() {
    if (cache) return cache;
    try { cache = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_e) { cache = null; }
    return cache;
  }
  function save(h) { localStorage.setItem(KEY, JSON.stringify(h)); cache = h; }
  function clear() { localStorage.removeItem(KEY); cache = null; }
  function has() { const h = load(); return !!(h && h.games && h.games.length); }

  // ---------- ball names: PinPal → your arsenal ----------
  const norm = (s) => String(s || '').toLowerCase()
    .replace(/\(.*?\)/g, ' ')          // (Gone), (pin down)…
    .replace(/\s-\s.*$/, ' ')          // "HyRoad 40 - 5 5/8" x 3 1/2""
    .replace(/\s\d+(\s\d+\/\d+)?\s*["”″]\s*(pin)?/g, ' ') // 5" pin, 5 5/8"
    .replace(/["'’`.,]/g, ' ').replace(/\s+/g, ' ').trim();
  function ballMap(arsenalNames) {
    let saved = {}; try { saved = JSON.parse(localStorage.getItem(MAP_KEY) || '{}') || {}; } catch (_e) {}
    const h = load(); const out = {};
    const byNorm = {}; (arsenalNames || []).forEach(n => { byNorm[norm(n)] = n; });
    (h ? h.balls : []).forEach(pp => {
      if (Object.prototype.hasOwnProperty.call(saved, pp)) { out[pp] = saved[pp]; return; }
      const k = norm(pp);
      if (byNorm[k]) { out[pp] = byNorm[k]; return; }
      // "Zen Master" in PinPal vs "Zen Master #1" in the arsenal: match only when there's exactly one.
      const numbered = (arsenalNames || []).filter(n => norm(n).startsWith(k + ' #') || norm(n).startsWith(k + ' 1') && /#/.test(n));
      out[pp] = numbered.length === 1 ? numbered[0] : '';
    });
    return out;
  }
  function setBallMap(ppName, arsenalName) {
    let saved = {}; try { saved = JSON.parse(localStorage.getItem(MAP_KEY) || '{}') || {}; } catch (_e) {}
    saved[ppName] = arsenalName || '';
    localStorage.setItem(MAP_KEY, JSON.stringify(saved));
  }

  // ---------- query ----------
  const yearOf = (g) => g.d ? Number(g.d.slice(0, 4)) : null;
  function filter(f) {
    const h = load(); if (!h) return [];
    f = f || {};
    return h.games.filter(g => g.done
      && (!f.house || g.h === f.house)
      && (!f.lanes || g.lanes === f.lanes)
      && (!f.start || String(g.start) === String(f.start))
      && (!f.league || g.lg === f.league)
      && (!f.year || yearOf(g) === Number(f.year))
      && (!f.gn || g.gn === Number(f.gn))
      && (!f.ball || ballUsed(g, h).includes(f.ball))
      && (!f.since || (g.d && g.d >= f.since)));
  }
  // Balls used in a game (frame-level, so mid-game changes count). Returned as PinPal names.
  function ballUsed(g, h) { h = h || load(); const s = new Set(g.f.filter(x => x[0] <= 9 && x[1] >= 0).map(x => h.balls[x[1]])); if (!s.size && g.b >= 0) s.add(h.balls[g.b]); return [...s]; }
  // Main ball of a game = the ball thrown in the most frames.
  function mainBall(g, h) { h = h || load(); const c = {}; g.f.filter(x => x[0] <= 9 && x[1] >= 0).forEach(x => { c[x[1]] = (c[x[1]] || 0) + 1; }); const best = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; return best ? h.balls[best[0]] : (g.b >= 0 ? h.balls[g.b] : ''); }

  function summary(games) {
    const n = games.length;
    if (!n) return { n: 0 };
    const sc = games.map(g => g.s);
    const tot = sc.reduce((a, b) => a + b, 0);
    const st = games.map(g => root.BTPinPal.gameStats(g)).reduce((a, s) => { for (const k of ['frames', 'strikes', 'spareChances', 'spares', 'singles', 'singlesMade', 'splits', 'opens', 'firstBall']) a[k] = (a[k] || 0) + s[k]; return a; }, {});
    const pct = (a, b) => b ? Math.round(1000 * a / b) / 10 : null;
    return {
      n, avg: Math.round(tot / n * 10) / 10, high: Math.max(...sc), low: Math.min(...sc),
      p200: pct(sc.filter(s => s >= 200).length, n),
      strike: pct(st.strikes, st.frames), spare: pct(st.spares, st.spareChances), single: pct(st.singlesMade, st.singles),
      split: pct(st.splits, st.frames), opens: Math.round(st.opens / n * 10) / 10, firstBall: Math.round(st.firstBall / st.frames * 10) / 10,
    };
  }
  const DIMS = {
    house: { label: 'House', key: g => g.h },
    lanes: { label: 'Lane pair', key: g => g.lanes || '' },
    start: { label: 'Starting lane', key: g => g.start ? String(g.start) : '' },
    gn: { label: 'Game #', key: g => g.gn ? 'Game ' + g.gn : '' },
    ball: { label: 'Ball (most frames)', key: g => mainBall(g) },
    year: { label: 'Year', key: g => String(yearOf(g) || '') },
    league: { label: 'League', key: g => g.lg },
  };
  function groupBy(games, dim, minN) {
    const d = DIMS[dim]; if (!d) return [];
    const m = {};
    games.forEach(g => { const k = d.key(g); if (!k) return; (m[k] = m[k] || []).push(g); });
    return Object.entries(m).map(([k, gs]) => ({ key: k, ...summary(gs) })).filter(r => r.n >= (minN || 1));
  }
  function leaves(games, top) {
    const m = {};
    games.forEach(g => g.f.filter(x => x[0] <= 9 && x[2] < 10).forEach(x => {
      const k = root.BTPinPal.pinsOf(x[4]).join('-'); if (!k) return;
      const o = m[k] = m[k] || { leave: k, n: 0, made: 0 }; o.n++; if (x[3] === 10) o.made++;
    }));
    return Object.values(m).sort((a, b) => b.n - a.n).slice(0, top || 12).map(o => ({ ...o, pct: Math.round(100 * o.made / o.n) }));
  }

  // ---------- Coach: what history says about tonight ----------
  // house: Game Day house name (matched loosely); lanes: "23-24"; bag: arsenal names in tonight's bag
  function houseKey(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function matchHouse(name) {
    const h = load(); if (!h || !name) return '';
    const k = houseKey(name);
    const names = [...new Set(h.games.map(g => g.h))];
    return names.find(n => houseKey(n) === k) || names.find(n => houseKey(n).startsWith(k) || k.startsWith(houseKey(n))) || '';
  }
  function insights(opts) {
    const h = load(); if (!h) return null;
    const house = matchHouse(opts.house); if (!house) return null;
    const G = filter({ house });
    if (G.length < 9) return null;
    const out = { house, n: G.length, lines: [], byGame: {} };
    const all = summary(G);
    out.lines.push(`📚 PinPal history at ${house}: ${G.length} games, ${all.avg} average, ${all.strike}% strikes, ${all.spare}% spares.`);
    // Game 1 → 3
    const gm = groupBy(G, 'gn', 6).filter(r => /Game [123]$/.test(r.key)).sort((a, b) => a.key.localeCompare(b.key));
    gm.forEach(r => { out.byGame[Number(r.key.slice(5))] = r.avg; });
    if (gm.length >= 2) {
      const g1 = gm[0], gl = gm[gm.length - 1], d = Math.round(gl.avg - g1.avg);
      out.transition = d;
      if (d <= -6) out.lines.push(`📉 Your ${gl.key.toLowerCase()} here averages ${Math.abs(d)} pins below game 1 (${gl.avg} vs ${g1.avg}). The lanes usually transition on you here: plan your first move early.`);
      else if (d >= 6) out.lines.push(`📈 You get better as the night goes here: ${gl.key.toLowerCase()} averages ${d} pins above game 1. Don't force game 1.`);
    }
    // Lanes
    if (opts.lanes) {
      const L = G.filter(g => g.lanes === opts.lanes);
      if (L.length >= 6) {
        const s = summary(L);
        const dd = Math.round(s.avg - all.avg);
        out.lines.push(`🛣️ On lanes ${opts.lanes}: ${L.length} games, ${s.avg} average (${Math.abs(dd) < 3 ? `about the same as your ${house} average` : `${dd > 0 ? '+' : ''}${dd} vs your ${house} average`}).`);
        const byStart = groupBy(L, 'start', 3);
        if (byStart.length === 2) { const [a, b] = byStart.sort((x, y) => y.avg - x.avg); if (a.avg - b.avg >= 6) out.lines.push(`   Starting on ${a.key}: ${a.avg} vs starting on ${b.key}: ${b.avg}.`); }
      }
    }
    // Balls: best history balls here, and how tonight's bag has done here
    const map = ballMap(opts.arsenal || []);
    const rev = {}; Object.entries(map).forEach(([pp, ar]) => { if (ar) (rev[ar] = rev[ar] || []).push(pp); });
    const byBall = groupBy(G, 'ball', 6).sort((a, b) => b.avg - a.avg);
    if (byBall.length) out.lines.push(`🎳 Best balls here (6+ games): ${byBall.slice(0, 3).map(r => `${r.key} ${r.avg} (${r.n})`).join(', ')}.`);
    const bag = (opts.bag || []).map(n => { const pps = rev[n] || []; const gs = G.filter(g => pps.includes(mainBall(g, h))); return { n, s: summary(gs) }; }).filter(x => x.s.n >= 3).sort((a, b) => b.s.avg - a.s.avg);
    if (bag.length) { out.lines.push(`🎒 Tonight's bag here before: ${bag.map(x => `${x.n} ${x.s.avg} (${x.s.n} games)`).join(', ')}.`); out.bestInBag = bag[0].n; }
    // Spares worth a heads-up
    // Single-pin spares: the most costly one (tries × misses) if it's below 80%.
    const lv = leaves(G, 60).filter(l => l.n >= 15 && !l.leave.includes('-')).map(l => ({ ...l, missed: l.n - l.made })).sort((a, b) => b.missed - a.missed)[0];
    if (lv && lv.pct < 80) { out.spare = lv; out.lines.push(`🎯 Spare to practice: the ${lv.leave}-pin. You've made ${lv.pct}% here (${lv.made} of ${lv.n}); missing about ${Math.round(lv.missed / G.length * 3 * 10) / 10} per 3-game night costs you roughly ${Math.round(lv.missed / G.length * 3 * 10)} pins a night.`); }
    return out;
  }
  // One ball's record (arsenal name) across history.
  function ballRecord(arsenalName, arsenal) {
    const h = load(); if (!h) return null;
    const map = ballMap(arsenal || [arsenalName]);
    const pps = Object.entries(map).filter(([, a]) => a === arsenalName).map(([p]) => p);
    if (!pps.length) return null;
    const G = filter({}).filter(g => pps.includes(mainBall(g, h)));
    if (!G.length) return { names: pps, n: 0 };
    const s = summary(G);
    const best = groupBy(G, 'house', 5).sort((a, b) => b.avg - a.avg)[0];
    return { names: pps, ...s, bestHouse: best ? `${best.key} (${best.avg}, ${best.n} games)` : '' };
  }

  root.BTHistory = { KEY, load, save, clear, has, filter, summary, groupBy, leaves, DIMS, ballUsed, mainBall, ballMap, setBallMap, insights, matchHouse, ballRecord, norm };
})(typeof window !== 'undefined' ? window : globalThis);
