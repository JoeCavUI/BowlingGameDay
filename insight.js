/* insight.js: matchup & risk by game number, your PinPal notes, testable house notes, and the in-game matchup meter.
   Reads BTHistory (PinPal import) and BT (arsenal, Game Day sessions). Nothing here changes Coach's shot-by-shot calls. */
(function (root) {
  'use strict';
  const BT = () => root.BT, H = () => root.BTHistory;
  const NOTES_KEY = 'bt_house_notes_v1';
  const r0 = (x) => Math.round(x);
  const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const hkey = (t) => String(t || '').toLowerCase().replace(/\blanes?\b/g, '').replace(/[^a-z0-9]/g, '');
  const gnOf = (g) => g.gn >= 3 ? 3 : g.gn;
  const GL = { 1: 'game 1', 2: 'game 2', 3: 'game 3' };
  function arsenalNames() { try { const c = BT().lsGet(BT().KEYS.CSV_CACHE, null); return BT().withCustomBalls((c && c.rows) || []).map(r => BT().ballName(r)).filter(Boolean); } catch (_e) { return []; } }
  function houseGames(house) { const h = H(); if (!h || !h.has()) return { house: '', G: [], all: [] }; const hn = h.matchHouse(house); const all = h.filter({}); return { house: hn, G: hn ? all.filter(g => g.h === hn) : [], all }; }
  function lefty() { try { return /^l/i.test(String((BT().lsGet(BT().KEYS.BOWLER, {}) || {}).handedness || '')); } catch (_e) { return false; } }

  // ---------- 1. Matchup & risk: how a ball has done in game 1 / 2 / 3 at this house ----------
  function ballByGame(house, ball) {
    const { house: hn, G } = houseGames(house); if (!hn || !ball) return null;
    const map = H().ballMap(arsenalNames().concat([ball]));
    const pps = Object.keys(map).filter(p => map[p] === ball);
    if (!pps.length) return null;
    const mine = G.filter(g => pps.includes(H().mainBall(g)));
    const out = { house: hn, ball, n: mine.length, g: {}, base: {} };
    [1, 2, 3].forEach(n => {
      const gs = mine.filter(g => gnOf(g) === n), hb = G.filter(g => gnOf(g) === n);
      out.base[n] = hb.length ? H().summary(hb).avg : null;
      if (gs.length) { const s = H().summary(gs); out.g[n] = { n: gs.length, avg: s.avg, low: s.low, high: s.high, scores: gs.map(g => g.s) }; }
    });
    const seen = [1, 2, 3].filter(n => out.g[n] && out.g[n].n >= 3);
    if (seen.length >= 2) {
      const best = seen.reduce((a, n) => out.g[n].avg > out.g[a].avg ? n : a, seen[0]);
      out.best = best;
      out.risk = seen.filter(n => n !== best && out.g[best].avg - out.g[n].avg >= 15 && out.base[n] != null && out.g[n].avg < out.base[n]).map(n => ({ gn: n, avg: out.g[n].avg, n: out.g[n].n, drop: r0(out.g[best].avg - out.g[n].avg), allBelow: out.g[n].scores.every(s => s < out.g[best].avg - 10) }));
      out.strong = seen.filter(n => out.base[n] != null && out.g[n].avg - out.base[n] >= 8);
    }
    return out;
  }
  function matchupText(m) {
    if (!m || !m.n) return '';
    const parts = [1, 2, 3].filter(n => m.g[n]).map(n => `${GL[n]} ${m.g[n].avg} (${m.g[n].n})`);
    return `${m.ball} here: ${parts.join(' · ')}.`;
  }
  function riskText(m, gn) {
    if (!m || !m.risk) return '';
    const r = m.risk.find(x => !gn || x.gn === gn); if (!r) return '';
    return `${m.ball} has averaged ${r.avg} in ${GL[r.gn]}s here (${r.n} games)${r.allBelow ? ', every one well under' : ', vs'} ${m.g[m.best].avg} in ${GL[m.best]}s. ${gn ? 'Have your next ball ready this game and switch at the first sign it fades.' : `Plan the switch before ${GL[r.gn]}.`}`;
  }

  // ---------- 2. Your PinPal notes: "14 over 5" = slide board 14, breakpoint 5 ----------
  const NUM = String.raw`(\d{1,2}(?:\.\d+)?(?:\s*\d\/\d)?)`;
  const toN = (t) => { t = String(t).trim(); const m = t.match(/^(\d+)(?:\s+(\d)\/(\d))?$/); if (m) return Number(m[1]) + (m[2] ? Number(m[2]) / Number(m[3]) : 0); const f = t.match(/^(\d+)\s*(\d)\/(\d)$/); if (f) return Number(f[1]) + Number(f[2]) / Number(f[3]); return Number(t); };
  const LINE_RE = new RegExp(NUM + String.raw`\s*over\s*` + NUM + String.raw`\s*(d\b|deep|short|out)?`, 'i');
  const FRAME_RE = /in the (\d{1,2})(?:st|nd|rd|th)/i;
  const WORDS = [
    ['tighter', /tight/i, 'tighter / hooking less'], ['nohook', /no hook|didn'?t hook|not hooking/i, 'no hook'], ['early', /\bearly\b|too soon/i, 'early'],
    ['firm', /\bfirm\b/i, 'firm'], ['transition', /transition/i, 'transition'], ['nocarry', /no carry|didn'?t carry|bucket|10 pin|ten pin/i, 'carry trouble'],
    ['missright', /missed right/i, 'missed right'], ['missleft', /missed left/i, 'missed left'], ['burn', /burn|dry|fried/i, 'burn / dry'], ['wall', /walled|wall\b/i, 'walled'], ['cliff', /cliff/i, 'cliffed'],
  ];
  function parseNote(text) {
    const lines = String(text || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    const out = { lines: [], changes: [], words: new Set() };
    lines.forEach(l => {
      const m = l.match(LINE_RE), fr = l.match(FRAME_RE);
      if (m) { const sl = toN(m[1]), bp = toN(m[2]); if (sl >= 1 && sl <= 45 && bp >= 0 && bp <= 30) out.lines.push({ slide: sl, bp, deep: /d|deep/i.test(m[3] || ''), frame: fr ? Number(fr[1]) : null, fin: /finish|ended/i.test(l) }); }
      else if (fr || /changed to|switched to|put away/i.test(l)) out.changes.push({ frame: fr ? Number(fr[1]) : null, text: l.replace(FRAME_RE, '').replace(/^(changed|switched)( to)?/i, '').trim() });
      WORDS.forEach(([k, re]) => { if (re.test(l)) out.words.add(k); });
    });
    return out;
  }
  function pinpalNotes(house) {
    const { house: hn, G } = houseGames(house); if (!hn) return null;
    const noted = G.filter(g => g.note && g.note.trim());
    const res = { house: hn, n: noted.length, games: G.length, byGame: { 1: { n: 0 }, 2: { n: 0 }, 3: { n: 0 } }, lines: [] };
    if (!noted.length) return res;
    const nights = {}; noted.forEach(g => { (nights[g.d] = nights[g.d] || []).push(g); });
    const startL = [], finL = [], moves = { 1: [], 2: [], 3: [] }, chg = { 1: [], 2: [], 3: [] }, words = { 1: {}, 2: {}, 3: {} };
    Object.values(nights).forEach(gs => {
      gs.sort((a, b) => a.gn - b.gn);
      const parsed = gs.map(g => ({ g, p: parseNote(g.note) }));
      const first = parsed.find(x => x.p.lines.length), last = parsed.slice().reverse().find(x => x.p.lines.length);
      if (first && gnOf(first.g) === 1) startL.push(first.p.lines[0]);
      if (last && gnOf(last.g) === 3) finL.push(last.p.lines[last.p.lines.length - 1]);
      parsed.forEach(({ g, p }) => {
        const k = gnOf(g); res.byGame[k].n++;
        p.lines.filter(l => l.frame).forEach(l => moves[k].push(l.frame));
        p.changes.forEach(c => chg[k].push(c.frame));
        p.words.forEach(w => { words[k][w] = (words[k][w] || 0) + 1; });
      });
    });
    const fmt = (l) => `${+l.slide.toFixed(2)} over ${+l.bp.toFixed(2)}`;
    const med = (arr, f) => median(arr.map(f));
    if (startL.length >= 3) res.lines.push(`You usually start game 1 at about <b>${+med(startL, l => l.slide).toFixed(1)} over ${+med(startL, l => l.bp).toFixed(1)}</b> (slide over breakpoint, ${startL.length} nights).`);
    if (finL.length >= 3) { const s0 = startL.length >= 3 ? med(startL, l => l.slide) : null, s1 = med(finL, l => l.slide); res.lines.push(`You usually finish game 3 at about <b>${+s1.toFixed(1)} over ${+med(finL, l => l.bp).toFixed(1)}</b>${s0 != null ? ` (${Math.abs(s1 - s0) < 0.5 ? 'about where you started' : `${+Math.abs(s1 - s0).toFixed(1)} boards ${(s1 > s0) !== lefty() ? 'left' : 'right'} of your start`})` : ''} (${finL.length} nights).`); }
    [1, 2, 3].forEach(k => {
      const mv = moves[k], ch = chg[k];
      if (mv.length >= 3) res.lines.push(`${GL[k][0].toUpperCase() + GL[k].slice(1)}: you noted a line change in ${mv.length} games, usually around frame ${r0(median(mv))}.`);
      const chf = ch.filter(Boolean);
      if (ch.length >= 3) res.lines.push(`${GL[k][0].toUpperCase() + GL[k].slice(1)}: you noted a ball change ${ch.length} times${chf.length >= 2 ? `, usually around frame ${r0(median(chf))}` : ''}.`);
      const top = Object.entries(words[k]).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3);
      if (top.length) res.lines.push(`${GL[k][0].toUpperCase() + GL[k].slice(1)} notes mention: ${top.map(([w, c]) => `${(WORDS.find(x => x[0] === w) || [, , w])[2]} ×${c}`).join(', ')}.`);
    });
    res.moves = moves; res.changes = chg; res.words = words; res.start = startL; res.finish = finL;
    return res;
  }

  // ---------- 3. Ball changes from PinPal frames (each frame records the ball) ----------
  function ballChangesByGame(G) {
    const out = { 1: { n: 0, changed: 0, frames: [] }, 2: { n: 0, changed: 0, frames: [] }, 3: { n: 0, changed: 0, frames: [] } };
    const h = H().load();
    G.forEach(g => {
      const k = gnOf(g); out[k].n++;
      const fr = (g.f || []).filter(x => x[0] <= 9 && x[1] >= 0 && x[2] !== undefined);
      const firstBall = fr.filter((x, i, a) => a.findIndex(y => y[0] === x[0]) === i); // first ball of each frame
      for (let i = 1; i < firstBall.length; i++) if (firstBall[i][1] !== firstBall[i - 1][1] && h.balls[firstBall[i][1]] !== undefined) { out[k].changed++; out[k].frames.push(firstBall[i][0] + 1); break; }
    });
    return out;
  }

  // ---------- 4. House notes: your theories, tested against your games ----------
  function notesAll() { try { return BT().lsGet(NOTES_KEY, []) || []; } catch (_e) { return []; } }
  function notesFor(house) { const k = hkey(house); return notesAll().filter(n => hkey(n.house) === k || (k && hkey(n.house).startsWith(k)) || (k && k.startsWith(hkey(n.house)))); }
  function addNote(house, text) {
    const t = String(text || '').trim(); if (!t || !house) return null;
    const all = notesAll(); const n = { id: 'hn_' + Math.random().toString(36).slice(2, 9), house, text: t, at: Date.now() };
    all.push(n); BT().lsSet(NOTES_KEY, all); return n;
  }
  function removeNote(id) { BT().lsSet(NOTES_KEY, notesAll().filter(n => n.id !== id)); }
  function gameIn(t) {
    const m = t.match(/\bgame\s*([123])\b|\bg([123])\b|\b(first|second|third|1st|2nd|3rd)\s+game\b/i); if (!m) return null;
    const w = (m[1] || m[2] || m[3] || '').toLowerCase(); return { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3 }[w] || Number(w) || null;
  }
  const LIGHT_R = ['10', '6-10', '1-2-4-10', '1-2-4-7', '2-4-5-8', '2-8', '1-2-10', '1-2-4-7-10'];
  const HIGH_R = ['4', '4-9', '4-6', '4-6-7-10', '4-6-10', '4-7-10', '4-6-7', '8-10', '4-10', '4-7-9'];
  const MIRROR = { 1: 1, 2: 3, 3: 2, 4: 6, 5: 5, 6: 4, 7: 10, 8: 9, 9: 8, 10: 7 };
  const mir = (k) => k.split('-').map(Number).map(p => MIRROR[p]).sort((a, b) => a - b).join('-');
  function leaveRate(gs, keys) { const lv = H().leaves(gs, 600); return keys.reduce((a, k) => a + ((lv.find(x => x.leave === k) || {}).n || 0), 0) / (gs.length || 1); }
  // A note can hold several claims ("game 3 move back outside with the right ball and score big"): each is tested.
  function testNote(note, house) {
    const t = String(note.text || '').toLowerCase();
    const { house: hn, G, all } = houseGames(house || note.house);
    const watch = { status: 'gameday', label: 'Watch for', why: 'PinPal can\'t show this. Your Game Day taps (Early / Long, pocket, misses) will build the evidence each night.', parts: [] };
    if (!hn || G.length < 9) return { status: 'thin', label: 'Not enough data', why: 'Not enough PinPal games here yet.', parts: [] };
    const gn = gameIn(t);
    const here = gn ? G.filter(g => gnOf(g) === gn) : G;
    const O = all.filter(g => g.h !== hn), there = gn ? O.filter(g => gnOf(g) === gn) : O;
    const where = gn ? `${GL[gn]}s here` : 'here';
    const GN = gn ? GL[gn][0].toUpperCase() + GL[gn].slice(1) : '';
    const L = lefty();
    const parts = [];
    const add = (claim, status, why) => parts.push({ claim, status, why });
    const sd = (gs) => { const v = gs.map(g => g.s), m = v.reduce((a, x) => a + x, 0) / (v.length || 1); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length || 1)); };
    const goodRe = /(score|scoring) (big|well|high)|best game|opens? up|good game|carry better/, badRe = /tough|hard|worst|shut|struggle|bad game|can'?t score/;
    const eitherRe = /or (you )?(don'?t|not)|either|hit or miss|or (it )?shuts?|or shut/;
    // a) corner pins
    const pm = t.match(/\b(10|ten|7|seven)[\s-]*pins?\b/);
    if (pm) {
      const p = /10|ten/.test(pm[1]) ? 10 : 7, k = String(p);
      const a = H().leaves(here, 600).find(x => x.leave === k) || { n: 0, made: 0 }, b = H().leaves(there, 900).find(x => x.leave === k) || { n: 0, made: 0 };
      if (a.n < 10) add(`${p} pin`, 'thin', `Only ${a.n} ${p}-pin leaves ${where}.`);
      else {
        const ra = a.n / here.length, rb = b.n / (there.length || 1), ca = r0(100 * a.made / a.n), cb = b.n ? r0(100 * b.made / b.n) : null;
        const more = ra >= rb * 1.08, worse = cb != null && ca <= cb - 3;
        add(`${p} pin`, more && worse ? 'yes' : (more || worse) ? 'some' : 'no', `${p}-pin left ${ra.toFixed(2)} a game ${where} vs ${rb.toFixed(2)} elsewhere; you convert ${ca}% vs ${cb}% (${a.n} leaves).${more !== worse ? ' Real but small.' : ''}`);
      }
    }
    // b) high / weak hits
    if (/high (hit|in the pocket)|hits? high|going high|nose|high hits/.test(t) || /light hit|weak hit|thin hit|hitting light/.test(t)) {
      const hi = /high|nose/.test(t), keys = (hi ? HIGH_R : LIGHT_R).map(k => L ? mir(k) : k);
      const ra = leaveRate(here, keys), rb = leaveRate(there, keys);
      add(hi ? 'high hits' : 'weak hits', ra >= rb * 1.12 ? 'yes' : ra >= rb * 1.04 ? 'some' : 'no', `${hi ? 'High-hit' : 'Weak-hit'} leaves ${ra.toFixed(2)} a game ${where} vs ${rb.toFixed(2)} elsewhere.`);
    }
    // c) "you have it or you don't": a swingy game
    if (gn && eitherRe.test(t)) {
      const a = sd(here), b = sd(G.filter(g => gnOf(g) !== gn)), c = sd(there);
      add('hit or miss', a >= Math.max(b, c) + 2 ? 'yes' : a >= Math.max(b, c) ? 'some' : 'gameday', `Your scores don't show it: ${GL[gn]}s here swing ±${r0(a)} pins vs ±${r0(b)} in your other games here and ±${r0(c)} in ${GL[gn]}s elsewhere. Room and reaction aren't in PinPal; your Game Day Early / Long and miss taps will show it.`);
    } else if (gn && (goodRe.test(t) || badRe.test(t))) {
      // d) a game that scores big / is tough
      const good = goodRe.test(t);
      const by = {}; [1, 2, 3].forEach(n => { const gs = G.filter(g => gnOf(g) === n); if (gs.length) by[n] = H().summary(gs).avg; });
      const others = [1, 2, 3].filter(n => n !== gn && by[n] != null).map(n => by[n]);
      if (by[gn] != null && others.length) {
        const oa = others.reduce((a, x) => a + x, 0) / others.length, d = by[gn] - oa;
        add(good ? 'scores well' : 'tough game', (good ? d >= 4 : d <= -4) ? 'yes' : (good ? d >= 1 : d <= -1) ? 'some' : 'no', `${GN}s here average ${by[gn]} vs ${r0(oa)} in your other games here.${good && d <= -2 ? ' It\'s one of your lower games here, so the move or ball for it may not be working yet.' : ''}`);
      }
    }
    // e) a ball change during a game
    if (gn && /ball|switch|change (balls?|to)/.test(t)) {
      const bc = ballChangesByGame(G)[gn], share = bc.n ? bc.changed / bc.n : 0;
      add('ball change', share >= 0.3 ? 'yes' : share >= 0.15 ? 'some' : 'no', `PinPal frames show a ball change during ${GL[gn]} in ${bc.changed} of ${bc.n} games here${bc.frames.length >= 2 ? `, usually around frame ${r0(median(bc.frames))}` : ''}.`);
    }
    // f) a line move in a game: from your PinPal line notes ("14 over 5") and Game Day
    if (gn && /move|go|get|stay/.test(t) && /outside|inside|right|left|deep|back out/.test(t)) {
      const wantOut = /outside|back out|right/.test(t) !== L; // righty: outside = right = lower slide board
      let to = 0, from = 0;
      G.filter(g => gnOf(g) === gn && g.note).forEach(g => { const p = parseNote(g.note).lines; if (p.length >= 2) { const d = p[p.length - 1].slide - p[0].slide; if (Math.abs(d) >= 0.5) ((d < 0) === wantOut ? to++ : from++); } });
      try { (BT().lsGet(BT().KEYS.GAME_SESSIONS, []) || []).filter(s => hkey(s.house) === hkey(hn)).forEach(s => { const sh = (s.shots || []).filter(x => x && x.type !== 'gameStart' && (x.gameNo >= 3 ? 3 : x.gameNo || 1) === gn && x.feet != null).sort((a, b) => a.at - b.at); if (sh.length >= 4) { const d = Number(sh[sh.length - 1].feet) - Number(sh[0].feet); if (Math.abs(d) >= 1) ((d < 0) === wantOut ? to++ : from++); } }); } catch (_e) {}
      const dirW = wantOut !== L ? 'outside (right)' : 'inside (left)';
      if (to + from < 3) add(`move ${wantOut ? 'outside' : 'inside'}`, 'thin', `${to + from ? 'Only ' + (to + from) : 'No'} ${GL[gn]}s here with a line change in your PinPal notes or Game Day. Write "14 over 5"-style lines in PinPal, or log Game Day, and Coach will count them.`);
      else add(`move ${wantOut ? 'outside' : 'inside'}`, to >= from * 2 ? 'yes' : to > from ? 'some' : 'no', `In ${to + from} ${GL[gn]}s here where you changed your line, you moved ${dirW} ${to} times and the other way ${from}.`);
    }
    if (!parts.length) return Object.assign(watch, { parts });
    const st = parts.map(x => x.status).filter(x => x !== 'thin' && x !== 'gameday');
    const status = !st.length ? (parts.some(x => x.status === 'gameday') ? 'gameday' : 'thin') : st.every(x => x === 'yes') ? 'yes' : st.every(x => x === 'no') ? 'no' : st.some(x => x === 'yes' || x === 'some') ? 'some' : 'no';
    const label = { yes: 'Supported', some: 'Partly supported', no: 'Not supported', thin: 'Not enough data', gameday: 'Watch for' }[status];
    return { status, label, why: parts.map(x => (parts.length > 1 ? `${x.claim}: ` : '') + x.why).join(' '), parts };
  }

  // ---------- 5. Matchup meter: the ball in your hand, tonight ----------
  const isPocket = (s) => /Pocket (flush|light|high)/.test(s.pocket || '');
  const isStrike = (s) => (s.leaves || []).includes('Strike') || s.leaveTag === 'Strike';
  const readsEarly = (s) => (s.obs || []).includes('Too early') || /Pocket high|Missed left/.test(s.pocket || '');
  const readsLong = (s) => (s.obs || []).includes('Too long') || /Pocket light|Missed right/.test(s.pocket || '');
  function meter(opts) {
    const { shots = [], ball = '', gameNow = 1, house = '', bagRoles = {} } = opts || {};
    if (!ball) return null;
    const mine = shots.filter(s => s && s.type !== 'gameStart' && !s.isFill && s.ball === ball);
    const last = mine.slice(-6), good = last.filter(s => s.qualityShot !== false && !/Poor/.test(s.execution || '') && (s.executionQuality == null || s.executionQuality >= 3));
    const m = ballByGame(house, ball);
    const gk = gameNow >= 3 ? 3 : gameNow;
    let score = 0; const why = [];
    if (m && m.g[gk] && m.g[gk].n >= 3 && m.base[gk] != null) {
      const d = m.g[gk].avg - m.base[gk];
      why.push(`${GL[gk]}s here with it: ${m.g[gk].avg} over ${m.g[gk].n} (you average ${r0(m.base[gk])})`);
      if (d >= 8) score += 1; else if (d <= -8) score -= 1;
    }
    const risk = m && m.risk ? m.risk.find(r => r.gn === gk) : null;
    if (risk) score -= 1;
    let dir = '';
    if (last.length >= 3) {
      const p = last.filter(isPocket).length, st = last.filter(isStrike).length;
      why.push(`tonight, last ${last.length} with it: ${p} in the pocket, ${st} strike${st === 1 ? '' : 's'}`);
      if (p / last.length >= 0.6 && st / last.length >= 0.34) score += 1; else if (last.length >= 4 && p / last.length < 0.4) score -= 1;
      const g3 = good.slice(-3), e = g3.filter(readsEarly).length, l = g3.filter(readsLong).length;
      if (g3.length >= 3 && (e >= 2 || l >= 2)) { score -= 2; dir = e >= 2 ? 'early' : 'long'; why.push(`${Math.max(e, l)} of your last 3 good shots read ${dir === 'early' ? 'early / high' : 'long / light'}`); }
    }
    if (!why.length) return null;
    const level = score >= 1 ? 'good' : score <= -2 ? 'switch' : 'watch';
    // Labels say WHICH game: a ball that's great in games 1-2 and fades in game 3 gets a game-3 warning, not "bad ball".
    const G_ = GL[gk], strongHere = m && m.strong && m.strong.includes(gk);
    const label = level === 'good' ? `Good matchup for ${G_}`
      : level === 'watch' ? (risk ? `Watch: ${G_} drop-off` : 'Watch')
      : risk ? `Fading in ${G_}, as it usually does here: switch`
      : strongHere ? `Off tonight (usually strong here in ${G_})`
      : `Not matching ${G_} so far`;
    const roleBall = (re) => Object.keys(bagRoles).find(n => n !== ball && re.test(bagRoles[n] || ''));
    let next = '';
    if (level === 'switch') {
      const alt = dir === 'early' ? roleBall(/\blater\b|cleaner/i) : dir === 'long' ? roleBall(/earlier|more ball/i) : roleBall(gk >= 3 ? /Burn/ : /Transition/);
      next = dir === 'early' ? `It's reading early on good shots: move in with it, or go to a cleaner / later ball${alt ? ` (${alt})` : ''}.` : dir === 'long' ? `It's not reading on good shots: move right with it, or go to a stronger / earlier ball${alt ? ` (${alt})` : ''}.` : `Have ${alt || 'your next ball'} ready.`;
    } else if (level === 'watch' && dir && !risk) {
      next = `It usually does well here in ${GL[gk]}, so make the line move first (${dir === 'early' ? 'in' : 'right'}); change balls only if good shots keep reading ${dir === 'early' ? 'early' : 'long'}.`;
    } else if (risk) {
      const alt = roleBall(gk >= 3 ? /Burn/ : /Transition/);
      next = riskText(m, gk) + (alt ? ` Your ${gk >= 3 ? 'burn' : 'transition'} ball: ${alt}.` : '');
    }
    return { level, label, why, next, ball, dir };
  }

  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const BADGE = { yes: '✅', some: '🟡', no: '❌', thin: '⏳', gameday: '👀' };
  function notesHtml(house, opts) {
    const N = notesFor(house); opts = opts || {};
    const rows = N.map(n => { const r = testNote(n, house); return `<li class="ins-note"><div><b>${BADGE[r.status] || '👀'} ${esc(n.text)}</b> <span class="small dim">${esc(r.label)}</span></div><div class="small">${esc(r.why)}</div>${opts.edit ? `<button type="button" class="ins-del" data-del="${esc(n.id)}">Remove</button>` : ''}</li>`; }).join('');
    return rows ? `<ul class="ins-notes">${rows}</ul>` : `<div class="small dim">No notes for ${esc(house)} yet. Write what you've noticed here (e.g. "10 pin won't fall", "game 3 move back outside"). Coach tests each one against your games.</div>`;
  }
  root.BTInsight = { notesHtml, BADGE, ballByGame, matchupText, riskText, parseNote, pinpalNotes, ballChangesByGame, notesAll, notesFor, addNote, removeNote, testNote, meter };
})(typeof window !== 'undefined' ? window : globalThis);
