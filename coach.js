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
  const num = (v) => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
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
    if (!strike && meaning === 'high' && hit !== 'flush') lean += 0.5; // flush pocket = the line was fine; it's a carry read
    if (!strike && meaning === 'weak' && hit !== 'flush') lean -= 0.5;
    if (strike && hit !== 'brooklyn') lean = 0; // a real strike says the line is fine
    lean = clamp(lean, -2, 2);

    const pocketHit = ['high', 'flush', 'light', 'brooklyn'].includes(hit);

    // "Best ball is your eyeball": how the ball left the deck and what the key pin did.
    // Righty: exit right = deflected (weak), exit left = drove through too hard (strong). Lefty mirrored.
    const exitRaw = String(s.exit || "Didn't notice");
    let exitRead = '';
    if (exitRaw === 'Exit straight') exitRead = 'good';
    else if (exitRaw === 'Exit right') exitRead = lefty ? 'strong' : 'weak';
    else if (exitRaw === 'Exit left') exitRead = lefty ? 'weak' : 'strong';
    const keyPin = String(s.keyPin || '');
    let finish = '';
    if (keyPin === 'weak' || (pocketHit && exitRead === 'weak')) finish = 'weak';
    else if (keyPin === 'wrap' || keyPin === 'kickback' || (pocketHit && exitRead === 'strong')) finish = 'strong';
    else if (pocketHit && exitRead === 'good') finish = 'good';

    // Carrydown tap: oil pushed downlane -> ball skids further and arrives weak.
    const carrydown = obs.includes('Carrydown');
    if (carrydown && !finish) finish = 'weak';
    if (carrydown && !strike) lean = clamp(lean - 0.5, -2, 2);

    // SPEED: a faster-than-normal shot that went long (or slower one that hooked early) is the bowler, not the lane.
    const speed = String(s.speedTrend || 'unknown');
    const speedCaused = !strike && ((speed === 'faster' && lean < 0) || (speed === 'slower' && lean > 0));
    if (speedCaused) execution = 'poor';

    // ANGLE: target (arrows) -> breakpoint -> pocket, in boards.
    // A downlane target: work out the board the ball crosses at the arrows (15 ft) from slide, laydown and target.
    let arrows = num(s.arrows); const bp = num(s.bp);
    { const tf = num(s.targetFt), sl = num(s.feet); if (arrows != null && tf && tf !== 15 && sl != null) { const lay = sl - (num(s.layOff) ?? 5); arrows = lay + (arrows - lay) * 15 / tf; } }
    // Empty pocket board = standard pocket. Lefties counting boards from the right gutter (target > 20) use 22.5.
    const pocketBoard = num(s.pocketBoard) ?? ((lefty && arrows != null && arrows > 20) ? 22.5 : 17.5);
    let outward = null, recovery = null, angleClass = '';
    if (arrows != null && bp != null) {
      outward = Math.abs(arrows - bp);
      recovery = Math.abs(pocketBoard - bp);
      const demand = outward + recovery;
      angleClass = recovery <= 8 ? 'direct' : (recovery >= 13 || demand >= 16) ? 'steep' : 'normal';
    }

    return {
      exitRaw, exitRead, keyPin, finish, speed, speedCaused, bp, outward, recovery, angleClass,
      shot: s, execution, missSide, saved, hit, strike, meaning, early, long, lean,
      pocketHit, carryFail: pocketHit && !strike,
      overUnder: obs.includes('Over/under') || meaning === 'split',
      carrydown,
      feet: num(s.feet), arrows, ball: s.ball || '', lane: s.lane || '', gameNo: num(s.gameNo) || 1,
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
      laydownOffset: clamp(num(b.laydownOffset) ?? 5, 1, 12),
      deeper: lefty ? 'right' : 'left',
      outside: lefty ? 'left' : 'right',
    };
  }

  function parseRatio(r) {
    const m = String(r || '').match(/(\d+(?:\.\d+)?)\s*(?::|to|-|\/)\s*(\d+(?:\.\d+)?)/i); // 10:1, 10-1, 10 to 1, 10/1
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
      flat: ratio != null && ratio <= 3,       // USBC sport condition (3:1 or less): small miss room
      mid: ratio != null && ratio > 3 && ratio < 7, // challenge / medium ratio: some room, less than a house shot
      house: ratio != null && ratio >= 7,      // typical house shot: forgiving
      box: (p.box && !p.box.off && p.box.b1 != null) ? p.box : null, // 📦 Baker Box, decided by BT.boxFor
      r31: p.r31 !== false, // 📏 Rule of 31 checkbox (off = no exit-point advice)
    };
  }

  // Rule of 31: estimated board where the ball EXITS the pattern (length − 31). Not the breakpoint.
  function exitBoardFor(pat) {
    if (!pat || pat.length == null || pat.r31 === false) return null;
    return clamp(Math.round(pat.length - 31), 3, 20);
  }

  // ---------- 📐 Math for a Line (Kegel three-point targeting) ----------
  // Worked backwards from the SLIDE at the foul line (inside of the slide foot):
  //   A straight line from the laydown (foul line) through the target (arrows, 15 ft) reaches the end of the oil
  //   (L ft) at  exit = laydown + (target − laydown)·k,  k = L / 15.
  //   So laydown = (k·target − focal) / (k − 1)      slide = laydown + laydown offset (default 5)
  // Focal point = the rule-of-31 exit board, measured where the oil ends (not at 60 ft).
  //   Each board the slide is off moves the exit by (k − 1) boards (about 1.9 on 43 ft).
  // phase 'start' = game 1 before any move: focal point = rule-of-31 exit board (a fresh-pattern estimate). Mild heads-up.
  // phase 'later' = after a move or from game 2: the exit point SHOULD move with the lane. It moves by the same
  //   number of boards your breakpoint has moved since your first shots (bp0). The question becomes "is your line
  //   still going through where the ball should leave the oil now?" — a usable line.
  function lineMath(slide, arrows, pat, prof, phase, bp, bp0, tFt) {
    arrows = num(arrows); slide = num(slide); bp = num(bp); bp0 = num(bp0);
    tFt = num(tFt) || 15; // where the target is: the arrows (15 ft) or a downlane spot
    if (arrows == null) return null;
    const mirror = prof.lefty && arrows > 20; // lefty counting boards from the right gutter
    const own = (v) => mirror ? 40 - v : v;
    const later = phase === 'later';
    const E31 = exitBoardFor(pat);
    let box = pat && pat.box ? pat.box : null;              // 📦 your target box, if it applies
    if (box && box.early38 && arrows != null) {             // Zone 1 (boards 1–10 at the arrows): box can start at 38 ft
      const sl0 = num(slide), lay0 = sl0 != null ? sl0 - prof.laydownOffset : null;
      const at15 = lay0 != null ? lay0 + (own(arrows) - lay0) * 15 / tFt : own(arrows);
      if (at15 <= 10.5) box = Object.assign({}, box, { f1: box.early38, zone1: true });
    }
    const A0 = box ? (box.b1 + box.b2) / 2 : E31;           // the board to aim the line through
    const D0 = box ? (box.f1 + box.f2) / 2 : (pat && Number(pat.length) ? Number(pat.length) : 60);
    let focal = null, basis = '';
    if (!later && A0 != null) { focal = A0; basis = box ? 'box' : 'rule31'; }
    else if (later && A0 != null && bp != null && bp0 != null) { focal = clamp(A0 + (own(bp) - own(bp0)), 2, 25); basis = 'moved'; }
    if (focal == null) return null;
    const off = prof.laydownOffset;
    const a = own(arrows);
    const k0 = D0 / tFt;
    if (Math.abs(k0 - 1) < 0.15) return null; // target is at the end of the oil: nothing to project
    const k = k0;
    const lay = (k * a - focal) / (k - 1);
    const mSlide = lay + off;
    const r = { tFt, rc: pat ? (pat.flat ? 'sport' : pat.mid ? 'mid' : 'house') : 'house', ratio: pat ? pat.ratio : null, phase: later ? 'later' : 'start', basis, target: arrows, focal: Math.round(own(focal)), exitBoard: E31 == null ? null : own(E31),
      box, boxFt: box ? Math.round(D0) : null, bp, bp0, shift: (basis === 'moved') ? Math.round(own(bp) - own(bp0)) : 0, laydown: Math.round(own(lay)), slide: Math.round(own(mSlide)), offset: off, status: '' };
    if (slide != null) {
      const sl = own(slide);
      const pass = (sl - off) + (a - (sl - off)) * k;
      r.yourSlide = slide;
      r.passes = Math.round(own(pass));
      r.gap = Math.round(Math.abs(pass - focal));
      const tol = later ? 2 : 1; // later games: more leeway
      r.status = Math.abs(sl - mSlide) <= tol ? 'on' : pass > focal ? 'inside' : 'outside';
      if (basis === 'box') { r.status = (pass >= box.b1 - 0.5 && pass <= box.b2 + 0.5) ? 'on' : pass > box.b2 ? 'inside' : 'outside'; r.gap = Math.round(pass > box.b2 ? pass - box.b2 : box.b1 - pass); r.passesExact = Math.round(own(pass) * 2) / 2; }
    }
    return r;
  }
  function lineText(r) {
    if (!r) return '';
    if (r.tFt && r.tFt !== 15) { const T = (t) => `${t} (at ${r.tFt} ft)`; r = Object.assign({}, r, { target: T(r.target) }); }
    const math = `slide ${r.slide} → lay down ${r.laydown} → target ${r.target} → board ${r.focal}`;
    if (r.basis === 'box') {
      const bx = `your Baker Box (boards ${r.box.b1}–${r.box.b2} at ${Math.round(r.box.f1)}–${Math.round(r.box.f2)} ft${r.box.zone1 ? ', starting at 38 ft in Zone 1' : ''})`;
      if (!r.status) return `📐 Line through ${bx}: ${math}.`;
      if (r.status === 'on') return `📐 ✅ Through ${bx}: from slide ${r.yourSlide} over target ${r.target} the ball is on about board ${r.passesExact} at ${r.boxFt} ft.`;
      const big = Math.abs(r.slide - r.yourSlide) > 5;
      return `📐 ⚠️ From slide ${r.yourSlide} over target ${r.target} the ball is on about board ${r.passesExact} at ${r.boxFt} ft, ${r.gap} board${r.gap === 1 ? '' : 's'} ${r.status === 'inside' ? 'inside' : 'outside'} ${bx}. ` + (big ? `That's a big move: try half of it (feet ${r.status === 'inside' ? 'out' : 'in'}) and check again.` : `Slide ${r.slide} (lay down ${r.laydown}) puts it through the middle.`);
    }
    if (r.basis === 'rule31') {
      if (!r.status) return `📐 Starting line through the rule-of-31 exit point: ${math}.`;
      if (r.status === 'on') return `📐 ✅ Starting line checks out: ${math} (the rule-of-31 exit point).`;
      return `📐 ⚠️ Starting-line heads-up: from slide ${r.yourSlide} over target ${r.target}, the ball heads ${r.passes >= 1 && r.passes <= 39 ? `to about board ${r.passes}` : 'off the edge of the lane'} by the end of the oil, ${r.gap} board${r.gap === 1 ? '' : 's'} ${r.status === 'inside' ? 'inside' : 'outside'} the rule-of-31 exit point (board ${r.focal}) for a fresh pattern. ` + (Math.abs(r.slide - r.yourSlide) > 5
        ? (r.status === 'outside'
          ? (r.rc === 'sport' ? `On a sport pattern there's little friction outside to bring it back: work toward slide ${r.slide} (lay down ${r.laydown}) in 2-board moves.`
            : r.rc === 'mid' ? `On a medium ratio there's some room outside, less than a house shot: move in 2 boards at a time toward slide ${r.slide} if it reads early or misses right.`
            : `The rule of 31 is an estimate: on a house shot a few boards outside is common. If your breakpoint holds and the ball comes back, keep it; if it reads early, move in a little at a time.`)
          : `That's a lot of oil to turn in: move out a little at a time and watch for over/under.`)
        : `To start through it with target ${r.target}, slide ${r.slide} (lay down ${r.laydown}).`);
    }
    // later games: the exit point has moved with the breakpoint
    const mv = r.shift === 0 ? 'Your breakpoint hasn\'t moved, so the exit point is still about board ' + r.focal
      : `Your breakpoint has moved ${Math.abs(r.shift)} board${Math.abs(r.shift) === 1 ? '' : 's'} ${r.shift > 0 ? 'in' : 'out'} since your first shots (${r.bp0} → ${r.bp}), so the exit point has moved too: about board ${r.focal} now (it was ${r.exitBoard})`;
    if (!r.status) return `📐 ${mv}. For target ${r.target}: ${math}.`;
    if (r.status === 'on') return `📐 ✅ Usable line: slide ${r.yourSlide} over target ${r.target} goes through about board ${r.focal}. ${mv}.`;
    return `📐 ⚠️ Usable-line heads-up: from slide ${r.yourSlide} over target ${r.target} the ball heads ${r.passes >= 1 && r.passes <= 39 ? `to about board ${r.passes}` : 'off the edge of the lane'} by the end of the oil. ${mv}. For target ${r.target}, slide ${r.slide} (lay down ${r.laydown}) goes through it.`;
  }

  // ---------- move menu ----------
  // situation: 'early' (hooking early / high), 'late' (holding / light), 'overunder', 'carryWeak', 'carryStrong'
  const BASE = {
    early:       { Aim: 8, Equipment: 6, Speed: 5, Loft: 4, Release: 4 },
    late:        { Aim: 8, Equipment: 6, Speed: 5, Loft: 4, Release: 4 },
    overunder:   { Equipment: 7, Aim: 6, Release: 5, Speed: 3, Loft: 2 },
    carryWeak:   { Equipment: 8, Speed: 6, Release: 4, Aim: 3, Loft: 2 },
    carryStrong: { Equipment: 7, Speed: 6, Aim: 4, Release: 4, Loft: 2 },
    mud:         { Aim: 8, Equipment: 7, Release: 4, Speed: 3, Loft: 2 },
  };

  // Ball need relative to the current ball (motion space 0..1)
  const NEED = {
    early:       { hook: -0.07, length: 0.12, backend: 0.02, say: 'cleaner through the front, more length' },
    late:        { hook: 0.08, length: -0.10, backend: 0.04, say: 'earlier read and more hook' },
    overunder:   { hook: -0.02, length: 0.05, backend: -0.10, say: 'smoother, more predictable shape' },
    carryWeak:   { hook: -0.02, length: 0.08, backend: 0.08, say: 'a cleaner trip through the front so it saves energy for the pins' },
    carryStrong: { hook: 0.02, length: -0.06, backend: -0.08, say: 'an earlier, smoother read so it uses some energy before the pins' },
    mud:         { hook: -0.02, length: 0.06, backend: -0.08, say: 'a smoother ball that won\'t try to plant and turn in the mud' },
  };

  function aimText(sit, prof, pat, step) {
    const small = pat && pat.flat;
    const f = step >= 2 ? (small ? 2 : 3) : (small ? 1 : 2);
    const e = step >= 2 ? 2 : 1;
    if (sit === 'carryWeak') return `Protect the energy: move your feet ${f} board${f > 1 ? 's' : ''} ${prof.deeper} and your eyes ${e} ${prof.deeper} so the ball stays in the oil longer and saves its rotation for the pins.`;
    if (sit === 'carryStrong') return `Let it use some energy: move your feet ${f} board${f > 1 ? 's' : ''} ${prof.outside} and your eyes ${e} ${prof.outside} so the ball reads a little sooner and rolls into the pocket.`;
    if (sit === 'mud') return `Get it out of the mud: move your feet ${f} board${f > 1 ? 's' : ''} ${prof.deeper} and keep your eyes, so the ball travels further out past the oil and turns in clean friction.`;
    if (sit === 'early') return `Move your feet ${f} board${f > 1 ? 's' : ''} ${prof.deeper} and your eyes ${e} ${prof.deeper} (into more oil).`;
    if (sit === 'late') return `Move your feet ${f} board${f > 1 ? 's' : ''} ${prof.outside} and your eyes ${e} ${prof.outside} (toward the friction).`;
    return `Make a small parallel move: feet and eyes 1–2 boards ${prof.deeper} to give yourself more room.`;
  }

  // Del Warren's 5 Scoring Elements (Kegel): every suggestion is a change to one of them.
  const ELEMENT = {
    Aim: '🎯 Direction', Angle: '📐 Angle', Speed: '⚡ Speed', Release: '🔄 Revs',
    Loft: '🎯 Direction (ball placement)', Equipment: '🎳 Equipment',
  };
  // More angle = feet move, eyes stay (more swing). Less angle = eyes move more than feet (straighter).
  function angleWant(sit, angleClass) {
    if ((sit === 'carryWeak' || sit === 'late') && angleClass === 'direct') return 'more';
    if ((sit === 'carryStrong' || sit === 'overunder' || sit === 'early') && angleClass === 'steep') return 'less';
    return '';
  }
  function angleText(sit, prof, angleClass) {
    const want = angleWant(sit, angleClass);
    if (want === 'more') return `Open your angle: move your feet 2 boards ${prof.deeper} and keep your eyes on the same target. More swing gives the ball more entry angle.`;
    if (want === 'less') return `Tighten your angle: move your eyes 2 boards ${prof.deeper} and your feet only 1. A straighter line means less swing and a smoother entry.`;
    return '';
  }

  function moveText(kind, sit, prof, pat, ball, step, angleClass) {
    if (kind === 'Angle') return angleText(sit, prof, angleClass);
    if (kind === 'Aim') return aimText(sit, prof, pat, step);
    if (kind === 'Equipment') return ball ? `Switch to ${ball} for ${NEED[sit].say}.` : '';
    if (sit === 'mud' && kind === 'Release') return 'Take a little side roll off for a smoother, more forward-roll shape that won\'t try to plant in the mud.';
    if (kind === 'Speed') {
      if (sit === 'early') return 'Add a touch of speed (about ½ mph) so the ball gets down the lane before it reads.';
      if (sit === 'carryWeak') return 'Add a touch of speed (about ½ mph) so the ball spends less time in friction and arrives with rotation left.';
      if (sit === 'carryStrong') return 'Take a touch of speed off (about ½ mph) so the ball uses some of its rotation before the pins.';
      if (sit === 'late') return 'Take a touch of speed off (about ½ mph) so the ball reads sooner and finishes.';
      return 'Keep your speed steady and repeatable while the lane settles.';
    }
    if (kind === 'Loft') {
      if (sit === 'early' || sit === 'carryStrong') return 'Add a little loft (set it down a few inches further) to get past the dry front.';
      return 'Lay it down a little sooner (less loft) so the ball sees the lane earlier.';
    }
    if (kind === 'Release') {
      if (sit === 'carryWeak') return 'Add a little more hand (rotation) so the ball saves energy and is still turning at the pins, not rolling out early.';
      if (sit === 'late') return 'Add a little more hand / rotation so the ball turns harder off the breakpoint.';
      if (sit === 'early' || sit === 'carryStrong') return 'Soften your hand: less side rotation, more forward roll, so the ball arrives smoother.';
      return 'Take a little side roll off and favor forward roll for a smoother, more predictable shape.';
    }
    return '';
  }

  function rankMoves(sit, prof, pat, hasBall, tried, angleClass, favor) {
    const base = Object.assign({}, BASE[sit] || BASE.early);
    // Angle only enters the menu when the line's geometry says it's the issue.
    const want = angleWant(sit, angleClass);
    if (want) base.Angle = (sit === 'carryWeak' || sit === 'carryStrong') ? 9 : sit === 'overunder' ? 8 : 6;
    const out = [];
    for (const kind of Object.keys(base)) {
      if (kind === 'Equipment' && !hasBall) continue;
      const rating = kind === 'Angle' ? (prof.laser.Aim ?? 4) : (prof.laser[kind] ?? 3);
      if (rating <= 1) continue; // "avoid it"
      let score = base[kind] + rating * 1.5;
      // Bowler profile shaping
      if (prof.dom < -0.3) { // speed-dominant
        if (sit === 'late' && kind === 'Speed') score += 2;
        if (sit === 'carryWeak' && kind === 'Speed') score -= 1; // already fast; protect energy with line/equipment first
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
      // 🧭 Compass: the ball is wrong -> change the ball; the ball is right -> move your feet, keep the ball.
      if (favor === 'ball' && kind === 'Equipment') score += 5;
      if (favor === 'spot') { if (kind === 'Equipment') score -= 9; if (kind === 'Aim' || kind === 'Angle') score += 1; }
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
    } else if (sit === 'carryWeak') { // save ENERGY: cleaner front (pearl/polish) with backend (asym)
      if (pearl || polished) p -= 0.04; if (asym) p -= 0.02; if (solid && grit <= 2000) p += 0.06;
    } else if (sit === 'carryStrong') { // use some energy early: sanded, smoother
      if (polished && asym) p += 0.06; if (!polished && !asym) p -= 0.04;
    } else if (sit === 'mud') {       // smooth, predictable: sanded symmetric, not shiny asym
      if (polished && pearl) p += 0.08; if (asym) p += 0.04; if (!asym && !polished) p -= 0.05;
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
        // 🧭 Friction timing: the new ball has to read in the direction the lane is asking for.
        const lt = LANE_TIMING[sit];
        if (lt === 'early' && v.length <= cv.length + 0.02) continue; // reading too early -> need one that reads later
        if (lt === 'late' && v.length >= cv.length - 0.02) continue;  // reading too late -> need one that reads earlier
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
      const t = { hook: 0.55, length: timingNeed(pat), backend: 0.5 };
      if (pat) {
        if (pat.lengthClass === 'long') t.hook += 0.10;
        if (pat.lengthClass === 'short') t.hook -= 0.10;
        if (pat.volumeClass === 'heavy') t.hook += 0.08;
        if (pat.volumeClass === 'light') t.hook -= 0.08;
        if (pat.flat) t.backend -= 0.08;
      }
      if (prof.dom < -0.3) t.hook += 0.05;
      if (prof.lowRev) t.hook += 0.04;
      let best = null;
      for (const b of balls) {
        const v = m.vector(b.row, ctx.bowler);
        // 🧭 Friction timing first (does it read when tonight's pattern needs it to?), overall motion second.
        const d = (pat ? Math.abs(v.length - t.length) * 2 : 0) + dist3(v, t) * (pat ? 0.5 : 1);
        if (!best || d < best.d) best = { name: b.name, d };
      }
      return best ? best.name : '';
    } catch (_e) { return ''; }
  }

  // ---------- 🧭 The compass (Benoit + Pinel) ----------
  // Every call answers two questions:
  //   Right ball?  Is the friction timing right? (reads early enough to store energy, late enough to keep it for the pins)
  //   Right spot?  Are feet + target keeping the breakpoint out of the mud (outside the rule-of-31 exit board)?
  // Ball timing = the motion model's "length" for THIS bowler (speed, revs, tilt, rotation already in it).
  // 0 = reads very early, 1 = reads very late.
  const TIMING_OK = 0.08;
  function timingNeed(pat) {
    let t = 0.55;
    if (pat) {
      if (pat.lengthClass === 'long') t -= 0.07;
      if (pat.lengthClass === 'short') t += 0.10;
      if (pat.volumeClass === 'heavy') t -= 0.06;
      if (pat.volumeClass === 'light') t += 0.06;
    }
    return clamp(t, 0.30, 0.85);
  }
  function bagTiming(ctx, pat) {
    try {
      const m = ctx.motion;
      if (!m || !pat) return [];
      const need = timingNeed(pat);
      return (ctx.setBalls || []).filter(b => b && b.row).map(b => {
        const t = m.vector(b.row, ctx.bowler).length;
        const gap = t - need;
        const rel = Math.abs(gap) <= TIMING_OK ? 'right' : gap < 0 ? 'early' : 'late';
        const info = ctx.ballInfo ? ctx.ballInfo(b.row) : {};
        const lowConf = info && info.known === false;
        return { name: b.name, t, gap, rel, lowConf };
      });
    } catch (_e) { return []; }
  }
  const REL_WORD = { right: 'reads about right', early: 'reads early', late: 'reads late' };
  function bagTimingText(list) {
    const nm = (b) => b.name + (b.lowConf ? ' (rough estimate: specs missing)' : '');
    const by = (r) => list.filter(b => b.rel === r).sort((a, b) => a.t - b.t);
    const E = by('early'), R = by('right'), L = by('late');
    if (L.length === list.length) return `on paper, everything in tonight's bag rates late for you (earliest: ${nm(L[0])}); trust what you see in practice`;
    if (E.length === list.length) return `on paper, everything in tonight's bag rates early for you (latest: ${nm(E[E.length - 1])}); trust what you see in practice`;
    const parts = [];
    if (R.length) parts.push(`${R.map(nm).join(', ')} ${R.length > 1 ? 'read' : 'reads'} about right`);
    if (E.length) parts.push(`${E.map(nm).join(', ')} ${E.length > 1 ? 'read' : 'reads'} early`);
    if (L.length) parts.push(`${L.map(nm).join(', ')} ${L.length > 1 ? 'read' : 'reads'} late`);
    return 'on paper, ' + parts.join('; ');
  }
  // What the lane is saying about timing, per situation.
  const LANE_TIMING = { early: 'early', carryWeak: 'early', late: 'late', carryStrong: 'late' };

  // Notes that ride along with any verdict
  function sideNotes(res, C, W, prof, pat) {
    const kp = prof.lefty ? '4-pin' : '6-pin';
    const pocket3 = W.filter(c => c.pocketHit).slice(-3);
    const wf = pocket3.filter(c => c.finish === 'weak').length;
    const sf = pocket3.filter(c => c.finish === 'strong').length;
    if (res.status !== 'move') {
      if (wf >= 2) res.notes.push(`⚠️ 🌀 Roll / energy early warning: the ball is losing energy on ${wf} of your last ${pocket3.length} pocket hits (deflecting off the deck / ${kp} laying down). Flat 10s are next if it continues.`);
      else if (sf >= 2) res.notes.push(`⚠️ 🌀 Roll / energy early warning: the ball is hitting too hard on ${sf} of your last ${pocket3.length} pocket hits (driving left off the deck / ${kp} wrapping). Watch for ringing 10s and 4-pins.`);
    }
    const trusted = C.filter(c => c.execution !== 'poor');
    const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    // 🛣️ Lane by lane: one lane of the pair can play differently
    const lanes = [...new Set(trusted.map(c => String(c.lane || '')).filter(Boolean))];
    if (lanes.length === 2) {
      const look = lanes.map(l => {
        const L = trusted.filter(c => String(c.lane) === l).slice(-4);
        return { l, n: L.length, hi: L.filter(c => c.lean > 0).length, lo: L.filter(c => c.lean < 0).length };
      });
      if (look.every(x => x.n >= 3)) {
        for (const [a, b] of [[look[0], look[1]], [look[1], look[0]]]) {
          if (a.hi >= 2 && b.hi === 0) { res.notes.push(`🛣️ Lane ${a.l} is reading high (${a.hi} of your last ${a.n} there) while lane ${b.l} isn't. Make the move on ${a.l} only.`); break; }
          if (a.lo >= 2 && b.lo === 0) { res.notes.push(`🛣️ Lane ${a.l} is holding (${a.lo} of your last ${a.n} light) while lane ${b.l} isn't. Make the move on ${a.l} only.`); break; }
        }
      }
    }

    // 📈 Game-to-game transition
    const games = [...new Set(trusted.map(c => c.gameNo))].sort((a, b) => a - b);
    if (games.length >= 2) {
      const g1 = trusted.filter(c => c.gameNo === games[0]), gN = trusted.filter(c => c.gameNo === games[games.length - 1]);
      if (g1.length >= 4 && gN.length >= 4) {
        const d = avg(gN.map(c => c.lean)) - avg(g1.map(c => c.lean));
        if (d >= 0.4) res.notes.push(`📈 Transition: game ${games[games.length - 1]} is hooking earlier than game ${games[0]}. The fronts are drying up${pat && pat.volumeClass === 'light' ? ', as expected on light oil' : ''}. Expect to keep moving ${prof.deeper}.`);
        else if (d <= -0.4) res.notes.push(`📉 Transition: game ${games[games.length - 1]} is holding more than game ${games[0]}. Oil may be carrying down; watch for flat 10s.`);
        // 🎯 Breakpoint drift on good results
        const bp1 = avg(g1.filter(c => c.bp != null && (c.pocketHit || c.strike)).map(c => c.bp));
        const bpN = avg(gN.filter(c => c.bp != null && (c.pocketHit || c.strike)).map(c => c.bp));
        if (bp1 != null && bpN != null && Math.abs(bpN - bp1) >= 2) res.notes.push(`🎯 Your breakpoint has moved from about board ${Math.round(bp1)} to ${Math.round(bpN)} since game ${games[0]}. That's the lane moving.`);
      }
    }

    // 🏈 Mud heads-up: turning at/inside the exit point even before over/under shows up
    const exB = exitBoardFor(pat);
    if (exB != null && res.situation !== 'mud' && res.tone !== 'good') {
      const m = W.filter(c => c.bp != null && c.bp >= exB);
      if (m.length >= 2 && m.length >= Math.ceil(W.length / 2)) res.notes.push(`🏈 Heads-up: your breakpoint (about board ${Math.round(avg(m.map(c => c.bp)))}) is at or inside where the ball exits the pattern (about board ${exB} on ${pat.length} ft). The ball is changing direction in the mud, so expect over/under. Let it travel further out before it turns.`);
    }

    const last = C[C.length - 1];
    const pocketShots = C.filter(c => c.pocketHit);
    const exitSeen = pocketShots.filter(c => c.exitRaw !== "Didn't notice").length;
    if (last && last.pocketHit && last.exitRaw === "Didn't notice" && pocketShots.length >= 2 && exitSeen / pocketShots.length < 0.6) {
      res.notes.push(`👀 Best ball is your eyeball: on your next pocket hit, watch where the ball leaves the deck${prof.lefty ? '' : ''} and what the ${kp} does.`);
    }
    return res;
  }

  // Eyeball score: how much of what matters you actually watched (0–100).
  function eyeballScore(shots, bowler) {
    const prof = bowlerProfile(bowler);
    const C = (shots || []).filter(s => s && s.type !== 'gameStart' && !s.isFill).map(s => classify(s, prof.lefty));
    if (!C.length) return { score: 0, label: '—', parts: {}, n: 0 };
    const pct = (a, b) => b ? a / b : null;
    const mark = pct(C.filter(c => String(c.shot.miss || 'didntTrack') !== 'didntTrack').length, C.length);
    const pocket = pct(C.filter(c => String(c.shot.pocket || 'Unknown') !== 'Unknown' || c.strike).length, C.length);
    const ph = C.filter(c => c.pocketHit);
    const exit = pct(ph.filter(c => c.exitRaw !== "Didn't notice").length, ph.length);
    const corner = prof.lefty ? '7' : '10';
    const cornerLeaves = C.filter(c => c.pocketHit && (pinsText(c.shot) === corner || ['Flat 10', 'Ringing 10'].includes(c.shot.leaveTag)));
    const key = pct(cornerLeaves.filter(c => c.keyPin && c.keyPin !== 'unknown').length, cornerLeaves.length);
    const parts = [[mark, 40], [pocket, 25], [exit, 25], [key, 10]].filter(([v]) => v !== null);
    const wsum = parts.reduce((a, [, w]) => a + w, 0);
    const score = Math.round(parts.reduce((a, [v, w]) => a + v * w, 0) / (wsum || 1) * 100);
    const label = score >= 85 ? 'Sharp eye' : score >= 65 ? 'Good eye' : score >= 45 ? 'Building' : 'Foggy';
    const r = (v) => v === null ? null : Math.round(v * 100);
    return { score, label, n: C.length, parts: { mark: r(mark), pocket: r(pocket), exit: r(exit), keyPin: r(key) }, pocketHits: ph.length, cornerLeaves: cornerLeaves.length };
  }

  // ---------- Five Elements ----------
  // Plain-words profile for the Bowler page.
  function elementsProfile(bowler) {
    const p = bowlerProfile(bowler);
    const L = p.laser;
    const conf = (r) => r >= 5 ? 'a strength' : r >= 4 ? 'comfortable' : r >= 3 ? 'sometimes' : r >= 2 ? 'rarely comfortable' : 'avoid';
    const tiltTxt = p.tilt == null ? null : p.tilt < 10 ? 'low tilt: the ball reads the lane early and rolls sooner'
      : p.tilt <= 20 ? 'medium tilt: the ball saves some energy, then reads mid-lane' : 'high tilt: the ball skids longer before it hooks';
    const rotTxt = p.rotation == null ? null : p.rotation < 30 ? 'low rotation: more forward roll, a smooth arc'
      : p.rotation <= 60 ? 'medium rotation: a balanced skid–hook–roll' : 'high rotation: a sharper turn at the breakpoint';
    const sideOf = p.lefty ? 'right' : 'left';
    return [
      { key: 'Direction', icon: '🎯', value: `Aim ${L.Aim}/5 (${conf(L.Aim)})`,
        meaning: 'Four parts: geometry (a line that works on this pattern), targeting (hitting your mark), ball placement (laying it down on your spot) and posture (staying balanced through the finish). Every "feet 2, eyes 1" move is a direction change.',
        tip: L.Aim >= 4 ? 'Moving your feet and target is your best tool. Coach will lead with it.' : 'Direction moves aren\'t your strength yet, so Coach will lean on equipment and speed first.' },
      { key: 'Speed', icon: '⚡', value: p.mph ? `${p.mph} mph at the foul line${L.Speed ? ` · speed changes ${conf(L.Speed)}` : ''}` : 'Not entered yet',
        meaning: 'Two parts: total speed (your normal speed, and repeating it) and versatility (changing speed on purpose). Faster = the ball goes longer and hooks later; slower = it reads sooner.',
        tip: p.dom < -0.3 ? 'You\'re speed-dominant: your speed outruns your revs, so the ball can skid long. A touch less speed, or earlier-reading equipment, helps it finish.' : p.dom > 0.3 ? 'You\'re rev-dominant: a touch more speed keeps the ball from hooking too early.' : 'Your speed and revs are matched, so small speed changes are a fine-tuning tool.' },
      { key: 'Angle', icon: '📐', value: 'From your feet, target and breakpoint',
        meaning: 'How much the ball has to come back from the breakpoint to the pocket. More angle = more swing; less angle = a straighter line.',
        tip: p.dom < -0.3 ? `As a speed-dominant bowler you usually create angle with lane position (feet ${sideOf}, eyes stay) or equipment, more than with your hand.` : 'Angle comes from where you stand vs. where you aim.' },
      { key: 'Revs', icon: '🔄', value: p.rpm ? `${p.rpm} rpm (${p.lowRev ? 'lower rev' : p.highRev ? 'high rev' : 'medium rev'})` : 'Not entered yet',
        meaning: 'How fast the ball spins, and whether you can change it on purpose (more or less hand). More revs = more hook and more pin action; fewer = a straighter, steadier ball.',
        tip: p.lowRev ? 'With lower revs, rely on stronger covers / rougher surfaces to get the ball to finish. Your hand alone won\'t add much hook.' : 'Your revs give you hook. Use smoother equipment when the lanes get dry.' },
      { key: 'Roll', icon: '🌀', value: [p.tilt != null ? `${p.tilt}° tilt` : null, p.rotation != null ? `${p.rotation}° rotation` : null].filter(Boolean).join(', ') || 'Not entered yet',
        meaning: 'How the ball goes through skid → hook → roll. Watch the exit off the deck and the 6-pin: they show whether the ball rolled out early or was still turning.',
        tip: [tiltTxt, rotTxt].filter(Boolean).join('; ') + (L.Release ? `. Release changes: ${conf(L.Release)}.` : '') },
    ];
  }

  // End-of-night report: Del Warren's 5 Scoring Elements (Kegel): Direction, Speed, Angle, Revs, Roll.
  // Each element has a grade (or null when not enough was logged) and sub-parts; one drill for the weakest.
  // It grades what you logged tonight. It never predicts.
  function elementsReport(shots, bowler, pattern) {
    const prof = bowlerProfile(bowler);
    const pat = patternProfile(pattern);
    const C = (shots || []).filter(s => s && s.type !== 'gameStart' && !s.isFill).map(s => classify(s, prof.lefty));
    if (C.length < 3) return null;
    const pct = (a, b) => b ? Math.round(a / b * 100) : null;
    const of = (a, b) => `${a} of ${b}`;
    const sub = (label, score, text) => ({ label, score, text });
    const chg = (c, k) => Array.isArray(c.shot.changed) && c.shot.changed.includes(k);
    const out = [];

    // 1. DIRECTION: Geometry · Targeting · Ball placement · Posture
    const dSubs = [];
    { // Geometry: did your opening line (game 1) pass the Rule of 31 / Baker Box?
      const g1 = C.filter(c => c.gameNo === 1 && c.feet != null && num(c.shot.arrows) != null);
      const checks = g1.map(c => lineMath(c.feet, c.shot.arrows, pat, prof, 'start', null, null, num(c.shot.targetFt) || 15)).filter(r => r && r.status);
      if (checks.length) {
        const on = checks.filter(r => r.status === 'on').length;
        const basis = checks[0].basis === 'box' ? 'your Baker Box' : 'the Rule of 31';
        dSubs.push(sub('Geometry', pct(on, checks.length), `Your game 1 line went through ${basis} on ${of(on, checks.length)} shots.`));
      } else dSubs.push(sub('Geometry', null, pat && pat.length && pat.r31 ? 'Log your slide and target in game 1 to check your line.' : 'Pick a pattern (with Rule of 31 checked) to check your line.'));
    }
    const trackedMark = C.filter(c => String(c.shot.miss || 'didntTrack') !== 'didntTrack');
    const onMark = trackedMark.filter(c => c.shot.miss === 'noMiss' || c.saved).length;
    const tgt = pct(onMark, trackedMark.length);
    dSubs.push(sub('Targeting', tgt, tgt == null ? 'Tap Your mark to grade targeting.' : `On your mark (or saved by the lane) on ${of(onMark, trackedMark.length)} shots.`));
    { const L = C.filter(c => ['on', 'inside', 'outside'].includes(c.shot.laydown));
      const on = L.filter(c => c.shot.laydown === 'on').length, ins = L.filter(c => c.shot.laydown === 'inside').length, outs = L.length - on - ins;
      dSubs.push(sub('Ball placement', pct(on, L.length), L.length ? `On your laydown spot on ${of(on, L.length)} shots${ins ? `, inside ${ins}×` : ''}${outs ? `, outside ${outs}×` : ''}.` : 'Tap Laydown under More reads to grade where the ball lands.'));
    }
    { const F = C.filter(c => c.shot.fault && c.shot.fault !== 'unsure' && c.shot.fault !== 'well');
      const bal = F.filter(c => c.shot.fault === 'balance').length;
      dSubs.push(sub('Posture', F.length ? pct(C.length - bal, C.length) : null, F.length ? (bal ? `Fell off the shot ${bal}× (${of(bal, F.length)} poor shots with a reason).` : `No balance faults among ${F.length} poor shot${F.length === 1 ? '' : 's'} with a reason.`) : 'Pick a reason on poor shots (like Fell off the shot) to grade posture.'));
    }
    const dScored = dSubs.filter(x => x.score != null);
    const dScore = tgt != null ? tgt : dScored.length ? Math.round(dScored.reduce((a, x) => a + x.score, 0) / dScored.length) : null;
    const dLeak = dScored.length >= 2 ? dScored.slice().sort((a, b) => a.score - b.score)[0] : null;
    out.push({ key: 'Direction', icon: '🎯', score: dScore, subs: dSubs,
      text: dScore == null ? 'Track your mark to grade direction.' : `Targeting ${tgt != null ? tgt + '%' : 'not tracked'}.${dLeak && dLeak.score < 70 ? ` Weakest part: ${dLeak.label.toLowerCase()} (${dLeak.score}%).` : ''}` });

    // 2. SPEED: Total · Versatility (changing speed on purpose)
    const sp = C.filter(c => c.speed && c.speed !== 'unknown');
    const planned = sp.filter(c => chg(c, 'speed') && c.speed !== 'same');
    const unplanned = sp.filter(c => !(chg(c, 'speed') && c.speed !== 'same'));
    const same = unplanned.filter(c => c.speed === 'same').length;
    const spCaused = C.filter(c => c.speedCaused && !chg(c, 'speed')).length;
    const sScore = pct(same, unplanned.length);
    const sSubs = [
      sub('Total', sScore, (prof.mph ? `${prof.mph} mph (${prof.label}). ` : '') + (unplanned.length ? `Repeated your normal speed on ${of(same, unplanned.length)} shots${spCaused ? `; ${spCaused} miss${spCaused > 1 ? 'es were' : ' was'} from speed, not the lane` : ''}.` : 'Tap Speed vs normal to grade speed control.')),
    ];
    if (planned.length) {
      const worked = planned.filter(c => c.strike || c.pocketHit).length;
      sSubs.push(sub('Versatility', pct(worked, planned.length), `You changed speed on purpose ${planned.length}× (${planned.filter(c => c.speed === 'faster').length} faster, ${planned.filter(c => c.speed === 'slower').length} slower); ${of(worked, planned.length)} found the pocket.`));
    } else sSubs.push(sub('Versatility', null, 'To grade a planned speed change: tap Speed under Changed since last shot, then Faster or Slower.'));
    out.push({ key: 'Speed', icon: '⚡', score: sScore, subs: sSubs, text: unplanned.length ? `Your normal speed on ${of(same, unplanned.length)} shots.` : 'Tap Speed vs normal to grade speed.' });

    // 3. ANGLE: breakpoint → pocket, and where the ball turns (the mud)
    const aSubs = [];
    const withGeo = C.filter(c => c.angleClass);
    let aScore = null, aText = 'Enter your breakpoint to grade angle.';
    if (withGeo.length) {
      const steepBad = withGeo.filter(c => c.angleClass === 'steep' && (c.finish === 'strong' || c.overUnder || c.hit === 'brooklyn')).length;
      const directBad = withGeo.filter(c => c.angleClass === 'direct' && (c.finish === 'weak' || c.shot.leaveTag === 'Flat 10')).length;
      const good = withGeo.filter(c => c.strike || c.finish === 'good').length;
      aScore = pct(good, withGeo.length);
      aText = `${of(good, withGeo.length)} shots with a breakpoint logged finished well.` + (steepBad ? ` ${steepBad} came in too strong on a big-swing line.` : '') + (directBad ? ` ${directBad} were weak on a straight-up line.` : '');
      aSubs.push(sub('Entry', aScore, aText)); aText = `${aScore}% of shots with a breakpoint finished well.`;
    }
    const exB = exitBoardFor(pat);
    if (exB != null) {
      const withBp = C.filter(c => c.bp != null);
      if (withBp.length) {
        const mud = withBp.filter(c => c.bp >= exB);
        aSubs.push(sub('Exit point', pct(withBp.length - mud.length, withBp.length), mud.length ? `Turned in the mud (breakpoint at or inside board ${exB}) on ${of(mud.length, withBp.length)} shots.` : `Turned in the dry, outside board ${exB}, on every logged shot.`));
      }
    }
    out.push({ key: 'Angle', icon: '📐', score: aScore, subs: aSubs, text: aText });

    // 4. REVS: how much the ball hooked for you, and changing your hand on purpose
    const rd = C.filter(c => c.early || c.long || c.pocketHit || c.strike);
    const right = rd.filter(c => (c.pocketHit || c.strike) && !c.early && !c.long).length;
    const early = rd.filter(c => c.early).length, long = rd.filter(c => c.long).length;
    const rScore = pct(right, rd.length);
    const rSubs = [sub('Hook', rScore, rd.length ? `Hooked the right amount on ${of(right, rd.length)} shots${early ? `; hooked early ${early}×` : ''}${long ? `; went long ${long}×` : ''}.` : 'Tap the pocket and ball reaction to grade hook.')];
    const hand = C.filter(c => chg(c, 'hand'));
    if (hand.length) { const w = hand.filter(c => c.strike || c.pocketHit).length; rSubs.push(sub('Versatility', pct(w, hand.length), `You changed your hand on purpose ${hand.length}×; ${of(w, hand.length)} found the pocket.`)); }
    else rSubs.push(sub('Versatility', null, 'To grade a planned rev change: tap Hand under Changed since last shot.'));
    out.push({ key: 'Revs', icon: '🔄', score: rScore, subs: rSubs, text: (prof.rpm ? `${prof.rpm} rpm. ` : '') + (rd.length ? `The right amount of hook on ${of(right, rd.length)} shots.` : rSubs[0].text) });

    // 5. ROLL: how the ball finished: exit off the deck and the key pin
    const ph = C.filter(c => c.pocketHit && (c.finish || c.strike));
    const fin = ph.filter(c => c.strike || c.finish === 'good').length;
    const weak = ph.filter(c => c.finish === 'weak').length, strong = ph.filter(c => c.finish === 'strong').length;
    const roScore = pct(fin, ph.length);
    out.push({ key: 'Roll', icon: '🌀', score: roScore, subs: [], text: ph.length ? `Finished right on ${of(fin, ph.length)} pocket hits.${weak ? ` Rolled out (weak exit) ${weak}×.` : ''}${strong ? ` Still turning too hard ${strong}×.` : ''}` : 'Tap the exit off the deck to grade roll.' });

    const scored = out.filter(x => x.score != null);
    const weakest = scored.length ? scored.slice().sort((a, b) => a.score - b.score)[0] : null;
    const DRILL = {
      Direction: 'Spot drill: 10 shots, same feet and target. Goal: 8 of 10 over your mark, laid down on your spot, holding your finish.',
      Speed: 'Speed ladder: 3 shots at normal speed, 3 a touch slower, 3 a touch faster, same line. Check the monitor and watch where each one turns.',
      Angle: 'Angle drill: keep the same target and try 3 different feet positions, 3 shots each. Watch how the entry and the 6-pin change.',
      Revs: 'Hand drill: 3 shots with your normal hand, 3 with less (quieter hand), 3 with more. Same line. Watch how much the ball hooks.',
      Roll: 'Finish drill: 10 pocket shots. Call the exit (left / straight / right) and the 6-pin out loud before the pins settle.',
    };
    return { model: 'kegel5', elements: out, weakest: weakest ? weakest.key : '', drill: weakest ? DRILL[weakest.key] : '' };
  }

  // ---------- Arsenal check: bowler ↔ ball, bag shape, history ----------
  // Games logged on a ball (fractional: share of first balls in each game), optionally since a date.
  function ballGames(sessions, name, sinceTs) {
    let g = 0;
    for (const s of (Array.isArray(sessions) ? sessions : [])) {
      if (sinceTs && (s.savedAt || 0) < sinceTs) continue;
      const shots = (s.shots || []).filter(x => x && x.type !== 'gameStart' && !x.isFill);
      const byGame = {};
      shots.forEach(x => { const k = x.gameNo || 1; (byGame[k] = byGame[k] || []).push(x); });
      for (const k of Object.keys(byGame)) {
        const arr = byGame[k];
        const mine = arr.filter(x => x.ball === name).length;
        if (mine) g += mine / arr.length; // a full game with this ball = 1
      }
    }
    return Math.round(g);
  }

  // ctx: { rows:[{name,row}], bowler, sessions, patterns, sets, info(row)->{cover,grit,asym,rg,diff}, motion, matrix(row)->{strength,shape,strengthScore}, care(name)->{weight,resurfacedAt} }
  function arsenalCheck(ctx) {
    const prof = bowlerProfile(ctx.bowler);
    const balls = (ctx.rows || []).filter(b => b && b.row && !b.row.__proposed);
    const F = [];
    const add = (level, icon, title, detail, fix) => F.push({ level, icon, title, detail, fix });
    if (!balls.length) return F;
    const info = (b) => ctx.info(b.row);
    const isPearl = (b) => /pearl/i.test(info(b).cover || '');
    const isSolid = (b) => /solid/i.test(info(b).cover || '');
    const isPolished = (b) => (Number(info(b).grit) || 4000) >= 4500;
    const isSanded = (b) => (Number(info(b).grit) || 4000) <= 3000;
    const isSpare = (b) => { try { if (typeof BT !== 'undefined' && BT.isSpareBall && b.row) return BT.isSpareBall(b.row); } catch (_e) {} return /plastic|poly(ester)?/i.test(info(b).cover || ''); };
    const play = balls.filter(b => !isSpare(b));
    const n = play.length;

    // ---- 1. Bowler ↔ ball ----
    const known = balls.map(b => ctx.care && ctx.care(b.name).weight).filter(Boolean);
    const weights = known.length ? known : [15];
    const usual = weights.slice().sort((a, b) => weights.filter(x => x === b).length - weights.filter(x => x === a).length)[0];
    const wKnown = known.length > 0;
    const wTxt = wKnown ? `Your ${usual} lb ball` : 'A 15–16 lb ball';
    const mphLine = prof.mph;
    const mphPins = num(ctx.bowler && ctx.bowler.mphPins) ?? (mphLine != null ? Math.round(mphLine * 0.85 * 10) / 10 : null);
    if (mphPins != null && usual >= 15 && mphPins < 11) {
      add('high', '⚖️', `${wTxt} may be too heavy for your speed`, `Your ball reaches the pins at about ${mphPins} mph. At that speed extra weight doesn't add carry. It mainly adds effort and fatigue.${wKnown ? '' : ' (Set each ball\'s weight in the Arsenal Matrix for a sharper check.)'}`, `Try a ${usual - 2}–${usual - 1} lb ball. You'll likely gain speed and revs with less effort, and lose very little pin carry. If your current weight feels great, keep it.`);
    } else if (mphPins != null && wKnown && usual >= 16 && mphPins < 12.5) {
      add('med', '⚖️', 'Consider a 15 lb ball', `About ${mphPins} mph at the pins with 16 lb equipment.`, 'One pound lighter often adds a little speed and rev rate with no carry loss at your speed.');
    }
    // Fatigue: slower taps / weak finishes pile up in the last game of the night
    const recent = (ctx.sessions || []).slice(0, 6);
    let tiredNights = 0;
    for (const s of recent) {
      const shots = (s.shots || []).filter(x => x && x.type !== 'gameStart' && !x.isFill);
      const games = [...new Set(shots.map(x => x.gameNo || 1))].sort((a, b) => a - b);
      if (games.length < 2) continue;
      const first = shots.filter(x => (x.gameNo || 1) === games[0]), lastG = shots.filter(x => (x.gameNo || 1) === games[games.length - 1]);
      const tired = (arr) => arr.filter(x => x.speedTrend === 'slower' || x.keyPin === 'weak' || (x.exit === (prof.lefty ? 'Exit left' : 'Exit right'))).length / Math.max(arr.length, 1);
      if (lastG.length >= 6 && tired(lastG) - tired(first) >= 0.25) tiredNights++;
    }
    if (tiredNights >= 2) add('med', '🔋', 'You may be tiring late in the night', `In ${tiredNights} of your last ${recent.length} sessions, "slower" speed taps and weak finishes jumped in the last game.`, usual >= 15 ? 'A ball 1 lb lighter can keep your speed and finish up through game 3. So can a short warm-up routine between games.' : 'A short stretch / warm-up between games helps keep speed and finish up through game 3.');

    if (n >= 3) {
      const shinyShare = play.filter(b => isPearl(b) || isPolished(b)).length / n;
      const strongShare = play.filter(b => (ctx.matrix(b.row).strength === 'STRONG') || (isSolid(b) && isSanded(b))).length / n;
      const hasClean = play.some(b => isPearl(b) || isPolished(b));
      const hasEarly = play.some(b => isSanded(b) && (isSolid(b) || /hybrid/i.test(info(b).cover || '')));
      if (prof.dom < -0.3 && shinyShare >= 0.75) add('high', '⚡', 'Speed-dominant, but your bag is mostly shiny', `${Math.round(shinyShare * 100)}% of your balls are pearls or polished. With your speed they'll skid past the friction.`, 'Add (or resurface one ball to) a sanded solid around 1500–2000 grit for an earlier, controllable read.');
      if (prof.dom > 0.3 && strongShare >= 0.75 && !hasClean) add('high', '🔄', 'Rev-dominant, and every ball is strong', 'Your revs already give you plenty of hook, and nothing in your bag is clean for when the lanes dry up.', 'Add a polished pearl (or polish one ball) for transition and drier lanes.');
      const rgs = play.map(b => num(info(b).rg)).filter(v => v != null);
      if (prof.lowRev && rgs.length >= 3 && rgs.filter(v => v >= 2.54).length / rgs.length >= 0.6) add('med', '🔄', 'High-RG cores for a lower-rev game', `Most of your balls have RG 2.54+. High-RG balls are slow to rev up, and with about ${prof.rpm} rpm they can skid too long.`, 'Lower-RG cores (about 2.46–2.50) rev up sooner and help a lower-rev release finish.');
      if (prof.tilt != null && prof.tilt >= 20 && !hasEarly) add('med', '🌀', 'High tilt and nothing reads early', `${prof.tilt}° of tilt already gives you length, and none of your balls is a sanded solid or hybrid.`, 'Add an earlier-reading sanded ball so you have an answer on heavier oil.');
      if (prof.laser.Speed <= 2 && prof.laser.Release <= 2) {
        const strengths = play.map(b => ctx.matrix(b.row).strengthScore).filter(v => v != null);
        const spread = strengths.length ? Math.max(...strengths) - Math.min(...strengths) : 0;
        if (spread < 0.3) add('med', '🎯', 'Your bag has to do the adjusting, and it\'s narrow', 'You rated speed and release changes low, so equipment is your main adjustment. Your balls are close together in strength.', 'Spread the bag: one clearly stronger ball and one clearly weaker/cleaner one.');
      }
    }

    // ---- 2. Bag shape ----
    if (n >= 3) {
      const cells = {};
      const cap = (w) => w.charAt(0) + w.slice(1).toLowerCase();
      for (const b of play) { const c = ctx.matrix(b.row); const k = `${cap(c.strength)} / ${cap(c.shape)}`; (cells[k] = cells[k] || []).push(b.name); }
      const all = ['Strong / Smooth', 'Strong / Sharp', 'Medium / Smooth', 'Medium / Sharp', 'Weak / Smooth', 'Weak / Sharp'];
      const empty = all.filter(k => !cells[k]);
      const crowded = Object.entries(cells).sort((a, b) => b[1].length - a[1].length)[0];
      if (crowded && crowded[1].length >= 3 && crowded[1].length / n >= 0.4) add('med', '🧺', `Crowded: ${crowded[1].length} of ${n} balls are ${crowded[0]}`, `${crowded[1].slice(0, 4).join(', ')}${crowded[1].length > 4 ? ` and ${crowded[1].length - 4} more` : ''}. ${empty.length ? 'Nothing in: ' + empty.join(', ') + '.' : ''}`, empty.length ? `Your next ball (or a resurface) should fill ${empty[0]}.` : 'Consider retiring or changing the surface on one of them.');
      else if (empty.length >= 3) add('low', '🧺', 'Missing categories', `Nothing in: ${empty.join(', ')}.`, `When you add a ball, aim for ${empty[0]}.`);

      // Near-duplicates
      const vecs = play.map(b => ({ name: b.name, v: ctx.motion.vector(b.row, ctx.bowler) }));
      const dups = [];
      for (let i = 0; i < vecs.length; i++) for (let j = i + 1; j < vecs.length; j++) {
        const d = Math.sqrt((vecs[i].v.hook - vecs[j].v.hook) ** 2 + (vecs[i].v.length - vecs[j].v.length) ** 2 + (vecs[i].v.backend - vecs[j].v.backend) ** 2);
        if (d <= 0.06) dups.push([vecs[i].name, vecs[j].name, d]);
      }
      dups.sort((a, b) => a[2] - b[2]);
      if (dups.length) add('low', '👯', `${dups.length} near-duplicate pair${dups.length > 1 ? 's' : ''}`, dups.slice(0, 3).map(d => `${d[0]} ≈ ${d[1]}`).join(' · ') + '. They roll almost the same for you.', 'Change the surface on one ball of each pair to make it a real step up or down.');

      // Step-down gaps
      const st = play.map(b => ({ name: b.name, s: ctx.matrix(b.row).strengthScore })).filter(x => x.s != null).sort((a, b) => b.s - a.s);
      for (let i = 1; i < st.length; i++) {
        if (st[i - 1].s - st[i].s >= 0.22) { add('low', '🪜', 'Big gap in your step-down', `Big jump between ${st[i - 1].name} and ${st[i].name}. Nothing in between for when the lane is transitioning.`, 'A medium-strength ball (or a different surface on one of these) fills the gap.'); break; }
      }

      // Same surface everywhere
      const bucket = (b) => isPolished(b) ? 'polish' : (Number(info(b).grit) || 4000) <= 2500 ? 'rough' : 'mid';
      const buckets = new Set(play.map(bucket));
      if (n >= 4 && buckets.size === 1) add('low', '🧽', 'Every ball has the same kind of surface', `All ${n} balls are ${[...buckets][0] === 'mid' ? 'around 3000–4000 grit' : [...buckets][0] === 'polish' ? 'polished' : 'rough-sanded'}.`, 'Spreading surfaces (e.g., one at 2000, one at 4000, one polished) gives you more steps without buying anything.');
    }
    if (!balls.some(isSpare)) add('med', '🎯', ctx.scope === 'bag' ? 'No spare ball in this bag' : 'No spare ball', ctx.scope === 'bag' ? 'No plastic/polyester ball in this bag.' : 'No plastic/polyester ball in your list.', 'A plastic spare ball goes straight, which makes 10-pins and 7-pins much easier.');

    // ---- 3. Arsenal ↔ where you bowl / history ----
    const sessions = Array.isArray(ctx.sessions) ? ctx.sessions : [];
    if (sessions.length >= 3 && n >= 3) {
      const pats = Object.fromEntries((ctx.patterns || []).map(p => [p.name, patternProfile(p)]));
      const used = sessions.map(s => pats[s.pattern]).filter(Boolean);
      if (used.length >= 3) {
        const light = used.filter(p => p.volumeClass === 'light' || p.lengthClass === 'short').length / used.length;
        const heavy = used.filter(p => p.volumeClass === 'heavy' || p.lengthClass === 'long').length / used.length;
        const avgStrength = play.map(b => ctx.matrix(b.row).strengthScore).filter(v => v != null).reduce((a, b, _, A) => a + b / A.length, 0);
        if (light >= 0.6 && avgStrength >= 0.66) add('med', '🛢️', 'Your bag is built for heavier oil than you bowl on', `${Math.round(light * 100)}% of your logged nights are on short or light patterns, but most of your balls are strong.`, 'Add a cleaner, weaker ball (pearl or polished) for these conditions.');
        if (heavy >= 0.6 && avgStrength <= 0.45) add('med', '🛢️', 'Your bag is light for the oil you bowl on', `${Math.round(heavy * 100)}% of your logged nights are on long or heavy patterns, but your balls are mostly weaker.`, 'Add a strong, sanded solid for these conditions.');
      }
      // Balls in a saved bag that never get thrown
      const bagBalls = new Set((ctx.sets || []).flatMap(st => (st.balls || []).map(x => typeof x === 'string' ? x : x && x.name)).filter(Boolean));
      const thrown = new Set(sessions.slice(0, 8).flatMap(s => (s.shots || []).map(x => x.ball)).filter(Boolean));
      const idle = [...bagBalls].filter(b => !thrown.has(b));
      if (idle.length && sessions.length >= 4) add('low', '💤', `${idle.length === 1 ? idle[0] + ' hasn\'t' : idle.length + ' bagged balls haven\'t'} been thrown lately`, `${idle.slice(0, 4).join(', ')}: no shots in your last ${Math.min(8, sessions.length)} sessions.`, 'Fine as a backup. If it never comes out, it may be dead weight in the bag.');
      // Underperforming ball at a house / lane pair
      const byCtx = {};
      for (const s of sessions) {
        const key = `${s.house || '—'}|${s.lanes || '—'}`;
        for (const x of (s.shots || [])) {
          if (!x || x.type === 'gameStart' || x.isFill || !x.ball) continue;
          const c = classify(x, prof.lefty);
          byCtx[key] = byCtx[key] || {};
          const r = byCtx[key][x.ball] = byCtx[key][x.ball] || { n: 0, good: 0 };
          r.n++; if (c.pocketHit || c.strike) r.good++;
        }
      }
      for (const [key, map] of Object.entries(byCtx)) {
        const list = Object.entries(map).filter(([, r]) => r.n >= 8).map(([b, r]) => ({ b, rate: r.good / r.n, n: r.n }));
        if (list.length < 2) continue;
        list.sort((a, b) => a.rate - b.rate);
        const worst = list[0], others = list.slice(1);
        const otherRate = others.reduce((a, o) => a + o.rate * o.n, 0) / others.reduce((a, o) => a + o.n, 0);
        if (otherRate - worst.rate >= 0.2) { const [h, l] = key.split('|'); add('low', '📉', `${worst.b} underperforms at ${h}${l !== '—' ? ' ' + l : ''}`, `Pocket rate ${Math.round(worst.rate * 100)}% vs ${Math.round(otherRate * 100)}% with your other balls (${worst.n} shots).`, 'Start with a different ball there, or check whether it needs a resurface.'); break; }
      }
      // Maintenance
      for (const b of balls) {
        const care = ctx.care ? ctx.care(b.name) : {};
        const g = ballGames(sessions, b.name, care.resurfacedAt);
        if (g >= 60) add(g >= 90 ? 'med' : 'low', '🧰', `${b.name}: about ${g} games${care.resurfacedAt ? ' since resurface' : ' logged'}`, 'Covers lose surface and soak up oil over time, so the ball slowly gets weaker and more unpredictable.', 'Time for a resurface / oil extraction (usually every 60–100 games). Tap the ball in the Arsenal Matrix → "Just resurfaced" to reset the count.');
      }
    }
    const order = { high: 0, med: 1, low: 2 };
    return F.sort((a, b) => order[a.level] - order[b.level]);
  }

  // ---------- 🔁 Move review: grade the bowler's own moves (timing, direction, result) ----------
  // Works the same for moves Coach suggested and moves the bowler made on their own.
  function moveReviews(C, prof) {
    const own = (v) => (v != null && prof.lefty && v > 20) ? 40 - v : v; // + = deeper in every case
    const lineKey = (c) => `${c.feet ?? '?'}/${c.arrows ?? '?'}`;
    const changes = [];
    for (let i = 1; i < C.length; i++) {
      const a = C[i - 1], b = C[i];
      const lineMoved = (a.feet != null && b.feet != null && a.feet !== b.feet) || (a.arrows != null && b.arrows != null && a.arrows !== b.arrows);
      const ballChanged = !!(a.ball && b.ball && a.ball !== b.ball);
      if (lineMoved || ballChanged) changes.push({ i, lineMoved, ballChanged });
    }
    const good = (c) => (c.strike && c.hit !== 'brooklyn') || c.hit === 'flush'; // clean result
    const rate = (arr) => arr.length ? arr.filter(good).length / arr.length : null;
    return changes.map((ch, k) => {
      const i = ch.i, prev = C[i - 1], cur = C[i];
      const start = k ? changes[k - 1].i : 0;
      const end = k + 1 < changes.length ? changes[k + 1].i : C.length;
      const before = C.slice(start, i).filter(c => c.execution !== 'poor');
      const after = C.slice(i, end).filter(c => c.execution !== 'poor');
      const last2 = before.slice(-2);
      const read = last2.length === 2 && last2.every(c => c.lean > 0) ? 'early' : last2.length === 2 && last2.every(c => c.lean < 0) ? 'late' : '';
      const dF = (prev.feet != null && cur.feet != null) ? own(cur.feet) - own(prev.feet) : 0;
      const dA = (prev.arrows != null && cur.arrows != null) ? own(cur.arrows) - own(prev.arrows) : 0;
      const dir = Math.sign(dF || dA); // +1 deeper, -1 outside
      const want = read === 'early' ? 1 : read === 'late' ? -1 : 0;
      const r = {
        i, from: lineKey(prev), to: lineKey(cur), fromBall: prev.ball, toBall: cur.ball,
        lineMoved: ch.lineMoved, ballChanged: ch.ballChanged, dF, dA, dir, read,
        afterPoor: prev.execution === 'poor',
        whileStriking: prev.execution !== 'poor' && last2.length === 2 && last2.every(c => c.strike && c.hit !== 'brooklyn'),
        tooSoon: false, wrongDir: false, rightDir: false, result: 'pending', nAfter: after.length, nBefore: before.length,
      };
      r.tooSoon = !r.afterPoor && !r.whileStriking && before.length < 2;
      if (ch.lineMoved && want) { r.wrongDir = dir === -want; r.rightDir = dir === want; }
      const a4 = after.slice(0, 4), b4 = before.slice(-4);
      if (a4.length >= 3) {
        const pa = rate(a4), pb = rate(b4);
        r.pa = a4.filter(good).length; r.na = a4.length;
        r.pb = b4.filter(good).length; r.nb = b4.length;
        if (pa >= 0.75 || (pb != null && pa >= pb + 0.25)) r.result = 'worked';
        else if (pb != null && pa < pb) r.result = 'didnt';
        else r.result = 'mixed';
        const leanA = a4.reduce((x, c) => x + c.lean, 0) / a4.length;
        r.after = leanA >= 0.5 ? 'early' : leanA <= -0.5 ? 'late' : '';
      }
      r.goodCall = !r.afterPoor && !r.tooSoon && !r.whileStriking && !r.wrongDir && r.result !== 'didnt';
      return r;
    });
  }
  function moveWord(r, prof) {
    const n = Math.abs(r.dF || r.dA);
    const way = r.dir > 0 ? prof.deeper : prof.outside;
    if (r.lineMoved && r.ballChanged) return `moved ${n} ${n === 1 ? 'board' : 'boards'} ${way} and switched to ${r.toBall}`;
    if (r.ballChanged) return `switched to ${r.toBall}`;
    return `moved ${n} ${n === 1 ? 'board' : 'boards'} ${way} (${r.from} → ${r.to})`;
  }
  function moveNotes(out, C, prof) {
    const R = moveReviews(C, prof);
    if (!R.length) return R;
    const last = R[R.length - 1];
    const what = moveWord(last, prof);
    const notes = [];
    // Timing + direction: right after the move, while the result is still pending
    if (last.result === 'pending') {
      if (last.afterPoor) notes.push(`⏱️ You ${what} right after a shot that missed your mark. That shot was the throw, not the lane. If your next good shot is fine, keep the new line; if not, go back to ${last.from}.`);
      else if (last.whileStriking) notes.push(`⏱️ You ${what} while you were striking. Usually stay until a good shot misses the pocket.`);
      else if (last.tooSoon) notes.push(`⏱️ You ${what} after only ${last.nBefore === 1 ? 'one good shot' : 'no good shots'} on the old line. Coach waits for 2 good shots that say the same thing before moving.`);
      if (last.wrongDir) notes.push(`↔️ You moved ${last.dir > 0 ? prof.deeper : prof.outside}, but your last 2 good shots were ${last.read === 'early' ? 'hooking early' : 'holding'}. Following the miss would be ${last.read === 'early' ? prof.deeper : prof.outside}.`);
      else if (last.rightDir && !last.afterPoor && !last.tooSoon) notes.push(`👍 Good call: your last 2 good shots were ${last.read === 'early' ? 'hooking early' : 'holding'} and you moved ${last.dir > 0 ? prof.deeper : prof.outside}.`);
    }
    if (last.result === 'didnt') {
      const fix = last.lineMoved && last.after && last.after === last.read ? `It's still ${last.after === 'early' ? 'hooking early' : 'holding'}: move further ${last.read === 'early' ? prof.deeper : prof.outside}.`
        : last.lineMoved && last.after && last.read && last.after !== last.read ? `It flipped to ${last.after === 'early' ? 'hooking early' : 'holding'}: you went too far, so come back about halfway.`
        : `Go back to ${last.ballChanged && !last.lineMoved ? last.fromBall : last.from}, or try a different kind of change.`;
      notes.push(`↩️ That change didn't help: you ${what}, and ${last.pa} of ${last.na} good shots were strikes or flush hits since, versus ${last.pb} of ${last.nb} before. ${fix}`);
      // Overshoot: make "come back halfway" the main call
      const flipped = last.lineMoved && last.after && last.read && last.after !== last.read;
      if (flipped && out.status === 'move') {
        const [f0, a0] = last.from.split('/').map(Number), [f1, a1] = last.to.split('/').map(Number);
        const half = (x, y) => Number.isFinite(x) && Number.isFinite(y) ? Math.round((x + y) / 2) : '?';
        out.headline = `You went too far: the ball went from ${last.read === 'early' ? 'hooking early' : 'holding'} to ${last.after === 'early' ? 'hooking early' : 'holding'}. Come back about halfway, to ${half(f0, f1)}/${half(a0, a1)}.`;
        out.ballSuggestion = ''; out.element = '🎯 Direction'; out.moveKind = 'Aim';
        if (out.compass) { out.compass.badge = '🧭 Ball ✅ · Spot ❌ → Come back halfway'; }
      }
    }
    // Too many moves
    const recent = R.filter(r => r.i >= C.length - 5).length;
    if (recent >= 3) {
      notes.unshift(`🔁 ${recent} changes in your last 5 shots. Pick one line and let 2 good shots tell you what the lane is doing.`);
      if (out.status === 'watch') out.headline = `You've changed ${recent} times in your last 5 shots. Stay on this line for 2 good shots before changing anything.`;
    }
    out.notes.unshift(...notes);
    out.moves = R;
    return R;
  }
  function moveSummary(shots, bowler) {
    const prof = bowlerProfile(bowler);
    const C = (shots || []).filter(s => s && s.type !== 'gameStart' && !s.isFill).map(s => classify(s, prof.lefty));
    const R = moveReviews(C, prof);
    const cnt = (f) => R.filter(f).length;
    const res = { made: R.length, good: cnt(r => r.goodCall), afterPoor: cnt(r => r.afterPoor), tooSoon: cnt(r => r.tooSoon), whileStriking: cnt(r => r.whileStriking), wrongDir: cnt(r => r.wrongDir), worked: cnt(r => r.result === 'worked'), didnt: cnt(r => r.result === 'didnt') };
    const bits = [`${res.made} made`];
    if (res.made) bits.push(`${res.good} good call${res.good === 1 ? '' : 's'}`);
    if (res.worked) bits.push(`${res.worked} worked`);
    if (res.didnt) bits.push(`${res.didnt} didn't help`);
    if (res.afterPoor) bits.push(`${res.afterPoor} right after a poor shot`);
    if (res.tooSoon) bits.push(`${res.tooSoon} before 2 good shots`);
    if (res.whileStriking) bits.push(`${res.whileStriking} while striking`);
    if (res.wrongDir) bits.push(`${res.wrongDir} the wrong way`);
    res.text = res.made ? `🔁 Your moves: ${bits.join(' · ')}.` : '🔁 Your moves: none tonight.';
    res.tip = res.afterPoor ? 'Next time: repeat the shot after a missed mark before you move.'
      : res.tooSoon ? 'Next time: wait for 2 good shots that say the same thing before you move.'
      : res.wrongDir ? 'Next time: follow the miss. Hooking early, move in; holding, move out.'
      : res.didnt ? 'When a move doesn\'t help after 3 good shots, go back or move further, don\'t sit on it.'
      : res.made ? 'Good decisions tonight.' : '';
    return res;
  }

  // ---------- main ----------
  // 🛣️ One lane of the pair playing differently (needs 6+ good shots on each lane).
  function laneSplit(C) {
    const by = {};
    C.filter(c => c.execution !== 'poor' && c.shot && c.shot.lane).forEach(c => { const k = String(c.shot.lane); (by[k] = by[k] || []).push(c); });
    const ks = Object.keys(by);
    if (ks.length !== 2) return null;
    const st = ks.map(k => { const a = by[k]; const n = a.length; const x = a.filter(c => c.strike).length; const pk = a.filter(c => c.pocketHit).length; const early = a.filter(c => c.early || c.lean > 0).length; const long = a.filter(c => c.long || c.lean < 0).length; return { lane: k, n, x, rate: n ? x / n : 0, pk, early, long }; });
    if (st.some(t => t.n < 6)) return null;
    const [a, b] = st[0].rate <= st[1].rate ? st : [st[1], st[0]]; // a = tougher lane
    const gap = b.rate - a.rate;
    const earlyGap = a.early - b.early, longGap = a.long - b.long;
    if (gap < 0.2 && earlyGap < 2 && longGap < 2) return null;
    return { tough: a, good: b, gap, earlyGap, longGap };
  }
  function laneNotes(out, C, prof) {
    if ((out.notes || []).some(n => /^🛣️/.test(n))) return;
    const L = laneSplit(C);
    if (!L) return;
    const t = L.tough, g = L.good, pct = (v) => Math.round(v * 100) + '%';
    const why = L.earlyGap >= 2 ? `${t.early} of its good shots read early or high (vs ${g.early} on ${g.lane})` : L.longGap >= 2 ? `${t.long} of its good shots went long or light (vs ${g.long} on ${g.lane})` : `you're in the pocket ${t.pk} of ${t.n} times there but carrying less`;
    const fix = L.earlyGap >= 2 ? `a 1-board move ${(prof && prof.deeper) || 'left'} with feet and eyes on ${t.lane} only` : L.longGap >= 2 ? `a 1-board move ${(prof && prof.outside) || 'right'} with feet and eyes on ${t.lane} only` : `watching ${t.lane} closely before you move on both`;
    out.notes.push(`🛣️ Lane ${t.lane} is playing differently: ${pct(t.rate)} strikes on good shots vs ${pct(g.rate)} on ${g.lane}, and ${why}. If it keeps up, try ${fix}, and keep what's working on ${g.lane}.`);
    out.laneSplit = L;
  }
  // 🎯 Execution misses that keep going the same way are a throw pattern, not the lane.
  function missPatternNote(out, C) {
    const poor = C.slice(-15).filter(c => c.execution === 'poor' && c.missSide && !c.saved);
    if (poor.length < 3) return;
    const side = poor[poor.length - 1].missSide;
    const same = poor.filter(c => c.missSide === side).length;
    if (same < 3 || same < poor.length - 1) return;
    out.notes.push(`🎯 ${same} of your ${poor.length} missed marks went ${side}. That's a pattern in the throw, not the lane: before the next shot, check that your feet, target and finish line up${side === 'outside' ? ' and that you\'re not pushing the ball out' : ' and that you\'re not pulling it'}.`);
  }

  function evaluate(ctx) {
    const out = evaluateCore(ctx);
    try {
      const prof = bowlerProfile(ctx && ctx.bowler);
      const all = ((ctx && ctx.shots) || []).filter(s => s && s.type !== 'gameStart' && !s.isFill);
      const C = all.map(s => classify(s, prof.lefty));
      const W = C.filter(c => c.execution !== 'poor').slice(-5);
      if (C.length >= 3) sideNotes(out, C, W, prof, patternProfile(ctx && ctx.pattern));
      if (C.length >= 2) moveNotes(out, C, prof);
      laneNotes(out, C, prof);
      missPatternNote(out, C);
      // 🛣️ How the inside plays on this league (the bowler told us), when the ball is reading early.
      const wear = ctx && ctx.wear;
      if (wear && out.situation === 'early' && !(out.notes || []).some(n => /^🛣️ This league/.test(n))) {
        const dIn = (prof && prof.deeper) || 'left', dOut = (prof && prof.outside) || 'right';
        out.notes.push(wear === 'holds'
          ? `🛣️ This league: the ${dIn} stays oily and the friction is outside and down lane, so moving ${dIn} is usually safe here. The trap is staying too far ${dOut}.`
          : `🛣️ This league: the ${dIn} opens up (two-handers and high revs). Keep moves ${dIn} small; if a move ${dIn} still reads early, a straighter line or a cleaner ball beats going deeper.`);
      }
      // ⚡ Early warning: the first good shot that reads differently after good ones. Decide the move now.
      try {
        if (!['move', 'repeat', 'start'].includes(out.status) && W.length >= 3) {
          const last = W[W.length - 1], prev = W.slice(-3, -1);
          const prevOk = prev.every(c => c.strike || Math.abs(c.lean || 0) < 1);
          const dIn = prof.deeper || 'left', dOut = prof.outside || 'right';
          const small = wear === 'opens' ? ` Keep it small: the ${dIn} opens up on this league.` : wear === 'holds' ? ` The ${dIn} holds on this league, so this move is safe.` : '';
          if (prevOk && (last.lean || 0) >= 1) out.ready = { dir: 'early', text: `⚡ First sign the lane is changing: that one came in higher / read earlier than the two before it. If your next good shot does the same, make the move right away: feet 1 ${dIn}, eyes ½ ${dIn}.${small}` };
          else if (prevOk && (last.lean || 0) <= -1) out.ready = { dir: 'late', text: (ctx.traffic && ctx.traffic.carry >= 2)
            ? `⚡ First sign the lane is changing: that one held longer / came in lighter. With ${ctx.traffic.carry} urethane / plastic bowlers on the pair this is likely carrydown: if the next good shot does the same, try a stronger ball or a touch less speed before moving ${dOut}.`
            : `⚡ First sign the lane is changing: that one held longer / came in lighter than the two before it. If your next good shot does the same, make the move right away: feet 1 ${dOut}, eyes ½ ${dOut}.` };
        }
      } catch (_e) {}
      // 🔁 Between games: shots on your lane since you were last on it, what usually happens here, and the move to have ready.
      try {
        const gNext = Number(ctx && ctx.gameNow) || 0;
        const inThis = all.filter(s => Number(s.gameNo) === gNext).length;
        if (gNext >= 2 && inThis < 2) {
          const T = ctx.traffic, dIn = prof.deeper || 'left', dOut = prof.outside || 'right';
          const parts = [];
          if (T && T.gameGap) parts.push(`About ${T.gameGap} shots have gone down on this lane since you were last on it${T.sameSideShare != null && T.sameSide ? `, about ${Math.round(T.gameGap * T.sameSideShare)} of them reactive on your side (${T.sameSide} other ${T.sameSide === 1 ? 'bowler' : 'bowlers'}${T.twoHand ? `, ${T.twoHand} two-handed` : ''})` : ''}.`);
          if (T && T.carry >= 2) parts.push(`${T.carry} on the pair throw urethane or plastic: by now they've pushed oil down the lane, so expect a weaker back end.`);
          const hb = ctx.history && ctx.history.byGame;
          if (hb && hb[1] && hb[gNext]) { const d = Math.round(hb[gNext] - hb[1]); if (Math.abs(d) >= 4) parts.push(`Your game ${gNext} here averages ${Math.abs(d)} pins ${d < 0 ? 'below' : 'above'} game 1${d < 0 ? ': the lanes usually change on you' : ''}.`); }
          const pm = ctx.pastMoves && ctx.pastMoves[gNext];
          if (pm && pm.n >= 2) parts.push(`On your last ${pm.n} nights here you moved by frame ${pm.frame} of game ${gNext}${pm.dir ? `, usually ${pm.dir}` : ''}.`);
          const lastShot = all[all.length - 1];
          if (lastShot && lastShot.feet != null) parts.push(`You finished game ${gNext - 1} at slide ${lastShot.feet}, target ${lastShot.arrows}${lastShot.targetFt && lastShot.targetFt !== 15 ? ` (at ${lastShot.targetFt} ft)` : ''}.`);
          const keep = wear === 'opens' ? ` Keep it small: the ${dIn} opens up on this league.` : '';
          parts.push(`Move ready: if your first good shot reads early or comes in high, go feet 1 ${dIn}, eyes ½ ${dIn} right away.${keep} If it's light or holds, feet 1 ${dOut}, eyes ½ ${dOut}.`);
          out.heads = { game: gNext, text: `🔁 Game ${gNext}. ` + parts.join(' ') };
        }
      } catch (_e) {}
      // 📚 History: entering a game where you usually drop off at this house
      const hist = ctx && ctx.history;
      if (hist && hist.byGame && C.length) {
        const gNow = C[C.length - 1].gameNo || 1;
        const inGame = C.filter(c => c.gameNo === gNow).length;
        const g1 = hist.byGame[1], gN = hist.byGame[gNow];
        // 🔄 Entering game 2: what has worked for you here once the lanes start to change
        try { const t = hist.cond && hist.cond.transition; if (gNow === 2 && inGame <= 2 && t && t.balls && t.balls.length) out.notes.push(`🔄 Transition: in game 2${t.scope !== hist.cond.house ? ' (all houses)' : ' here'} your best have been ${t.balls.map(x => `${x.n} ${x.avg}`).join(', ')}. If it starts reading early, check alignment, then weigh a move against a ball that reads later through the front.`); } catch (_e) {}
        try { const t = hist.cond && hist.cond.late; if (gNow >= 3 && inGame <= 2 && t && t.balls && t.balls.length) out.notes.push(`🔥 Game 3${t.scope !== hist.cond.house ? ' (all houses)' : ' here'}: your best have been ${t.balls.map(x => `${x.n} ${x.avg}`).join(', ')}.`); } catch (_e) {}
        if (gNow >= 2 && inGame <= 2 && g1 != null && gN != null && gN - g1 <= -6) out.notes.unshift(`📚 History: at ${hist.house} your game ${gNow} averages ${Math.round(g1 - gN)} pins below game 1 (${gN} vs ${g1}). The lanes usually change here by now: watch the first good shots closely and don't wait to move.`);
      }
      // 📐 Alignment: is the line going through the exit point? Only speak up before any move,
      // or when the mark is being missed (then it may be alignment, not the throw).
      if (C.length >= 1 && out.status !== 'start' && out.tone !== 'good') {
        const pat2 = patternProfile(ctx && ctx.pattern);
        const lastL = [...C].reverse().find(c => c.feet != null && c.arrows != null);
        const moved = C.some((c, i) => i > 0 && (c.feet !== C[i - 1].feet || c.arrows !== C[i - 1].arrows));
        const phase = (moved || (lastL && lastL.gameNo > 1)) ? 'later' : 'start';
        const first = C.find(c => c.bp != null);
        const lm = lastL ? lineMath(lastL.feet, lastL.arrows, pat2, prof, phase, lastL.bp, first ? first.bp : null, lastL.targetFt) : null;
        if (lm && lm.status && lm.status !== 'on') {
          const recent = C.slice(-4);
          const markMiss = recent.filter(c => c.missSide && !c.saved).length;
          if (markMiss >= 2 && out.status === 'repeat') out.next = `${markMiss} misses at the mark, and your slide and target don't line up${lm.basis === 'rule31' ? ' through the exit point' : lm.basis === 'box' ? ' through your Baker Box' : ' with where the ball should leave the oil now'}. Try finishing your slide on ${lm.slide} for target ${lm.target} (lay down ${lm.laydown}) before changing anything else.`;
          if (markMiss >= 2) out.notes.unshift(`📐 Before blaming your throw: ${markMiss} of your last ${recent.length} missed the mark, and the line itself doesn't line up. ${lineText(lm).replace(/^📐 /, '')}`);
          else if (!moved) out.notes.push(lineText(lm));
        }
      }
      out.eyeball = eyeballScore(ctx && ctx.shots, ctx && ctx.bowler);
    } catch (_e) {}
    return out;
  }

  function evaluateCore(ctx) {
    ctx = ctx || {};
    const prof = bowlerProfile(ctx.bowler);
    const pat = patternProfile(ctx.pattern);
    const all = (ctx.shots || []).filter(s => s && s.type !== 'gameStart' && !s.isFill);
    const C = all.map(s => classify(s, prof.lefty));
    const res = { status: 'start', tone: 'info', headline: '', why: '', next: '', notes: [], ballSuggestion: '', read: '', profileLine: '', patternLine: '', compass: null };

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
      res.patternLine = `${pat.name}${b.length ? ' (' + b.join(', ') + ')' : ''}${pat.flat ? ', sport pattern: small misses matter' : pat.mid ? ', medium ratio: some room to miss' : pat.house ? ', house shot: room to miss' : ''}`;
    }

    // ---- Before there's enough to read: starting plan ----
    const trustedAll = C.filter(c => c.execution !== 'poor');
    if (C.length < 3) {
      res.status = 'start';
      // Same first ball as tonight's Game Plan when it's in the bag (history-based pick); else the motion pick.
      const planPick = ctx.plan && ctx.plan.firstBall && (ctx.setBalls || []).some(b => b.name === ctx.plan.firstBall) ? ctx.plan.firstBall : '';
      const sb = planPick || startingBall(ctx, prof, pat);
      // Short and specific: the Game Plan holds the detail and the reasons.
      const lines = [];
      if (planPick) lines.push(`🎳 Ball: ${planPick} (your Game Plan pick for ${ctx.plan.house || 'this house'}). Confirm it in practice.`);
      else if (sb) lines.push(`🎳 Ball: start with ${sb}.${ctx.plan && ctx.plan.firstBall && (ctx.setBalls || []).length ? ` (Your Game Plan pick, ${ctx.plan.firstBall}, isn't in tonight's bag.)` : ''}`);
      const lm0 = ctx.line ? lineMath(ctx.line.feet, ctx.line.arrows, pat, prof, 'start', ctx.line.bp, null, ctx.line.targetFt) : null;
      if (lm0 && lm0.basis === 'box') {
        const tgt = `${lm0.target}${lm0.tFt && lm0.tFt !== 15 ? ` at ${lm0.tFt} ft` : ''}`, bx = `your Baker Box (boards ${lm0.box.b1}–${lm0.box.b2} at ${Math.round(lm0.box.f1)}–${Math.round(lm0.box.f2)} ft${lm0.box.zone1 ? ', from 38 ft in Zone 1' : ''})`;
        if (lm0.status === 'on') lines.push(`📐 Line: slide ${lm0.yourSlide}, target ${tgt} goes through ${bx}: about board ${lm0.passesExact} at ${lm0.boxFt} ft.`);
        else if (lm0.status) lines.push(`📐 Line: from slide ${lm0.yourSlide}, target ${tgt} the ball is on about board ${lm0.passesExact} at ${lm0.boxFt} ft, ${lm0.gap} board${lm0.gap === 1 ? '' : 's'} ${lm0.status} ${bx}. ${Math.abs(lm0.slide - lm0.yourSlide) > 5 ? 'Try half the move and check again.' : `Try slide ${lm0.slide}, target ${tgt}.`}`);
      } else if (lm0 && lm0.basis === 'rule31') {
        if (lm0.status === 'on') lines.push(`📐 Line: slide ${lm0.yourSlide != null ? lm0.yourSlide : lm0.slide}, target ${lm0.target}${lm0.tFt && lm0.tFt !== 15 ? ` at ${lm0.tFt} ft` : ''} checks out (through the exit point, about board ${lm0.focal}).`);
        else if (lm0.status) {
          const tgt = `${lm0.target}${lm0.tFt && lm0.tFt !== 15 ? ` at ${lm0.tFt} ft` : ''}`;
          const big = Math.abs(lm0.slide - lm0.yourSlide) > 5;
          lines.push(`📐 Line: from slide ${lm0.yourSlide}, target ${tgt} the ball is ${lm0.gap} board${lm0.gap === 1 ? '' : 's'} ${lm0.status === 'inside' ? 'inside' : 'outside'} the exit point (about board ${lm0.focal}). ` + (big
            ? (lm0.status === 'outside'
              ? (lm0.rc === 'sport' ? `On a sport pattern there's little friction outside to bring it back: work toward slide ${lm0.slide} in 2-board moves and stay close to the exit point.`
                : lm0.rc === 'mid' ? `On a medium ratio there's some room outside, less than a house shot: move in 2 boards at a time toward slide ${lm0.slide} if it reads early or misses right.`
                : `On a house shot a few boards outside is common; if your breakpoint holds and the ball comes back, keep it. If it reads early, move in a little at a time.`)
              : `That's a lot of oil to turn in; move out a little at a time and watch for over/under.`)
            : `Try slide ${lm0.slide}, target ${tgt}.`));
        }
        else lines.push(`📐 Line: slide ${lm0.slide}, target ${lm0.target} heads through the exit point (about board ${lm0.focal}).`);
      } else if (pat && pat.length && exitBoardFor(pat) != null) lines.push(`📐 Line: aim to leave the oil around board ${exitBoardFor(pat)}, not inside it.`);
      if (!pat) lines.push('📐 Pick tonight\'s oil pattern so Coach can check your line.');
      const lean = ctx.plan ? Number(ctx.plan.lean) || 0 : 0;
      const wr = ctx.wear, dIn = prof.deeper || 'left';
      if (wr === 'holds') lines.push(`👀 Watch for: the outside and down lane drying. The ${dIn} stays oily on this league, so moving ${dIn} with feet and eyes is your first move.`);
      else if (wr === 'opens') lines.push(`👀 Watch for: the ${dIn} opening up as the night goes. Small moves (1 board, feet and eyes together); don't go deep into it.`);
      else if (lean === -1) lines.push('👀 Watch for: the ball reading early as the lane changes. Small moves (1 board, feet and eyes together) before a big move left.');
      else if (lean === 1) lines.push('👀 Watch for: the ball arriving weak (light hits, 10 pins). Small moves in, or a stronger ball, before a big change.');
      try {
        const sp = ((ctx.history && ctx.history.lines) || []).find(l => /Spare to practice/.test(l));
        const m = sp && sp.match(/Spare to practice: (?:the )?([^.]+)\. You've made (\d+%)/);
        const SP = ctx.spare || {};
        const how = SP.on && SP.name ? (SP.kind === 'plastic' ? ` Use your ${SP.name}: straight, flat release.` : ` Use your ${SP.name} with a flat release (no rotation): it still hooks a little, so give corner pins a board or two more angle than with plastic.`) : SP.asked && !SP.on && !SP.none ? ' No spare ball tonight: flatten your release (no rotation) and play straighter at corner pins.' : SP.none ? ' A plastic spare ball would make corner pins easier: flatten your release with your strike ball for now.' : '';
        if (m) lines.push(`🎯 Spare: the ${m[1]} (${m[2]} here).${how}`);
        else if (how) lines.push(`🎯 Spares:${how}`);
      } catch (_e) {}
      try { const T = ctx.traffic; if (T && T.carry >= 2) lines.push(`🛢️ ${T.carry} on the pair throw urethane or plastic${T.plastic ? ` (${T.plastic} plastic, usually down the middle)` : ''}. They push oil down the lane: as the night goes the back end gets weaker and the lane plays longer, sometimes with an early read in front. Before moving in, try a stronger solid ball, a touch less speed or more rotation. Tap Carrydown when you see it.`); } catch (_e) {}
      if (pat && pat.volumeClass === 'light') lines.push('🛢️ Light oil: watch for high hits by game 2.');
      if (pat && pat.volumeClass === 'heavy') lines.push('🛢️ Heavy oil: the lane changes slowly. Don\'t chase it early.');
      const bt = bagTiming(ctx, pat);
      if (prof.dom < -0.3 && bt.length < 2 && !planPick) lines.push('Speed-dominant: if the ball skids, favor your earlier-reading ball.');
      // Tonight's bag vs tonight's pattern (only when it matters)
      try {
        const bag = (ctx.setBalls || []).filter(b => b && b.row);
        if (pat && bag.length >= 2 && ctx.matrix) {
          const cells = bag.map(b => ctx.matrix(b.row));
          const info = (b) => ctx.ballInfo ? ctx.ballInfo(b.row) : {};
          const anySmooth = cells.some(c => c.shape === 'SMOOTH');
          const allStrong = cells.every(c => c.strength === 'STRONG');
          const anyStrong = cells.some(c => c.strength === 'STRONG') || bag.some(b => /solid/i.test(info(b).cover || '') && (Number(info(b).grit) || 4000) <= 3000);
          if (pat.flat && !anySmooth) lines.push('🩺 Heads-up: nothing in tonight\'s bag is smooth, and this pattern is flat. Small misses will be punished. Play straighter and favor your most controllable ball.');
          if ((pat.volumeClass === 'light' || pat.lengthClass === 'short') && allStrong) lines.push('🩺 Heads-up: everything in tonight\'s bag is strong for a light/short pattern. Expect early hook and start with your cleanest ball.');
          if ((pat.volumeClass === 'heavy' || pat.lengthClass === 'long') && !anyStrong) lines.push('🩺 Heads-up: nothing strong in tonight\'s bag for a long/heavy pattern. Expect the ball to skid. Slow down a touch and stay inside.');
        }
      } catch (_e) {}
      res.headline = C.length ? `Building your read: ${C.length}/3 shots` : 'Starting plan';
      res.why = lines.join('\n') || 'Log your first few shots: mark, pocket and leave matter most.';
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
      if (a && b && a.feet != null && b.feet != null && a.arrows != null && b.arrows != null && Math.abs((b.feet - a.feet) - (b.arrows - a.arrows)) >= 2) tried.add('Angle');
    }

    // Typical angle on the current line (from target / breakpoint / pocket board)
    const angles = W.map(c => c.angleClass).filter(Boolean);
    const angleClass = angles.length ? ['steep', 'direct', 'normal'].sort((a, b) => angles.filter(x => x === b).length - angles.filter(x => x === a).length)[0] : '';
    const recs = W.map(c => c.recovery).filter(v => v != null);
    const avgRec = recs.length ? Math.round(recs.reduce((a, b) => a + b, 0) / recs.length) : null;
    res.angleLine = avgRec != null ? `About ${avgRec} boards of recovery from breakpoint to pocket (${angleClass === 'direct' ? 'a direct, low-angle line' : angleClass === 'steep' ? 'a big swing, high-angle line' : 'a normal angle'}).` : '';

    // 🧭 Compass state for the current line
    const bag = bagTiming(ctx, pat);
    const curT = bag.find(b => b.name === ctx.currentBall) || null;
    const exitB = exitBoardFor(pat);
    const bpW = W.filter(c => c.bp != null).map(c => c.bp);
    const avgBpW = bpW.length ? bpW.reduce((a, b) => a + b, 0) / bpW.length : null;
    const inMud = exitB != null && avgBpW != null && bpW.length >= 2 && avgBpW >= exitB;
    const spotOkText = (exitB != null && avgBpW != null && !inMud) ? `breakpoint about board ${Math.round(avgBpW)}, outside the exit point (board ${exitB})` : '';
    const spotAnswer = inMud ? `Careful: your breakpoint (about board ${Math.round(avgBpW)}) is at or inside the exit point (board ${exitB}), in the mud.`
      : spotOkText ? `Yes (${spotOkText}).` : 'Not sure yet (no pattern or breakpoint).';
    const setCompass = (ball, spot, call, line) => {
      const mk = (v) => v === 'ok' ? '✅' : v === 'warn' ? '⚠️' : (v === 'off' || v === 'mud') ? '❌' : '❔';
      const CALL = { stay: 'Stay', spot: spot === 'mud' ? 'Get out of the mud first' : 'Move your feet, keep the ball', ball: 'Change the ball, keep your spot', repeat: 'Repeat your shot', watch: 'Keep watching', move: 'Make the move below', tweak: 'Keep ball & line, small delivery change' };
      const badge = (call === 'repeat') ? '🧭 Execution first → Repeat your shot'
        : `🧭 Ball ${mk(ball)} · Spot ${mk(spot)}${spot === 'mud' ? ' (mud)' : ''}${CALL[call] ? ' → ' + CALL[call] : ''}`;
      res.compass = { ball, spot, call, line, badge };
    };

    const decide = (sit, headline, why, lens) => {
      res.lens = lens || '';
      const ball = suggestBall(sit, ctx, prof);
      const step = (tried.has('Aim') && lastChange >= 0) ? 2 : 1;
      // 🧭 Which question is the answer: right ball or right spot?
      const laneSays = LANE_TIMING[sit] || '';
      const ballState = curT ? curT.rel : 'unknown';
      let favor = '';
      if (sit === 'mud') favor = 'spot';
      else if (sit === 'overunder' && ball) favor = 'ball';                 // spot is fine, shape isn't: smoother ball
      else if (laneSays && ballState === laneSays && ball) favor = 'ball';
      else if (laneSays && ballState !== 'unknown') favor = 'spot'; // ball fits, ball isn't the cause, or nothing in the bag fixes it
      const cur = ctx.currentBall || 'your ball';
      const est = curT && curT.lowConf ? ' (rough estimate: some ball specs are missing)' : '';
      if (sit === 'mud') {
        const ballAlso = laneSays && ballState === laneSays;
        setCompass(ballAlso ? 'warn' : (ballState === 'unknown' ? '?' : 'ok'), 'mud', 'spot',
          `🧭 Right spot? No: you're turning in the mud. Move first, then judge the ball.${ballAlso ? ` If it's still ${laneSays} after you're out of the mud, ${cur} is the next thing to change.` : ''}`);
      } else if (favor === 'ball' && sit !== 'overunder') {
        setCompass('off', inMud ? 'mud' : 'ok', 'ball', `🧭 Right ball? No. The lane says the ball is reading ${laneSays}, and ${cur} reads ${laneSays === 'early' ? 'earlier' : 'later'} than this pattern needs for you${est}. Right spot? ${spotAnswer} Change the ball${inMud ? ', then check your spot' : ', keep your spot'}.`);
      } else if (favor === 'spot') {
        const why = { early: 'the lane is hooking early where you\'re playing', late: 'the lane is holding where you\'re playing', carryWeak: 'on this line the ball is using up its energy before the pins', carryStrong: 'on this line the ball is getting to the pins with too much energy' }[sit];
        const ballQ = ballState === 'right' ? `Right ball? Yes: ${cur} fits this pattern for you${est}.`
          : ballState === laneSays ? `Right ball? Partly: ${cur} reads ${laneSays} for you${est}, but nothing in tonight's bag fixes that.`
          : `Right ball? It isn't the cause: ${cur} reads ${ballState} for you${est}, and the lane is making it act ${laneSays}.`;
        setCompass(ballState === laneSays ? 'warn' : 'ok', 'off', 'spot', `🧭 ${ballQ} Right spot? No: ${why}. Move your feet and target, keep the ball.`);
      } else if (sit === 'overunder') {
        setCompass(ball ? 'off' : '?', inMud ? 'mud' : spotOkText ? 'ok' : '?', ball ? 'ball' : 'spot', `🧭 Right spot? ${spotAnswer} ${ball ? `Right ball? No: the shape is the problem. You want something smoother and more predictable.` : 'The shape is the problem, but nothing in tonight\'s bag is smoother, so give yourself more room with a small move.'}`);
      } else {
        setCompass('?', '?', laneSays ? 'move' : '', laneSays ? `🧭 The ball is reading ${laneSays}. ${pat ? 'Coach can\'t tell yet if it\'s the ball or the spot.' : 'Pick tonight\'s pattern so Coach can tell if it\'s the ball or the spot.'}` : '');
      }
      const ranked = rankMoves(sit, prof, pat, !!ball, tried, angleClass, favor);
      const first = ranked[0], second = ranked[1];
      // Several ways to make the same fix (best first, from the lane + your LASER ratings): you pick, and tap what you did.
      res.options = ranked.slice(0, 3).map(m => ({ kind: m.kind, label: ELEMENT[m.kind], text: moveText(m.kind, sit, prof, pat, ball, step, angleClass) }));
      const firstText = first ? moveText(first.kind, sit, prof, pat, ball, step, angleClass) : '';
      const secondText = second ? moveText(second.kind, sit, prof, pat, ball, step, angleClass) : '';
      // In the pocket but not carrying: the line is fine, so the compass must not say "Spot ❌, move your feet"
      // unless the first move really is a line move.
      if ((sit === 'carryWeak' || sit === 'carryStrong') && first && res.compass) {
        const k = first.kind;
        const bm = res.compass.ball;
        if (k === 'Equipment') setCompass('warn', inMud ? 'mud' : 'ok', 'ball', `🧭 Right spot? Yes: you're in the pocket. Right ball? This is about energy at the pins, and a different ball is the cleanest fix. Keep your line.`);
        else if (k === 'Aim' || k === 'Angle') setCompass(bm === 'off' ? 'warn' : bm, 'warn', 'spot', `🧭 You're in the pocket, but the angle into it is costing carry. A small line change (feet and eyes together) is the first thing to try. Keep the ball.`);
        else setCompass(bm === 'off' ? 'warn' : bm, inMud ? 'mud' : 'ok', 'tweak', `🧭 Right spot? Yes: you're in the pocket. This is about how much energy the ball has left at the pins. Keep your ball and your line; make one small change in how you deliver it.`);
      }
      res.status = 'move'; res.tone = 'move';
      res.element = first ? ELEMENT[first.kind] : '';
      res.headline = `${headline} ${firstText}`;
      const ratingNote = !first ? '' : first.kind === 'Equipment' ? ' (Ball change: picked from tonight\'s bag.)'
        : first.kind === 'Angle' ? ` (Angle: ${res.angleLine.replace(/^About /, 'about ').replace(/\.$/, '')}. Aim rated ${first.rating}/5.)`
        : ` (${first.kind}: you rated yourself ${first.rating}/5.)`;
      res.why = why + ratingNote;
      res.next = secondText ? `If 2 more good shots say the same thing, next: ${ELEMENT[second.kind]}: ${secondText}` : '';
      if (!ball && (ctx.setBalls || []).length >= 2 && ['late', 'carryWeak', 'early', 'overunder', 'carryStrong'].includes(sit)) {
        res.notes.push(`Nothing else in tonight's bag gives ${NEED[sit].say} compared with ${ctx.currentBall || 'your current ball'}, so stick with line and speed moves.`);
      }
      res.ballSuggestion = (first && first.kind === 'Equipment') ? ball : '';
      res.moveKind = first ? first.kind : '';
      res.situation = sit;
      return res;
    };

    // ---- 1. Poor shot: don't move ----
    if (last.execution === 'poor' && last.speedCaused) {
      res.status = 'repeat'; res.tone = 'warn'; res.element = '⚡ Speed';
      res.headline = last.speed === 'faster'
        ? 'That one was faster than normal and went long. That\'s speed, not the lane. Don\'t move, just match your normal tempo.'
        : 'That one was slower than normal and hooked early. That\'s speed, not the lane. Don\'t move, just match your normal tempo.';
      const drift = C.slice(-5).filter(c => c.speed === last.speed).length;
      res.why = drift >= 3 ? `${drift} of your last 5 shots were ${last.speed} than normal. Your tempo is drifting.` : 'Coach is leaving this shot out of the lane read.';
      res.next = 'Same feet, same target, normal tempo on the next one.';
      setCompass('?', '?', 'repeat', '🧭 Execution first: a shot you didn\'t throw well can\'t tell you if it\'s the ball or the spot.');
      if (moveVerdict) res.notes.push(moveVerdict);
      return res;
    }
    if (last.execution === 'poor') {
      res.status = 'repeat'; res.tone = 'warn'; res.element = '🎯 Direction';
      res.headline = 'That was an execution miss. Don\'t move. Repeat your shot.';
      setCompass('?', '?', 'repeat', '🧭 Execution first: a shot you didn\'t throw well can\'t tell you if it\'s the ball or the spot.');
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
      setCompass('?', '?', 'watch', `🧭 You changed your ${/switched/.test(changeDesc) ? 'ball' : 'spot'}. Two good shots will tell you if it's right.`);
      return res;
    }

    // ---- 2. Utopia: room both ways ----
    if (outsideSaved && insideSaved) {
      res.status = 'utopia'; res.tone = 'good'; res.element = '🎯 Direction';
      res.headline = 'Wide window both ways. Stay right where you are.';
      res.why = `You missed outside and it recovered${outsideSaved.strike ? ' for a strike' : ' to the pocket'}, and missed inside and it held${insideSaved.strike ? ' for a strike' : ' in the pocket'}. That's the best look you can have.`;
      res.next = 'Don\'t change a thing until a good shot misses the pocket.';
      setCompass('ok', 'ok', 'stay', '🧭 Right ball, right spot. This is what you\'re looking for.');
      if (moveVerdict) res.notes.push(moveVerdict);
      return res;
    }

    // ---- 3. Striking: stay ----
    const s3 = W.slice(-3);
    const clean = (c) => c.strike && c.hit !== 'brooklyn'; // a Brooklyn strike is a high miss, not a reason to stay
    if (cnt(s3, clean) >= 2 || cnt(W, clean) >= 3) {
      res.status = 'stay'; res.tone = 'good'; res.element = '';
      res.headline = 'You\'re striking. Stay put.';
      res.why = `${cnt(W, clean)} pocket strikes in your last ${W.length} good shots on this line.`;
      const bk = W.slice(-3).filter(c => c.hit === 'brooklyn').length;
      setCompass('ok', 'ok', 'stay', '🧭 Right ball, right spot. Stay.');
      res.next = bk >= 2 ? 'Heads-up: those were Brooklyns. The lane is starting to hook early. Be ready to move deeper.' : 'Keep repeating. Coach will flag the first sign of change.';
      if (moveVerdict) res.notes.push(moveVerdict);
      return res;
    }

    // ---- 4a. Mud: over/under while the breakpoint is at/inside where the ball exits the pattern ----
    const ouSignals = cnt(W, c => c.overUnder);
    const mudShots = exitB != null ? W.filter(c => c.bp != null && c.bp >= exitB) : [];
    const isOU = (highs >= 2 && lights >= 2) || ouSignals >= 2;
    if (isOU && mudShots.length >= 2) {
      const avgBp = Math.round(mudShots.reduce((a, c) => a + c.bp, 0) / mudShots.length);
      return decide('mud', 'You\'re changing direction in the mud.', `Over/under (${highs} early, ${lights} long) and your breakpoint (about board ${avgBp}) is at or inside where the ball exits the pattern (about board ${exitB} on ${pat.length} ft). The ball is trying to plant and turn while it's still in the oil. Like a receiver cutting on a muddy field, it slips one shot and grabs the next.`, '🏈 Mud');
    }

    // ---- 4. Over/under ----
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
    const pocket3 = W.filter(c => c.pocketHit).slice(-3);
    const weakFinish = cnt(pocket3, c => c.finish === 'weak');
    const strongFinish = cnt(pocket3, c => c.finish === 'strong');
    const finishProblem = pocket3.length >= 2 && cnt(pocket3, c => c.strike) === 0 && (weakFinish >= 2 || strongFinish >= 2);
    if ((cnt(recentPocket, c => c.pocketHit) >= 3 && cnt(recentPocket, c => c.strike) <= 1) || finishProblem) {
      // What the bowler SAW (exit / key pin) beats what the leave alone suggests.
      const carryType = (c) => c.finish === 'weak' || c.finish === 'strong' ? c.finish
        : (c.shot.leaveTag === 'Flat 10' || c.meaning === 'weak') ? 'weak'
        : (c.shot.leaveTag === 'Ringing 10' || c.meaning === 'high') ? 'strong' : '';
      const weak = carryFails.filter(c => carryType(c) === 'weak').length;
      const strong = carryFails.filter(c => carryType(c) === 'strong').length;
      const sit = strong > weak ? 'carryStrong' : 'carryWeak';
      const lastT = W[W.length - 1];
      const agree = Math.max(weak, strong) >= 2 && Math.max(weak, strong) > Math.min(weak, strong);
      // A strike on the last good shot, or leaves that point both ways, is not a reason to change speed.
      if ((lastT && lastT.strike) || !agree) {
        res.status = 'watch'; res.tone = 'info'; res.lens = '🌀 Energy';
        res.headline = lastT && lastT.strike ? 'Strike. Keep repeating; no speed change yet.' : (weak && strong) ? 'In the pocket, but the leaves point both ways. Repeat before changing anything.' : 'In the pocket, not carrying yet. Repeat before changing anything.';
        res.why = `${cnt(recentPocket, c => c.pocketHit)} of your last ${recentPocket.length} good shots hit the pocket (${carryFails.slice(-3).map(c => c.shot.leaveTag || pinsText(c.shot)).filter(Boolean).join(', ') || 'no carry'}). ${lastT && lastT.strike ? 'The last one carried, so the energy is there.' : !agree ? ((weak && strong) ? `Weak signs ${weak}, strong signs ${strong}: they don't agree.` : 'One leave isn\'t enough to tell weak from strong.') : ''}`;
        res.next = 'Coach calls an energy change when 2 more good pocket shots leave the same kind of pin.';
        setCompass('ok', inMud ? 'mud' : 'ok', 'watch', '🧭 Right ball, right spot so far. Watch how the 10 pin (or 7 pin) goes down.');
        if (moveVerdict) res.notes.push(moveVerdict);
        return res;
      }
      const leaves = carryFails.slice(-3).map(c => c.shot.leaveTag || pinsText(c.shot)).filter(Boolean);
      const eyes = [];
      const wE = carryFails.filter(c => c.exitRead === 'weak').length, sE = carryFails.filter(c => c.exitRead === 'strong').length;
      const wK = carryFails.filter(c => c.keyPin === 'weak').length, sK = carryFails.filter(c => c.keyPin === 'wrap' || c.keyPin === 'kickback').length;
      const kp = prof.lefty ? '4-pin' : '6-pin';
      if (wE) eyes.push(`ball deflected off the deck ${wE}×`);
      if (sE) eyes.push(`ball drove through too hard ${sE}×`);
      if (wK) eyes.push(`${kp} laid down weak ${wK}×`);
      if (sK) eyes.push(`${kp} hit the kickback / wrapped ${sK}×`);
      const head = sit === 'carryWeak' ? 'The ball is running out of energy before the pins (rolling out).' : 'The ball is arriving with too much energy (still turning hard at the pins).';
      return decide(sit, head, `In the pocket with ${leaves.join(', ') || 'leaves'}${eyes.length ? ' (' + eyes.join(', ') + ')' : ''}. Your line is fine: this is about how much axis rotation the ball has left when it gets to the pins.`, '🌀 Energy');
    }

    // ---- 8. One-sided room ----
    if (outsideSaved || insideSaved) {
      res.status = 'stay'; res.tone = 'good';
      res.headline = outsideSaved ? 'You have room outside. Stay.' : 'You have room inside. Stay.';
      res.why = outsideSaved ? 'A miss outside still recovered to the pocket, so there\'s friction out there to help you.' : 'A miss inside still held to the pocket, so there\'s oil in there to help you.';
      res.next = 'Keep playing this line. Coach will tell you when that room disappears.';
      setCompass('ok', 'ok', 'stay', `🧭 Right ball, right spot. You have room ${outsideSaved ? 'outside' : 'inside'}.`);
      if (moveVerdict) res.notes.push(moveVerdict);
      return res;
    }

    // ---- 9. Not enough to call ----
    res.status = 'watch'; res.tone = 'info';
    res.headline = 'No clear pattern yet. Stay and keep tracking.';
    const unknowns = cnt(W, c => c.execution === 'unknown');
    res.why = `${pockets} of your last ${W.length} ${unknowns >= Math.ceil(W.length / 2) ? '' : 'good '}shots hit the pocket.` + (unknowns >= 3 ? ' Tip: tapping your mark (Hit my mark / held / recovered) helps Coach trust the read.' : '');
    res.next = 'Coach will call a move when 2 good shots in a row tell the same story.';
    {
      const provenTonight = curT && curT.rel !== 'right' && W.length >= 2 && pockets >= Math.ceil(W.length * 0.75) && cnt(W, c => c.strike) >= 1;
      const b = curT ? (provenTonight ? `${ctx.currentBall} is hitting the pocket tonight (on paper it ${REL_WORD[curT.rel]}; your shots win)` : `${ctx.currentBall} ${REL_WORD[curT.rel]} for you on this pattern${curT.lowConf ? ' (rough estimate)' : ''}`) : '';
      const sp = inMud ? `your breakpoint (about board ${Math.round(avgBpW)}) is at or inside the exit point (board ${exitB}), so watch for over/under` : spotOkText ? `${spotOkText}` : '';
      if (b || sp) setCompass(curT ? ((curT.rel === 'right' || provenTonight) ? 'ok' : 'warn') : '?', inMud ? 'mud' : sp ? 'ok' : '?', 'watch', `🧭 ${[b && 'Ball: ' + b, sp && 'Spot: ' + sp].filter(Boolean).join('. ')}.`);
    }
    if (moveVerdict) res.notes.push(moveVerdict);
    return res;
  }

  // ---------- 🤔 Poor-shot reasons: your read of a poor shot, checked against what the ball did ----------
  // Known signatures (Bowling This Month): a sticking thumb lofts the ball and usually misses inside;
  // chicken winging veers the swing and usually pulls the follow-through. The rest are learned from your own tags.
  const FAULTS = [
    { v: 'thumb', l: 'Thumb stuck / hung' }, { v: 'chicken', l: 'Chicken wing / came around it' }, { v: 'dropped', l: 'Dropped it' },
    { v: 'squeezed', l: 'Squeezed / muscled it' }, { v: 'pulled', l: 'Pulled it' }, { v: 'pushed', l: 'Pushed it' },
    { v: 'early', l: 'Timing early' }, { v: 'late', l: 'Timing late' },
    { v: 'balance', l: 'Fell off the shot' }, { v: 'well', l: 'Released it well' }, { v: 'unsure', l: 'Not sure' },
  ];
  // Physical feelings only: where the ball went (missed the mark) is already logged under Your mark.
  // Your own reasons are saved as 'my:<text>' and learned like the others.
  const faultLabel = (v) => /^my:/.test(String(v || '')) ? String(v).slice(3) : (FAULTS.find(f => f.v === v) || {}).l || ({ target: 'Missed my target' }[v]) || v;
  const MY_FAULTS_KEY = 'bt_my_faults_v1';
  const myFaults = () => { try { const a = JSON.parse(localStorage.getItem(MY_FAULTS_KEY) || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string' && x.trim()) : []; } catch (_e) { return []; } };
  const setMyFaults = (a) => { try { localStorage.setItem(MY_FAULTS_KEY, JSON.stringify([...new Set(a.map(x => String(x).trim()).filter(Boolean))].slice(0, 20))); } catch (_e) {} };
  // Built-in list (Not sure last) with your own reasons before Not sure.
  const allFaults = () => { const base = FAULTS.filter(f => f.v !== 'unsure'); return [...base, ...myFaults().map(t => ({ v: 'my:' + t, l: t, mine: true })), FAULTS.find(f => f.v === 'unsure')]; };
  // s: a logged shot; lefty: boolean. Returns { fit: 'fits'|'off'|'learn'|'na', side, room, text }.
  function faultRead(s, lefty) {
    if (!s || !s.fault) return null;
    const m = String(s.miss || 'didntTrack'), pk = String(s.pocket || ''), obs = Array.isArray(s.obs) ? s.obs : [];
    const IN = lefty ? 'right' : 'left';
    const side = /^left/.test(m) ? (IN === 'left' ? 'in' : 'out') : /^right/.test(m) ? (IN === 'right' ? 'in' : 'out') : m === 'noMiss' ? 'hit' : '';
    const room = m === 'leftHeld' || m === 'rightRecovered' ? 'room' : m === 'leftMiss' || m === 'rightMiss' ? 'tight' : m === 'noMiss' ? 'hit' : '';
    const sp = String(s.speedTrend || ''), fast = sp === 'faster', slow = sp === 'slower';
    const dirTxt = side === 'in' ? `missed ${IN} (inside)` : side === 'out' ? `missed ${IN === 'left' ? 'right' : 'left'} (outside)` : side === 'hit' ? 'hit your mark' : '';
    let fit = 'na';
    switch (s.fault) {
      case 'thumb': case 'pulled': fit = side === 'in' ? 'fits' : side === 'out' ? 'off' : 'na'; break;
      case 'chicken': fit = side === 'in' || pk === 'Pocket light' ? 'fits' : side === 'out' ? 'off' : 'na'; break;
      case 'pushed': fit = side === 'out' ? 'fits' : side === 'in' ? 'off' : 'na'; break;
      case 'target': fit = side === 'in' || side === 'out' ? 'fits' : side === 'hit' ? 'off' : 'na'; break;
      case 'squeezed': fit = fast || obs.includes('Too early') || pk === 'Pocket high' ? 'fits' : 'learn'; break;
      case 'dropped': case 'early': case 'late': case 'balance': fit = 'learn'; break;
      default: fit = /^my:/.test(String(s.fault)) ? 'learn' : 'na';
    }
    // Coach's call: change the bowler or the line?
    let call = '';
    if (s.fault === 'well') call = side === 'in' || side === 'out' ? `You released it well but ${dirTxt}: that's launch angle or alignment, not the release. Check your slide and target (📐 Angles page).` : side === 'hit' ? 'Good release and you hit your mark: the reaction is the lane or the ball, so read it like a good shot.' : '';
    else if (room === 'room') call = `It ${m === 'leftHeld' ? 'held' : 'recovered'} anyway, so your line has room: fix the release, don't move.`;
    else if (room === 'tight') call = 'It didn\'t come back. Don\'t move off one bad shot; if it keeps happening, find a line with more room.';
    const spd = (fast || slow) && s.fault !== 'squeezed' ? ` It was also ${fast ? 'faster' : 'slower'} than normal, which adds to the miss.` : '';
    const why = s.fault === 'squeezed' ? [fast && 'it was faster than normal', obs.includes('Too early') && 'it read early', pk === 'Pocket high' && 'it hit high'].filter(Boolean).join(' and ') : s.fault === 'chicken' && side !== 'in' && pk === 'Pocket light' ? 'it hit light' : dirTxt;
    const fitTxt = fit === 'fits' ? ` That fits: ${why || 'it reacted that way'}.` : fit === 'off' ? ` That doesn't match: it ${dirTxt}. Check alignment too.` : '';
    return { fault: s.fault, label: faultLabel(s.fault), fit, side, room, fast, slow, text: `${faultLabel(s.fault)}.${fitTxt}${spd} ${call}`.trim() };
  }
  // Across shots: counts per reason, how often your read fit, the miss pattern per reason, and how often misses held / recovered.
  function faultSummary(shots, lefty) {
    const R = (shots || []).filter(s => s && s.type !== 'gameStart' && s.fault).map(s => ({ s, r: faultRead(s, lefty) })).filter(x => x.r);
    const by = {};
    R.forEach(({ r }) => { const b = by[r.fault] = by[r.fault] || { fault: r.fault, label: r.label, n: 0, fits: 0, off: 0, in: 0, out: 0, hit: 0, room: 0, tight: 0, fast: 0, slow: 0 };
      b.n++; if (r.fit === 'fits') b.fits++; if (r.fit === 'off') b.off++; if (r.side) b[r.side]++; if (r.room === 'room') b.room++; if (r.room === 'tight') b.tight++; if (r.fast) b.fast++; if (r.slow) b.slow++; });
    const rows = Object.values(by).sort((a, b) => b.n - a.n);
    const misses = R.filter(x => x.r.room === 'room' || x.r.room === 'tight');
    return { n: R.length, rows, room: misses.filter(x => x.r.room === 'room').length, tight: misses.filter(x => x.r.room === 'tight').length, speedOff: R.filter(x => x.r.fast || x.r.slow).length };
  }
  // One line per reason, plain words. min: tags needed before a learned pattern is reported.
  function faultLines(sum, lefty, min) {
    min = min || 5; const IN = lefty ? 'right' : 'left', OUT = lefty ? 'left' : 'right';
    return sum.rows.filter(b => b.fault !== 'unsure').map(b => {
      const checked = b.fits + b.off;
      if (b.fault === 'well') return `<b>${b.label}</b> ×${b.n}: ${b.in + b.out ? `${b.in + b.out} still missed the mark (alignment or launch angle, not the release)` : 'all hit the mark (those were lane reads)'}.`;
      if (checked >= 2) return `<b>${b.label}</b> ×${b.n}: your read fit ${b.fits} of ${checked}${b.off ? ` (${b.off} went the other way: check alignment)` : ''}.`;
      if (b.n >= min && b.in + b.out >= 3) { const dir = b.in > b.out * 1.5 ? `you usually miss ${IN}` : b.out > b.in * 1.5 ? `you usually miss ${OUT}` : 'your misses go both ways'; return `<b>${b.label}</b> ×${b.n}: ${dir}.`; }
      return `<b>${b.label}</b> ×${b.n}${b.n < min ? ` (not enough yet: ${checked === 1 ? (b.fits ? 'the one so far fit' : "the one so far didn't fit") : `${min}+ tags to see your pattern`})` : ''}.`;
    });
  }

  root.BTCoach = { FAULTS, allFaults, myFaults, setMyFaults, faultLabel, faultRead, faultSummary, faultLines, moveSummary, lineCheck: (o) => lineMath(o.feet, o.arrows, patternProfile(o.pattern), bowlerProfile(o.bowler), o.phase, o.bp, o.bp0, o.targetFt), lineText, evaluate, eyeballScore, elementsProfile, elementsReport, arsenalCheck, ballGames, _internals: { timingNeed, bagTiming, classify, leaveMeaning, bowlerProfile, patternProfile, rankMoves, parseRatio } };
})(typeof window !== 'undefined' ? window : globalThis);
