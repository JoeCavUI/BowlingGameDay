/* Bowling Tool: 👀 Second set of eyes. Short, evidence-backed signals for Game Day from tonight's reads and your
   history at this house and pair: lane vs lane (tonight and over time), when the lanes usually change here, a ball
   that fades late, and the lines that have worked here (the lane map). Every signal names its evidence; with thin
   data it says nothing. It describes what has happened; it never predicts a score.
   Exposes window.BTEyes. */
(function (root) {
  'use strict';
  const H = () => root.BTHistory, P = () => root.BTPinPal, BT = () => root.BT;
  const MIRROR = { 1: 1, 2: 3, 3: 2, 4: 6, 5: 5, 6: 4, 7: 10, 8: 9, 9: 8, 10: 7 };
  const LIGHT_R = new Set(['10', '6-10', '1-2-4-10', '1-2-4-7', '2-4-5-8', '2-8', '1-2-10', '1-2-4-7-10', '6', '3-6-10']);
  const HIGH_R = new Set(['4', '4-9', '4-6', '4-6-7-10', '4-6-10', '4-7-10', '4-6-7', '8-10', '4-10', '4-7-9', '7', '4-7', '2-4-5-8-10']);
  const mir = (k) => k.split('-').map(Number).map(p => MIRROR[p]).sort((a, b) => a - b).join('-');
  const leaveSide = (key, lefty) => { if (!key) return ''; const k = lefty ? mir(key) : key; return HIGH_R.has(k) ? 'high' : LIGHT_R.has(k) ? 'light' : ''; };
  const pairOf = (s) => (String(s || '').match(/\d+/g) || []).map(String);
  const gm = (n) => `${n} game${n === 1 ? '' : 's'}`, nt = (n) => `${n} night${n === 1 ? '' : 's'}`;
  const r1 = (x) => Math.round(x * 10) / 10;

  // ---------- tonight: which lane is hooking more? (from your reads; poor shots only when you said they told you something)
  function shotSide(s, lefty) {
    const pk = String(s.pocket || ''), obs = Array.isArray(s.obs) ? s.obs : [];
    let v = 0;
    if (pk === 'Pocket high' || pk === 'Brooklyn' || pk === (lefty ? 'Missed right' : 'Missed left')) v += 1;
    if (pk === 'Pocket light' || pk === (lefty ? 'Missed left' : 'Missed right')) v -= 1;
    if (obs.includes('Too early')) v += 1; if (obs.includes('Too long')) v -= 1;
    // A flush hit that leaves the 10 (ringing, kickback, flat) is a carry / energy read, not a hook read.
    if (!v && (pk === 'Pocket flush' || s.leaveTag === 'Ringing 10' || s.leaveTag === 'Flat 10' || ['wrap', 'kickback', 'weak'].includes(s.keyPin))) return 0;
    if (!v) { const lv = BT().standingPins(s).sort((a, b) => a - b).join('-'), sd = leaveSide(lv, lefty); v = sd === 'high' ? 1 : sd === 'light' ? -1 : 0; }
    return v;
  }
  const counts = (s) => s.laneInfo === true || !(Number(s.executionQuality) === 1 || s.miss === 'rightMiss' || s.miss === 'leftMiss');
  function tonightLanes(shots, lanes, lefty) {
    const pr = pairOf(lanes); if (pr.length < 2) return null;
    const by = {}; pr.forEach(l => { by[l] = { n: 0, hi: 0, lo: 0 }; });
    shots.filter(s => s && s.type !== 'gameStart' && !s.isFill && by[String(s.lane)] && counts(s)).forEach(s => { const b = by[String(s.lane)], v = shotSide(s, lefty); b.n++; if (v > 0) b.hi++; if (v < 0) b.lo++; });
    const [a, b] = pr.map(l => ({ l, ...by[l], idx: by[l].n ? (by[l].hi - by[l].lo) / by[l].n : 0 }));
    if (a.n < 4 || b.n < 4) return null;
    const d = a.idx - b.idx; if (Math.abs(d) < 0.35) return { same: true, a, b };
    const more = d > 0 ? a : b, less = d > 0 ? b : a;
    return { more, less };
  }

  // ---------- corner-pin spares (the 10, or the 7 for lefties): makes, and which way you miss it
  function cornerSpares(shots, lefty) {
    const C = lefty ? 7 : 10, o = { pin: C, att: 0, made: 0, missed: 0, inside: 0, channel: 0, thin: 0, unknown: 0, missBalls: {} };
    (shots || []).forEach(x => { if (!x || x.type === 'gameStart' || !x.second || !Array.isArray(x.second.left)) return;
      const lv = BT().standingPins(x); const single = lv.length === 1 && lv[0] === C;
      const leftC = x.second.left.length === 1 && x.second.left[0] === C;
      if (single) { o.att++; if (!x.second.left.length) o.made++; }
      if (leftC) { o.missed++; const m = x.second.miss; if (m === 'inside' || m === 'channel' || m === 'thin') o[m]++; else o.unknown++; const bl = x.second.ball || x.ball || '?'; o.missBalls[bl] = (o.missBalls[bl] || 0) + 1; } });
    const sides = [['channel', o.channel], ['inside', o.inside], ['thin', o.thin]].sort((a, b) => b[1] - a[1]);
    o.pattern = sides[0][1] >= 2 && sides[0][1] > sides[1][1] ? sides[0][0] : '';
    o.tip = o.pattern === 'channel' ? `Missing the ${C} to the channel points to alignment: check your feet and target on the ${C} (you may be lined up too thin or drifting).`
      : o.pattern === 'inside' ? `Missing the ${C} inside means the ball is hooking: flatten your release or use your spare ball, and if it keeps happening move your feet.`
      : o.pattern === 'thin' ? `Chopping the ${C}: you're close. Aim a half board more toward the middle of the pin.` : '';
    return o;
  }

  // ---------- tonight: is one lane tougher to get to the pocket / to strike? (all shots, with poor shots split out)
  function tonightTough(shots, lanes) {
    const pr = pairOf(lanes); if (pr.length < 2) return null;
    const by = {}; pr.forEach(l => { by[l] = { l, n: 0, p: 0, x: 0, miss: 0, poorMiss: 0, good: 0, goodP: 0 }; });
    shots.filter(s => s && s.type !== 'gameStart' && by[String(s.lane)]).forEach(s => { const b = by[String(s.lane)], ph = BT().isPocketHit(s), x = !BT().standingPins(s).length;
      const poor = !counts(s); b.n++; if (ph) b.p++; if (x) b.x++; if (!ph) { b.miss++; if (poor) b.poorMiss++; } if (!poor) { b.good++; if (ph) b.goodP++; } });
    const [a, b] = pr.map(l => by[l]); if (a.n < 5 || b.n < 5) return null;
    const pp = (o) => o.p / o.n, sx = (o) => o.x / o.n, cy = (o) => o.p ? o.x / o.p : 0;
    let tough = null, kind = '';
    if (Math.abs(pp(a) - pp(b)) >= 0.25 && Math.abs(a.p - b.p) >= 2) { tough = pp(a) < pp(b) ? a : b; kind = 'pocket'; }
    else if (Math.abs(sx(a) - sx(b)) >= 0.3 && Math.abs(a.x - b.x) >= 2) { tough = sx(a) < sx(b) ? a : b; kind = 'strike'; }
    const easy = tough ? (tough === a ? b : a) : null;
    const noCarry = [a, b].filter(o => o.p >= 5 && pp(o) >= 0.8 && cy(o) <= 0.45);
    return { a, b, tough, easy, noCarry, kind };
  }

  // ---------- history at this pair (PinPal): each frame's lane from the game's starting lane
  function pairHistory(house, lanes, lefty) {
    const h = H() && H().load ? H().load() : null; if (!h) return null;
    const hn = H().matchHouse(house); const pr = pairOf(lanes); if (!hn || pr.length < 2) return null;
    const G = H().filter({ house: hn }).filter(g => g.lanes === pr.join('-'));
    const by = {}; pr.forEach(l => { by[l] = { f: 0, x: 0, hi: 0, lo: 0 }; });
    let used = 0;
    G.forEach(g => { const st = String(g.start || ''); if (!pr.includes(st)) return; used++; const other = st === pr[0] ? pr[1] : pr[0];
      g.f.filter(x => x[0] <= 9).forEach(x => { const l = x[0] % 2 ? other : st, b = by[l]; b.f++; if (x[2] === 10) { b.x++; return; } const sd = leaveSide(P().pinsOf(x[4]).join('-'), lefty); if (sd === 'high') b.hi++; if (sd === 'light') b.lo++; }); });
    const L = pr.map(l => { const b = by[l], idx = b.f ? (b.hi - b.lo) / b.f : 0, ex2 = b.f ? (b.hi + b.lo) / b.f : 0; return { l, ...b, idx, v: Math.max(1e-6, ex2 - idx * idx), xp: b.f ? b.x / b.f : 0 }; });
    // Is one lane really different, or is it chance? z = difference / its standard error (|z| ≥ 2 ≈ 95%).
    const z = L[0].f && L[1].f ? (L[0].idx - L[1].idx) / Math.sqrt(L[0].v / L[0].f + L[1].v / L[1].f) : 0;
    return { games: used, all: G.length, L, z, house: hn, G };
  }

  // ---------- when the lanes usually change here: game 1 → 3 at this pair (PinPal), and your past Game Day moves
  function transition(house, lanes, sessions) {
    const out = {};
    const ph = H() && H().load && H().load() ? pairHistory(house, lanes, false) : null;
    const G = ph ? ph.G : [];
    const byGn = (n) => { const gs = G.filter(g => g.gn === n); return gs.length ? { n: gs.length, avg: gs.reduce((a, g) => a + g.s, 0) / gs.length } : null; };
    const g1 = byGn(1), g3 = byGn(3); if (g1 && g3 && g1.n >= 6 && g3.n >= 6) out.drop = { g1, g3, d: g3.avg - g1.avg };
    // Past Game Day nights here: the frame of your first move in game 2
    const hk = String(house || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const nights = (sessions || []).filter(s => s && String(s.house || '').toLowerCase().replace(/[^a-z0-9]/g, '') === hk && (!lanes || s.lanes === lanes));
    const firsts = [];
    nights.forEach(s => { const g2 = (s.shots || []).filter(x => x && x.type !== 'gameStart' && !x.isFill && Number(x.gameNo) === 2).sort((a, b) => (a.at || 0) - (b.at || 0));
      const g1l = (s.shots || []).filter(x => x && x.type !== 'gameStart' && !x.isFill && Number(x.gameNo) === 1).sort((a, b) => (a.at || 0) - (b.at || 0)).pop();
      let prev = g1l; for (const x of g2) { if (prev && x.feet != null && prev.feet != null && (x.feet !== prev.feet || x.arrows !== prev.arrows)) { firsts.push({ frame: Number(x.frame) || 0, d: (x.feet - prev.feet) }); break; } prev = x; } });
    if (firsts.length >= 2) { const fr = Math.round(firsts.reduce((a, f) => a + f.frame, 0) / firsts.length), dv = r1(firsts.reduce((a, f) => a + f.d, 0) / firsts.length); out.move = { n: firsts.length, nights: nights.length, frame: fr, boards: dv }; }
    return out;
  }

  // ---------- a ball that fades late here (PinPal games matched to your arsenal names)
  function ballFade(house, ball) {
    const h = H() && H().load ? H().load() : null; if (!h || !ball) return null;
    const hn = H().matchHouse(house); if (!hn) return null;
    const map = H().ballMap([ball]); const pps = Object.keys(map).filter(p => map[p] === ball); if (!pps.length) return null;
    const G = H().filter({ house: hn }).filter(g => pps.includes(H().mainBall(g, h)));
    const by = (n) => { const gs = G.filter(g => g.gn === n); return gs.length ? { n: gs.length, avg: gs.reduce((a, g) => a + g.s, 0) / gs.length } : null; };
    const a = by(1), c = by(3); if (!a || !c || a.n < 4 || c.n < 4) return null;
    return { g1: a, g3: c, d: c.avg - a.avg };
  }

  // ---------- 🗺️ Lane map: the lines that have worked here (Game Day nights), overall and by game
  function laneMap(house, lanes, sessions) {
    const hk = String(house || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const nights = (sessions || []).filter(s => s && String(s.house || '').toLowerCase().replace(/[^a-z0-9]/g, '') === hk);
    const onPair = nights.filter(s => !lanes || s.lanes === lanes), use = onPair.length ? onPair : nights;
    const m = {};
    use.forEach(s => (s.shots || []).forEach(x => { if (!x || x.type === 'gameStart' || x.isFill || x.feet == null || x.arrows == null) return;
      const k = `${x.ball || '?'}|${x.feet}|${x.arrows}`, g = Number(x.gameNo) || 1; const o = m[k] = m[k] || { ball: x.ball || '?', feet: x.feet, arrows: x.arrows, n: 0, x: 0, p: 0, bp: {}, games: {}, nights: new Set() };
      o.n++; o.nights.add(s.id); if (!BT().standingPins(x).length) o.x++; if (BT().isPocketHit(x)) o.p++; if (x.bp != null) o.bp[x.bp] = (o.bp[x.bp] || 0) + 1; const gg = o.games[g] = o.games[g] || { n: 0, x: 0 }; gg.n++; if (!BT().standingPins(x).length) gg.x++; }));
    const rows = Object.values(m).filter(o => o.n >= 5).map(o => ({ ...o, nights: o.nights.size, bp: Object.entries(o.bp).sort((a, b) => b[1] - a[1])[0] ? Number(Object.entries(o.bp).sort((a, b) => b[1] - a[1])[0][0]) : null, sc: (o.x + 0.25 * (o.p - o.x)) / (o.n + 2) })) // strikes first, a little credit for pocket hits that didn't carry
      .sort((a, b) => b.sc - a.sc);
    // Best line in each game (4+ shots in that game): how your line has moved with the lanes here.
    const byGame = {}; [1, 2, 3].forEach(g => { const c = Object.values(m).map(o => ({ o, gg: o.games[g] })).filter(x => x.gg && x.gg.n >= 4).sort((a, b) => (b.gg.x + 0.5) / (b.gg.n + 1) - (a.gg.x + 0.5) / (a.gg.n + 1))[0]; if (c) byGame[g] = { ball: c.o.ball, feet: c.o.feet, arrows: c.o.arrows, x: c.gg.x, n: c.gg.n }; });
    return { rows, byGame, pair: onPair.length > 0, nights: use.length };
  }

  // ---------- the signals Game Day shows, most useful first (each: id, text, why)
  function signals(ctx) {
    const out = [], lefty = !!ctx.lefty, shots = ctx.shots || [], game = ctx.gameNow || 1;
    const real = shots.filter(s => s && s.type !== 'gameStart' && !s.isFill);
    const tl = tonightLanes(shots, ctx.lanes, lefty);
    let ph = null; try { ph = pairHistory(ctx.house, ctx.lanes, lefty); } catch (_e) {}
    let usual = null;
    if (ph && ph.games >= 10) { const [a, b] = ph.L; if (a.f >= 60 && b.f >= 60 && Math.abs(ph.z) >= 2) { const more = a.idx > b.idx ? a : b, less = more === a ? b : a; usual = { more, less }; } }
    if (tl && tl.more) {
      const vs = usual ? (usual.more.l === tl.more.l ? ' Same as usual here.' : ` Not the usual: over ${gm(ph.games)} it's been lane ${usual.more.l} that hooks more.`) : '';
      const ur = ctx.userRead === 'more' ? ' You called it hooking more this game.' : ctx.userRead === 'less' ? ' You called it hooking less this game.' : '';
      out.push({ id: `tl:${tl.more.l}`, text: `👀 Lane ${tl.more.l} is hooking more than ${tl.less.l} tonight.${vs}${ur}`, why: `High hits / early reads on ${tl.more.l}: ${tl.more.hi} of ${tl.more.n}; on ${tl.less.l}: ${tl.less.hi} of ${tl.less.n}. Light hits: ${tl.more.lo} vs ${tl.less.lo}. Poor shots count only when you tap "Still told me about the lane".` });
    }
    if (usual && real.length <= 2 && game === 1) out.push({ id: 'usual', text: `🗺️ On ${ctx.lanes} lane ${usual.more.l} has hooked more than ${usual.less.l}.`, why: `Over ${gm(ph.games)} here: high-hit leaves ${Math.round(usual.more.hi / usual.more.f * 100)}% of frames on ${usual.more.l} vs ${Math.round(usual.less.hi / usual.less.f * 100)}% on ${usual.less.l}; light-hit leaves ${Math.round(usual.more.lo / usual.more.f * 100)}% vs ${Math.round(usual.less.lo / usual.less.f * 100)}%. From PinPal leaves, so a tendency, not proof.` });
    let tr = {}; try { tr = transition(ctx.house, ctx.lanes, ctx.sessions); } catch (_e) {}
    if (game === 2 && real.filter(s => Number(s.gameNo) === 2).length <= 2) {
      if (tr.move) out.push({ id: 'move2', text: `⏱️ Here you've usually made your first move in game 2 around frame ${tr.move.frame} (${Math.abs(tr.move.boards)} board${Math.abs(tr.move.boards) === 1 ? '' : 's'} ${(tr.move.boards > 0) !== lefty ? 'left' : 'right'} with your feet).`, why: `From ${nt(tr.move.n)} you logged here.` });
    }
    if (game === 3 && real.filter(s => Number(s.gameNo) === 3).length <= 2 && tr.drop && tr.drop.d <= -8) out.push({ id: 'drop3', text: `⏱️ On this pair your game 3s average ${Math.round(-tr.drop.d)} less than game 1s. Watch for the lanes changing.`, why: `Game 1: ${r1(tr.drop.g1.avg)} over ${gm(tr.drop.g1.n)}; game 3: ${r1(tr.drop.g3.avg)} over ${gm(tr.drop.g3.n)} (PinPal).` });
    if (game >= 2 && ctx.ball) { let bf = null; try { bf = ballFade(ctx.house, ctx.ball); } catch (_e) {} if (bf && bf.d <= -10) out.push({ id: 'fade', text: `🎳 ${ctx.ball} fades here: its game 3s average ${Math.round(-bf.d)} below its game 1s.`, why: `Game 1: ${r1(bf.g1.avg)} over ${gm(bf.g1.n)}; game 3: ${r1(bf.g3.avg)} over ${gm(bf.g3.n)} (PinPal).` }); }
    // 📝 Your notes on this ball: tonight first, then past nights here
    const NM = root.BTCoach && root.BTCoach.noteMix;
    if (NM && ctx.ball) {
      const mine = real.filter(s => s.ball === ctx.ball);
      const tn = NM(mine, lefty);
      if (tn && tn.read !== 'mixed') out.push({ id: `notes:${tn.read}:${tn.n}`, text: `📝 Your notes on ${ctx.ball} tonight: ${tn.say}. ${tn.text}`, why: `From ${tn.n} shot notes with this ball tonight. Coach weighs them with your pocket and mark reads.` });
      if (!tn && real.length <= 2) {
        const hk = String(ctx.house || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const past = (ctx.sessions || []).filter(s => s && String(s.house || '').toLowerCase().replace(/[^a-z0-9]/g, '') === hk);
        const hn = NM(past.flatMap(s => (s.shots || []).filter(x => x && x.ball === ctx.ball)), lefty);
        if (hn && hn.read !== 'mixed') out.push({ id: `notesh:${ctx.ball}`, text: `📝 Past notes on ${ctx.ball} here: ${hn.say}. ${hn.read === 'strong' ? 'It has entered strong here.' : hn.text}`, why: `From ${hn.n} shot notes over ${nt(past.length)} here.`, late: true });
      }
    }
    { let tt = null; try { tt = tonightTough(shots, ctx.lanes); } catch (_e) {}
      if (tt && tt.tough) { const t = tt.tough, e = tt.easy, pl = (n, w) => `${n} ${w}${n === 1 ? '' : 'es'}`;
        const why = !t.miss ? '' : t.poorMiss === t.miss ? ` ${t.miss === 1 ? 'The miss' : `All ${t.miss} misses`} on ${t.l} ${t.miss === 1 ? 'was a poor shot' : 'were poor shots'}: on good shots it was ${t.goodP} of ${t.good} to the pocket, so that part is execution.`
          : t.poorMiss * 2 >= t.miss ? ` ${t.poorMiss} of the ${pl(t.miss, 'miss')} on ${t.l} were poor shots; on good shots it was ${t.goodP} of ${t.good} to the pocket.`
          : ` Most of the misses on ${t.l} were good shots, so it's the lane.`;
        out.push({ id: `tough:${t.l}:${tt.kind}:${Math.floor(t.n / 4)}`, text: `👀 Lane ${t.l} is tougher ${tt.kind === 'pocket' ? 'to get to the pocket' : 'to strike'} tonight: pocket ${t.p} of ${t.n} vs ${e.p} of ${e.n} on ${e.l}, strikes ${t.x} vs ${e.x}.${why}`, why: `Every shot counts here (fill balls too). Pocket = a pocket read or a strike.` }); }
      if (tt) tt.noCarry.filter(o => !tt.tough || o !== tt.tough).forEach(o => out.push({ id: `nocarry:${o.l}:${Math.floor(o.p / 3)}`, text: `👀 Lane ${o.l} gets you to the pocket (${o.p} of ${o.n}) but only ${o.x} carried. That's energy at the pins, not your line.`, why: 'A pocket hit that leaves pins: check what the corner pin did (flat, kickback, ringing) to see if the ball is weak or too strong.' })); }
    { let cs = null; try { cs = cornerSpares(shots, lefty); } catch (_e) {}
      if (cs && cs.pattern) { const n = cs[cs.pattern], side = cs.pattern === 'channel' ? 'to the channel' : cs.pattern === 'inside' ? 'inside' : 'thin'; out.push({ id: `corner:${cs.pattern}:${n}`, text: `🎯 ${n} missed ${cs.pin}s ${side} tonight. ${cs.tip}`, why: `${cs.pin}-pin spares tonight: made ${cs.made} of ${cs.att} single ${cs.pin}s. Misses: ${cs.channel} channel, ${cs.inside} inside, ${cs.thin} thin${cs.unknown ? `, ${cs.unknown} not noted` : ''}.` }); } }
    let lm = null; try { lm = laneMap(ctx.house, ctx.lanes, ctx.sessions); } catch (_e) {}
    const best = lm && lm.rows[0];
    const bg = lm && lm.byGame[game], inGame = real.filter(s => (Number(s.gameNo) || 1) === game).length;
    if (bg && inGame <= 1 && (game > 1 || !best || bg.feet !== best.feet || bg.arrows !== best.arrows)) out.push({ id: `mapg${game}`, text: `🗺️ Game ${game} here: ${bg.ball} ${bg.feet}/${bg.arrows} has worked best (${bg.x} strikes in ${bg.n}).`, why: `From ${nt(lm.nights)} you logged ${lm.pair ? 'on this pair' : 'at this house'}.`, angle: { slide: bg.feet, target: bg.arrows } });
    if (best && real.length <= 1 && game === 1) out.push({ id: 'map', text: `🗺️ Your best line here: ${best.ball} ${best.feet}/${best.arrows}${best.bp != null ? '/' + best.bp : ''}: ${best.x} strikes in ${best.n}.`, why: `From ${nt(best.nights)} you logged ${lm.pair ? 'on this pair' : 'at this house'}: pocket ${Math.round(best.p / best.n * 100)}%.`, angle: { slide: best.feet, target: best.arrows, bp: best.bp } });
    return out.filter(x => !x.late).concat(out.filter(x => x.late));
  }
  root.BTEyes = { signals, cornerSpares, tonightLanes, tonightTough, pairHistory, transition, ballFade, laneMap, leaveSide };
})(typeof window !== 'undefined' ? window : globalThis);
