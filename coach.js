/* Bowling Tool — Coach v2 decision engine.
   Pure logic (no DOM). Game Day calls BTCoach.evaluate(ctx) after every shot.

   Decision order (from the bowler's point of view):
     1. Who is bowling   -> Bowler profile (speed/rev dominance, tilt, rotation, hand)
     2. What they can do -> LASER confidence 1–5 (5 = strength). Coach only suggests moves they own.
     3. The lane         -> Oil pattern length / volume / ratio
     4. The equipment    -> ball motion model for each ball in tonight's bag
     5. What's happening -> each first ball: mark (miss room), pocket, leave, ball reaction

   Rules:
     - Never move off a poor shot (missed the mark and the lane didn't save it, or "Poor execution").
     - Don't wait too long: 2 good shots in a row telling the same story = move.
     - One change at a time, then watch 2 good shots to see if it worked.
     - Missed outside + recovered + pocket, AND missed inside + held + pocket = wide window: stay.
*/
(function (root) {
  'use strict';

  // ---------- helpers ----------
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // Mirror a lefty's pins to right-hander equivalents so one leave table works for both.
  const MIRROR = { 1: 1, 2: 3, 3: 2, 4: 6, 6: 4, 5: 5, 7: 10, 10: 7, 8: 9, 9: 8 };

  function leaveKey(pins, lefty) {
    const arr = (Array.isArray(pins) ? pins : []).map(Number).filter(Number.isFinite)
      .map(p => lefty ? MIRROR[p] : p).sort((a, b) => a - b);
    return arr.join('-');
  }

  // Leave meaning for a right-hander (lefty pins already mirrored).
  //  high   = ball got there too early / too strong (4, 4-9, 9, 4-6-7-10, ringing 10, Brooklyn)
  //  weak   = ball lost energy / hit light (flat 10, 2, 2-8, 8, 2-8-10, 8-10, 7 on light hits)
  //  split  = 2-10, 4-10 style (often over/under)
  function leaveMeaning(shot, lefty) {
    const tag = String(shot.leaveTag || '');
    if (tag === 'Brooklyn') return 'high';
    if (tag === 'Ringing 10') return 'high';
    if (tag === 'Flat 10') return 'weak';
    if (tag === 'Strike') return 'strike';
    const key = leaveKey(shot.leavePins, lefty);
    if (!key) return (shot.leaves || []).includes('Strike') ? 'strike' : 'none';
    if (['4', '4-9', '9', '4-6-7-10', '4-7-10', '6-7-10'].includes(key)) return 'high';
    if (['10', '2', '2-8', '8', '2-8-10', '8-10', '2-4-5', '2-5'].includes(key)) return 'weak';
    if (['2-10', '4-10', '2-7', '3-10', '4-6', '7-10'].includes(key)) return 'split';
    if (['7', '5', '5-7', '1-2-4-10'].includes(key)) return 'other';
    return 'other';
  }

  function pinsText(s) {
    return (Array.isArray(s.leavePins) ? s.leavePins : []).map(Number).filter(Number.isFinite).sort((a, b) => a - b).join('-');
  }

  function isStrikeShot(s) {
    const L = s.leaves || [];
    return L.includes('Strike') || L.includes('Brooklyn') || s.leaveTag === 'Strike' || s.leaveTag === 'Brooklyn';
  }

  // ---------- per-shot classification ----------
  function classify(s, lefty) {
    const miss = String(s.miss || 'didntTrack');
    const exec = num(s.executionQuality);
    const tapped = s.execTapped === true || exec === 1 || exec === 5; // older shots: only extremes count as tapped
    const outsideDir = lefty ? 'left' : 'right';

    // Execution
    let execution = 'unknown';
    if (exec === 1) execution = 'poor';
    else if (miss === 'leftMiss' || miss === 'rightMiss') execution = 'poor';
    else if (miss === 'noMiss' || miss === 'leftHeld' || miss === 'rightRecovered') execution = 'good';
    else if (tapped && exec >= 3) execution = 'good';

    // Miss room (which side was missed, and did the lane save it?)
    let missSide = null, saved = false;
    if (miss === 'rightRecovered' || miss === 'rightMiss') missSide = (outsideDir === 'right') ? 'outside' : 'inside';
    if (miss === 'leftHeld' || miss === 'leftMiss') missSide = (outsideDir === 'left') ? 'outside' : 'inside';
    if (miss === 'rightRecovered' || miss === 'leftHeld') saved = true;

    // Where it hit
    const pocket = String(s.pocket || 'Unknown');
    const strike = isStrikeShot(s);
    const meaning = leaveMeaning(s, lefty);
    let hit = 'unknown';
    if (pocket === 'Pocket high') hit = 'high';
    else if (pocket === 'Pocket flush') hit = 'flush';
    else if (pocket === 'Pocket light') hit = 'light';
    else if (pocket === 'Brooklyn' || s.leaveTag === 'Brooklyn') hit = 'brooklyn';
    else if (pocket === 'Missed left') hit = lefty ? 'missLight' : 'missHigh';
    else if (pocket === 'Missed right') hit = lefty ? 'missHigh' : 'missLight';
    else if (strike) hit = 'flush';
    else if (meaning === 'high') hit = 'high';
    else if (meaning === 'weak') hit = 'light';

    const obs = Array.isArray(s.obs) ? s.obs : [];
    const early = obs.includes('Too early');
    const long = obs.includes('Too long');

    // Direction the ball is telling us about the LINE
    let lean = 0; // +1 = hooking early / too strong, -1 = holding / too weak
    if (hit === 'high' || hit === 'missHigh' || hit === 'brooklyn') lean += 1;
    if (hit === 'light' || hit === 'missLight') lean -= 1;
    if (early) lean += 1;
    if (long) lean -= 1;
    if (!strike && meaning === 'high') lean += 0.5;
    if (!strike && meaning === 'weak' && hit !== 'flush') lean -= 0.5;
    if (strike && hit !== 'brooklyn') lean = 0; // a real strike says the line is fine
    lean = clamp(lean, -2, 2);

    const pocketHit = ['high', 'flush', 'light', 'brooklyn'].includes(hit);
    return {
      shot: s, execution, missSide, saved, hit, strike, meaning, early, long, lean,
      pocketHit, carryFail: pocketHit && !strike,
      overUnder: obs.includes('Over/under') || meaning === 'split',
      carrydown: obs.includes('Carrydown'),
      feet: num(s.feet), arrows: num(s.arrows), ball: s.ball || '', lane: s.lane || '', gameNo: num(s.gameNo) || 1,
    };
  }

  // ---------- context: profile, pattern ----------
  function bowlerProfile(b) {
    b = b || {};
    const mph = num(b.mphLine ?? b.mph), rpm = num(b.rpm);
    let dom = 0, label = 'matched';
    if (mph && rpm) {
      const ratio = mph / (rpm / 100);
      dom = clamp((4.75 - ratio) / 0.45, -1, 1); // -1 speed-dominant ... +1 rev-dominant
      label = dom <= -0.35 ? 'speed-dominant' : dom >= 0.35 ? 'rev-dominant' : 'matched';
    }
    const lefty = String(b.handedness || b.hand || 'R').toUpperCase().startsWith('L');
    const laser = b.laser || {};
    const rate = (v, d) => clamp(num(v) ?? d, 1, 5);
    return {
      lefty, mph, rpm, dom, label,
      lowRev: rpm != null && rpm < 300,
      highRev: rpm != null && rpm > 450,
      tilt: num(b.tilt), rotation: num(b.rotation),
      laser: { Loft: rate(laser.loft, 3), Aim: rate(laser.aim, 4), Speed: rate(laser.speed, 3), Release: rate(laser.release, 3), Equipment: 4 },
      deeper: lefty ? 'right' : 'left',
      outside: lefty ? 'left' : 'right',
    };
  }

  function parseRatio(r) {
    const m = String(r || '').match(/(\d+(?:\.\d+)?)\s*(?::|to)\s*(\d+(?:\.\d+)?)/i);
    if (m) { const a = Number(m[1]), b = Number(m[2]) || 1; return a / b; }
    const n = num(String(r || '').replace(/[^0-9.]/g, ''));
    return n;
  }

  function patternProfile(p) {
    if (!p) return null;
    const length = num(p.length), volume = num(p.volume), ratio = parseRatio(p.ratio);
    return {
      name: p.name || '', length, volume, ratio,
      lengthClass: length == null ? null : length <= 37 ? 'short' : length >= 43 ? 'long' : 'medium',
      volumeClass: volume == null ? null : volume <= 21 ? 'light' : volume >= 26 ? 'heavy' : 'medium',
      flat: ratio != null && ratio <= 4,       // sport / challenge: small miss room
      house: ratio != null && ratio >= 7,      // typical house shot: forgiving
    };
  }

  // ---------- move menu ----------
  // situation: 'early' (hooking early / high), 'late' (holding / light), 'overunder', 'carryWeak', 'carryStrong'
  const BASE = {
    early:       { Aim: 8, Equipment: 6, Speed: 5, Loft: 4, Release: 4 },
    late:        { Aim: 8, Equipment: 6, Speed: 5, Loft: 4, Release: 4 },
    overunder:   { Equipment: 7, Aim: 6, Release: 5, Speed: 3, Loft: 2 },
    carryWeak:   { Equipment: 8, Speed: 6, Release: 4, Aim: 3, Loft: 2 },
    carryStrong: { Equipment: 7, Speed: 6, Aim: 4, Release: 4, Loft: 2 },
  };

  // Ball need relative to the current ball (motion space 0..1)
  const NEED = {
    early:       { hook: -0.07, length: 0.12, backend: 0.02, say: 'cleaner through the front, more length' },
    late:        { hook: 0.08, length: -0.10, backend: 0.04, say: 'earlier read and more hook' },
    overunder:   { hook: -0.02, length: 0.05, backend: -0.10, say: 'smoother, more predictable shape' },
    carryWeak:   { hook: 0.03, length: -0.03, backend: 0.09, say: 'more continuation through the pins' },
    carryStrong: { hook: -0.05, length: 0.04, backend: -0.06, say: 'a smoother, softer hit' },
  };

  function aimText(sit, prof, pat, step) {
    const small = pat && pat.flat;
    const f = step >= 2 ? (small ? 2 : 3) : (small ? 1 : 2);
    const e = step >= 2 ? 2 : 1;
    if (sit === 'early' || sit === 'carryStrong') return `Move your feet ${f} board${f > 1 ? 's' : ''} ${prof.deeper} and your eyes ${e} ${prof.deeper} (into more oil).`;
    if (sit === 'late' || sit === 'carryWeak') return `Move your feet ${f} board${f > 1 ? 's' : ''} ${prof.outside} and your eyes ${e} ${prof.outside} (toward the friction).`;
    return `Make a small parallel move: feet and eyes 1–2 boards ${prof.deeper} to give yourself more room.`;
  }

  function moveText(kind, sit, prof, pat, ball, step) {
    if (kind === 'Aim') return aimText(sit, prof, pat, step);
    if (kind === 'Equipment') return ball ? `Switch to ${ball} for ${NEED[sit].say}.` : '';
    if (kind === 'Speed') {
      if (sit === 'early' || sit === 'carryStrong') return 'Add a touch of speed (about ½ mph) so the ball gets down the lane before it reads.';
      if (sit === 'late' || sit === 'carryWeak') return 'Take a touch of speed off (about ½ mph) so the ball reads sooner and finishes.';
      return 'Keep your speed steady and repeatable while the lane settles.';
    }
    if (kind === 'Loft') {
      if (sit === 'early' || sit === 'carryStrong') return 'Add a little loft (set it down a few inches further) to get past the dry front.';
      return 'Lay it down a little sooner (less loft) so the ball sees the lane earlier.';
    }
    if (kind === 'Release') {
      if (sit === 'early' || sit === 'carryStrong') return 'Soften your hand: a little less side roll, more forward roll.';
      if (sit === 'late' || sit === 'carryWeak') return 'Add a little more hand / rotation so the ball turns harder.';
      return 'Take a little side roll off and favor forward roll for a smoother shape.';
    }
    return '';
  }

  function rankMoves(sit, prof, pat, hasBall, tried) {
    const base = BASE[sit] || BASE.early;
    const out = [];
    for (const kind of Object.keys(base)) {
      if (kind === 'Equipment' && !hasBall) continue;
      const rating = prof.laser[kind] ?? 3;
      if (rating <= 1) continue; // "avoid it"
      let score = base[kind] + rating * 1.5;
      // Bowler profile shaping
      if (prof.dom < -0.3) { // speed-dominant
        if ((sit === 'late' || sit === 'carryWeak') && kind === 'Speed') score += 2;
        if ((sit === 'late' || sit === 'carryWeak') && kind === 'Equipment') score += 1;
        if (sit === 'early' && kind === 'Speed') score -= 1;
      }
      if (prof.dom > 0.3) { // rev-dominant
        if (sit === 'early' && (kind === 'Equipment' || kind === 'Speed')) score += 1;
        if (sit === 'late' && kind === 'Speed') score -= 1;
      }
      if (prof.lowRev && sit === 'late' && kind === 'Equipment') score += 1;
      if (prof.tilt != null && prof.tilt >= 15 && (sit === 'late' || sit === 'carryWeak') && kind === 'Equipment') score += 1;
      if (prof.rotation != null && prof.rotation >= 60 && sit === 'overunder' && kind === 'Release') score += 1;
      // Pattern shaping
      if (pat) {
        if (pat.flat && sit === 'overunder' && kind === 'Equipment') score += 1;
        if (pat.lengthClass === 'long' && pat.volumeClass === 'heavy' && sit === 'late' && kind === 'Equipment') score += 1;
        if (pat.volumeClass === 'light' && sit === 'early' && kind === 'Aim') score += 1;
      }
      // Already tried this kind for this problem -> push it down
      if (tried && tried.has(kind)) score -= 6;
      out.push({ kind, score, rating });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  // ---------- ball fit ----------
  const dist3 = (a, b) => Math.sqrt((a.hook - b.hook) ** 2 + (a.length - b.length) ** 2 + (a.backend - b.backend) ** 2);
  // Layer 4: cover, surface and core matter on their own, not just through the motion model.
  // Lower = better fit for the situation.
  function coverFit(sit, row, ctx) {
    const info = ctx.ballInfo ? ctx.ballInfo(row) : null;
    if (!info) return 0;
    const cover = String(info.cover || '').toLowerCase();
    const grit = Number(info.grit) || 4000;
    const polished = grit >= 4500;
    const pearl = cover.includes('pearl');
    const solid = cover.includes('solid');
    const asym = !!info.asym;
    let p = 0;
    if (sit === 'late') {          // need an EARLIER read: sanded solids/hybrids, not shiny pearls
      if (polished) p += 0.12; if (pearl) p += 0.06; if (solid) p -= 0.04; if (grit <= 2000) p -= 0.04;
    } else if (sit === 'early') {  // need LENGTH: shiny / pearl, not rough solids
      if (solid && grit <= 3000) p += 0.10; if (pearl || polished) p -= 0.05;
    } else if (sit === 'overunder') { // need SMOOTH: symmetric, sanded, not shiny asym
      if (polished && pearl) p += 0.08; if (asym) p += 0.05; if (!asym && solid) p -= 0.04;
    } else if (sit === 'carryWeak') { // need FINISH: asym / pearl / higher backend
      if (asym || pearl) p -= 0.04;
    } else if (sit === 'carryStrong') { // need SOFTER: away from shiny asym
      if (polished && asym) p += 0.06; if (solid && !asym) p -= 0.03;
    }
    return p;
  }

  function suggestBall(sit, ctx, prof) {
    try {
      const m = ctx.motion;
      const balls = (ctx.setBalls || []).filter(b => b && b.row);
      if (!m || balls.length < 2) return '';
      const cur = balls.find(b => b.name === ctx.currentBall);
      if (!cur) return '';
      const cv = m.vector(cur.row, ctx.bowler);
      const need = NEED[sit]; if (!need) return '';
      const target = { hook: clamp(cv.hook + need.hook, 0, 1), length: clamp(cv.length + need.length, 0, 1), backend: clamp(cv.backend + need.backend, 0, 1) };
      let best = null;
      for (const b of balls) {
        if (b.name === cur.name) continue;
        const v = m.vector(b.row, ctx.bowler);
        const d = dist3(v, target);
        // must actually move in the needed direction
        const dir = (need.hook * (v.hook - cv.hook)) + (need.length * (v.length - cv.length)) + (need.backend * (v.backend - cv.backend));
        if (dir <= 0) continue;
        const fit = coverFit(sit, b.row, ctx);
        if (fit >= 0.15) continue;            // clearly the wrong kind of ball for this problem
        const sc = d + fit;
        if (!best || sc < best.d) best = { name: b.name, d: sc };
      }
      return (best && best.d <= 0.30) ? best.name : '';
    } catch (_e) { return ''; }
  }

  function startingBall(ctx, prof, pat) {
    try {
      const m = ctx.motion;
      const balls = (ctx.setBalls || []).filter(b => b && b.row);
      if (!m || !balls.length) return '';
      const t = { hook: 0.55, length: 0.55, backend: 0.5 };
      if (pat) {
        if (pat.lengthClass === 'long') { t.hook += 0.10; t.length -= 0.05; }
        if (pat.lengthClass === 'short') { t.hook -= 0.10; t.length += 0.10; }
        if (pat.volumeClass === 'heavy') t.hook += 0.08;
        if (pat.volumeClass === 'light') { t.hook -= 0.08; t.length += 0.05; }
        if (pat.flat) t.backend -= 0.08;
      }
      if (prof.dom < -0.3) t.hook += 0.05;
      if (prof.lowRev) t.hook += 0.04;
      let best = null;
      for (const b of balls) {
        const d = dist3(m.vector(b.row, ctx.bowler), t);
        if (!best || d < best.d) best = { name: b.name, d };
      }
      return best ? best.name : '';
    } catch (_e) { return ''; }
  }

  // ---------- main ----------
  function evaluate(ctx) {
    ctx = ctx || {};
    const prof = bowlerProfile(ctx.bowler);
    const pat = patternProfile(ctx.pattern);
    const all = (ctx.shots || []).filter(s => s && s.type !== 'gameStart' && !s.isFill);
    const C = all.map(s => classify(s, prof.lefty));
    const res = { status: 'start', tone: 'info', headline: '', why: '', next: '', notes: [], ballSuggestion: '', read: '', profileLine: '', patternLine: '' };

    // Profile + pattern summary lines
    const pbits = [prof.label];
    if (prof.rpm) pbits.push(prof.lowRev ? 'lower rev' : prof.highRev ? 'high rev' : `${prof.rpm} rpm`);
    if (prof.tilt != null) pbits.push(`${prof.tilt}° tilt`);
    if (prof.rotation != null) pbits.push(`${prof.rotation}° rotation`);
    res.profileLine = `${prof.lefty ? 'Lefty' : 'Righty'}, ${pbits.join(', ')}`;
    if (pat) {
      const b = [];
      if (pat.length) b.push(`${pat.length} ft`);
      if (pat.volume) b.push(`${pat.volume} mL`);
      if (pat.ratio) b.push(`${Math.round(pat.ratio * 10) / 10}:1`);
      res.patternLine = `${pat.name}${b.length ? ' (' + b.join(', ') + ')' : ''}${pat.flat ? ', flat/sport: small misses matter' : pat.house ? ', house shot: room to miss' : ''}`;
    }

    // ---- Before there's enough to read: starting plan ----
    const trustedAll = C.filter(c => c.execution !== 'poor');
    if (C.length < 3) {
      res.status = 'start';
      const sb = startingBall(ctx, prof, pat);
      const lines = [];
      if (pat && pat.length) {
        const bp = clamp(Math.round(pat.length - 31), 3, 15);
        lines.push(`Rule of 31: on ${pat.length} ft, look for a breakpoint around board ${bp}.`);
      }
      if (sb) lines.push(`Best starting ball in your bag for this pattern: ${sb}.`);
      if (pat && pat.volumeClass === 'light') lines.push('Light oil: expect the fronts to dry up early. Watch for high hits by game 2.');
      if (pat && pat.volumeClass === 'heavy') lines.push('Heavy oil: the lane should change slowly. Don\'t chase it early.');
      if (prof.dom < -0.3) lines.push('As a speed-dominant player, the ball may read late. Favor earlier-reading equipment if it skids.');
      res.headline = C.length ? `Building your read: ${C.length}/3 shots` : 'Starting plan';
      res.why = lines.join(' ') || 'Log your first few shots: mark, pocket and leave matter most.';
      res.next = 'Coach starts calling moves after 3 shots.';
      res.ballSuggestion = '';
      return res;
    }

    // ---- Find the last change (line move or ball change) ----
    let lastChange = -1, changeDesc = '';
    for (let i = 1; i < C.length; i++) {
      const a = C[i - 1], b = C[i];
      const lineMoved = (a.feet != null && b.feet != null && a.feet !== b.feet) || (a.arrows != null && b.arrows != null && a.arrows !== b.arrows);
      const ballChanged = a.ball && b.ball && a.ball !== b.ball;
      if (lineMoved || ballChanged) {
        lastChange = i;
        changeDesc = ballChanged ? `switched to ${b.ball}` : `moved to ${b.feet ?? '?'}/${b.arrows ?? '?'}`;
      }
    }
    const since = lastChange >= 0 ? C.slice(lastChange) : C;
    const trustedSince = since.filter(c => c.execution !== 'poor');
    const before = lastChange >= 0 ? C.slice(Math.max(0, lastChange - 5), lastChange).filter(c => c.execution !== 'poor') : [];

    // Window for decisions: last 5 trusted shots on the current line/ball
    const W = trustedSince.slice(-5);
    const last = C[C.length - 1];
    const last2 = W.slice(-2);

    const cnt = (arr, f) => arr.filter(f).length;
    const strikes = cnt(W, c => c.strike);
    const highs = cnt(W, c => c.lean > 0);
    const lights = cnt(W, c => c.lean < 0);
    const pockets = cnt(W, c => c.pocketHit);
    const carryFails = W.filter(c => c.carryFail);
    const recent6 = (lastChange >= 0 ? trustedSince : trustedAll).slice(-6); // room info only counts on the current line
    const outsideSaved = recent6.find(c => c.missSide === 'outside' && c.saved && (c.pocketHit || c.strike));
    const insideSaved = recent6.find(c => c.missSide === 'inside' && c.saved && (c.pocketHit || c.strike));

    // Lane read for the whole current game (for the trend line)
    const gameNo = last.gameNo;
    const G = C.filter(c => c.gameNo === gameNo && c.execution !== 'poor');
    const gH = cnt(G, c => c.lean > 0), gL = cnt(G, c => c.lean < 0);
    res.read = gH >= 2 && gL >= 2 ? 'Over/under' : gH >= 2 && gH > gL ? 'Hooking early (drying up)' : gL >= 2 && gL > gH ? 'Holding (ball going long)' : (outsideSaved || insideSaved) ? 'Room to miss' : 'Steady';

    // Evaluate whether the last change worked
    let moveVerdict = '';
    if (lastChange >= 0 && trustedSince.length >= 2) {
      const pr = (arr) => arr.length ? cnt(arr, c => c.pocketHit || c.strike) / arr.length : 0;
      const after = trustedSince.slice(0, 4);
      const pa = pr(after), pb = pr(before);
      if (pa >= 0.75 && pa >= pb) moveVerdict = `✅ Your last change (${changeDesc}) is working: ${cnt(after, c => c.pocketHit || c.strike)} of ${after.length} good shots in the pocket since.`;
    }

    // Problems already worked on: which move kinds were tried since the trend began
    const tried = new Set();
    if (lastChange >= 0) {
      const a = C[lastChange - 1], b = C[lastChange];
      if (a && b && a.ball !== b.ball) tried.add('Equipment');
      if (a && b && (a.feet !== b.feet || a.arrows !== b.arrows)) tried.add('Aim');
    }

    const decide = (sit, headline, why) => {
      const ball = suggestBall(sit, ctx, prof);
      const step = (tried.has('Aim') && lastChange >= 0) ? 2 : 1;
      const ranked = rankMoves(sit, prof, pat, !!ball, tried);
      const first = ranked[0], second = ranked[1];
      const firstText = first ? moveText(first.kind, sit, prof, pat, ball, step) : '';
      const secondText = second ? moveText(second.kind, sit, prof, pat, ball, step) : '';
      res.status = 'move'; res.tone = 'move';
      res.headline = `${headline} ${firstText}`;
      res.why = why + (first ? (first.kind === 'Equipment' ? ' (Ball change: picked from tonight\'s bag.)' : ` (${first.kind}: you rated yourself ${first.rating}/5.)`) : '');
      res.next = secondText ? `If 2 more good shots say the same thing, next: ${secondText}` : '';
      if (!ball && (ctx.setBalls || []).length >= 2 && ['late', 'carryWeak', 'early', 'overunder', 'carryStrong'].includes(sit)) {
        res.notes.push(`Nothing else in tonight's bag gives ${NEED[sit].say} compared with ${ctx.currentBall || 'your current ball'}, so stick with line and speed moves.`);
      }
      res.ballSuggestion = (first && first.kind === 'Equipment') ? ball : '';
      res.moveKind = first ? first.kind : '';
      res.situation = sit;
      return res;
    };

    // ---- 1. Poor shot: don't move ----
    if (last.execution === 'poor') {
      res.status = 'repeat'; res.tone = 'warn';
      res.headline = 'That was an execution miss. Don\'t move. Repeat your shot.';
      res.why = last.missSide ? `You missed ${last.missSide} and the lane didn't save it. That tells us about the throw, not the lane.` : 'You marked it as a poor shot, so Coach is ignoring it for the lane read.';
      const poorRun = C.slice(-3).filter(c => c.execution === 'poor').length;
      if (poorRun >= 2) res.next = 'Two poor shots close together: slow your feet, quiet tempo, and hit your mark before changing anything.';
      else if (W.length) res.next = `Lane read so far on this line: ${res.read.toLowerCase()}.`;
      if (moveVerdict) res.notes.push(moveVerdict);
      return res;
    }

    // ---- Just changed something: give it 2 good shots ----
    if (lastChange >= 0 && trustedSince.length < 2) {
      res.status = 'watch'; res.tone = 'info';
      res.headline = `You ${changeDesc}. Give it ${2 - trustedSince.length} more good shot${2 - trustedSince.length === 1 ? '' : 's'} before judging.`;
      res.why = 'One change at a time, and let the ball tell you if it worked.';
      return res;
    }

    // ---- 2. Utopia: room both ways ----
    if (outsideSaved && insideSaved) {
      res.status = 'utopia'; res.tone = 'good';
      res.headline = 'Wide window both ways. Stay right where you are.';
      res.why = `You missed outside and it recovered${outsideSaved.strike ? ' for a strike' : ' to the pocket'}, and missed inside and it held${insideSaved.strike ? ' for a strike' : ' in the pocket'}. That's the best look you can have.`;
      res.next = 'Don\'t change a thing until a good shot misses the pocket.';
      if (moveVerdict) res.notes.push(moveVerdict);
      return res;
    }

    // ---- 3. Striking: stay ----
    const s3 = W.slice(-3);
    const clean = (c) => c.strike && c.hit !== 'brooklyn'; // a Brooklyn strike is a high miss, not a reason to stay
    if (cnt(s3, clean) >= 2 || cnt(W, clean) >= 3) {
      res.status = 'stay'; res.tone = 'good';
      res.headline = 'You\'re striking. Stay put.';
      res.why = `${cnt(W, clean)} pocket strikes in your last ${W.length} good shots on this line.`;
      const bk = W.slice(-3).filter(c => c.hit === 'brooklyn').length;
      res.next = bk >= 2 ? 'Heads-up: those were Brooklyns. The lane is starting to hook early. Be ready to move deeper.' : 'Keep repeating. Coach will flag the first sign of change.';
      if (moveVerdict) res.notes.push(moveVerdict);
      return res;
    }

    // ---- 4. Over/under ----
    const ouSignals = cnt(W, c => c.overUnder);
    if ((highs >= 2 && lights >= 2) || ouSignals >= 2) {
      return decide('overunder', 'Over/under: some hook early, some go long.', `${highs} early/high and ${lights} long/light in your last ${W.length} good shots. The lane is unpredictable, so you want a smoother look.`);
    }

    // ---- 5. Directional: hooking early ----
    const twoHigh = last2.length === 2 && last2.every(c => c.lean > 0);
    const twoLight = last2.length === 2 && last2.every(c => c.lean < 0);
    if (twoHigh || (highs >= 3 && lights <= 1)) {
      const ev = W.filter(c => c.lean > 0).slice(-3).map(c => c.hit === 'brooklyn' ? 'Brooklyn' : c.hit === 'missHigh' ? 'crossed over' : c.early ? 'hooked early' : c.meaning === 'high' && !c.strike ? (c.shot.leaveTag || pinsText(c.shot) + '-pin') : 'high');
      return decide('early', 'Lane is hooking early.', `${twoHigh ? '2 good shots in a row' : highs + ' of your last ' + W.length + ' good shots'} came in high (${ev.join(', ')}).`);
    }

    // ---- 6. Directional: holding / going long ----
    if (twoLight || (lights >= 3 && highs <= 1)) {
      const ev = W.filter(c => c.lean < 0).slice(-3).map(c => c.hit === 'missLight' ? 'missed light' : c.long ? 'went long' : c.shot.leaveTag === 'Flat 10' ? 'flat 10' : 'light');
      return decide('late', 'Lane is holding: the ball is going long.', `${twoLight ? '2 good shots in a row' : lights + ' of your last ' + W.length + ' good shots'} came in light (${ev.join(', ')}).`);
    }

    // ---- 7. In the pocket but not carrying ----
    const recentPocket = W.slice(-4);
    if (cnt(recentPocket, c => c.pocketHit) >= 3 && cnt(recentPocket, c => c.strike) <= 1) {
      const weak = carryFails.filter(c => c.meaning === 'weak' || c.shot.leaveTag === 'Flat 10').length;
      const strong = carryFails.filter(c => c.meaning === 'high' || c.shot.leaveTag === 'Ringing 10').length;
      const sit = strong > weak ? 'carryStrong' : 'carryWeak';
      const leaves = carryFails.slice(-3).map(c => c.shot.leaveTag || pinsText(c.shot)).filter(Boolean);
      return decide(sit, 'You\'re in the pocket but not carrying.', `Pocket hits with ${leaves.join(', ') || 'leaves'}. Your line is fine: this is about how the ball finishes.`);
    }

    // ---- 8. One-sided room ----
    if (outsideSaved || insideSaved) {
      res.status = 'stay'; res.tone = 'good';
      res.headline = outsideSaved ? 'You have room outside. Stay.' : 'You have room inside. Stay.';
      res.why = outsideSaved ? 'A miss outside still recovered to the pocket, so there\'s friction out there to help you.' : 'A miss inside still held to the pocket, so there\'s oil in there to help you.';
      res.next = 'Keep playing this line. Coach will tell you when that room disappears.';
      if (moveVerdict) res.notes.push(moveVerdict);
      return res;
    }

    // ---- 9. Not enough to call ----
    res.status = 'watch'; res.tone = 'info';
    res.headline = 'No clear pattern yet. Stay and keep tracking.';
    const unknowns = cnt(W, c => c.execution === 'unknown');
    res.why = `${pockets} of your last ${W.length} ${unknowns >= Math.ceil(W.length / 2) ? '' : 'good '}shots hit the pocket.` + (unknowns >= 3 ? ' Tip: tapping your miss room (No miss / held / recovered) helps Coach trust the read.' : '');
    res.next = 'Coach will call a move when 2 good shots in a row tell the same story.';
    if (moveVerdict) res.notes.push(moveVerdict);
    return res;
  }

  root.BTCoach = { evaluate, _internals: { classify, leaveMeaning, bowlerProfile, patternProfile, rankMoves, parseRatio } };
})(typeof window !== 'undefined' ? window : globalThis);
