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
    const layout = { short: 'Short pin', long: 'Long pin', xlong: 'Very long pin', flare: 'High flare', control: 'Pin down', benchmark: 'Benchmark' }[v.layoutType] || '';
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
        if (groups.length >= 2 && groups[0].avg - groups[groups.length - 1].avg >= 5) lines.push(`<b>${LBL[tr]}</b><ul class="pl-sub">${groups.map((gp, gi) => `<li>${gi === 0 ? '⭐ ' : ''}<b>${esc(gp.k)}</b>: ${gp.avg} avg <span class="dim">· ${gp.n} games · ${Math.round(gp.strike)}% strikes</span></li>`).join('')}</ul>`);
      }
      return { tg, base, eff, lines };
    }
    const H = patterns(G), P = pairG.length >= 12 ? patterns(pairG) : null;
    const items = [];
    const pairNote = lanes ? (P && P.tg.length >= 12 ? '' : ` Lanes ${lanes.replace('-', ' & ')} have ${pairG.length} game${pairG.length === 1 ? '' : 's'}${pairG.length ? ` (${tag(pairG).length} with balls in your arsenal)` : ''}, so patterns come from the whole house and the pair only adjusts them.`) : '';
    items.push(`${H.tg.length} of ${G.length} games here were thrown with balls matched to your arsenal.${pairNote}`);
    if (P && P.lines.length) { items.push(`<span class="pl-h">On lanes ${lanes.replace('-', ' & ')}</span>`); P.lines.forEach(l => items.push(l)); }
    if (H.lines.length) { if (P && P.lines.length) items.push('<span class="pl-h">Across the house</span>'); H.lines.forEach(l => items.push(l)); }
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
    // Pick by job, from your own results here: the start ball (fresh, game 1), then the ball that has scored best
    // in game 2s (transition) and game 3s (burn). A ball needs 4+ games in that condition to count; otherwise
    // Coach falls back to motion spread. Every ball still sits 10+ points from the others on the Early → Late scale.
    const fbI = ctx.firstBall ? scored.findIndex(s => s.n === ctx.firstBall) : -1;
    if (fbI > 0) scored.unshift(scored.splice(fbI, 1)[0]); // same first ball as the Ball section
    const COND = { fresh: g => g.gn === 1, transition: g => g.gn === 2, burn: g => g.gn >= 3 };
    const CL = { fresh: 'game 1s', transition: 'game 2s', burn: 'game 3s' };
    const cBase = {}; Object.keys(COND).forEach(c => { const gs = G.filter(COND[c]); cBase[c] = gs.length ? hist.summary(gs).avg : null; });
    scored.forEach(sc => {
      const pps = Object.keys(map).filter(p => map[p] === sc.n); sc.cond = {};
      Object.keys(COND).forEach(c => {
        const gs = G.filter(g => COND[c](g) && pps.includes(hist.mainBall(g)));
        if (gs.length >= 4 && cBase[c] != null) { const s2 = hist.summary(gs); sc.cond[c] = { n: gs.length, avg: s2.avg, rel: (s2.avg - cBase[c]) * gs.length / (gs.length + K) }; }
      });
    });
    const picked = [scored[0]], x0 = scored[0].t.x ?? 50; const job = new Map([[scored[0], 'fresh']]);
    const spaced = (s) => !picked.includes(s) && s.t.x != null && Math.min(...picked.map(p => Math.abs((p.t.x ?? 50) - s.t.x))) >= 10;
    const order = lean === 1 ? ['earlier', 'later'] : ['later', 'earlier']; // reads early (-1) or neutral: the later / smoother ball comes first
    const bySide = (want, pool) => { const side = pool.filter(s => want === 'earlier' ? s.t.x < x0 : s.t.x > x0); const P2 = side.length ? side : pool; return P2.sort((p, q) => (q.score + (picked.some(z => z.t.box === q.t.box) ? 0 : 2)) - (p.score + (picked.some(z => z.t.box === p.t.box) ? 0 : 2)))[0]; };
    for (const c of ['transition', 'burn']) {
      if (picked.length >= Math.min(count, scored.length)) break;
      const ok = scored.filter(spaced); if (!ok.length) break;
      const proven = ok.filter(s => s.cond[c] && s.cond[c].rel > 0).sort((p, q) => (q.cond[c].rel + q.score * 0.1) - (p.cond[c].rel + p.score * 0.1));
      const pick = proven.length ? proven[0] : bySide(order[(picked.length - 1) % 2], ok);
      picked.push(pick); job.set(pick, proven.length ? c : c + '?');
    }
    while (picked.length < Math.min(count, scored.length)) {
      const ok = scored.filter(spaced); if (!ok.length) break;
      picked.push(bySide(order[(picked.length - 1) % 2], ok));
    }
    const first = picked[0];
    const ordered = picked.slice().sort((p, q) => (p.t.x ?? 50) - (q.t.x ?? 50));
    const motion = (p) => (p.t.x ?? 50) < x0 ? 'earlier / more ball' : 'later / cleaner';
    const role = (p) => { const j = job.get(p);
      if (j === 'fresh') return 'Fresh (game 1): start with';
      if (j === 'transition') return 'Transition (game 2)';
      if (j === 'burn') return 'Burn (game 3)';
      if (j === 'transition?') return `Transition (${motion(p)})`;
      if (j === 'burn?') return `Burn (${motion(p)})`;
      return (p.t.x ?? 50) < x0 ? 'Earlier / more ball' : 'Later / cleaner'; };
    const gm = (n) => `${n} game${n === 1 ? '' : 's'}`;
    const condWhy = (p) => { const j = String(job.get(p) || '').replace('?', ''); const c = p.cond && p.cond[j]; return c ? `${CL[j]} here: ${c.avg} over ${gm(c.n)} (your ${CL[j]} here average ${cBase[j]})` : (job.get(p) || '').endsWith('?') ? `no ball that fits the bag has beaten your ${CL[j]} average here (4+ games), so this one is picked for its motion` : ''; };
    const why = (p) => [condWhy(p), p.os ? `${p.os.avg} over ${gm(p.os.n)} here${p.rs ? ` (${p.rs.avg} in the last 12 months)` : ''}` : `${p.predK ? `no games on it here; other balls with its cover / core / layout averaged about ${Math.round(p.pred)} (not this ball's own result)` : 'no record here yet'}`, p.po ? `${p.po.avg} over ${gm(p.po.n)} on this pair` : ''].filter(Boolean).join('; ');
    items.push('<span class="pl-h"><b>The bag</b> · each ball has a job (fresh, transition, burn), listed early → late</span>');
    const whyList = (p) => why(p).split('; ').filter(Boolean).map(w => `<li>${w}</li>`).join('');
    ordered.forEach(p => items.push(`<b>${role(p)}: ${esc(p.n)}</b><ul class="pl-sub"><li class="dim">${[p.t.cover, p.t.core && p.t.core + ' core', p.t.layout, p.t.box].filter(Boolean).map(esc).join(' · ')}</li>${whyList(p)}</ul>`));
    if (picked.length < count) items.push(`Only ${picked.length} of your balls read far enough apart to be worth bringing; more would overlap.`);
    items.push('Plus your spare ball.');
    const roles = {}; ordered.forEach(q => { roles[q.n] = role(q); });
    return { items, picked: ordered.map(p => p.n), first: first.n, roles, why: scored.map(s => ({ n: s.n, score: Math.round(s.score * 10) / 10, pred: Math.round(s.pred * 10) / 10, predK: s.predK, own: s.os ? [s.os.avg, s.os.n] : null, pair: s.po ? [s.po.avg, s.po.n] : null, t: s.t, cond: s.cond, job: job.get(s) || "" })), traits: { house: H.eff, pair: P ? P.eff : null, base: H.base } };
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
    // How the inside plays on this league (the bowler's own read): 'opens' | 'holds' | ''.
    let wear = opts.wear || '';
    try { if (!wear && opts.league && BT().leagueByName) { const lgO = BT().leagueByName(opts.league, opts.house); wear = (lgO && lgO.wear) || ''; } } catch (_e) {}
    const today = opts.date || BT().localDate();
    const sess = sessionsAt(houseLabel);
    const out = { title: `Game Plan: ${houseLabel || 'pick a house'}`, sub: [], sections: [], house: houseLabel, lefty };
    const sec = (icon, h, items, lead) => { if ((items && items.length) || lead) out.sections.push({ icon, h, lead: lead || '', items: items || [] }); };

    let G = house ? hist.filter({ house }) : [];
    // 🏁 Sport pattern picked (ratio 3:1 or less, USBC's line): house-shot records don't transfer.
    // Use PinPal games on this pattern (any house), else games on any named tournament pattern; else warn.
    const patPick = (opts.patternName && patterns().find(p => p.name === opts.patternName)) || null;
    const rmP = String((patPick && patPick.ratio) || '').match(/(\d+(?:\.\d+)?)\s*(?::|to|-|\/)\s*(\d+(?:\.\d+)?)/i);
    const ratioP = rmP ? Number(rmP[1]) / (Number(rmP[2]) || 1) : null;
    const sport = ratioP != null && ratioP <= 3;
    out.sport = sport;
    if (sport && hist) {
      const pk = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const want = pk(patPick.name);
      const allG = hist.filter({});
      const onPat = allG.filter(g => g.p && want && (pk(g.p).includes(want) || want.includes(pk(g.p))) && !/house/i.test(g.p));
      const onSport = allG.filter(g => g.p && !/house/i.test(g.p));
      const pool = onPat.length >= MIN_HOUSE ? onPat : onSport.length >= MIN_HOUSE ? onSport : null;
      if (pool) { G = pool; out.sportFrom = pool === onPat ? `your ${pool.length} PinPal games on ${patPick.name}` : `your ${pool.length} PinPal games on tournament patterns (${[...new Set(pool.map(g => g.p))].slice(0, 3).join(', ')})`; }
      out.sub.push(`Sport pattern ${Math.round(ratioP * 10) / 10}:1`);
    }
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

    if (sport) {
      const items = [];
      items.push(out.sportFrom ? `Records below come from ${esc(out.sportFrom)}, not the house shot here.` : `No PinPal games on sport patterns to plan from, so the records below are from the <b>house shot</b> here: they show which balls you like at this house, not how they play on a sport shot.`);
      items.push('Little room to miss: start with your <b>smoothest, most controllable</b> ball, play close to the exit point (rule of 31), and make <b>smaller moves</b> (1-and-1 or 2-and-1, not big jumps).');
      items.push('A miss outside won\'t come back and a miss inside won\'t hook: hitting your mark matters more than the ball.');
      sec('🏁', `Sport pattern (${Math.round(ratioP * 10) / 10}:1)`, items);
    }
    // ---- Where you stand
    if (G.length >= MIN_HOUSE) {
      const items = [];
      // This house only: other houses don't help tonight.
      items.push(`${out.sportFrom ? 'On sport patterns' : esc(house)}: <b>${S.avg}</b> average over ${S.n} games, ${S.strike}% strikes, ${S.spare}% spares.`);
      // This season = the latest league here (6+ games), else the last 12 months.
      const latest = G.slice().sort((a, b) => (a.d < b.d ? 1 : -1))[0];
      const lgKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const wantLg = opts.league ? [...new Set(G.map(g => g.lg))].filter(l => l && (lgKey(l).includes(lgKey(opts.league).slice(0, 8)) || lgKey(opts.league).includes(lgKey(l).slice(0, 8)))).sort((a, b2) => { const la = G.filter(g => g.lg === a).map(g => g.d).sort().pop(), lb = G.filter(g => g.lg === b2).map(g => g.d).sort().pop(); return la < lb ? 1 : -1; })[0] : '';
      const seasonLg = wantLg || (latest && latest.lg) || '';
      let season = seasonLg ? G.filter(g => g.lg === seasonLg) : [];
      let seasonLabel = seasonLg ? `This season (${esc(seasonLg)})` : '';
      if (season.length < 6) { const cut = new Date(Date.parse(today) - 365 * 864e5).toISOString().slice(0, 10); season = G.filter(g => g.d >= cut); seasonLabel = 'The last 12 months'; }
      if (season.length >= 6 && season.length < G.length) {
        const s2 = hist.summary(season), d = r1(s2.avg - S.avg);
        items.push(`${seasonLabel}: <b>${s2.avg}</b> over ${s2.n} games, ${s2.strike}% strikes${Math.abs(d) >= 4 ? ` (${d > 0 ? '+' : ''}${d} vs your ${out.sportFrom ? 'sport-pattern' : esc(house)} average)` : ''}.`);
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
      // Game Day reads here say WHICH kind of weak it is: "Too early" / high = read early and burned up;
      // "Too long" / light = never hooked. PinPal leaves alone can't tell the two apart.
      const shots = sess.flatMap(s => s.shots || []).filter(s => s && s.type !== 'gameStart');
      const early = shots.filter(s => (Array.isArray(s.obs) && s.obs.includes('Too early')) || /high|Missed left/i.test(s.pocket || '')).length;
      const long = shots.filter(s => (Array.isArray(s.obs) && s.obs.includes('Too long')) || /light|Missed right/i.test(s.pocket || '')).length;
      const gdSays = early + long >= 8 ? (early >= long * 1.3 ? 'early' : long >= early * 1.3 ? 'long' : 'mixed') : '';
      // This season vs the house's own history: weak AND high both up = reads early, then rolls out.
      let seasonBoth = false;
      if (out.season && out.season.games.length >= 9) {
        const SG = out.season.games, prior = G.filter(g => !SG.includes(g));
        if (prior.length >= 30) {
          const lvS = hist.leaves(SG, 400), lvP = hist.leaves(prior, 400);
          const sl = rate(lvS, LIGHT, SG.length), pl = rate(lvP, LIGHT, prior.length), sh = rate(lvS, HIGH, SG.length), ph = rate(lvP, HIGH, prior.length);
          if (sl > pl * 1.15 && sh > ph * 1.15) { seasonBoth = true; items.push(`${out.season.label.replace(/ \(.*\)$/, '')}: weak-hit leaves are up (${r1(sl)} a game vs ${r1(pl)} before) <b>and</b> high-hit leaves are up (${r1(sh)} vs ${r1(ph)}). Both rising together <b>can</b> mean the ball is reading early and losing energy, but it can also come from launch direction, speed or release changes, or an over/under lane. Leaves can't show where the ball left skid and entered roll; your Game Day reads (Early / Long, pocket) can.`); }
        }
      }
      const lightUp = lh > la * 1.12 && lh - la > 0.08, highUp = hh > ha * 1.12 && hh - ha > 0.06;
      if (seasonBoth || (lightUp && highUp) || (lightUp && gdSays === 'early') || (highUp && !lightUp)) {
        lean = -1;
        if (!seasonBoth) items.push(lightUp && highUp ? `Both weak-hit (${r1(lh)} a game vs ${r1(la)} everywhere) and high-hit leaves (${r1(hh)} vs ${r1(ha)}) run high here. That fits a ball reading early, but launch, speed or release variation and over/under conditions leave the same pins.` : lightUp ? `Weak-hit leaves run high here (${r1(lh)} a game vs ${r1(la)}), and your Game Day reads say <b>early</b>: likely reading early and arriving flat.` : `Your leaves here lean to <b>high hits</b> (${r1(hh)} a game vs ${r1(ha)} everywhere), which fits the ball reading early.`);
      } else if (lightUp && gdSays === 'long') {
        lean = 1;
        items.push(`Weak-hit leaves run high here (${r1(lh)} a game vs ${r1(la)}), and your Game Day reads say <b>long / light</b>: the ball isn't getting enough hook.`);
      } else if (lightUp) {
        items.push(`Weak-hit leaves run high here (${r1(lh)} a game vs ${r1(la)} everywhere). That can mean the ball <b>never hooked</b> or that it <b>read early and burned up</b>; leaves alone can't tell. Tap <b>Early</b> or <b>Long</b> in Game Day ④ when you see it and Coach will know which.`);
      } else items.push('Your leaves here look like your leaves everywhere else: no strong high or weak signature. Read the first few shots before deciding.');
      if (sig && sig.h / sig.a >= 1.4) items.push(`The ${nm(sig.k)} shows up <b>${r1(sig.h / sig.a)}×</b> as often here as anywhere else (${sig.h.toFixed(2)} a game vs ${sig.a.toFixed(2)}).`);
      if (early + long >= 8) items.push(`Game Day reads here: ${early} early / high, ${long} long / light.`);
      if (lean === -1) items.push('<b>Worth testing in practice:</b> a ball that gets through the front more easily (reads later) and/or responds more evenly at the back (smoother), alongside your usual line. Check alignment first.' + (wear === 'holds' ? ` On this league the ${lefty ? 'right' : 'left'} stays oily, so a move in is usually safe.` : wear === 'opens' ? ` On this league the ${lefty ? 'right' : 'left'} opens up, so a ball change is worth weighing as well as a move.` : ` If the ${lefty ? 'right' : 'left'} is opening up, a big move in can take you into that friction, so a ball change is worth weighing as well as a move.`));
      if (lean === 1) items.push('<b>Start with more ball</b>, or move right to find friction.');
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
        items.push(`<b>First ball: ${esc(first.ar || first.key)}.</b> Top pick on sample-weighted record here (more games and recent form count more than a high average on a few games): ${first.avg} over ${first.n} games, ${first.strike}% strikes${fl ? `; ${fl.avg} in its ${fl.n} games here in the last 12 months` : ''}${recentCut.length && !usedRecently.has(first.key) ? `. <b>You haven't thrown it ${out.season.label.toLowerCase().startsWith('this season') ? 'this season' : 'in the last 12 months'}.</b>` : '.'}`);
        const second = pool[1];
        if (second) {
          const rs = lately(second);
          items.push(`<b>Backup: ${esc(second.ar || second.key)}</b> (${second.avg} over ${second.n} games${rs ? `; ${rs.avg} in its ${rs.n} games here in the last 12 months` : ''}).`);
        }
        items.push('<span class="small">Records mix seasons, surfaces, lanes and your form, so they show what has worked, not proof one ball is best. Confirm in practice.</span>');
        const picked = new Set([first.ar || first.key, second && (second.ar || second.key)].filter(Boolean));
        const avoid = hist.groupBy(G, 'ball', 4).filter(r => r.avg <= S.avg - 12 && owned(r.key) && !picked.has(owned(r.key)) && (!bag.length || bag.includes(owned(r.key)))).sort((a, b) => a.avg - b.avg).slice(0, 2);
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
        const rb = recommendBag({ hist, G, lanes, S, b, count: Math.max(1, Math.min(6, Number(opts.count) || 3)), lean, today, firstBall: out.firstBall });
        if (rb) { out.recWhy = rb.why; out.recTraits = rb.traits; out.recRoles = rb.roles; out.recFirst = rb.first; sec('🎒', `Your ${Math.max(1, Math.min(6, Number(opts.count) || 3))}-ball bag for ${lanes ? 'lanes ' + lanes.replace('-', ' & ') : 'this house'}`, rb.items); out.recBag = rb.picked; }
      } catch (e) { console.error(e); }
    }

    // ---- By lane condition: fresh / transition / burn, from your own results
    if (hist) {
      try {
        let sessAll = []; try { sessAll = BT().lsGet(BT().KEYS.GAME_SESSIONS, []) || []; } catch (_e) {}
        const bc = hist.byCondition({ house: houseLabel, rows: arsenalRows(), bowler: b, sessions: sessAll });
        const L = hist.conditionLines(bc);
        if (L.length) sec('🌡️', 'By lane condition', L);
      } catch (e) { console.error(e); }
    }

    // ---- Starting line
    {
      const items = [];
      const pat = (opts.patternName && patterns().find(p => p.name === opts.patternName)) || null;
      // Pattern length: the one picked, else what you've used for this house (Game Day tonight / last night here), else a saved pattern named for the house.
      let patSrc = pat ? `${pat.name}` : '';
      let pat2 = pat;
      if (!pat2) {
        const hk = String(houseLabel || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const pats = patterns();
        const byName = (n) => n && pats.find(p => p.name === n);
        let tn = null; try { const t = BT().lsGet('bt_gameday_tonight_v1', null); if (t && t.pattern && String(t.house || '').toLowerCase().replace(/[^a-z0-9]/g, '').startsWith(hk.slice(0, 5))) tn = byName(t.pattern); } catch (_e) {}
        const sp = sess.map(s => byName(s.pattern)).find(Boolean);
        const nm = pats.find(p => hk && String(p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').includes(hk.replace(/lanes?$/, '').slice(0, 6)));
        pat2 = tn || sp || nm || null;
        if (pat2) patSrc = `your saved pattern "${pat2.name}"`;
      }
      const len = Number(opts.patLen) || (pat2 && Number(pat2.length)) || null;
      // Game Day: the line that opened game 1 last time, and the line in the best game here.
      const withLine = sess.map(s => ({ s, shots: (s.shots || []).filter(x => x && x.type !== 'gameStart' && Number.isFinite(x.feet) && Number.isFinite(x.arrows)).slice().reverse() })).filter(x => x.shots.length);
      if (withLine.length) {
        const last = withLine[0], f = last.shots[0], end = last.shots[last.shots.length - 1];
        const d = BT().localDate(last.s.savedAt || f.at || Date.now());
        items.push(`Game Day, ${fmtDate(d)}: you started at slide ${f.feet}, target ${f.arrows}${f.targetFt && f.targetFt !== 15 ? ` (at ${f.targetFt} ft)` : ''}${Number.isFinite(f.bp) ? `, breakpoint ${f.bp}` : ''}${f.ball ? ` with ${esc(f.ball)}` : ''} and finished at slide ${end.feet}, target ${end.arrows}${end.targetFt && end.targetFt !== 15 ? ` (at ${end.targetFt} ft)` : ''}${Number.isFinite(end.bp) ? `, breakpoint ${end.bp}` : ''}.`);
      }
      const lines = G.filter(g => g.lines && g.lines.length).sort((a, b) => (a.d < b.d ? 1 : -1));
      if (lines.length) {
        const seen = []; lines.forEach(g => g.lines.forEach(l => { const k = l.join('/'); if (!seen.some(x => x.k === k) && seen.length < 3) seen.push({ k, l, d: g.d }); }));
        const yr = lines[0].d.slice(0, 4);
        items.push(`Lines in your PinPal notes here (latest ${yr}): ${seen.map(x => `${x.l[0]} over ${x.l[1]}`).join(', ')}.${Number(yr) < Number(today.slice(0, 4)) - 1 ? ' Older lines with different balls: use them as a reference only.' : ''}`);
      }
      if (len) items.push(`Rule of 31: a ${len} ft pattern${patSrc ? ` (${esc(patSrc)})` : ''} puts the exit area near <b>board ${Math.max(1, Math.round(len - 31))}</b>. It's an estimate of where the ball should leave the pattern, not a required breakpoint; let practice confirm it.`);
      else items.push('Rule of 31: pattern length − 31 ≈ exit board. No pattern length is saved for this house. Pick or save one on the Oil page (e.g. 43 ft → about board 12) and confirm it in practice.');
      const lay = Number(b.laydownOffset);
      items.push(`Alignment check before shot 1: your slide foot is offset from the ball's path${Number.isFinite(lay) && lay > 0 ? ` (your laydown is about ${lay} boards)` : ' by your laydown'}. Line up the <b>ball's path</b> (about slide board − laydown), your target and the exit area, not your foot.`);
      sec('🎯', 'Starting line', items);
    }

    // ---- If / then
    {
      const fb = out.firstBall ? esc(out.firstBall) : 'your first ball';
      const items = [];
      const dIn = lefty ? 'right' : 'left', dOut = lefty ? 'left' : 'right';
      if (wear === 'holds') {
        items.push(`<b>Reads early</b> (high or flat, on shots where you hit your mark): move ${dIn}, 2 with your feet and 1 with your eyes. On this league the ${dIn} stays oily and the friction is outside and down lane, so moving in is usually safe.`);
        items.push(`<b>Later in the night</b>: the outside dries first here. Keep moving ${dIn} in small steps rather than chasing it ${dOut}.`);
        items.push('<b>Ball starts going long</b> after a move in: come back half the move, or go to the stronger ball.');
      } else if (lean === 1) {
        items.push('<b>Light hits keep coming</b> (10s, washouts, buckets): don\'t chase it with your feet first. Play a stronger line in, or keep ' + fb + ' and move right 1–2.');
        items.push('<b>' + fb + ' reads early</b> (high, left of the pocket, on shots where you hit your mark): move 2 left with your feet and 1 with your eyes. Still early: go to the backup.');
      } else if (lean === -1) {
        items.push(`<b>Reads early</b> (high or flat, on shots where you hit your mark): check alignment first; then choose between a move and a ball that reads later through the front.${wear === 'opens' ? ` On this league the ${dIn} opens up (two-handers and high revs): a big move ${dIn} can put you into that friction.` : ` A big move ${dIn} can put you into friction if other players have opened it up. Tell Coach how the ${dIn} plays on this league (Game Day → Tonight).`}`);
        items.push('<b>Feeling trapped</b> (moved left and it still reads early): a straighter line from farther right, or a ball that gets through the front, are both options; a little loft past the heads helps some players.');
        items.push('<b>Ball starts going long</b> late in the night: come back half the move, or go back to the stronger ball.');
      } else {
        items.push(`<b>Reads early</b> (high, ${dIn} of the pocket, on shots where you hit your mark): 2 ${dIn} with your feet, 1 with your eyes.${wear === 'opens' ? ` On this league the ${dIn} opens up: keep the moves small.` : ''}`);
        items.push('<b>Goes long</b> (light, right of the pocket): 2 right and 1, or a stronger ball.');
      }
      items.push('<b>Hitting the pocket but not carrying</b>: often a ball-reaction question rather than a big line move; check alignment and release, then consider a ball change or a small move. Surface changes happen <b>before</b> league: no sanding or polishing during sanctioned competition.');
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
      lean === 1 ? 'Watch the exit off the deck: is it arriving weak? That\'s the read tonight.' : lean === -1 ? 'Watch where it starts to hook and tap Early / Long in Game Day: that tells you (and Coach) which kind of miss it is.' : 'Watch the exit off the deck: it tells you ball vs line.',
    ]);

    const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    if (opts.setName) { const dn = DAYS.find(d => String(opts.setName).toLowerCase().includes(d)); const td = DAYS[new Date(today + 'T12:00:00').getDay()]; if (dn && dn !== td) out.sub.push(`⚠️ Bag "${opts.setName}" on a ${td[0].toUpperCase() + td.slice(1)}: is that the right bag?`); }
    out.basedOn = [G.length ? `${G.length} PinPal games at ${house}` : '', sess.length ? `${sess.length} Game Day night${sess.length === 1 ? '' : 's'} here` : '', arsenal.length ? `${arsenal.length} balls in your arsenal` : '', bag.length ? `bag "${opts.setName}"` : ''].filter(Boolean);
    return out;
  }

  // Plain text (for sharing / copying).
  function toText(p) {
    const strip = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    const lines = [p.title, p.sub.join(' · '), ''];
    if (p.empty) lines.push(strip(p.empty), '');
    p.sections.forEach(s => { lines.push(`${s.icon} ${s.h.toUpperCase()}`); if (s.lead) lines.push(strip(s.lead)); s.items.forEach(i => { const t = String(i).replace(/<li[^>]*>/g, '\n   – ').replace(/<span class="pl-h">/g, ''); const isH = /^<span class="pl-h">/.test(i); lines.push((isH ? '' : '• ') + strip(t)); }); lines.push(''); });
    if (p.basedOn && p.basedOn.length) lines.push('Based on ' + p.basedOn.join(', ') + '.');
    return lines.join('\n');
  }

  // One answer for the whole app: the Game Plan's pick for a house / lanes / league / pattern (+ bag).
  // Game Day's Coach and the Arsenal's "Suggest my bag" call this so all three say the same thing.
  const _cache = {};
  function forContext(ctx) {
    ctx = ctx || {};
    let wr = ctx.wear || ''; try { if (!wr && ctx.league && BT().leagueByName) { const l = BT().leagueByName(ctx.league, ctx.house); wr = (l && l.wear) || ''; } } catch (_e) {}
    const key = JSON.stringify([ctx.house, pairKey(ctx.lanes), ctx.league, wr, ctx.setName, ctx.patternName, ctx.count, BT().localDate()]);
    if (_cache[key]) return _cache[key];
    let r = null; try { r = build(ctx); } catch (e) { console.error(e); }
    _cache[key] = r; return r;
  }
  root.BTPlan = { build, forContext, toText, houseOptions, sets, patterns, pairKey };
})(typeof window !== 'undefined' ? window : globalThis);
