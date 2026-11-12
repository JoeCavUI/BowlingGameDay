/* Bowling Tool: 🧪 Gap lab (Arsenal → Gaps & ideas). Maps every active ball, as drilled and surfaced, on your motion
   (strength · timing · shape, from your speed and revs), finds the biggest empty spot first, then splits what's left into
   smaller and smaller gaps. Each gap gets test ideas, cheapest first: a surface on a ball you own, a new layout on a copy
   of a ball you own, or the spec of a new ball. Ideas you've already tried are skipped. */
(function (root) {
  'use strict';
  const BT = () => root.BT, CH = () => root.BTChart;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TESTS_KEY = 'bt_gap_tests_v1';
  const SURF = ['1000', '1500', '2000', '3000', '4000', 'Polish'];
  const surfName = (s) => /polish/i.test(s) ? 'polished' : `${s} grit`;
  const gritOf = (s) => { const g = BT().surfaceToGrit ? BT().surfaceToGrit(s) : NaN; return /polish/i.test(String(s)) ? 'P' : String(g); };

  const vec = (row, bw) => { const v = BT().motionVector(row, bw || {}); return { h: v.hook, l: v.length, b: v.backend }; };
  const dist = (a, b) => Math.sqrt((a.h - b.h) ** 2 + (a.l - b.l) ** 2 + (a.b - b.b) ** 2);
  const simName = (row, tag) => { const c = Object.assign({}, row); Object.keys(c).filter(k => /ball\s*name|^name$/i.test(k)).forEach(k => { c[k] = String(c[k]) + ' ·' + tag; }); return c; };
  function withLayout(row, pin, drill) {
    const c = simName(row, 'lay'); c.PAP = String(pin); c['PAP#1'] = String(pin); c['Drill Angle'] = String(drill); c['Pin Location'] = pin < 3 ? 'Short' : 'Up';
    try { if (c.__layout) { const L = JSON.parse(c.__layout); L.pinToPAP = pin; L.drill = drill; c.__layout = JSON.stringify(L); } } catch (_e) {}
    return c;
  }
  function withSurf(row, s) { const c = simName(row, 'sim'); c.Surface = s; c.Finish = s; return c; }
  function boxOf(row, v) { let k = ''; try { k = CH().label(BT().matrixCellForRow(row).strength + '|' + BT().matrixCellForRow(row).shape); } catch (_e) {} return k; }

  function tests() { try { const a = JSON.parse(localStorage.getItem(TESTS_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (_e) { return []; } }
  function addTest(t) { const a = tests(); a.push(Object.assign({ at: Date.now() }, t)); try { localStorage.setItem(TESTS_KEY, JSON.stringify(a)); } catch (_e) {} }
  function removeTest(id) { try { localStorage.setItem(TESTS_KEY, JSON.stringify(tests().filter(t => t.id !== id))); } catch (_e) {} }

  function build(rows, bowler, nGaps) {
    const B = BT(), care = (n) => (B.ballCareFor ? B.ballCareFor(n) : {}) || {};
    const spare = (r) => { try { return B.isSpareBall ? B.isSpareBall(r) : false; } catch (_e) { return false; } };
    const own = (rows || []).filter(r => r && !r.__proposed && B.ballName(r) && !care(B.ballName(r)).retired && !spare(r));
    if (own.length < 3) return { own: own.length, gaps: [] };
    const pts = own.map(r => ({ name: B.ballName(r), row: r, v: vec(r, bowler) }));
    const triedSurf = {}; own.forEach(r => { const n = B.ballName(r); const s = new Set([gritOf(B.ballSurface(r))]); try { (B.resurfaceLog(n) || []).forEach(e => e.surface && s.add(gritOf(e.surface))); } catch (_e) {} tests().filter(t => t.ball === n && t.kind === 'surface').forEach(t => s.add(gritOf(t.surface))); triedSurf[n] = s; });
    const triedLay = new Set(tests().filter(t => t.kind === 'layout').map(t => `${t.ball}|${t.pin}|${t.drill}`));
    const triedNew = new Set(tests().filter(t => t.kind === 'new').map(t => t.key));
    // Candidates: everything you could test.
    const C = [];
    own.forEach(r => { const n = B.ballName(r);
      SURF.forEach(s => { if (triedSurf[n].has(gritOf(s))) return; const c = withSurf(r, s); C.push({ kind: 'surface', cost: 1, ball: n, surface: s, row: c, v: vec(c, bowler), t: `${n} at ${surfName(s)}`, sub: `now ${surfName(B.ballSurface(r) || '?')}` }); });
      [[2.5, 45], [2.5, 75], [4, 45], [4, 75], [5.5, 45], [5.5, 75]].forEach(([pin, drill]) => { if (triedLay.has(`${n}|${pin}|${drill}`)) return; const c = withLayout(r, pin, drill); C.push({ kind: 'layout', cost: 2, ball: n, pin, drill, row: c, v: vec(c, bowler), t: `another ${n}: pin ${pin}″, drill angle ${drill}°`, sub: `same cover, surface ${surfName(B.ballSurface(r) || '?')}` }); });
    });
    const covers = [['Solid', 'solid reactive'], ['Hybrid', 'hybrid reactive'], ['Pearl', 'pearl reactive']], cores = [['Sym', 0.030, 0], ['Sym', 0.050, 0], ['Asym', 0.050, 0.015]];
    covers.forEach(([cv, cvN]) => cores.forEach(([co, df, psa]) => ['2000', '3000', 'Polish'].forEach(s => [[3, 50], [5, 70]].forEach(([pin, drill]) => {
      const key = `${cv}|${co}|${df}|${s}|${pin}|${drill}`; if (triedNew.has(key)) return;
      const row = { 'Ball Name': '·new ' + key, Brand: '', Cover: cv, Core: co, Diff: String(df), RG: '2.50', PSA: psa ? String(psa) : '', Surface: s, PAP: String(pin), 'Drill Angle': String(drill) };
      C.push({ kind: 'new', cost: 3, key, row, v: vec(row, bowler), t: `New ${cvN}, ${co === 'Asym' ? 'asymmetric' : 'symmetric'} ${df >= 0.045 ? 'high' : 'low'}-diff core (~${df.toFixed(3)})`, sub: `${surfName(s)}, pin ${pin}″, drill angle ${drill}°` }); }))));
    // Only holes inside the range your arsenal already spans (a little margin): the gaps between balls, not 'stronger than anything'.
    const ax = ['h', 'l', 'b'], lo = {}, hi = {}; ax.forEach(k => { const v = pts.map(p => p.v[k]); const a = Math.min(...v), z = Math.max(...v), m = (z - a) * 0.05; lo[k] = a - m; hi[k] = z + m; });
    for (let i = C.length - 1; i >= 0; i--) if (!ax.every(k => C[i].v[k] >= lo[k] && C[i].v[k] <= hi[k])) C.splice(i, 1);
    if (!C.length) return { own: own.length, gaps: [] };
    // Farthest-point search: biggest hole first, then pretend it's filled and look again (the holes get smaller).
    const filled = pts.map(p => p.v), gaps = [];
    const nn = (v, set) => set.reduce((m, q) => Math.min(m, dist(v, q)), Infinity);
    for (let g = 0; g < (nGaps || 5); g++) {
      let best = null, bd = -1; C.forEach(c => { const d = nn(c.v, filled); if (d > bd) { bd = d; best = c; } });
      if (!best || bd < 0.04) break;
      const nearOwn = pts.slice().sort((a, b) => dist(a.v, best.v) - dist(b.v, best.v))[0];
      // Ideas: cheapest first among candidates that land close to the gap.
      const R = Math.max(0.035, bd * 0.45);
      const near = C.filter(c => dist(c.v, best.v) <= R).sort((a, b) => a.cost - b.cost || dist(a.v, best.v) - dist(b.v, best.v));
      const ideas = []; ['surface', 'layout', 'new'].forEach(k => { const x = near.filter(c => c.kind === k); x.slice(0, 1).forEach(c => ideas.push(c)); });
      let box = ''; try { box = CH().label(CH().place([best.row], bowler)[0].rowKey); } catch (_e) {}
      gaps.push({ n: g + 1, size: bd, v: best.v, box, timing: CH() ? CH().timingWord(best.v.l) : '', nearest: nearOwn ? nearOwn.name : '', ideas: ideas.slice(0, 4) });
      filled.push(best.v);
    }
    return { own: own.length, gaps };
  }

  function sizeWord(d) { return d >= 0.16 ? 'big' : d >= 0.09 ? 'medium' : 'small'; }
  function describe(v) {
    const h = v.h > 0.62 ? 'strong' : v.h < 0.42 ? 'weak' : 'medium', l = v.l > 0.66 ? 'late' : v.l < 0.42 ? 'early' : 'mid-lane', b = v.b > 0.6 ? 'sharp' : v.b < 0.42 ? 'smooth' : 'even';
    return `${h}, reads ${l}, ${b} turn`;
  }

  function render(box, rows, bowler) {
    if (!box) return;
    const R = build(rows, bowler, 5);
    if (!R.gaps.length) { box.innerHTML = `<div class="small dim">${R.own < 3 ? 'Add at least 3 active balls to find gaps.' : 'No real gaps left: your arsenal covers your motion well.'}</div>`; return; }
    const T = tests();
    const kindL = { surface: '🧽 Surface', layout: '🛠️ Layout', new: '🆕 New ball' };
    box.innerHTML = `<div class="small dim" style="margin-bottom:8px">Your ${R.own} active balls as drilled, on your speed and revs. Biggest gap first; each next one is what's left once the one above is filled. Ideas cheapest first.</div>`
      + R.gaps.map(g => `<div class="gl-gap gl-${sizeWord(g.size)}"><div class="gl-h"><b>Gap ${g.n} · ${sizeWord(g.size)}</b><span class="small dim">${esc(g.box)}${g.timing ? ` · reads ${g.timing}` : ''}</span></div>
        <div class="small">Nearest ball you own: ${esc(g.nearest)}.</div>
        ${g.ideas.map(c => { const id = c.kind === 'surface' ? `s|${c.ball}|${c.surface}` : c.kind === 'layout' ? `l|${c.ball}|${c.pin}|${c.drill}` : `n|${c.key}`; const on = T.find(t => t.id === id);
          return `<div class="gl-idea"><div><span class="gl-k">${kindL[c.kind]}</span> ${esc(c.t)} <span class="small dim">· ${esc(c.sub)}</span></div>${on ? `<button type="button" class="btn secondary gl-btn" data-gl-undo="${esc(id)}">✓ Testing since ${new Date(on.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · undo</button>` : `<button type="button" class="btn secondary gl-btn" data-gl-test="${esc(id)}">Testing this</button>`}</div>`; }).join('')}
      </div>`).join('')
      + `<div class="small dim" style="margin-top:6px">Ideas are a model, not a promise. "Testing this" skips it from future gaps; the real result comes from the nights you log with it.</div>`;
    box.querySelectorAll('[data-gl-test]').forEach(b => b.addEventListener('click', () => { const id = b.getAttribute('data-gl-test'), p = id.split('|');
      if (p[0] === 's') addTest({ id, kind: 'surface', ball: p[1], surface: p[2] }); else if (p[0] === 'l') addTest({ id, kind: 'layout', ball: p[1], pin: Number(p[2]), drill: Number(p[3]) }); else addTest({ id, kind: 'new', key: p.slice(1).join('|') });
      render(box, rows, bowler); }));
    box.querySelectorAll('[data-gl-undo]').forEach(b => b.addEventListener('click', () => { removeTest(b.getAttribute('data-gl-undo')); render(box, rows, bowler); }));
  }

  root.BTGapLab = { build, render, tests };
})(typeof window !== 'undefined' ? window : globalThis);
