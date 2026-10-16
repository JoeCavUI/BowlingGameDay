/* Bowling Tool — PinPal history import (no server, no libraries).
   A .pinpal backup = an Apple plist header followed by a SQLite database. This file contains a small
   read-only SQLite reader (table b-trees, records, overflow pages) and turns PinPal's tables into a
   compact history the app and Coach can use. Exposes window.BTPinPal. */
(function (root) {
  'use strict';

  // ---------- minimal SQLite reader ----------
  function findSqlite(u8) {
    const sig = [83, 81, 76, 105, 116, 101, 32, 102, 111, 114, 109, 97, 116, 32, 51, 0]; // "SQLite format 3\0"
    outer: for (let i = 0; i + 16 <= u8.length; i += (i < 65536 ? 1 : 512)) {
      for (let j = 0; j < 16; j++) if (u8[i + j] !== sig[j]) continue outer;
      return i;
    }
    return -1;
  }

  function SqliteFile(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let pageSize = dv.getUint16(16); if (pageSize === 1) pageSize = 65536;
    const reserved = u8[20];
    const usable = pageSize - reserved;
    const dec = new TextDecoder('utf-8');
    const pageOff = (n) => (n - 1) * pageSize;

    function varint(p) { // returns [value, length]
      let v = 0;
      for (let i = 0; i < 8; i++) { const b = u8[p + i]; v = v * 128 + (b & 0x7f); if (!(b & 0x80)) return [v, i + 1]; }
      return [v * 256 + u8[p + 8], 9];
    }
    function payloadOf(p, total, isTableLeaf) {
      // local size rules (table leaf)
      const U = usable, X = U - 35, M = Math.floor((U - 12) * 32 / 255) - 23;
      if (total <= X) return u8.subarray(p, p + total);
      let K = M + ((total - M) % (U - 4)); const local = K <= X ? K : M;
      const out = new Uint8Array(total); out.set(u8.subarray(p, p + local), 0);
      let got = local, next = dv.getUint32(p + local);
      while (next && got < total) {
        const o = pageOff(next); const n = Math.min(U - 4, total - got);
        out.set(u8.subarray(o + 4, o + 4 + n), got); got += n; next = dv.getUint32(o);
      }
      return out;
    }
    function record(buf) {
      const bdv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      let [hlen, n] = vi(buf, 0); let p = n; const types = [];
      while (p < hlen) { const [t, l] = vi(buf, p); types.push(t); p += l; }
      const vals = []; let q = hlen;
      for (const t of types) {
        if (t === 0) vals.push(null);
        else if (t >= 1 && t <= 6) { const sz = [0, 1, 2, 3, 4, 6, 8][t]; let v = 0; const neg = buf[q] & 0x80; for (let i = 0; i < sz; i++) v = v * 256 + buf[q + i]; if (neg) v -= Math.pow(2, 8 * sz); vals.push(v); q += sz; }
        else if (t === 7) { vals.push(bdv.getFloat64(q)); q += 8; }
        else if (t === 8) vals.push(0); else if (t === 9) vals.push(1);
        else if (t >= 12) { const len = t % 2 === 0 ? (t - 12) / 2 : (t - 13) / 2; const s = buf.subarray(q, q + len); vals.push(t % 2 === 0 ? s.slice() : dec.decode(s)); q += len; }
        else vals.push(null);
      }
      return vals;
    }
    function vi(b, p) { let v = 0; for (let i = 0; i < 8; i++) { const x = b[p + i]; v = v * 128 + (x & 0x7f); if (!(x & 0x80)) return [v, i + 1]; } return [v * 256 + b[p + 8], 9]; }
    function walk(pageNo, cb) {
      const base = pageOff(pageNo); const h = base + (pageNo === 1 ? 100 : 0);
      const type = u8[h]; const ncell = dv.getUint16(h + 3);
      const hdr = (type === 2 || type === 5) ? 12 : 8;
      for (let i = 0; i < ncell; i++) {
        const cp = base + dv.getUint16(h + hdr + i * 2);
        if (type === 5) walk(dv.getUint32(cp), cb);
        else if (type === 13) {
          let [plen, a] = varint(cp); let [rowid, b] = varint(cp + a);
          cb(rowid, record(payloadOf(cp + a + b, plen, true)));
        }
      }
      if (type === 5) walk(dv.getUint32(h + 8), cb);
    }
    function tables() {
      const t = {};
      walk(1, (rowid, r) => { if (r[0] === 'table') t[r[1]] = { root: r[3], sql: r[4] }; });
      return t;
    }
    function rows(name) {
      const t = tables()[name]; if (!t) return [];
      const cols = (t.sql.match(/\((.*)\)/s) || ['', ''])[1].split(',').map(c => c.trim().split(/\s+/)[0].replace(/['"`\[\]]/g, ''));
      const ipk = /INTEGER\s+PRIMARY\s+KEY/i.test(t.sql) ? cols[0] : null;
      const out = [];
      walk(t.root, (rowid, r) => { const o = {}; cols.forEach((c, i) => { o[c] = r[i] === undefined ? null : r[i]; }); if (ipk && o[ipk] == null) o[ipk] = rowid; out.push(o); });
      return out;
    }
    return { tables, rows };
  }

  // ---------- PinPal → history ----------
  const FULL = (1 << 30) - 1;
  const standing = (mask, ball) => { const m = Math.floor(mask / Math.pow(2, 10 * ball)) & 1023; const a = []; for (let i = 0; i < 10; i++) if (m >> i & 1) a.push(i + 1); return a; };
  function laneFromNotes(t) {
    const txt = String(t || '');
    // "Lanes 13 & 14s", plus phone typos: "Lames 13s & 14", "Lanes 21d & 22".
    let m = txt.match(/\bla[mn]\w{0,2}\s*(\d{1,3})[a-rt-z]?\s*(s?)\s*(?:&|-|and|,|\/|\s)\s*(\d{1,3})[a-rt-z]?\s*(s?)/i);
    // A bare pair at the start of the note ("5 & 6"): only an odd/even pair, so "16 over 6" never counts.
    if (!m) { const b2 = txt.match(/^\s*(\d{1,3})\s*(s?)\s*(?:&|and)\s*(\d{1,3})\s*(s?)\b/i); if (b2 && Number(b2[1]) % 2 === 1 && Number(b2[3]) === Number(b2[1]) + 1) m = b2; }
    if (!m) return { lanes: '', start: null };
    const a = Number(m[1]), b = Number(m[3]);
    if (!(b === a + 1 || a === b + 1)) return { lanes: '', start: null };
    return { lanes: `${a}-${b}`, start: m[2] ? a : m[4] ? b : null };
  }
  function linesFromNotes(t) {
    const out = []; const re = /(\d{1,2}(?:\.\d)?)\s*over\s*(\d{1,2}(?:\.\d)?)/gi; let m;
    while ((m = re.exec(String(t || '')))) out.push([Number(m[1]), Number(m[2])]);
    return out;
  }

  function parse(arrayBuffer) {
    const all = new Uint8Array(arrayBuffer);
    const off = findSqlite(all);
    if (off < 0) throw new Error('This doesn\'t look like a PinPal backup (no database inside).');
    const db = SqliteFile(all.subarray(off));
    const T = db.tables();
    for (const need of ['game', 'frame', 'week', 'league', 'ball', 'house']) if (!T[need]) throw new Error('PinPal backup is missing the "' + need + '" table.');
    const byPk = (rows) => { const m = {}; rows.forEach(r => { m[r.pk] = r; }); return m; };
    const balls = byPk(db.rows('ball')), houses = byPk(db.rows('house')), leagues = byPk(db.rows('league')), weeks = byPk(db.rows('week'));
    const patterns = T.pattern ? byPk(db.rows('pattern')) : {};
    const framesBy = {};
    for (const f of db.rows('frame')) (framesBy[f.gameFk] = framesBy[f.gameFk] || []).push(f);
    const nm = (o) => String((o && o.name) || '').trim();
    const ballNames = [], ballIdx = {};
    const bi = (pk) => { const n = nm(balls[pk]); if (!n) return -1; if (!(n in ballIdx)) { ballIdx[n] = ballNames.length; ballNames.push(n); } return ballIdx[n]; };
    const games = [];
    const gamesRaw = db.rows('game').sort((a, b) => (a.weekFk - b.weekFk) || (a.pk - b.pk));
    const gnByWeek = {};
    for (const g of gamesRaw) {
      const wk = weeks[g.weekFk] || {}; const lg = leagues[g.leagueFk] || {};
      const fr = (framesBy[g.pk] || []).sort((a, b) => a.frameNum - b.frameNum);
      gnByWeek[g.weekFk] = (gnByWeek[g.weekFk] || 0) + 1;
      const F = []; // [frameNum, ballIdx, firstBallPins, rackTotal, standing1mask10, standing2mask10]
      for (const f of fr) {
        if (f.pins === FULL && !f.scores) continue;
        F.push([f.frameNum, bi(f.ballFk), f.scores & 15, f.scores >> 4, f.pins & 1023, Math.floor(f.pins / 1024) & 1023]);
      }
      const ln = laneFromNotes(wk.notes) ;
      const dateMs = wk.date ? (wk.date > 1e12 ? wk.date : wk.date * 1000) : null;
      games.push({
        id: 'pp' + g.pk,
        d: dateMs ? new Date(dateMs).toISOString().slice(0, 10) : '',
        h: nm(houses[g.houseFk] || houses[wk.houseFk] || houses[lg.houseFk]),
        lg: nm(lg), p: nm(patterns[g.patternFk] || patterns[wk.patternFk]),
        gn: gnByWeek[g.weekFk], s: g.score, done: g.frame >= 10,
        b: bi(g.ballFk), lanes: ln.lanes, start: ln.start,
        f: F, wk: g.weekFk,
        lines: linesFromNotes((wk.notes || '') + '\n' + (g.notes || '')),
        note: String(g.notes || '').trim(),
      });
    }
    // Night notes once per week
    const weekNotes = {};
    Object.values(weeks).forEach(w => { if (w.notes) weekNotes[w.pk] = String(w.notes).trim(); });
    return { source: 'PinPal', importedAt: Date.now(), balls: ballNames, games, weekNotes, counts: { games: games.length, frames: games.reduce((a, g) => a + g.f.length, 0), houses: Object.keys(houses).length, leagues: Object.keys(leagues).length } };
  }

  // ---------- helpers on history ----------
  const pinsOf = (mask) => { const a = []; for (let i = 0; i < 10; i++) if (mask >> i & 1) a.push(i + 1); return a; };
  function isSplit(pins) { // headpin down, two or more pins with a gap (standard definition, simplified)
    if (pins.length < 2 || pins.includes(1)) return false;
    const groups = [[1], [2, 3], [4, 5, 6], [7, 8, 9, 10]];
    const adj = { 2: [3, 4, 5, 8], 3: [2, 5, 6, 9], 4: [2, 5, 7, 8], 5: [2, 3, 4, 6, 8, 9], 6: [3, 5, 9, 10], 7: [4, 8], 8: [4, 5, 7, 9], 9: [5, 6, 8, 10], 10: [6, 9] };
    const seen = new Set([pins[0]]); const st = [pins[0]];
    while (st.length) { const p = st.pop(); (adj[p] || []).forEach(q => { if (pins.includes(q) && !seen.has(q)) { seen.add(q); st.push(q); } }); }
    return seen.size < pins.length;
  }
  // Frame stats for one game (first 10 frames; the 10th frame's first rack only).
  function gameStats(g) {
    const fr = g.f.filter(x => x[0] <= 9);
    let strikes = 0, spareChances = 0, spares = 0, singles = 0, singlesMade = 0, splits = 0, opens = 0, firstBall = 0, n = 0;
    const leaves = {};
    for (const x of fr) {
      n++; firstBall += x[2];
      if (x[2] === 10) { strikes++; continue; }
      spareChances++;
      const st1 = pinsOf(x[4]);
      const key = st1.join('-'); leaves[key] = (leaves[key] || 0) + 1;
      if (st1.length === 1) { singles++; if (x[3] === 10) singlesMade++; }
      if (isSplit(st1)) splits++;
      if (x[3] === 10) spares++; else opens++;
    }
    return { frames: n, strikes, spareChances, spares, singles, singlesMade, splits, opens, firstBall, leaves };
  }

  root.BTPinPal = { parse, laneFromNotes, gameStats, pinsOf, isSplit, _sqlite: SqliteFile, _find: findSqlite };
})(typeof window !== 'undefined' ? window : globalThis);
