/* 📊 Bowling Tool stats: every game you've bowled, from PinPal and from Game Day, in one shape.
   A Game Day night that's also in PinPal counts once (PinPal's copy), so keeping score in both never double counts. */
(function (root) {
  const BT = () => root.BT, H = () => root.BTHistory;
  const pinsOf = (mask) => { const a = []; for (let i = 0; i < 10; i++) if (mask >> i & 1) a.push(i + 1); return a; };
  const hk = (t) => String(t || '').toLowerCase().replace(/\blanes?\b/g, '').replace(/[^a-z0-9]/g, '');
  const sameHouse = (a, b) => { const x = hk(a), y = hk(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)); };
  const localDate = (ms) => { const d = new Date(ms); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

  // Rolls → 10 frame scores (null when the rolls don't add up to a full game).
  function frameScores(rolls) {
    const out = []; let i = 0;
    for (let f = 0; f < 10; f++) {
      const a = rolls[i], b = rolls[i + 1], c = rolls[i + 2];
      if (a == null) return null;
      if (f === 9) { if (a === 10 || a + (b || 0) === 10) { if (b == null || c == null) return null; out.push(a + b + c); } else { if (b == null) return null; out.push(a + b); } break; }
      if (a === 10) { if (b == null || c == null) return null; out.push(10 + b + c); i += 1; }
      else { if (b == null) return null; if (a + b === 10) { if (c == null) return null; out.push(10 + c); } else out.push(a + b); i += 2; }
    }
    return out.length === 10 ? out : null;
  }

  // PinPal game → common shape. Rows are racks: 0–9 are frames 1–10, 10–11 are 10th-frame fill racks.
  function fromPinPal(g, h) {
    const rows = (g.f || []).slice().sort((a, b) => a[0] - b[0]), byN = {}; rows.forEach(x => { byN[x[0]] = x; });
    const frames = [], rolls = [];
    for (let n = 0; n <= 9; n++) {
      const x = byN[n]; if (!x) break;
      const f1 = x[2], tot = x[3], leave = f1 === 10 ? [] : pinsOf(x[4]), f2 = f1 === 10 ? null : tot - f1;
      frames.push({ f1, f2, leave, strike: f1 === 10, spare: f1 < 10 && tot === 10, split: BT().isSplit(leave), ball: x[1] >= 0 && h ? h.balls[x[1]] : '' });
      rolls.push(f1); if (f1 < 10) rolls.push(f2);
    }
    const t = byN[9];
    if (t) { const a = byN[10], b = byN[11];
      if (t[2] === 10 && a) { rolls.push(a[2]); if (a[2] === 10) { if (b) rolls.push(b[2]); } else rolls.push(a[3] - a[2]); }
      else if (t[2] < 10 && t[3] === 10 && a) rolls.push(a[2]); }
    let fs = frameScores(rolls); if (fs && fs.reduce((s, v) => s + v, 0) !== g.s) fs = null;
    return { id: g.id, src: 'pp', d: g.d, h: g.h, lanes: g.lanes || '', lg: g.lg || '', p: g.p || '', gn: g.gn || 0, s: g.s, ball: H().mainBall(g, h) || '', frames, fs, wk: 'pp' + g.wk };
  }

  // Game Day night → its fully scored games (shots with a 2nd ball; incomplete games are left out).
  function fromSession(sess) {
    const chron = (sess.shots || []).filter(x => x && x.type !== 'gameStart').sort((a, b) => (a.at || 0) - (b.at || 0));
    const gNos = [...new Set(chron.map(x => Number(x.gameNo) || 1))].sort((a, b) => a - b);
    const d = localDate((chron[0] && chron[0].at) || sess.savedAt);
    return gNos.map(gn => {
      const gs = chron.filter(x => (Number(x.gameNo) || 1) === gn);
      let sc = null; try { sc = BT().scoreGame(gs); } catch (_e) {}
      if (!sc || !sc.complete) return null;
      const balls = {}; gs.filter(x => !x.isFill).forEach(x => { if (x.ball) balls[x.ball] = (balls[x.ball] || 0) + 1; });
      const ball = Object.entries(balls).sort((a, b) => b[1] - a[1])[0];
      const frames = sc.frames.map(f => ({ f1: f.balls[0], f2: f.balls[0] === 10 ? null : f.balls[1], leave: f.leave, strike: f.balls[0] === 10, spare: !!f.spare, split: f.split, ball: f.shot && f.shot.ball || '' }));
      const fs = sc.frames.map((f, i) => f.cum - (i ? sc.frames[i - 1].cum : 0));
      return { id: `${sess.id}:${gn}`, src: 'gd', d, h: sess.house || '', lanes: sess.lanes || '', lg: sess.leagueName || '', p: sess.pattern || '', gn, s: sc.total, ball: ball ? ball[0] : '', frames, fs, wk: 'gd' + sess.id };
    }).filter(Boolean);
  }

  function allGames() {
    const h = H() && H().load ? H().load() : null;
    const pp = h && h.games ? h.games.filter(g => g.done).map(g => fromPinPal(g, h)) : [];
    const ppDays = {}; pp.forEach(g => { (ppDays[g.d] = ppDays[g.d] || []).push(g.h); });
    let sess = []; try { sess = BT().lsGet(BT().KEYS.GAME_SESSIONS, []) || []; } catch (_e) {}
    const gd = sess.flatMap(s => {
      if (s.pinpal) return []; // already matched to PinPal
      const games = fromSession(s);
      return games.filter(g => !(ppDays[g.d] || []).some(hh => sameHouse(hh, g.h)));
    });
    return [...pp, ...gd].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.gn - b.gn));
  }

  const pct = (a, b) => b ? Math.round(1000 * a / b) / 10 : null;
  function summarize(G) {
    const n = G.length; if (!n) return { n: 0 };
    const sc = G.map(g => g.s), tot = sc.reduce((a, b) => a + b, 0);
    let frames = 0, strikes = 0, chances = 0, spares = 0, singles = 0, singlesMade = 0, splits = 0, splitsMade = 0, opens = 0, first = 0, clean = 0, whatIf = 0;
    const leaves = {};
    G.forEach(g => {
      let open = 0, wi = 0;
      g.frames.forEach((f, i) => {
        frames++; first += f.f1; if (f.strike) { strikes++; return; }
        chances++; const k = f.leave.join('-') || '—'; const L = leaves[k] = leaves[k] || { leave: k, n: 0, made: 0, split: f.split }; L.n++;
        if (f.spare) { spares++; L.made++; } else { opens++; open++; }
        if (f.leave.length === 1) { singles++; if (f.spare) singlesMade++; else { const nx = g.frames[i + 1], next = nx ? nx.f1 : 0, prev = g.frames[i - 1]; wi += (1 - (f.f2 || 0)) + (i < 9 ? next : 0) + (prev && prev.strike ? 1 - (f.f2 || 0) : 0); } }
        if (f.split) { splits++; if (f.spare) splitsMade++; }
      });
      if (!open && g.frames.length === 10) clean++;
      whatIf += g.s + wi;
    });
    // Series: nights with 3+ games
    const nights = {}; G.forEach(g => { (nights[g.wk] = nights[g.wk] || []).push(g); });
    const series = Object.values(nights).filter(x => x.length >= 3).map(x => x.slice(0, 3).reduce((a, g) => a + g.s, 0));
    const bestNight = Object.values(nights).filter(x => x.length >= 3).map(x => ({ s: x.slice(0, 3).reduce((a, g) => a + g.s, 0), d: x[0].d, h: x[0].h })).sort((a, b) => b.s - a.s)[0];
    const hi = G.slice().sort((a, b) => b.s - a.s)[0];
    return {
      n, avg: Math.round(tot / n * 10) / 10, high: hi.s, highG: hi, low: Math.min(...sc),
      series: series.length ? Math.max(...series) : null, seriesN: series.length, bestNight, seriesAvg: series.length ? Math.round(series.reduce((a, b) => a + b, 0) / series.length) : null,
      p200: pct(sc.filter(s => s >= 200).length, n),
      strike: pct(strikes, frames), spare: pct(spares, chances), single: pct(singlesMade, singles), singles, singlesMissed: singles - singlesMade,
      splitConv: pct(splitsMade, splits), splitsPer: Math.round(splits / n * 10) / 10, splits, splitsMade,
      clean: pct(clean, n), cleanN: clean, opens: Math.round(opens / n * 10) / 10, firstBall: Math.round(first / frames * 10) / 10,
      whatIf: Math.round(whatIf / n * 10) / 10,
      leaves: Object.values(leaves).sort((a, b) => b.n - a.n),
    };
  }
  const DIM = {
    house: { label: 'House', key: g => g.h }, lanes: { label: 'Lane pair', key: g => g.lanes }, league: { label: 'League', key: g => g.lg },
    ball: { label: 'Ball', key: g => g.ball }, pattern: { label: 'Pattern', key: g => g.p }, gn: { label: 'Game #', key: g => g.gn ? 'Game ' + g.gn : '' },
    year: { label: 'Year', key: g => (g.d || '').slice(0, 4) }, month: { label: 'Month', key: g => (g.d || '').slice(0, 7) }, src: { label: 'Source', key: g => g.src === 'gd' ? 'Game Day' : 'PinPal' },
  };
  function filter(G, f) {
    f = f || {};
    const since = f.period === '90' ? localDate(Date.now() - 90 * 864e5) : f.period === '365' ? localDate(Date.now() - 365 * 864e5) : f.period === 'season' ? localDate(Date.now() - 300 * 864e5) : '';
    return G.filter(g => (!since || g.d >= since) && (!/^\d{4}$/.test(f.period || '') || (g.d || '').startsWith(f.period))
      && (!f.house || g.h === f.house) && (!f.lanes || g.lanes === f.lanes) && (!f.league || g.lg === f.league)
      && (!f.ball || g.ball === f.ball) && (!f.pattern || g.p === f.pattern) && (!f.gn || String(g.gn) === String(f.gn)) && (!f.src || g.src === f.src));
  }
  function groupBy(G, dim) {
    const d = DIM[dim]; if (!d) return []; const m = {};
    G.forEach(g => { const k = d.key(g); if (!k) return; (m[k] = m[k] || []).push(g); });
    return Object.entries(m).map(([k, gs]) => Object.assign({ key: k }, summarize(gs)));
  }
  function distribution(G, step) {
    step = step || 20; const b = {}; G.forEach(g => { const k = Math.min(280, Math.floor(g.s / step) * step); b[k] = (b[k] || 0) + 1; });
    return Object.keys(b).map(Number).sort((a, z) => a - z).map(k => ({ from: k, to: k + step - 1, n: b[k] }));
  }
  function byFrame(G) { const s = Array(10).fill(0), c = Array(10).fill(0); G.forEach(g => { if (g.fs) g.fs.forEach((v, i) => { s[i] += v; c[i]++; }); }); return s.map((v, i) => c[i] ? Math.round(v / c[i] * 10) / 10 : null); }
  function trend(G, months) { const m = {}; G.forEach(g => { const k = (g.d || '').slice(0, 7); if (k) (m[k] = m[k] || []).push(g.s); }); return Object.keys(m).sort().slice(-(months || 18)).map(k => ({ k, avg: Math.round(m[k].reduce((a, b) => a + b, 0) / m[k].length * 10) / 10, n: m[k].length })); }

  root.BTStats = { allGames, filter, summarize, groupBy, distribution, byFrame, trend, DIM, frameScores, fromPinPal, fromSession };
})(typeof window !== 'undefined' ? window : globalThis);
