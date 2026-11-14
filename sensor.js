/* 📡 Ball sensor data (Witsee and similar CSV exports).
   - Reads a sensor CSV by column name, so other sensors can be added by listing their headers below.
   - Matches each throw to the shot you logged with the same ball, in order, by time.
   - Builds the sensor part of the night review: averages and spread, game by game, strikes vs the rest,
     your feel vs the sensor, how your release drifted, and your PAP.
   Nothing here predicts scores: it reports what the sensor measured. */
(function () {
  'use strict';

  const SESS_KEY = 'bt_sensor_sessions_v1';   // sensor-only nights (practice, or nights not logged in Game Day); kept out of league stats
  const MAP_KEY = 'bt_sensor_ballmap_v1';      // { "name in the sensor app": "ball name in your arsenal" }
  const PREF_KEY = 'bt_sensor_pref_v1';        // { on, ball } remembered from night to night

  // Column names as each sensor writes them (lower case, spaces and symbols removed before matching).
  const COLS = {
    t:        ['createdatutc', 'createdat', 'timestamp', 'time', 'datetime', 'date'],
    n:        ['thrownumber', 'throw', 'shot', 'shotnumber'],
    rpm:      ['releaserpm', 'revrate', 'rpm', 'revs'],
    speed:    ['ballreleasespeedmph', 'releasespeedmph', 'releasespeed', 'ballspeed', 'speedmph', 'speed'],
    avgSpeed: ['ballaveragespeedmph', 'averagespeedmph', 'avgspeed', 'averagespeed'],
    rot:      ['axisrotation', 'rotation'],
    tilt:     ['axistilt', 'tilt'],
    loft:     ['loftft', 'loft'],
    loftAng:  ['loftangle'],
    bounce:   ['totalbounceft', 'bounce'],
    swing:    ['swingheightft', 'swingheight'],
    relH:     ['releaseheightft', 'releaseheight'],
    skid:     ['skiddistanceft', 'skid'],
    hook:     ['hookdistanceft', 'hook'],
    roll:     ['rolldistanceft', 'roll'],
    flare:    ['trackflare', 'flare'],
    hole:     ['sensorhole'],
    sensor:   ['sensorname', 'sensor'],
    ball:     ['userballname', 'ballname', 'ball'],
    papR:     ['paprightmm'],
    papD:     ['papdownmm'],
    notes:    ['notes'],
    pins:     ['pinsstanding'],
    spare:    ['isspare'],
    foul:     ['isfoul'],
  };
  const NUM = ['n', 'rpm', 'speed', 'avgSpeed', 'rot', 'tilt', 'loft', 'loftAng', 'bounce', 'swing', 'relH', 'skid', 'hook', 'roll', 'flare', 'papR', 'papD'];

  // What each number is called on screen, its unit, how to print it, and how big a change is worth mentioning.
  const M = {
    speed: { label: 'Release speed', unit: 'mph', dp: 1, step: 0.3 },
    rpm:   { label: 'Rev rate', unit: 'rpm', dp: 0, step: 10 },
    rot:   { label: 'Axis rotation', unit: '°', dp: 0, step: 5 },
    tilt:  { label: 'Axis tilt', unit: '°', dp: 0, step: 3 },
    loft:  { label: 'Loft', unit: 'ft', dp: 1, step: 0.4 },
    swing: { label: 'Swing height', unit: 'ft', dp: 1, step: 0.2 },
    skid:  { label: 'Skid', unit: 'ft', dp: 0, step: 2 },
    hook:  { label: 'Hook', unit: 'ft', dp: 0, step: 2 },
    roll:  { label: 'Roll', unit: 'ft', dp: 1, step: 2 },
    papO:  { label: 'PAP over', unit: 'in', dp: 2, step: 0.125 },
    papU:  { label: 'PAP up', unit: 'in', dp: 2, step: 0.125 },
  };
  const SHOW = ['speed', 'rpm', 'rot', 'tilt', 'loft', 'skid', 'hook', 'roll'];

  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_e) { return false; } };
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const key = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // ---------- CSV ----------
  function splitCSV(text) {
    const rows = []; let row = [], cur = '', q = false;
    const s = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
      if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x.trim() !== '')) rows.push(row); row = []; }
      else cur += c;
    }
    row.push(cur); if (row.some(x => x.trim() !== '')) rows.push(row);
    return rows;
  }

  // Returns { throws, found: [field names found], missing, sensorName, ballName } or { error }
  function parse(text) {
    const rows = splitCSV(text);
    if (rows.length < 2) return { error: 'That file has no throws in it.' };
    const head = rows[0].map(key), idx = {};
    Object.entries(COLS).forEach(([f, names]) => { const i = names.map(n => head.indexOf(n)).find(i => i >= 0); if (i != null && i >= 0) idx[f] = i; });
    if (idx.t == null || (idx.speed == null && idx.rpm == null)) return { error: "This doesn't look like a sensor file: it needs a time column and speed or rev rate." };
    const throws = [];
    rows.slice(1).forEach((r, k) => {
      const o = {};
      Object.entries(idx).forEach(([f, i]) => { const v = (r[i] ?? '').trim(); o[f] = NUM.includes(f) ? (v === '' || isNaN(Number(v)) ? null : Number(v)) : v; });
      let t = Date.parse(o.t); if (!isFinite(t) && /^\d{9,13}$/.test(String(o.t))) t = Number(o.t) * (String(o.t).length <= 10 ? 1000 : 1);
      if (!isFinite(t)) return;
      o.t = t; if (o.n == null) o.n = k + 1;
      // PAP from millimetres to inches: over = right of the grip for a righty, up = toward the fingers (the file counts down).
      if (o.papR != null) o.papO = o.papR / 25.4;
      if (o.papD != null) o.papU = -o.papD / 25.4;
      o.spare = /^true|1|yes$/i.test(String(o.spare || ''));
      o.foul = /^true|1|yes$/i.test(String(o.foul || ''));
      throws.push(o);
    });
    if (!throws.length) return { error: 'No throws with a time on them were found.' };
    throws.sort((a, b) => a.t - b.t);
    const most = (f) => { const c = {}; throws.forEach(x => { if (x[f]) c[x[f]] = (c[x[f]] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1]).map(e => e[0])[0] || ''; };
    return { throws, found: Object.keys(idx), sensorName: most('sensor'), ballName: most('ball'), hole: most('hole') };
  }

  // ---------- numbers ----------
  const vals = (T, f) => T.map(x => x[f]).filter(v => v != null && isFinite(v));
  const mean = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
  const sd = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
  const median = (a) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y), h = b.length >> 1; return b.length % 2 ? b[h] : (b[h - 1] + b[h]) / 2; };
  function stats(T) {
    const o = { n: T.length };
    Object.keys(M).forEach(f => { const a = vals(T, f); if (a.length) o[f] = { avg: mean(a), sd: sd(a), min: Math.min(...a), max: Math.max(...a), n: a.length }; });
    return o;
  }
  const U = (f) => M[f] ? (M[f].unit === '°' ? '°' : ' ' + M[f].unit) : '';
  const fmt = (f, v) => v == null || !isFinite(v) ? '—' : (M[f] ? v.toFixed(M[f].dp) : String(v));
  const signed = (f, v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + fmt(f, Math.abs(v));
  function frac(inches) { // 5.02 → 5"; 0.31 → 5/16"
    if (inches == null || !isFinite(inches)) return '—';
    const neg = inches < 0, x = Math.abs(inches); let w = Math.floor(x), n = Math.round((x - w) * 16);
    if (n === 16) { w++; n = 0; }
    let d = 16; while (n && n % 2 === 0) { n /= 2; d /= 2; }
    return (neg ? '−' : '') + (w ? w : '') + (n ? (w ? ' ' : '') + n + '/' + d : (w ? '' : '0')) + '"';
  }

  // Bullet list of what changed between two groups of throws (only changes big enough to matter).
  function changes(A, B, fields) {
    const a = stats(A), b = stats(B), out = [];
    (fields || ['speed', 'rpm', 'rot', 'tilt', 'loft', 'swing', 'papO', 'papU']).forEach(f => {
      if (!a[f] || !b[f]) return; const d = b[f].avg - a[f].avg;
      if (Math.abs(d) >= M[f].step) out.push({ f, d, from: a[f].avg, to: b[f].avg });
    });
    return out;
  }
  const changeText = (c) => {
    if (c.f === 'papO') return `PAP moved ${frac(Math.abs(c.d))} ${c.d < 0 ? 'in (less over)' : 'out (more over)'}`;
    if (c.f === 'papU') return `PAP moved ${frac(Math.abs(c.d))} ${c.d > 0 ? 'up' : 'down'}`;
    return `${M[c.f].label} ${c.d > 0 ? 'up' : 'down'} ${fmt(c.f, Math.abs(c.d))}${U(c.f)} (${fmt(c.f, c.from)} → ${fmt(c.f, c.to)})`;
  };

  // ---------- matching throws to logged shots ----------
  // Only shots thrown with the sensor ball are expected to have a throw (spare-ball shots don't).
  // You log a shot some seconds after you throw it, so the typical delay is found first, then throws and shots are paired in order.
  function match(session, throws, ball) {
    const ev = [];
    (session.shots || []).forEach(sh => {
      if (!sh || sh.type === 'gameStart') return;
      if (sh.ball === ball && sh.at) ev.push({ at: sh.at, ref: sh, first: true });
      if (sh.second && sh.second.ball === ball && sh.second.at) ev.push({ at: sh.second.at, ref: sh.second, first: false, parent: sh });
    });
    ev.sort((a, b) => a.at - b.at);
    const T = throws.slice().sort((a, b) => a.t - b.t);
    if (!ev.length) return { pairs: [], extra: T, unlogged: [], delay: null, events: 0 };
    // typical delay: for each shot, the gap back to the latest throw before it (within 3 minutes)
    const gaps = [];
    ev.forEach(e => { let best = null; T.forEach(x => { const g = e.at - x.t; if (g >= -5000 && g <= 180000 && (best == null || g < best)) best = g; }); if (best != null) gaps.push(best); });
    const delay = gaps.length ? median(gaps) : 20000;
    const TOL = 60000;
    const pairs = [], used = new Set(); let j = 0;
    ev.forEach(e => {
      let bi = -1, bd = Infinity;
      for (let k = j; k < T.length; k++) {
        const off = (e.at - T[k].t) - delay;
        if (off < -TOL) break;            // throws after this are too late for this shot
        if (Math.abs(off) <= TOL && Math.abs(off) < bd) { bd = Math.abs(off); bi = k; }
      }
      if (bi >= 0) { pairs.push({ e, x: T[bi] }); used.add(bi); j = bi + 1; }
    });
    return { pairs, extra: T.filter((_, k) => !used.has(k)), unlogged: ev.filter(e => !pairs.some(p => p.e === e)), delay, events: ev.length };
  }

  const pick = (x) => { const o = {}; ['t', 'n', 'rpm', 'speed', 'avgSpeed', 'rot', 'tilt', 'loft', 'swing', 'relH', 'skid', 'hook', 'roll', 'flare', 'papO', 'papU'].forEach(f => { if (x[f] != null) o[f] = x[f]; }); return o; };

  // Writes the match onto the night: each matched shot gets .sensor, the night gets .sensorData.
  function attach(session, parsed, ball, fileName) {
    const r = match(session, parsed.throws, ball);
    (session.shots || []).forEach(sh => { if (!sh) return; delete sh.sensor; if (sh.second) delete sh.second.sensor; });
    r.pairs.forEach(p => { p.e.ref.sensor = pick(p.x); });
    session.sensorData = Object.assign({}, session.sensorData || {}, {
      ball, file: fileName || '', importedAt: Date.now(), sensorName: parsed.sensorName || '', sensorBall: parsed.ballName || '',
      throws: parsed.throws.map(pick), matched: r.pairs.length, events: r.events, extra: r.extra.length, unlogged: r.unlogged.length,
      delaySec: r.delay != null ? Math.round(r.delay / 1000) : null,
    });
    if (parsed.ballName && ball) { const m = lsGet(MAP_KEY, {}); m[parsed.ballName] = ball; lsSet(MAP_KEY, m); }
    return r;
  }

  // Best guess for which ball the sensor was in: tonight's setting, the name you linked before, a ball with the same name, or the most-thrown ball.
  function guessBall(session, parsed) {
    const balls = {}; (session.shots || []).forEach(sh => { if (sh && sh.type !== 'gameStart' && sh.ball) balls[sh.ball] = (balls[sh.ball] || 0) + 1; });
    const names = Object.keys(balls);
    const linked = parsed && parsed.ballName ? (lsGet(MAP_KEY, {}) || {})[parsed.ballName] : '';
    const same = parsed && parsed.ballName ? names.find(n => key(n) === key(parsed.ballName) || key(n).includes(key(parsed.ballName)) || key(parsed.ballName).includes(key(n))) : '';
    const set = session.sensor && session.sensor.ball;
    const top = Object.entries(balls).sort((a, b) => b[1] - a[1]).map(e => e[0])[0] || '';
    return [set, linked, same, top].find(n => n && names.includes(n)) || top;
  }

  // ---------- review ----------
  const row = (cells, head) => `<tr>${cells.map(c => head ? `<th>${c}</th>` : `<td>${c}</td>`).join('')}</tr>`;
  const table = (head, rows) => `<div class="sn-tw"><table class="sn-t">${row(head, true)}${rows.join('')}</table></div>`;

  function summaryTable(T, base) {
    const s = stats(T), b = base ? base : null;
    const head = ['', 'Average', 'Throw to throw'].concat(b ? ['Warm-up'] : []);
    const rows = SHOW.filter(f => s[f]).map(f => row([`${M[f].label}`, `<b>${fmt(f, s[f].avg)}</b>${U(f)}`, s[f].sd != null ? '±' + fmt(f, s[f].sd) : '—'].concat(b ? [b[f] ? fmt(f, b[f].avg) : '—'] : [])));
    if (s.papO) rows.push(row(['PAP', `<b>${frac(s.papO.avg)} over, ${frac(s.papU ? s.papU.avg : null)} ${s.papU && s.papU.avg < 0 ? 'down' : 'up'}</b>`, '±' + frac(s.papO.sd)].concat(b ? [b.papO ? `${frac(b.papO.avg)} over` : '—'] : [])));
    return table(head, rows);
  }

  // Your feel vs the sensor: "Speed vs normal" and "Ball reaction early / long" checked against what was measured.
  function feelChecks(pairs, T) {
    const out = [];
    const sp = median(vals(T, 'speed')), sk = median(vals(T, 'skid'));
    const sCalls = pairs.filter(p => p.first && ['slower', 'same', 'faster'].includes(p.sh.speedTrend) && p.x.speed != null);
    if (sp != null && sCalls.length) {
      let ok = 0; const misses = [];
      sCalls.forEach(p => { const d = p.x.speed - sp, real = d >= 0.3 ? 'faster' : d <= -0.3 ? 'slower' : 'same'; if (real === p.sh.speedTrend) ok++; else misses.push(`felt ${p.sh.speedTrend}, was ${signed('speed', d)} mph`); });
      out.push(`<b>Speed:</b> your feel matched the sensor on <b>${ok} of ${sCalls.length}</b> shot${sCalls.length === 1 ? '' : 's'} you marked (normal = tonight's middle, ${fmt('speed', sp)} mph).${misses.length ? ` <span class="small dim">Off: ${misses.slice(0, 3).map(esc).join('; ')}${misses.length > 3 ? '…' : ''}</span>` : ''}`);
    }
    const kCalls = pairs.filter(p => p.first && Array.isArray(p.sh.obs) && p.sh.obs.some(o => o === 'Too early' || o === 'Too long') && p.x.skid != null);
    if (sk != null && kCalls.length) {
      let ok = 0; kCalls.forEach(p => { const early = p.sh.obs.includes('Too early'); if (early ? p.x.skid <= sk - 2 : p.x.skid >= sk + 2) ok++; });
      out.push(`<b>Early / long:</b> the sensor's skid agreed with your read on <b>${ok} of ${kCalls.length}</b> (tonight's middle skid ${fmt('skid', sk)} ft; early = 2 ft shorter, long = 2 ft longer).`);
    }
    if (!out.length) out.push('<span class="small dim">Mark "Speed vs normal" or "Early / Long" on a few shots and this compares your feel with the sensor.</span>');
    return out;
  }

  function strikesVsRest(pairs) {
    const F = pairs.filter(p => p.first && !p.sh.isFill);
    const isK = (sh) => (sh.leaveTag === 'Strike') || (Array.isArray(sh.leavePins) && sh.leavePins.length === 0);
    const K = F.filter(p => isK(p.sh)).map(p => p.x), R = F.filter(p => !isK(p.sh)).map(p => p.x);
    if (K.length < 3 || R.length < 3) return '';
    const a = stats(K), b = stats(R);
    const rows = ['speed', 'rpm', 'rot', 'tilt', 'loft', 'skid'].filter(f => a[f] && b[f]).map(f => { const d = a[f].avg - b[f].avg, big = Math.abs(d) >= M[f].step; return row([M[f].label, fmt(f, a[f].avg), fmt(f, b[f].avg), big ? `<b>${signed(f, d)}</b>` : `<span class="dim">${signed(f, d)}</span>`]); });
    return `<div style="margin-top:10px"><b>Strikes vs the rest</b> <span class="small dim">(${K.length} strikes, ${R.length} other first balls; bold = a real difference)</span>${table(['', 'Strikes', 'Other', 'Difference'], rows)}</div>`;
  }

  function byGame(pairs) {
    const g = {}; pairs.filter(p => p.first).forEach(p => { const n = Number(p.sh.gameNo) || 1; (g[n] = g[n] || []).push(p.x); });
    const nos = Object.keys(g).map(Number).sort((a, b) => a - b); if (nos.length < 2) return '';
    const rows = nos.map(n => { const s = stats(g[n]); return row([`Game ${n}`, String(g[n].length)].concat(['speed', 'rpm', 'rot', 'loft'].map(f => s[f] ? fmt(f, s[f].avg) : '—'))); });
    return `<div style="margin-top:10px"><b>Game by game</b>${table(['', 'Shots', 'mph', 'rpm', 'Rotation', 'Loft'], rows)}</div>`;
  }

  function driftList(T) {
    if (T.length < 9) return [];
    const third = Math.floor(T.length / 3);
    return changes(T.slice(0, third), T.slice(-third)).map(changeText);
  }

  function profilePap() { try { const b = lsGet('bt_bowler_v1', {}) || {}; return String(b.pap || '').trim(); } catch (_e) { return ''; } }

  // The whole sensor panel for a night (or a sensor-only session when session is null).
  function reviewHTML(session, sensorOnly) {
    const D = sensorOnly || (session && session.sensorData);
    if (!D || !D.throws || !D.throws.length) return '';
    const T = D.throws;
    const pairs = [];
    if (session && !sensorOnly) (session.shots || []).forEach(sh => { if (!sh) return; if (sh.sensor) pairs.push({ sh, x: sh.sensor, first: true }); if (sh.second && sh.second.sensor) pairs.push({ sh: sh.second, x: sh.second.sensor, first: false }); });
    const used = pairs.length ? pairs.map(p => p.x) : T;
    const base = session && session.sensor && session.sensor.baseline ? session.sensor.baseline.stats : null;
    const first = new Date(T[0].t), last = new Date(T[T.length - 1].t);
    const tm = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const parts = [];
    parts.push(`<div class="small">${T.length} throw${T.length === 1 ? '' : 's'} from ${esc(D.sensorName || 'the sensor')}${D.sensorBall ? ` (${esc(D.sensorBall)})` : ''}, ${tm(first)}–${tm(last)}${D.ball ? ` · in <b>${esc(D.ball)}</b>` : ''}${!sensorOnly && D.events ? ` · matched <b>${D.matched} of ${D.events}</b> ${esc(D.ball)} shots${D.delaySec != null ? ` (you logged about ${D.delaySec} s after each throw)` : ''}` : ''}${!sensorOnly && D.extra ? ` · ${D.extra} throw${D.extra === 1 ? '' : 's'} not matched (practice or extra balls)` : ''}</div>`);
    parts.push(`<div style="margin-top:8px"><b>Your release${pairs.length ? ' on the matched shots' : ''}</b>${summaryTable(used, base)}</div>`);
    const roll = stats(used).roll, skid = stats(used).skid;
    if (roll && skid && roll.avg < 4) parts.push(`<div class="small" style="margin-top:6px">The ball skidded about <b>${fmt('skid', skid.avg)} ft</b> and rolled only about <b>${fmt('roll', roll.avg)} ft</b> before the pins: it's still finishing its hook at the pins, not rolling into them.</div>`);
    const dr = driftList(pairs.length ? pairs.map(p => p.x).sort((a, b) => a.t - b.t) : T);
    parts.push(`<div style="margin-top:10px"><b>Start to finish</b> <span class="small dim">(first third vs last third)</span>${dr.length ? `<ul class="nr-list">${dr.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '<div class="small">Your release held steady from start to finish.</div>'}</div>`);
    if (base) { const ch = changes(session.sensor.baseline.throws || [], used).map(changeText); parts.push(`<div style="margin-top:10px"><b>Tonight vs your warm-up</b>${ch.length ? `<ul class="nr-list">${ch.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '<div class="small">Same release as your warm-up.</div>'}</div>`); }
    if (pairs.length) {
      parts.push(byGame(pairs));
      parts.push(strikesVsRest(pairs));
      parts.push(`<div style="margin-top:10px"><b>👁️ Your feel vs the sensor</b><ul class="nr-list">${feelChecks(pairs, used).map(t => `<li>${t}</li>`).join('')}</ul></div>`);
    }
    const s = stats(used), pp = profilePap();
    if (s.papO) parts.push(`<div class="small" style="margin-top:10px">📍 <b>PAP from the sensor:</b> ${frac(s.papO.avg)} over, ${frac(s.papU ? Math.abs(s.papU.avg) : null)} ${s.papU && s.papU.avg < 0 ? 'down' : 'up'} (throw to throw ±${frac(s.papO.sd)})${pp ? ` · your saved PAP: ${esc(pp)}` : ''}. One session isn't enough to change your PAP: watch it over a few nights.</div>`);
    return parts.join('');
  }

  function throwListHTML(T) {
    const tm = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    return table(['#', 'Time', 'mph', 'rpm', 'Rot', 'Tilt', 'Loft', 'Skid', 'Hook', 'Roll', 'PAP over'],
      T.map(x => row([String(x.n), tm(x.t), fmt('speed', x.speed), fmt('rpm', x.rpm), fmt('rot', x.rot), fmt('tilt', x.tilt), fmt('loft', x.loft), fmt('skid', x.skid), fmt('hook', x.hook), fmt('roll', x.roll), x.papO != null ? frac(x.papO) : '—'])));
  }

  // ---------- sensor-only sessions ----------
  function sessions() { return lsGet(SESS_KEY, []) || []; }
  function saveSessions(a) { return lsSet(SESS_KEY, a); }
  function newSession(parsed, fileName, ball) {
    const a = sessions(), T = parsed.throws;
    const o = { id: 'sns_' + Math.random().toString(36).slice(2, 10), savedAt: T[0].t, file: fileName || '', sensorName: parsed.sensorName, sensorBall: parsed.ballName, ball: ball || '', throws: T.map(pick), kind: 'practice' };
    const dup = a.findIndex(x => x.throws && x.throws.length === o.throws.length && x.throws[0].t === o.throws[0].t);
    if (dup >= 0) a.splice(dup, 1);
    a.unshift(o); saveSessions(a); return o;
  }

  const CSS = `.sn-tw{overflow-x:auto;margin-top:6px}.sn-t{border-collapse:collapse;font-size:13px;min-width:100%}.sn-t th,.sn-t td{padding:4px 8px;text-align:right;white-space:nowrap;border-bottom:1px solid rgba(127,127,127,.2)}.sn-t th:first-child,.sn-t td:first-child{text-align:left}.sn-t th{font-weight:700;opacity:.8}.sn-pick{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}.sn-pick select{flex:1;min-width:160px}`;
  function css() { if (document.getElementById('snCss')) return; const st = document.createElement('style'); st.id = 'snCss'; st.textContent = CSS; document.head.appendChild(st); }

  // Opens the phone's file picker for a CSV and hands back the text.
  function pickFile(cb) {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,text/csv,text/plain'; inp.style.display = 'none';
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => cb(String(r.result || ''), f.name); r.readAsText(f); inp.remove(); };
    document.body.appendChild(inp); inp.click();
  }

  window.BTSensor = { esc, parse, stats, match, attach, guessBall, reviewHTML, throwListHTML, changes, changeText, frac, fmt, sessions, saveSessions, newSession, pickFile, css, lsGet, lsSet, MAP_KEY, PREF_KEY, SESS_KEY, M };
})();
