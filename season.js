/* Bowling Tool: 📊 Season review. Reads every Game Day night and reports what keeps going right and wrong.
   Facts from what you logged, no predictions. A pattern needs 3+ nights before it shows. */
(function (root) {
  'use strict';
  const BT = () => root.BT;
  const pc = (a, b) => b ? Math.round(a / b * 100) : 0;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const r0 = (x) => Math.round(x);

  function build(sessions, bowler) {
    const lefty = /^l/i.test(String((bowler || {}).handedness || ''));
    const S = (sessions || []).filter(s => s && Array.isArray(s.shots) && s.shots.some(x => x && x.type !== 'gameStart')).sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0));
    if (S.length < 3) return { nights: S.length, enough: false };
    const X = (x) => !BT().standingPins(x).length, P = (x) => BT().isPocketHit(x);
    const C = root.BTCoach, E = root.BTEyes;
    const all = [], byBall = {}, games = { 1: [], 2: [], 3: [] }, spares = {}, faults = {};
    const ten = { att: 0, made: 0, channel: 0, inside: 0, thin: 0, unknown: 0, pin: lefty ? 7 : 10, balls: {} }, eyeN = [];
    const seven = { att: 0, made: 0 }; const other = lefty ? 10 : 7;
    const mv = { made: 0, afterPoor: 0, afterPoorBad: 0, worked: 0, didnt: 0 };
    const leaves = { light: 0, high: 0, flush: 0 }, eye = { seen: 0, ph: 0 }, opens = {};
    const goodS = (z) => !(Number(z.executionQuality) <= 1) && (!z.miss || z.miss === 'noMiss');
    const pkT = (z) => { const k = String(z.pocket || ''); return /light/i.test(k) ? 'light' : /high/i.test(k) ? 'high' : 'flush'; };
    const byType = { high: { n: 0, x: 0 }, flush: { n: 0, x: 0 }, light: { n: 0, x: 0 } }, stage = {}, exG = { 1: { n: 0, poor: 0, f: {} }, 2: { n: 0, poor: 0, f: {} }, 3: { n: 0, poor: 0, f: {} } };
    S.forEach(s => {
      const ch = s.shots.filter(x => x && x.type !== 'gameStart').sort((a, b) => (a.at || 0) - (b.at || 0)), fr = ch.filter(x => !x.isFill);
      all.push(...ch);
      const sc = (Array.isArray(s.scores) && s.scores.length) ? s.scores : ((s.pinpal && s.pinpal.scores) || []);
      if (sc.length === 3) [1, 2, 3].forEach(g => games[g].push(sc[g - 1])); // 3-game nights only (tournament blocks of 4+ aren't a game 3 story)
      ch.forEach(z => { const b = z.ball || '?', o = byBall[b] = byBall[b] || { ball: b, n: 0, x: 0, p: 0, c: 0, houses: {} }; o.n++; if (X(z)) o.x++; if (P(z)) o.p++; if (P(z) && X(z)) o.c++;
        const h = o.houses[s.house || '?'] = o.houses[s.house || '?'] || { n: 0, x: 0 }; h.n++; if (X(z)) h.x++;
        // High / flush / light: good shots only, so a pulled shot that went high doesn't count as "the ball read early".
        if (P(z) && goodS(z)) { const t = pkT(z); byType[t].n++; if (X(z)) byType[t].x++; else leaves[t]++; }
        const gn = Number(z.gameNo) || 1;
        if (!z.isFill && !(Number(z.shotNo) >= 2) && s.house && gn <= 3) { const hs = stage[s.house] = stage[s.house] || { 1: {}, 2: {}, 3: {} }, o2 = hs[gn][b] = hs[gn][b] || { n: 0, x: 0 }; o2.n++; if (X(z)) o2.x++; }
        if (!z.isFill && gn <= 3 && (z.execTapped === true || Number(z.executionQuality) === 1 || Number(z.executionQuality) === 5)) { const e = exG[gn]; e.n++; if (Number(z.executionQuality) <= 1) { e.poor++; if (z.fault) e.f[z.fault] = (e.f[z.fault] || 0) + 1; } } });
      fr.forEach(z => { if (z.fault) faults[z.fault] = (faults[z.fault] || 0) + 1;
        if (X(z) || !z.second || !Array.isArray(z.second.left)) return; const lv = BT().standingPins(z).join('-'); const o = spares[lv] = spares[lv] || { a: 0, m: 0 }; o.a++; if (!z.second.left.length) o.m++;
        if (lv === String(other)) { seven.att++; if (!z.second.left.length) seven.made++; } });
      try { const cs = E.cornerSpares(ch, lefty); ['att', 'made', 'channel', 'inside', 'thin', 'unknown'].forEach(k => ten[k] += cs[k] || 0); Object.entries(cs.missBalls || {}).forEach(([b, v]) => { ten.balls[b] = (ten.balls[b] || 0) + v; }); } catch (_e) {}
      try { const m = C.moveSummary(ch, bowler); Object.keys(mv).forEach(k => mv[k] += m[k] || 0); } catch (_e) {}
      try { const e = C.eyeballScore(ch, bowler); eye.seen += e.exitSeen || 0; eye.ph += e.pocketHits || 0; if (e.pocketHits) eyeN.push({ seen: e.exitSeen || 0, ph: e.pocketHits }); } catch (_e) {}
      const g1 = fr.filter(z => (Number(z.gameNo) || 1) === 1);
      if (g1.length && s.house) { const k = `${s.house}|${g1[0].ball}`; const o = opens[k] = opens[k] || { house: s.house, ball: g1[0].ball, nights: 0, x: 0, n: 0, g1: [] }; o.nights++; o.n += g1.length; o.x += g1.filter(X).length; if (sc.length) o.g1.push(sc[0]); }
    });
    const n = all.length, xN = all.filter(X).length, pN = all.filter(P).length, cN = all.filter(z => P(z) && X(z)).length;
    const right = [], wrong = [], habits = [], work = [];
    // game-by-game
    const gA = [1, 2, 3].map(g => avg(games[g])), three = games[1].length;
    if (three >= 3) {
      const lo = gA.indexOf(Math.min(...gA)) + 1, others = gA.filter((_, i) => i !== lo - 1), gap = r0(avg(others) - gA[lo - 1]);
      if (gap >= 8) { const why = lo === 1 ? 'a slow start: settle your ball and line in practice' : lo === 2 ? 'transition: plan your first move or ball change for the start of game 2' : 'too many changes late: one change, then 2 good shots. Not deeper';
        wrong.push(`<b>Game ${lo} is your low game:</b> ${gA.map((v, i) => `G${i + 1} ${r0(v)}`).join(' · ')} over ${three} three-game nights (about ${gap} pins). Usually ${why}.`);
        work.push({ pins: gap, t: `Game ${lo}: ${lo === 2 ? 'have your first move or ball change ready for frame 1 of game 2' : lo === 1 ? 'decide your ball by the end of practice' : 'one change, then 2 good shots. Not deeper (your game 3 plan card)'}.`, cost: `~${gap} pins a night` }); }
      else right.push(`<b>Even games:</b> ${gA.map((v, i) => `G${i + 1} ${r0(v)}`).join(' · ')}. No game is costing you.`);
    }
    // pocket vs carry
    const pkP = pc(pN, n), cy = pc(cN, pN);
    if (pkP >= 70) right.push(`<b>You get to the pocket:</b> ${pkP}% of ${n} shots.`);
    else wrong.push(`<b>Pocket ${pkP}%:</b> getting there is where pins are.`);
    if (cy < 60 && pN >= 20) { const T = ['high', 'flush', 'light'].map(k => `${k[0].toUpperCase() + k.slice(1)} ${byType[k].x} of ${byType[k].n} struck (${pc(byType[k].x, byType[k].n)}%)`).join(' · ');
      const t = leaves.high > leaves.light * 1.25 ? 'More high than light on good shots: the ball reads early more often than it arrives weak.' : leaves.light > leaves.high * 1.25 ? 'More light than high on good shots: the ball arrives weak more often than it reads early.' : 'High and light about even on good shots: no clear direction.';
      wrong.push(`<b>Carry ${cy}%:</b> good-shot pocket hits: ${T}. ${t}`); }
    // balls by house
    const balls = Object.values(byBall).filter(o => o.n >= 10).sort((a, b) => b.x / b.n - a.x / a.n);
    const houses = [...new Set(S.map(s => s.house).filter(Boolean))];
    const bestAt = houses.map(h => { const rows = Object.values(byBall).map(o => ({ ball: o.ball, ...(o.houses[h] || { n: 0, x: 0 }) })).filter(r => r.n >= 10).sort((a, b) => b.x / b.n - a.x / a.n); return rows.length ? { h, best: rows[0], worst: rows.length > 1 ? rows[rows.length - 1] : null } : null; }).filter(Boolean);
    bestAt.forEach(o => right.push(`<b>${esc(o.best.ball)} at ${esc(o.h)}:</b> ${o.best.x} strikes in ${o.best.n} (${pc(o.best.x, o.best.n)}%)${o.worst && pc(o.worst.x, o.worst.n) + 15 <= pc(o.best.x, o.best.n) ? `, vs ${esc(o.worst.ball)} ${pc(o.worst.x, o.worst.n)}%` : ''}.`));
    // carry over/under by house (ringing + flat corner pins from the same line)
    houses.forEach(h => { try { const hb = E.houseBook(h, '', S, lefty); const m = hb && hb.mix; if (!m) return;
      wrong.push(`<b>Possible carry over/under at ${esc(h)}:</b> ${m.ring} ringing and ${m.flat} flat ${m.pin}s on good shots from about the same line, on ${m.nights} of ${m.of} nights.${m.zone === 'outside' ? ` Breakpoint about ${m.bp} vs exit board ${m.exB} (app estimate from ${m.patLen} ft): finishing out in the dry. Start deeper.` : m.zone === 'inside' ? ` Breakpoint about ${m.bp}, inside exit board ${m.exB}: turning in the mud. Let it get further out.` : ''} Smoother, more predictable ball there.`); } catch (_e) {} });
    // carrydown: nights with plastic / urethane on the pair vs without
    try { const cc = E.carryCompare(S, lefty), w = cc.with, o = cc.without, f = (v, d = 0) => v == null ? '–' : (Math.round(v * Math.pow(10, d)) / Math.pow(10, d));
      if (w.n && o.n) { const mv = (d) => d == null ? '–' : Math.abs(d) < 0.25 ? 'stayed put' : `moved ${f(Math.abs(d), 1)} ${d > 0 ? 'in' : 'out'}`;
        const wh = [...new Set(cc.withHouses || [])];
        let line = `with plastic / urethane on the pair (${w.n} night${w.n === 1 ? '' : 's'}${w.est ? `, ${w.est === w.n ? 'all' : w.est} from your roster` : ''}): you ${mv(w.drift)} by the last game, carry ${f(w.carry * 100)}% · without (${o.n}): you ${mv(o.drift)}, carry ${f(o.carry * 100)}%${wh.length === 1 ? `. All the plastic nights were at ${esc(wh[0])}, so part of this could be the house` : ''}`;
        if (w.n >= 3 && o.n >= 3 && w.drift != null && o.drift != null && w.drift < o.drift - 1) { wrong.push(`<b>🛢️ ${wh.length === 1 ? 'Carrydown, or the house?' : 'Carrydown hurts you'}:</b> ${line}. With it on the pair the ball holds and you end up moving out, not in.`); work.push({ pins: 6, t: 'Plastic / urethane on the pair: start with an earlier-reading ball and expect to move out, not in, by game 2.', cost: `${w.n} nights` }); }
        const unk = S.length - w.n - o.n; if (unk > 0) line += ` · ${unk} night${unk === 1 ? '' : 's'} not known (no lane notes)`;
        else habits.push(`<b>🛢️ Carrydown test:</b> ${line}.${w.n < 3 || o.n < 3 ? ' Needs 3+ nights of each before it counts.' : ' No clear difference yet.'}`); } } catch (_e) {}
    // opening ball
    Object.values(opens).filter(o => o.nights >= 2 && o.n >= 8 && o.x / o.n < 0.3).forEach(o => { const alt = bestAt.find(b => b.h === o.house); if (alt && alt.best.ball !== o.ball) { wrong.push(`<b>Opening with ${esc(o.ball)} at ${esc(o.house)}:</b> ${o.nights} nights, ${o.x} strikes in ${o.n} game-1 shots${o.g1.length ? ` (game 1: ${o.g1.join(', ')})` : ''}. ${esc(alt.best.ball)} has the better record there.`); const g1all = avg(games[1]), g1o = avg(o.g1), sh = g1all != null && g1o != null ? r0(g1all - g1o) : 0; work.push({ pins: Math.max(sh, 1), t: `Open with ${alt.best.ball} at ${o.house}.`, cost: sh > 0 ? `game 1 ran ~${sh} under your usual` : '' }); } });
    // spares
    if (ten.att >= 5) { const r = pc(ten.made, ten.att), side = [[lefty ? 'left (channel)' : 'right (channel)', ten.channel], [lefty ? 'right' : 'left', ten.inside]].filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(', ');
      if (r < 80) { wrong.push(`<b>${ten.pin}-pin:</b> ${ten.made} of ${ten.att} (${r}%).${side ? ` Misses: ${side}${ten.unknown ? `, ${ten.unknown} not noted` : ''}.` : ''}${ten.channel >= ten.inside + 3 && ten.channel >= ten.inside * 1.5 && ten.unknown < ten.channel + ten.inside ? ' Mostly into the channel: alignment.' : ten.inside >= ten.channel + 3 && ten.inside >= ten.channel * 1.5 && ten.unknown < ten.channel + ten.inside ? ((() => { let sp = 0; try { Object.entries(ten.balls).forEach(([b, v]) => { if (BT().isSpareBall && BT().isSpareBall(b)) sp += v; }); } catch (_e) {} return sp; })() >= Math.ceil(ten.inside / 2) ? ` Mostly left, with your spare ball: that's the line, not hook. Keep your target and move your feet ${lefty ? 'right' : 'left'} 1–2 boards.` : ' Mostly crossing over: the ball is hooking; use your spare ball.') : ten.channel + ten.inside ? ' No clear side yet: log the miss side every time.' : ''}`);
        const per = r0((ten.att * 0.8 - ten.made) * 10 / S.length); work.push({ pins: per, t: `${ten.pin}-pin: spare ball, and log the miss side every time.`, cost: `~${per} pins a night to reach 80%: ${Math.max(0, r0(ten.att * 0.8 - ten.made))} more makes × ~10 pins ÷ ${S.length} nights` }); }
      else right.push(`<b>${ten.pin}-pin:</b> ${ten.made} of ${ten.att} (${r}%).`); }
    if (seven.att >= 5 && pc(seven.made, seven.att) < 75) wrong.push(`<b>${other}-pin:</b> ${seven.made} of ${seven.att} (${pc(seven.made, seven.att)}%).`);
    const multi = Object.entries(spares).filter(([k, o]) => k.includes('-') && o.a >= 4 && o.m / o.a >= 0.75).sort((a, b) => b[1].a - a[1].a).slice(0, 4);
    if (multi.length) right.push(`<b>Multi-pin spares:</b> ${multi.map(([k, o]) => `${k} ${o.m}/${o.a}`).join(' · ')}.`);
    // habits
    if (mv.made >= 8) { habits.push(`<b>Moves:</b> ${mv.made} made · ${mv.worked} worked · ${mv.didnt} didn't · ${Math.max(0, mv.made - mv.worked - mv.didnt)} not clear (too few shots after, or mixed) · ${mv.afterPoor} right after a poor shot (${mv.afterPoorBad} didn't clearly help).`);
      if (mv.afterPoorBad >= 5) { wrong.push(`<b>Moving after bad shots:</b> ${mv.afterPoorBad} of ${mv.afterPoor} moves right after a poor shot didn't clearly help.`); work.push({ pins: 6, t: 'Repeat the shot after a miss; move when two good shots agree.', cost: `${mv.afterPoorBad} moves that didn't help` }); } }
    const ft = Object.entries(faults).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (ft.length && C && C.faultLabel) habits.push(`<b>Poor-shot reasons:</b> ${ft.map(([k, v]) => `${esc(C.faultLabel(k))} ×${v}`).join(' · ')}.`);
    const eyeR = (() => { const L = eyeN.slice(-3), a = L.reduce((x, o) => x + o.seen, 0), b = L.reduce((x, o) => x + o.ph, 0); return L.length === 3 && b >= 10 ? pc(a, b) : null; })();
    if (eye.ph >= 20) { const r = pc(eye.seen, eye.ph), fixed = eyeR != null && eyeR >= 80 && r < 80;
      habits.push(`<b>Off the deck:</b> watched ${eye.seen} of ${eye.ph} pocket hits (${r}%)${fixed ? `; your last 3 nights ${eyeR}%: <b>fixed</b> ✅` : eyeR != null ? `; last 3 nights ${eyeR}%` : ''}.`); if (r < 60 && !fixed) { wrong.push(`<b>Your eye:</b> off the deck on only ${r}% of pocket hits.`); work.push({ pins: 4, t: 'Watch every pocket hit off the deck (goal 80%).', cost: `now ${r}%` }); } }
    // ⚙️ Execution by game: is game 3 you (more poor shots) or the lanes (same shots, fewer pins)?
    if ([1, 2, 3].every(g => exG[g].n >= 15)) { const r = [1, 2, 3].map(g => pc(exG[g].poor, exG[g].n)), f3 = Object.entries(exG[3].f).sort((a, b) => b[1] - a[1])[0];
      const lo3 = gA[2] != null && gA[0] != null && gA[1] != null && gA[2] < Math.min(gA[0], gA[1]);
      const read = r[2] >= Math.min(r[0], r[1]) + 5 ? 'More poor shots in game 3: execution or fatigue is part of it.' : lo3 ? 'Poor shots hold steady in game 3 while pins drop: the lanes and your decisions, not your body.' : '';
      habits.push(`<b>⚙️ Execution by game</b> (shots you rated): poor shots G1 ${r[0]}% · G2 ${r[1]}% · G3 ${r[2]}%${f3 && C && C.faultLabel ? ` (top in G3: ${esc(C.faultLabel(f3[0]))} ×${f3[1]})` : ''}. ${read}`); }
    // 🎳 Ball by stage at each house: best strike rate in game 1 / 2 / 3 (8+ shots).
    const stageRows = Object.entries(stage).map(([h, G]) => { const best = (g) => { const L = Object.entries(G[g]).filter(([, o]) => o.n >= 8).sort((a, b) => b[1].x / b[1].n - a[1].x / a[1].n); return L.length ? { ball: L[0][0], n: L[0][1].n, x: L[0][1].x } : null; };
      return { h, g: [best(1), best(2), best(3)] }; }).filter(r => r.g.filter(Boolean).length >= 2);
    let goals = null; try { const G = (BT().goalsAll ? BT().goalsAll() : []).filter(g => g.result); if (G.length) { const L = G.slice().sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 5); goals = `${G.filter(g => g.result === 'done').length} of ${G.length} goals met · newest first: ${L.map(g => g.result === 'done' ? '✅' : '❌').join(' ')}`; } } catch (_e) {}
    if (goals) habits.push(`<b>Goals:</b> ${goals}.`);
    work.sort((a, b) => b.pins - a.pins);
    return { enough: true, nights: S.length, games: three, first: S[0].savedAt, last: S[S.length - 1].savedAt, n, strike: pc(xN, n), pocket: pkP, carry: cy, gA, right, wrong, habits, work: work.slice(0, 3), stageRows };
  }

  function render(box, opts) {
    if (!box) return;
    const bw = BT().lsGet(BT().KEYS.BOWLER, {}) || {};
    const R = build(BT().lsGet(BT().KEYS.GAME_SESSIONS, []) || [], bw);
    if (!R.enough) { box.innerHTML = `<div class="panel"><b>📊 Season review</b><p class="small">Log 3 or more nights in Game Day and this page shows what keeps going right and wrong. ${R.nights} so far.</p></div>`; return; }
    const d = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const ul = (a) => a.length ? `<ul class="sr-l">${a.map(x => `<li>${x}</li>`).join('')}</ul>` : '<p class="small dim">Nothing yet.</p>';
    box.innerHTML = `<div class="panel"><b>📊 Season review</b> <span class="small dim">${R.nights} nights · ${d(R.first)} – ${d(R.last)}</span>
      <div class="small" style="margin-top:4px">${R.n} shots · strikes ${R.strike}% · pocket ${R.pocket}% · carry ${R.carry}%${R.gA[0] != null ? ` · G1 ${r0(R.gA[0])} · G2 ${r0(R.gA[1])} · G3 ${r0(R.gA[2])}` : ''}</div>
      <div class="small dim">What you logged, not a prediction. Patterns need 3+ nights.</div>
      <div class="nr-tools no-print" style="margin-top:10px"><button type="button" class="btn" id="srFile">💾 Save to Files</button><button type="button" class="btn secondary" id="srPdf">📄 Save as PDF</button></div>
      <div class="small dim no-print">On iPhone, Save as PDF opens the print screen: tap the share icon, then Save to Files.</div></div>
      ${(() => { try { return root.BTTrends ? root.BTTrends.changesHtml(root.BTTrends.nights()) : ''; } catch (e) { console.error(e); return ''; } })()}
      ${R.work.length ? `<div class="panel"><b>🎯 Top ${R.work.length} to work on</b> <span class="small dim">(biggest cost first)</span><ol class="sr-l">${R.work.map(w => `<li>${esc(w.t)}${w.cost ? ` <span class="small dim">(${esc(w.cost)})</span>` : ''}</li>`).join('')}</ol><button type="button" class="btn secondary no-print" id="srGoal">Make #1 my next goal</button></div>` : ''}
      <div class="panel"><b>✅ Going right</b>${ul(R.right)}</div>
      ${R.stageRows && R.stageRows.length ? `<div class="panel"><b>🎳 Ball by stage</b> <span class="small dim">· best strike rate in each game at each house (8+ shots)</span><div style="overflow-x:auto"><table class="small" style="width:100%;border-collapse:collapse;margin-top:6px"><tr><th style="text-align:left">House</th><th style="text-align:left">Start (G1)</th><th style="text-align:left">Transition (G2)</th><th style="text-align:left">Late (G3)</th></tr>${R.stageRows.map(r => `<tr><td style="padding:3px 4px 3px 0">${esc(r.h)}</td>${r.g.map(o => `<td style="padding:3px 4px">${o ? `${esc(o.ball)} <span class="dim">${pc(o.x, o.n)}% (${o.n})</span>` : '<span class="dim">—</span>'}</td>`).join('')}</tr>`).join('')}</table></div><div class="small dim" style="margin-top:4px">Thin samples: a ball you only threw late can look like the late ball. Your record, not a rule.</div></div>` : ''}
      <div class="panel"><b>❌ Going wrong (repeats)</b>${ul(R.wrong)}</div>
      <div class="panel"><b>🔁 Habits</b>${ul(R.habits)}</div>`;
    // 💾 Save the review as a file (share sheet → Save to Files / Mail), or 📄 print to PDF.
    const stamp = (() => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; })();
    const fb = box.querySelector('#srFile'); if (fb) fb.addEventListener('click', () => {
      const c = box.cloneNode(true); c.querySelectorAll('button, .no-print, script').forEach(n => n.remove());
      const name = `Bowling season review ${stamp}.html`;
      const css = 'body{font:15px/1.4 -apple-system,system-ui,sans-serif;background:#fff;color:#111;padding:16px;max-width:760px;margin:auto}.panel{border:1px solid #ccc;border-radius:12px;padding:12px;margin:10px 0;break-inside:avoid}.small{font-size:13px}.dim{color:#555}.sr-l{margin:6px 0 0;padding-left:20px}.sr-l li{margin:5px 0}';
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(name.replace(/\.html$/, ''))}</title><style>${css}</style></head><body>${c.innerHTML}</body></html>`;
      const file = new File([html], name, { type: 'text/html' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: name }).catch(() => {}); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); });
    const pb = box.querySelector('#srPdf'); if (pb) pb.addEventListener('click', () => { const t0 = document.title; document.title = `Bowling season review ${stamp}`; document.body.classList.add('print-season'); try { window.print(); } catch (_e) { alert('Printing isn\'t available here. Use Save to Files.'); } setTimeout(() => { document.body.classList.remove('print-season'); document.title = t0; }, 800); });
    const g = box.querySelector('#srGoal');
    if (g) g.addEventListener('click', () => { const S = BT().lsGet(BT().KEYS.GAME_SESSIONS, []) || []; const last = S.slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0] || {};
      BT().setGoal({ id: 'goal_season_' + Date.now(), from: 'season_' + Date.now(), house: last.house || '', at: Date.now(), kind: /game [123]|^open with/i.test(R.work[0].t) ? 'startFast' : /pin/.test(R.work[0].t) ? 'tenPin' : /deck/.test(R.work[0].t) ? 'offDeck' : 'repeatFirst', text: R.work[0].t });
      g.textContent = '✓ Set as your next goal'; g.disabled = true; });
  }

  // Game Day heads-up: is game 2 (or 3) usually your low game?
  function lowGame(sessions) {
    const g = { 1: [], 2: [], 3: [] }; (sessions || []).forEach(s => { const sc = s && ((Array.isArray(s.scores) && s.scores.length) ? s.scores : (s.pinpal && s.pinpal.scores)); if (Array.isArray(sc) && sc.length >= 3) [1, 2, 3].forEach(i => g[i].push(sc[i - 1])); });
    if (g[1].length < 3) return null; const a = [1, 2, 3].map(i => avg(g[i])); const lo = a.indexOf(Math.min(...a)); const gap = r0(avg(a.filter((_, i) => i !== lo)) - a[lo]);
    return gap >= 8 ? { game: lo + 1, gap, avgs: a.map(r0), nights: g[1].length } : null;
  }

  root.BTSeason = { build, render, lowGame };
})(typeof window !== 'undefined' ? window : globalThis);
