/* Bowling Tool — Barnes chart (pure logic, no DOM).
   Chris Barnes's six boxes (Strong/Medium/Weak × Smooth/Sharp) plus a Urethane row (ZVL Bowling's addition),
   each ordered Early → Late. Unlike a printed chart, the Early → Late position is worked out for THIS bowler:
   the motion model's "length" already includes their speed, revs, tilt and rotation.
   Needs window.BT (app.js). Exposes window.BTChart. */
(function (root) {
  'use strict';
  const BT = root.BT;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  const ROWS = [
    { key: 'STRONG|SMOOTH', label: 'Strong / Smooth', job: 'Heavy or long oil, early in the night: reads early and rolls evenly.' },
    { key: 'STRONG|SHARP', label: 'Strong / Sharp', job: 'Heavy oil with friction downlane: lots of hook and a strong move off the spot.' },
    { key: 'MEDIUM|SMOOTH', label: 'Medium / Smooth', job: 'Your typical house shot benchmark: predictable, easy to read.' },
    { key: 'MEDIUM|SHARP', label: 'Medium / Sharp', job: 'Medium oil when you need more angle and carry at the back.' },
    { key: 'WEAK|SMOOTH', label: 'Weak / Smooth', job: 'Light oil or burned fronts: controlled, won\'t overreact.' },
    { key: 'WEAK|SHARP', label: 'Weak / Sharp', job: 'Late in the night: gets through the dry front and still turns at the back.' },
    { key: 'URETHANE', label: 'Urethane / urethane-like', job: 'Short, flat or very dry lanes: big control, very little backend.', optional: true },
  ];

  // What to look for to fill a box (spec-based shopping guidance, no brands).
  const SPEC = {
    'STRONG|SMOOTH': 'solid (or hybrid) reactive cover, sanded 1000–2000 grit, high-differential core (about 0.050+), symmetric or a mild asymmetric',
    'STRONG|SHARP': 'hybrid or pearl cover with a strong asymmetric core (high diff and PSA), 2000–3000 grit or a light polish',
    'MEDIUM|SMOOTH': 'solid or hybrid cover, 2000–3000 grit, medium differential (about 0.035–0.045), symmetric core',
    'MEDIUM|SHARP': 'pearl or hybrid cover, polished or 4000+, medium differential, asymmetric or a strong symmetric',
    'WEAK|SMOOTH': 'solid or low-diff pearl cover, 3000–4000 grit, low differential (under about 0.030), symmetric',
    'WEAK|SHARP': 'pearl cover, polished, low-to-medium differential, symmetric: clean through the front, quick at the back',
    'URETHANE': 'urethane or urethane-like cover (e.g. pearl urethane), about 1500–2000 grit',
  };
  const SURFACES = ['1000', '1500', '2000', '3000', '4000', 'Polish'];

  function coverOf(row) { return String(BT.ballCover(row) || '').toLowerCase(); }
  function isSpare(row) { const c = coverOf(row); return /polyester|plastic|spare/.test(c); }
  function isUrethane(row) { return /urethane/.test(coverOf(row)); }

  // Timing for this bowler: 0 = reads very early, 1 = reads very late (motion model length).
  function timingOf(row, bowler) {
    try { return BT.motionVector(row, bowler || {}).length; } catch (_e) { return 0.5; }
  }
  function rowKeyOf(row) {
    if (isUrethane(row)) return 'URETHANE';
    const c = BT.matrixCellForRow(row);
    return `${c.strength}|${c.shape}`;
  }
  // Chart x position in percent (fixed scale so the chart is comparable over time).
  const T0 = 0.20, T1 = 0.95;
  const xPct = (t) => Math.round(clamp((t - T0) / (T1 - T0), 0, 1) * 1000) / 10;
  const timingWord = (t) => t < 0.42 ? 'early' : t > 0.66 ? 'late' : 'mid';

  function place(rows, bowler, opts) {
    opts = opts || {};
    const care = (n) => (BT.ballCareFor ? BT.ballCareFor(n) : {}) || {};
    const out = [];
    for (const row of (rows || [])) {
      const name = BT.ballName(row);
      if (!name) continue;
      const v = BT.motionVector(row, bowler || {});
      out.push({
        name, row,
        rowKey: isSpare(row) ? 'SPARE' : rowKeyOf(row),
        timing: v.length, hook: v.hook, backend: v.backend, vec: v,
        x: xPct(v.length),
        surface: BT.ballSurface(row), cover: BT.ballCover(row),
        proposed: !!row.__proposed,
        retired: !!care(name).retired,
      });
    }
    return out;
  }

  // Gaps, duplicates and step sizes for the ACTIVE balls you own (not retired, not what-if).
  function analyze(balls) {
    const act = balls.filter(b => !b.retired && !b.proposed && b.rowKey !== 'SPARE');
    const byRow = {};
    ROWS.forEach(r => { byRow[r.key] = act.filter(b => b.rowKey === r.key).sort((a, b) => a.timing - b.timing); });
    const six = ROWS.filter(r => !r.optional);
    const covered = six.filter(r => byRow[r.key].length).map(r => r.key);
    const empty = six.filter(r => !byRow[r.key].length).map(r => r.key);
    // Duplicates: same box, nearly the same timing and motion.
    const dups = [];
    for (const r of ROWS) {
      const L = byRow[r.key];
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
        const a = L[i], b = L[j];
        const d = Math.hypot(a.vec.hook - b.vec.hook, a.vec.length - b.vec.length, a.vec.backend - b.vec.backend);
        if (Math.abs(a.timing - b.timing) <= 0.04 && d <= 0.07) dups.push({ a: a.name, b: b.name, box: r.label, d });
      }
    }
    dups.sort((x, y) => x.d - y.d);
    // Steps: line every active ball up from strongest to weakest hook; a big jump = a hole in your step-down.
    const ladder = act.filter(b => b.rowKey !== 'URETHANE').slice().sort((a, b) => b.hook - a.hook);
    const steps = [];
    for (let i = 1; i < ladder.length; i++) {
      const gap = ladder[i - 1].hook - ladder[i].hook;
      if (gap >= 0.12) steps.push({ from: ladder[i - 1].name, to: ladder[i].name, gap: Math.round(gap * 100) });
    }
    // Timing spread inside a box: everything on one side?
    const lopsided = [];
    for (const r of ROWS) {
      const L = byRow[r.key];
      if (L.length >= 2 && L.every(b => b.timing > 0.62)) lopsided.push({ box: r.label, side: 'late' });
      if (L.length >= 2 && L.every(b => b.timing < 0.40)) lopsided.push({ box: r.label, side: 'early' });
    }
    const allLate = act.length >= 3 && act.filter(b => b.timing > 0.62).length >= act.length * 0.8;
    const allEarly = act.length >= 3 && act.filter(b => b.timing < 0.40).length >= act.length * 0.8;
    return { byRow, covered, empty, dups, steps, lopsided, allLate, allEarly, active: act.length, urethane: byRow.URETHANE.length };
  }

  // What a ball would be with a different surface (tuning sliders aside). Used by "resurface before you buy".
  function withSurface(row, surface, bowler) {
    const clone = Object.assign({}, row, { Surface: surface, Finish: surface });
    // Use a name the per-ball surface override can't match, so the new surface is what gets measured.
    const nameKeys = Object.keys(clone).filter(k => /ball\s*name|^name$/i.test(k));
    nameKeys.forEach(k => { clone[k] = String(clone[k]) + ' ·sim'; });
    const v = BT.motionVector(clone, bowler || {});
    return { rowKey: isUrethane(row) ? 'URETHANE' : rowKeyOf(clone), timing: v.length, x: xPct(v.length), vec: v };
  }

  // Cheapest fixes first: can resurfacing a ball you own fill an empty box without opening a new hole?
  function resurfaceIdeas(balls, an, bowler) {
    const ideas = [];
    if (!an.empty.length) return ideas;
    const act = balls.filter(b => !b.retired && !b.proposed && b.rowKey !== 'SPARE' && b.rowKey !== 'URETHANE');
    for (const b of act) {
      const othersInBox = an.byRow[b.rowKey].filter(x => x.name !== b.name).length;
      const isDup = an.dups.some(d => d.a === b.name || d.b === b.name);
      if (!othersInBox && !isDup) continue; // moving it would just open a new hole
      for (const s of SURFACES) {
        if (String(BT.surfaceToGrit(s)) === String(BT.surfaceToGrit(b.surface))) continue;
        const sim = withSurface(b.row, s, bowler);
        if (an.empty.includes(sim.rowKey)) {
          ideas.push({ ball: b.name, fromSurface: b.surface || '?', toSurface: s, fromBox: label(b.rowKey), toBox: label(sim.rowKey), toKey: sim.rowKey, timing: timingWord(sim.timing), why: isDup ? 'it overlaps another ball' : 'another ball still covers its box' });
        }
      }
    }
    // One idea per empty box, prefer the smallest surface change.
    const best = {};
    const step = (a, b) => Math.abs(SURFACES.indexOf(a) - SURFACES.indexOf(b));
    for (const i of ideas) {
      const cur = best[i.toKey];
      const ci = SURFACES.indexOf(i.fromSurface) >= 0 ? i.fromSurface : nearestSurface(i.fromSurface);
      i._cost = step(ci, i.toSurface);
      if (!cur || i._cost < cur._cost) best[i.toKey] = i;
    }
    return Object.values(best);
  }
  function nearestSurface(s) {
    const g = BT.surfaceToGrit(s);
    if (g >= 5000) return 'Polish';
    let bestS = '4000', bestD = Infinity;
    for (const x of SURFACES.slice(0, 5)) { const d = Math.abs(Number(x) - g); if (d < bestD) { bestD = d; bestS = x; } }
    return bestS;
  }
  const label = (k) => (ROWS.find(r => r.key === k) || { label: k === 'SPARE' ? 'Spare ball' : k }).label;

  // Before you buy: where would this ball land, and is it worth it?
  function buyVerdict(candidate, balls, an) {
    const box = candidate.rowKey, bl = label(box);
    const same = (an.byRow[box] || []);
    const near = same.map(b => ({ b, d: Math.hypot(b.vec.hook - candidate.vec.hook, b.vec.length - candidate.vec.length, b.vec.backend - candidate.vec.backend), dt: Math.abs(b.timing - candidate.timing) }))
      .sort((x, y) => x.d - y.d)[0];
    if (box === 'SPARE') return { kind: 'spare', text: `Spare ball: it doesn't change your strike-ball coverage.` };
    if (an.empty.includes(box)) return { kind: 'fills', text: `✅ Fills an empty box: ${bl} (${timingWord(candidate.timing)} for you). Nothing you own does this now.` };
    if (box === 'URETHANE' && !an.urethane) return { kind: 'fills', text: `✅ Adds a urethane option for short, flat or very dry lanes. You don't have one.` };
    if (near && near.dt <= 0.04 && near.d <= 0.07) return { kind: 'dup', text: `⚠️ Duplicates your ${near.b.name}: same box (${bl}) and about the same timing for you. Probably skip it, or resurface ${near.b.name} instead.` };
    // Does it land between two balls with a big step?
    const ladder = an.byRow ? Object.values(an.byRow).flat().filter(b => b.rowKey !== 'URETHANE').sort((a, b) => b.hook - a.hook) : [];
    for (let i = 1; i < ladder.length; i++) {
      const hi = ladder[i - 1], lo = ladder[i];
      if (hi.hook - lo.hook >= 0.12 && candidate.vec.hook < hi.hook && candidate.vec.hook > lo.hook) return { kind: 'step', text: `👍 Fills a big step between your ${hi.name} and ${lo.name}. A good in-between ball for transition.` };
    }
    const where = same.length ? `You already have ${same.length} in ${bl} (${same.map(b => b.name).join(', ')}), but this one reads ${candidate.timing < near.b.timing ? 'earlier' : 'later'} than ${near.b.name} for you.` : '';
    return { kind: 'ok', text: `🟡 Lands in ${bl}, ${timingWord(candidate.timing)} for you. ${where}`.trim() };
  }

  root.BTChart = { ROWS, SPEC, SURFACES, place, analyze, withSurface, resurfaceIdeas, buyVerdict, timingWord, label, xPct };
})(typeof window !== 'undefined' ? window : globalThis);
