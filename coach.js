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
  // ---------- 📝 Your shot notes, read as reads ----------
  // "6 pin tapped the 10 at the last second" = a strike on the weak side (the 6-pin laying down is a weak hit; wrapping
  // around the 10 is a solid one). A messenger = strong entry: the ball drove the head pin off the side wall into the corner, so it still had energy (ball strength + lane condition). "hooked early", "went long",
  // "over/under", "carrydown", "lanes hooking more / drying up / tightening" become the same reads as the buttons.
  // Lefties: the key pin is the 4 and the corner the 7, so "4 tapped the 7" reads the same way.
  function noteTags(text, lefty) {
    const t = ' ' + String(text || '').toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ') + ' ';
    if (!t.trim()) return null;
    const K = lefty ? '(4|four)' : '(6|six)', C = lefty ? '(7|seven)' : '(10|ten)';
    const out = { tags: [], obs: [] };
    const has = (re) => re.test(t);
    if (has(/messenger/)) { out.strike = 'messenger'; out.tags.push('messenger (strong entry)'); }
    if (has(new RegExp(`${K}[ -]?(pin)?[^.]{0,30}(tap|tapped|barely|just got|late|last second|slow|trickl|lazy|soft|nudg|tipped)[^.]{0,25}${C}`)) || has(new RegExp(`${C}[ -]?(pin)?[^.]{0,12}(fell|went|dropped) (late|last|slow)`)) || has(/weak strike|lucky strike|cheap strike|soft strike/)) { if (!out.strike) out.strike = 'weak'; out.tags.push(out.strike === 'lucky' ? 'lucky strike' : `strike on the weak side (${lefty ? '4' : '6'}-pin barely got the ${lefty ? '7' : '10'})`); }
    if (has(/wrap|ringing|rang the|ring the/) || has(new RegExp(`${K}[ -]?(pin)?[^.]{0,20}(wrapped|around)`))) { out.keyPin = 'wrap'; out.tags.push('key pin wrapped (strong)'); }
    else if (has(/kick ?back/)) { out.keyPin = 'kickback'; out.tags.push('key pin hit the kickback'); }
    else if (has(new RegExp(`${K}[ -]?(pin)?[^.]{0,15}(laid|lay|layed|fell|went) (down|flat)`)) || has(/flat (10|ten|7|seven)|weak (10|ten|7|seven)/)) { out.keyPin = 'weak'; out.tags.push('key pin laid down (weak)'); }
    if (has(/hooked early|read early|early hook|burn(ed|t)? up|rolled out|hit early|too early/)) { out.obs.push('Too early'); out.tags.push('hooked early'); }
    if (has(/went long|too long|skid(ded)?|didnt hook|did not hook|never hooked|held (the )?line|missed the break|slid through/)) { out.obs.push('Too long'); out.tags.push('went long'); }
    if (has(/over ?\/? ?under|over and under/)) { out.obs.push('Over/under'); out.tags.push('over/under'); }
    if (has(/carry ?down/)) { out.obs.push('Carrydown'); out.tags.push('carrydown'); }
    if (has(/deflect/)) { out.finish = 'weak'; out.tags.push('deflected'); }
    if (has(/drove through|strong hit|hit hard|powered through/)) { out.finish = out.finish || 'strong'; out.tags.push('drove through'); }
    if (has(/lanes? (are |is )?(hooking more|drying|dry|burn|breaking down|opening)|more hook|friction/)) { out.laneRead = 'more'; out.tags.push('lanes hooking more'); }
    else if (has(/lanes? (are |is )?(hooking less|tight|tightening|oily|holding)|less hook|carry ?down/)) { if (!out.obs.includes('Carrydown')) { out.laneRead = 'less'; out.tags.push('lanes hooking less'); } }
    if (out.strike === 'messenger' && !out.finish) out.finish = 'good';
    // What the note says about energy at the pins: strong entry, weak (short on energy), hot (too much, wrapping)
    out.energy = out.finish === 'weak' || out.strike === 'weak' || out.keyPin === 'weak' ? 'weak' : out.keyPin === 'wrap' ? 'hot' : out.strike === 'messenger' || out.finish === 'strong' ? 'strong' : '';
    return out.tags.length ? out : null;
  }
  // 📝 Notes tally for a set of shots (e.g. one ball + one line): what your notes keep saying about energy at the pins.
  function noteMix(shots, lefty) {
    const m = { n: 0, strong: 0, weak: 0, hot: 0, messenger: 0, x: 0 };
    (shots || []).forEach(x => { if (!x || x.type === 'gameStart') return; let t = null; try { t = noteTags(x.notes, lefty); } catch (_e) {} if (!t || !t.energy) return; m.n++; m[t.energy]++; if (t.strike === 'messenger') m.messenger++; if (isStrikeShot(x)) m.x++; });
    if (m.n < 2) return null;
    const say = [m.messenger ? `${m.messenger} messenger${m.messenger === 1 ? '' : 's'}` : '', m.strong - m.messenger > 0 ? `${m.strong - m.messenger} drove through` : '', m.weak ? `${m.weak} weak-side` : '', m.hot ? `${m.hot} wrapped/ringing` : ''].filter(Boolean).join(', ');
    m.say = say;
    m.read = m.strong >= 2 && m.weak + m.hot <= Math.floor(m.strong / 2) ? 'strong' : m.weak >= 2 && m.weak > m.strong ? 'weak' : m.hot >= 2 && m.hot > m.strong ? 'hot' : 'mixed';
    m.text = m.read === 'strong' ? `Strong entry: the ball is getting to the pins with energy. That's what right ball, right spot looks like.`
      : m.read === 'weak' ? `The ball is getting to the pocket short on energy (the ${lefty ? '4' : '6'} is laying down). Look for more energy at the pins: a stronger ball, or a line that lets this one finish.`
      : m.read === 'hot' ? `The ball is hitting with too much energy (the ${lefty ? '4' : '6'} is wrapping). Look for a smoother ball or a little less angle.`
      : 'Your notes are split, so they don\'t point either way yet.';
    return m;
  }
  function classify(s, lefty) {
    // Your notes add reads you didn't tap (the buttons you tapped always win).
    const NT = noteTags(s && s.notes, lefty);
    if (NT) s = Object.assign({}, s, { obs: [...new Set([...(Array.isArray(s.obs) ? s.obs : []), ...NT.obs])], keyPin: s.keyPin || NT.keyPin || '' });
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
    if (strike && NT && NT.strike === 'weak') lean = -0.5; // …unless your note says it only just carried (weak side)
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
    if (NT && NT.finish && !finish) finish = NT.finish;
    if (strike && NT && NT.strike === 'weak' && finish !== 'strong') finish = 'weak';

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
      laneInfo: s.laneInfo === true, // a poor shot you said still told you about the lane: used for lane reads
      noteTags: NT, messenger: !!(NT && NT.strike === 'messenger'),
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
    const out = {
      name: p.name || '', length, volume, ratio,
      lengthClass: length == null ? null : length <= 37 ? 'short' : length >= 43 ? 'long' : 'medium',
      volumeClass: volume == null ? null : volume <= 21 ? 'light' : volume >= 26 ? 'heavy' : 'medium',
      flat: ratio != null && ratio <= 3,       // USBC sport condition (3:1 or less): small miss room
      mid: ratio != null && ratio > 3 && ratio < 7, // challenge / medium ratio: some room, less than a house shot
      house: ratio != null && ratio >= 7,      // typical house shot: forgiving
      box: (p.box && !p.box.off && p.box.b1 != null) ? p.box : null, // 📦 Baker Box, decided by BT.boxFor
      r31: p.r31 !== false, // 📏 Rule of 31 checkbox (off = no exit-point advice)
      est: /unknown|guess|estimat/i.test(String(p.name || '')), // length is your estimate, not a posted pattern
    };
    // A saved pattern straight from the Oil page (Scores, Trends): use your Baker Box and Rule of 31 settings, as Game Day does.
    if (p.box === undefined && root.BT && root.BT.boxFor) { try { const b = root.BT.boxFor(length, ratio, {}); out.box = !b.off && b.b1 != null ? b : null; } catch (_e) {} }
    if (p.r31 === undefined && root.BT && root.BT.rule31Pref) { try { out.r31 = (ratio != null && ratio <= 3) || root.BT.rule31Pref(); } catch (_e) {} }
    return out;
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
    if (r && pat && pat.est) r.est = true;
    return r;
  }
  function lineText(r) { const t = lineText0(r); return t && r && r.est && r.basis !== 'box' ? `${t} (Your pattern length is an estimate: a guide, not proof the line is wrong.)` : t; }
  function lineText0(r) {
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
    if (kind === 'Equipment') return ball ? `Switch to ${ball} for ${NEED[sit].say}.${lastBallWhy ? ' ' + lastBallWhy : ''}` : '';
    if (sit === 'mud' && kind === 'Release') return 'Take a little side roll off for a smoother, more forward-roll shape that won\'t try to plant in the mud.';
    if (kind === 'Speed') {
      if (sit === 'early') return 'Add a touch of speed (about ½ mph) so the ball gets down the lane before it reads.';
      if (sit === 'carryWeak') return 'Add a touch of speed (about ½ mph) so the ball spends less time in friction and arrives with rotation left.';
      if (sit === 'carryStrong') return 'Take a touch of speed off (about ½ mph) so the ball uses some of its rotation before the pins.';
      if (sit === 'late') return 'Take a touch of speed off (about ½ mph) so the ball reads sooner and finishes.';
      return 'Keep your speed steady and repeatable while the lane settles.';
    }
    if (kind === 'Loft') {
      // More loft = less time in the dry front: saves energy (early read, slow burn). Less loft = an earlier read (going long, arriving too strong).
      if (sit === 'early' || sit === 'carryWeak' || sit === 'slowBurn') return 'Add a little loft (set it down a few inches further) to get past the dry front and save energy for the pins.';
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
  function coverFit(sit, row, ctx, curRow) {
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
    }
    // Cover strength (1–10): don't go to a stronger cover when the ball needs to get through the front cleaner,
    // or to a weaker one when it needs to read sooner.
    if (curRow) {
      const cur = ctx.ballInfo(curRow) || {}, sa = Number(cur.strength), sb = Number(info.strength);
      if (Number.isFinite(sa) && Number.isFinite(sb)) {
        if ((sit === 'early' || sit === 'carryWeak' || sit === 'mud') && sb >= sa + 2) p += 0.08;
        if ((sit === 'late' || sit === 'carryStrong') && sb <= sa - 2) p += 0.08;
      }
    } else if (sit === 'mud') {       // smooth, predictable: sanded symmetric, not shiny asym
      if (polished && pearl) p += 0.08; if (asym) p += 0.04; if (!asym && !polished) p -= 0.05;
    }
    return p;
  }

  // Why this ball: say which lever the change pulls. Cover and surface first (the biggest factors in the
  // USBC Ball Motion Study), then core/layout as the smaller change.
  let lastBallWhy = '';
  function ballWhy(ctx, curRow, sugRow) {
    try {
      if (!ctx.ballInfo) return '';
      const a = ctx.ballInfo(curRow) || {}, b = ctx.ballInfo(sugRow) || {};
      const kind = (c) => { c = String(c || '').toLowerCase(); return c.includes('solid') ? 'solid' : c.includes('hybrid') ? 'hybrid' : c.includes('pearl') ? 'pearl' : c.includes('urethane') ? 'urethane' : ''; };
      const ka = kind(a.cover), kb = kind(b.cover), ga = Number(a.grit) || 4000, gb = Number(b.grit) || 4000;
      const surf = (g) => g >= 4500 ? 'polished' : `${g} grit`;
      const parts = [], sa = Number(a.strength), sb = Number(b.strength);
      if (Number.isFinite(sa) && Number.isFinite(sb) && Math.abs(sb - sa) >= 2) parts.push(`${sb > sa ? 'stronger' : 'cleaner'} cover (${b.coverName || kb || 'cover'} ${sb}/10 vs ${a.coverName || ka || 'cover'} ${sa}/10)`);
      else if (ka && kb && ka !== kb) parts.push(`${kb} cover vs ${ka}`);
      if (Math.abs(ga - gb) >= 1000) parts.push(`${surf(gb)} vs ${surf(ga)}`);
      if (parts.length) return `Why: ${parts.join(', ')}. Cover and surface drive most of the read.`;
      return 'Why: same kind of cover and surface, so the difference is the core and layout. Expect a smaller change.';
    } catch (_e) { return ''; }
  }

  // Strike-ball choices never include a spare ball (plastic / marked spare / only ever thrown at spares).
  const strikeBag = (ctx) => (ctx.setBalls || []).filter(b => { if (!b || !b.row) return false; try { return !(typeof BT !== 'undefined' && BT.isSpareBall && BT.isSpareBall(b.row)); } catch (_e) { return true; } });
  function suggestBall(sit, ctx, prof) {
    try {
      const m = ctx.motion;
      const balls = strikeBag(ctx).concat((ctx.setBalls || []).filter(b => b && b.row && b.name === ctx.currentBall && !strikeBag(ctx).includes(b)));
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
        const fit = coverFit(sit, b.row, ctx, cur.row);
        if (fit >= 0.15) continue;            // clearly the wrong kind of ball for this problem
        const sc = d + fit;
        if (!best || sc < best.d) best = { name: b.name, d: sc, row: b.row };
      }
      if (best && best.d <= 0.30) { lastBallWhy = ballWhy(ctx, cur.row, best.row); return best.name; }
      return '';
    } catch (_e) { return ''; }
  }

  function startingBall(ctx, prof, pat) {
    try {
      const m = ctx.motion;
      const balls = strikeBag(ctx);
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
      return strikeBag(ctx).map(b => {
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
    const trusted = C.filter(c => (c.execution !== 'poor' || c.laneInfo));
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
    const exitSeen = pocketShots.filter(c => c.exitRaw !== "Didn't notice").length; // an honest "Didn't see" counts as answered
    if (last && last.pocketHit && last.exitRaw === "Didn't notice" && pocketShots.length >= 2 && exitSeen / pocketShots.length < 0.8) {
      res.notes.unshift(`👀 Off the deck: ${exitSeen} of ${pocketShots.length} pocket hits watched tonight. Full routine every shot: mark → breakpoint → pocket → watch it leave the deck and what the ${kp} does.`);
    }
    return res;
  }

  // Eyeball score: how much of what matters you actually watched (0–100).
  function eyeballScore(shots, bowler) {
    const prof = bowlerProfile(bowler);
    const C = (shots || []).filter(s => s && s.type !== 'gameStart').map(s => classify(s, prof.lefty));
    if (!C.length) return { score: 0, label: '—', parts: {}, n: 0 };
    const pct = (a, b) => b ? a / b : null;
    const mark = pct(C.filter(c => String(c.shot.miss || 'didntTrack') !== 'didntTrack').length, C.length);
    const pocket = pct(C.filter(c => String(c.shot.pocket || 'Unknown') !== 'Unknown' || c.strike).length, C.length);
    const ph = C.filter(c => (root.BT && root.BT.isPocketHit) ? root.BT.isPocketHit(c.shot) : c.pocketHit); // same pocket count as the rest of the report
    // Off the deck: watched = full credit; an honest "Didn't see" = 0.6 (better than a guess); blank = 0.
    const seenX = (c) => /^Exit /.test(c.exitRaw), notSeen = ph.filter(c => c.exitRaw === 'Not seen').length;
    const exit = ph.length ? (ph.filter(seenX).length + 0.6 * notSeen) / ph.length : null;
    const corner = prof.lefty ? '7' : '10';
    const cornerLeaves = C.filter(c => c.pocketHit && (pinsText(c.shot) === corner || ['Flat 10', 'Ringing 10'].includes(c.shot.leaveTag)));
    const key = pct(cornerLeaves.filter(c => c.keyPin && c.keyPin !== 'unknown').length, cornerLeaves.length);
    // Full routine: mark, pocket and off-the-deck all watched on the same shot (pocket hits and strikes).
    const routine = pct(ph.filter(c => String(c.shot.miss || 'didntTrack') !== 'didntTrack' && String(c.shot.pocket || 'Unknown') !== 'Unknown' && seenX(c)).length, ph.length);
    const parts = [[mark, 25], [pocket, 15], [exit, 35], [routine, 15], [key, 10]].filter(([v]) => v !== null);
    const wsum = parts.reduce((a, [, w]) => a + w, 0);
    const score = Math.round(parts.reduce((a, [v, w]) => a + v * w, 0) / (wsum || 1) * 100);
    const label = score >= 85 ? 'Sharp eye' : score >= 65 ? 'Good eye' : score >= 45 ? 'Building' : 'Foggy';
    const r = (v) => v === null ? null : Math.round(v * 100);
    const P = { mark: r(mark), pocket: r(pocket), exit: r(exit), routine: r(routine), keyPin: r(key) };
    const NAMES = { mark: 'your mark', pocket: 'the pocket', exit: 'off the deck', routine: 'the full routine', keyPin: 'the key pin' };
    const weakest = Object.entries(P).filter(([, v]) => v != null).sort((a, b) => a[1] - b[1])[0];
    const exitSeenN = ph.filter(seenX).length;
    return { score, label, n: C.length, parts: P, pocketHits: ph.length, exitSeen: exitSeenN, exitNotSeen: notSeen, cornerLeaves: cornerLeaves.length,
      weakest: weakest && weakest[1] < 70 ? { key: weakest[0], name: NAMES[weakest[0]], pct: weakest[1] } : null,
      tip: weakest && weakest[1] < 70 ? (weakest[0] === 'exit' || weakest[0] === 'routine' ? `Watch it off the deck: ${exitSeenN} of ${ph.length} pocket hits tonight. Mark → breakpoint → pocket → off the deck, every shot.` : `Weakest: ${NAMES[weakest[0]]} (${weakest[1]}%).`) : '' };
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
    const C = (shots || []).filter(s => s && s.type !== 'gameStart').map(s => classify(s, prof.lefty));
    if (C.length < 3) return null;
    const pct = (a, b) => b >= 5 ? Math.round(a / b * 100) : null; // under 5 shots: not enough to grade
    const of = (a, b) => `${a} of ${b}`;
    const sub = (label, score, text) => ({ label, score, text: score == null && /\b[0-4] of [1-4]\b/.test(text) ? text + " (not enough yet to grade)" : text });
    const chg0 = (c, k) => Array.isArray(c.shot.changed) && c.shot.changed.includes(k);
    // A planned speed change carries on while you keep throwing it the same way (slower stays planned until you mark Same or change the other way).
    const carrySpd = new Set(); { let on = ''; C.slice().sort((a, b) => (a.shot.at || 0) - (b.shot.at || 0)).forEach(c => { if (chg0(c, 'speed') && c.speed && c.speed !== 'same') on = c.speed; else if (on && c.speed === on) carrySpd.add(c); else if (c.speed && c.speed !== 'unknown') on = ''; }); }
    const chg = (c, k) => chg0(c, k) || (k === 'speed' && carrySpd.has(c));
    const out = [];

    // 1. DIRECTION: Geometry · Targeting · Posture (ball placement isn't graded: your eyes are on the target, not the foul line)
    const dSubs = [];
    { // Geometry: did your opening line (game 1) pass the Rule of 31 / Baker Box?
      const g1 = C.filter(c => c.gameNo === 1 && c.feet != null && num(c.shot.arrows) != null);
      const checks = (pat && pat.est) ? [] : g1.map(c => lineMath(c.feet, c.shot.arrows, pat, prof, 'start', null, null, num(c.shot.targetFt) || 15)).filter(r => r && r.status);
      if (pat && pat.est && g1.length) dSubs.push(sub('Geometry', null, 'Not graded: the oil pattern is unknown or estimated, so the Baker Box / Rule of 31 is a guess here.'));
      else if (checks.length) {
        const on = checks.filter(r => r.status === 'on').length;
        const basis = checks[0].basis === 'box' ? 'your Baker Box' : 'the Rule of 31';
        dSubs.push(sub('Geometry', pct(on, checks.length), `Your game 1 line went through ${basis} on ${of(on, checks.length)} shots.`));
      } else dSubs.push(sub('Geometry', null, pat && (pat.box || (pat.length && pat.r31)) ? 'Log your slide and target in game 1 to check your line.' : pat ? 'Check the Baker Box (Angles page) or Rule of 31 to check your line.' : 'Pick an oil pattern to check your line.'));
    }
    const trackedMark = C.filter(c => String(c.shot.miss || 'didntTrack') !== 'didntTrack');
    const onMark = trackedMark.filter(c => c.shot.miss === 'noMiss' || c.saved).length;
    const tgt = pct(onMark, trackedMark.length);
    dSubs.push(sub('Targeting', tgt, tgt == null ? 'Tap Your mark to grade targeting.' : `On your mark (or saved by the lane) on ${of(onMark, trackedMark.length)} shots.`));
    { const F = C.filter(c => c.shot.fault && c.shot.fault !== 'unsure' && c.shot.fault !== 'well');
      const bal = F.filter(c => c.shot.fault === 'balance').length;
      dSubs.push(sub('Posture', F.length && bal ? pct(C.length - bal, C.length) : null, F.length ? (bal ? `Fell off the shot ${bal}× (${of(bal, F.length)} poor shots with a reason).` : `None recorded among ${F.length} poor shot${F.length === 1 ? '' : 's'} with a reason (not graded: nothing measured).`) : 'Pick a reason on poor shots (like Fell off the shot) to grade posture.'));
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
    } else sSubs.push(sub('Versatility', null, 'To grade a planned speed change: tap Speed in the LASER row, then Faster or Slower.'));
    { const few = unplanned.length < 5 && !planned.length; out.push({ key: 'Speed', icon: '⚡', score: few ? null : sScore, subs: few ? [] : sSubs, quiet: few, text: few ? (unplanned.length ? `Speed logged on ${unplanned.length} shot${unplanned.length === 1 ? '' : 's'}: needs 5 to grade.` : 'Not graded: no speed reads logged.') : `Your normal speed on ${of(same, unplanned.length)} shots.` }); }

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
    let angleDir = '';
    { const nx = C.filter(c => c.pocketHit && !c.strike), hi = nx.filter(c => /high/i.test(String(c.shot.pocket || ''))).length, lo = nx.filter(c => /light/i.test(String(c.shot.pocket || ''))).length;
      if (hi + lo >= 4) { const tot = hi + lo; angleDir = hi >= lo * 2 ? 'high' : lo >= hi * 2 ? 'light' : 'mixed';
        aSubs.push(sub('Which way', null, angleDir === 'high' ? `Pocket hits that didn't strike: ${hi} high, ${lo} light. Too much angle, or the ball read early: less angle or a later / cleaner ball.` : angleDir === 'light' ? `Pocket hits that didn't strike: ${lo} light, ${hi} high. Not enough angle, or the ball arrived weak: follow the miss with your feet, or an earlier ball.` : `Pocket hits that didn't strike: ${hi} high, ${lo} light: no single direction, so it's the shape not repeating, not the angle.`)); } }
    const exB = exitBoardFor(pat);
    if (exB != null) {
      const withBp = C.filter(c => c.bp != null);
      if (withBp.length) {
        const mud = withBp.filter(c => c.bp >= exB);
        aSubs.push(sub('Exit point', pct(withBp.length - mud.length, withBp.length), mud.length ? `Turned in the mud (breakpoint at or inside board ${exB}) on ${of(mud.length, withBp.length)} shots.` : `Turned in the dry, outside board ${exB}, on every logged shot.`));
      }
    }
    out.push({ key: 'Angle', icon: '📐', score: aScore, subs: aSubs, text: aText, dir: angleDir });

    // 4. REVS: how much the ball hooked for you, and changing your hand on purpose
    // Too much hook: read early, a high hit that was hit still turning hard, or the shot before you tapped "Hooked early" / "Backend too sharp".
    // Too little: went long, a light hit that rolled out, or the shot before "Gave up downlane" / "Skidding too far".
    const told = new Map(); C.forEach((c, i) => { const w = c.shot && c.shot.why; if (i && (w === 'early' || w === 'sharp')) told.set(C[i - 1], 'more'); if (i && (w === 'gaveUp' || w === 'skid')) told.set(C[i - 1], 'less'); });
    const tooMuch = (c) => c.early || told.get(c) === 'more' || (!c.strike && c.finish === 'strong');
    const tooLittle = (c) => c.long || told.get(c) === 'less' || (!c.strike && c.finish === 'weak');
    const rd = C.filter(c => tooMuch(c) || tooLittle(c) || c.pocketHit || c.strike);
    const right = rd.filter(c => (c.pocketHit || c.strike) && !tooMuch(c) && !tooLittle(c)).length;
    const early = rd.filter(tooMuch).length, long = rd.filter(c => tooLittle(c) && !tooMuch(c)).length;
    const rScore = pct(right, rd.length);
    const rSubs = [sub('Hook', rScore, rd.length ? `Hooked the right amount on ${of(right, rd.length)} shots${early ? `; too much (early or still turning hard) ${early}×` : ''}${long ? `; too little (long or rolled out) ${long}×` : ''}.` : 'Tap the pocket and ball reaction to grade hook.')];
    const hand = C.filter(c => chg(c, 'hand'));
    if (hand.length) { const w = hand.filter(c => c.strike || c.pocketHit).length; rSubs.push(sub('Versatility', pct(w, hand.length), `You changed your hand on purpose ${hand.length}×; ${of(w, hand.length)} found the pocket.`)); }
    else rSubs.push(sub('Versatility', null, 'To grade a planned rev change: tap Release (hand) in the LASER row.'));
    out.push({ key: 'Revs', icon: '🔄', score: rScore, subs: rSubs, text: (prof.rpm ? `Profile: ${prof.rpm} rpm (your Bowler page, not measured tonight). ` : '') + (rd.length ? `The right amount of hook on ${of(right, rd.length)} shots.` : rSubs[0].text) });

    // 5. ROLL: how the ball finished: exit off the deck and the key pin
    // Graded only on pocket hits you watched off the deck (strikes included); each shot lands in exactly one bucket.
    const ph = C.filter(c => c.pocketHit && c.finish);
    const weak = ph.filter(c => c.finish === 'weak').length, strong = ph.filter(c => c.finish === 'strong').length;
    const fin = ph.length - weak - strong;
    const unwatched = C.filter(c => c.pocketHit && !c.finish).length;
    const roScore = ph.length >= 3 ? pct(fin, ph.length) : null;
    out.push({ key: 'Roll', icon: '🌀', score: roScore, subs: [], text: ph.length ? `Of ${ph.length} pocket hits you watched off the deck: finished right ${fin}${weak ? `, rolled out (weak exit) ${weak}` : ''}${strong ? `, still turning too hard ${strong}` : ''}.${unwatched ? ` ${unwatched} not watched, not graded.` : ''}${ph.length < 3 ? ' Needs 3 to grade.' : ''}` : 'Tap the exit off the deck to grade roll.' });

    const scored = out.filter(x => x.score != null);
    const weakest = scored.length ? scored.slice().sort((a, b) => a.score - b.score)[0] : null;
    const DRILL = {
      Direction: 'Spot drill: 10 shots, same feet and target. Goal: 8 of 10 over your mark, holding your finish.',
      Speed: 'Speed ladder: 3 shots at normal speed, 3 a touch slower, 3 a touch faster, same line. Check the monitor and watch where each one turns.',
      Angle: 'Angle drill: keep the same target and try 3 different feet positions, 3 shots each. Watch how the entry and the 6-pin change.',
      Revs: 'Hand drill: 3 shots with your normal hand, 3 with less (quieter hand), 3 with more. Same line. Watch how much the ball hooks.',
      Roll: 'Finish drill: 10 pocket shots. Call the exit (left / straight / right) and the 6-pin out loud before the pins settle.',
    };
    const angEl = out.find(x => x.key === 'Angle'), outW = prof.lefty ? 'right' : 'left';
    // If going deeper tonight cost carry (Energy vs angle), the drill doesn't send you deeper: later ball from the same spot first.
    let deepHurt = false; try { const ea = energyAngle(C.map(x => x.shot).filter(Boolean), prof.lefty); deepHurt = !!(ea && /^Deeper/.test(ea.text || '')); } catch (_e) {}
    if (angEl && angEl.dir === 'high') DRILL.Angle = deepHurt
      ? `Angle drill (your misses were high, and going deeper cost carry tonight): from your better spot, same target, try a later / cleaner ball, 3 shots; then the same ball with a little loft. Watch whether the 4-pin and 9-pin stop staying.`
      : `Angle drill (your misses were high): keep your target and move your feet 1 and 2 boards ${outW}, 3 shots each, or try a later ball from the same spot. Watch whether the 4-pin and 9-pin stop staying.`;
    else if (angEl && angEl.dir === 'light') DRILL.Angle = `Angle drill (your misses were light): keep your target and move your feet 1 and 2 boards ${prof.lefty ? 'left' : 'right'}, 3 shots each, or try an earlier ball from the same spot. Watch the 6-pin and 10-pin.`;
    else if (angEl && angEl.dir === 'mixed') DRILL.Angle = 'Angle drill: high and light from the same line means the shape isn\'t repeating. Same line, 9 shots, same speed: log the pocket each time before you move.';
    return { model: 'kegel5', elements: out, weakest: weakest ? weakest.key : '', drill: weakest ? DRILL[weakest.key] : '' };
  }

  // ---------- 🔁 Repeatability: how well you repeated your shot, from what you logged ----------
  // Four parts (each needs 3+ logged shots): your mark, your normal speed (planned speed changes don't count
  // against you), a good or OK release, and the same reaction from the same line on the same lane as the last
  // time you threw it there. Moves you make on purpose aren't misses: the line part compares like with like.
  function repeatability(shots, bowler) {
    const prof = bowlerProfile(bowler);
    const C = (shots || []).filter(s => s && s.type !== 'gameStart').map(s => classify(s, prof.lefty));
    if (C.length < 4) return null;
    const pct = (a, b) => b ? Math.round(a / b * 100) : null;
    const parts = [];
    const tr = C.filter(c => !['didntTrack', 'na', ''].includes(String(c.shot.miss || 'didntTrack')));
    const mk = tr.filter(c => c.shot.miss === 'noMiss' || c.saved).length;
    if (tr.length >= 3) parts.push({ k: 'mark', label: 'Your mark', w: 0.35, score: pct(mk, tr.length), text: `Over your mark (or saved by the lane) ${mk} of ${tr.length}` });
    const sp = C.filter(c => c.speed && c.speed !== 'unknown' && !(Array.isArray(c.shot.changed) && c.shot.changed.includes('speed') && c.speed !== 'same'));
    const ss = sp.filter(c => c.speed === 'same').length;
    if (sp.length >= 3) parts.push({ k: 'speed', label: 'Speed', w: 0.25, score: pct(ss, sp.length), text: `Your normal speed ${ss} of ${sp.length}` });
    const ex = C.filter(c => c.shot.execTapped === true || num(c.shot.executionQuality) === 1 || num(c.shot.executionQuality) === 5);
    const eg = ex.filter(c => num(c.shot.executionQuality) >= 3).length;
    if (ex.length >= 3) parts.push({ k: 'release', label: 'Release', w: 0.2, score: pct(eg, ex.length), text: `Good or OK release ${eg} of ${ex.length}` });
    // Same line + same lane as the last time: did the ball do the same thing?
    const grp = (c) => c.strike || c.hit === 'flush' ? 'good' : c.hit === 'light' || c.hit === 'missLight' ? 'light' : c.hit === 'high' || c.hit === 'missHigh' || c.hit === 'brooklyn' ? 'high' : '';
    const last = {}; let pairs = 0, same = 0;
    C.forEach(c => { const g = grp(c); if (!g || c.feet == null || c.arrows == null) return; const key = `${c.lane}|${c.feet}|${c.arrows}|${c.ball}`; if (last[key]) { pairs++; if (last[key] === g) same++; } last[key] = g; });
    if (pairs >= 3) parts.push({ k: 'reaction', label: 'Ball reaction', w: 0.2, score: pct(same, pairs), text: `Same result from the same line on the same lane ${same} of ${pairs} times` });
    if (!parts.length) return null;
    const wsum = parts.reduce((a, p) => a + p.w, 0);
    const score = Math.round(parts.reduce((a, p) => a + p.score * p.w, 0) / wsum);
    const weakest = parts.length >= 2 ? parts.slice().sort((a, z) => a.score - z.score)[0] : null;
    const TIP = {
      mark: 'Your mark varied most. Spot drill: 10 shots, same feet and target; goal 8 of 10 over your mark.',
      speed: 'Your speed varied most. Same tempo every shot: same number of steps, same pushaway height.',
      release: 'Your release varied most. Slow your last step and hold your finish until the ball passes your target.',
      reaction: "The ball's reaction varied most from the same line. If your mark and speed held, that's the lane changing: read it before you move.",
    };
    return { score, parts, weakest: weakest ? weakest.k : '', tip: weakest && weakest.score < 80 ? TIP[weakest.k] : '' };
  }
  function repeatByGame(shots, bowler) {
    const out = {}; const gs = [...new Set((shots || []).filter(s => s && s.type !== 'gameStart').map(s => num(s.gameNo) || 1))];
    gs.forEach(g => { const r = repeatability((shots || []).filter(s => s && (num(s.gameNo) || 1) === g), bowler); if (r) out[g] = r.score; });
    return out;
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
      const shots = (s.shots || []).filter(x => x && x.type !== 'gameStart');
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
      else add('low', '🧺', `Barnes boxes: ${Object.keys(cells).length} of 6 filled`, all.filter(k => cells[k]).map(k => `${k}: ${cells[k].join(', ')}`).join(' · ') + '.', empty.length ? `Open: ${empty.join(', ')}. Fine if you don't need them for this house.` : 'Every box covered.');

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
      const bagBalls = ctx.scope === 'bag' ? new Set(balls.map(b => b.name)) : new Set((ctx.sets || []).flatMap(st => (st.balls || []).map(x => typeof x === 'string' ? x : x && x.name)).filter(Boolean));
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
    // Two lanes, two lines: a move is a change from your last shot on the SAME lane, not from the other lane's line.
    const lanesSeen = new Set(C.map(c => c.shot && c.shot.lane).filter(Boolean));
    const prevOf = (i) => { const ln = C[i].shot && C[i].shot.lane; if (lanesSeen.size === 2 && ln) { for (let j = i - 1; j >= 0; j--) if (C[j].shot && C[j].shot.lane === ln) return j; return -1; } return i - 1; };
    for (let i = 1; i < C.length; i++) {
      const pj = prevOf(i); if (pj < 0) continue;
      const a = C[pj], b = C[i];
      const lineMoved = (a.feet != null && b.feet != null && a.feet !== b.feet) || (a.arrows != null && b.arrows != null && a.arrows !== b.arrows);
      const ballChanged = !!(a.ball && b.ball && a.ball !== b.ball);
      if (lineMoved || ballChanged) changes.push({ i, pj, lineMoved, ballChanged });
    }
    const good = (c) => (c.strike && c.hit !== 'brooklyn') || c.hit === 'flush'; // clean result
    const rate = (arr) => arr.length ? arr.filter(good).length / arr.length : null;
    return changes.map((ch, k) => {
      const i = ch.i, prev = C[ch.pj != null ? ch.pj : i - 1], cur = C[i];
      const start = k ? changes[k - 1].i : 0;
      const end = k + 1 < changes.length ? changes[k + 1].i : C.length;
      const before = C.slice(start, i).filter(c => (c.execution !== 'poor' || c.laneInfo));
      const after = C.slice(i, end).filter(c => (c.execution !== 'poor' || c.laneInfo));
      const last2 = before.slice(-2);
      const read = last2.length === 2 && last2.every(c => c.lean > 0) ? 'early' : last2.length === 2 && last2.every(c => c.lean < 0) ? 'late' : '';
      const dF = (prev.feet != null && cur.feet != null) ? own(cur.feet) - own(prev.feet) : 0;
      const dA = (prev.arrows != null && cur.arrows != null) ? own(cur.arrows) - own(prev.arrows) : 0;
      const dir = Math.sign(dF || dA); // +1 deeper, -1 outside
      const want = read === 'early' ? 1 : read === 'late' ? -1 : 0;
      const r = { lineMoved: ch.lineMoved, ballChanged: ch.ballChanged,
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
        r.pkA = a4.filter(x => x.pocketHit || (x.strike && x.hit !== 'brooklyn')).length;
        // Need 3+ good shots before the move to call it worse: 1 of 1 before isn't a baseline.
        if (pa >= 0.75 || (pb != null && b4.length >= 3 && pa >= pb + 0.25)) r.result = 'worked';
        else if (pb != null && b4.length >= 3 && pa < pb) r.result = 'didnt';
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
    // Still in the pocket after the move, just not striking every time: one message, keep it.
    if ((last.result === 'didnt' || last.result === 'mixed') && last.na && last.pkA / last.na >= 0.75) {
      notes.push(`↔️ Since you ${what}: pocket ${last.pkA} of ${last.na} good shots, strikes or flush ${last.pa} of ${last.na}${last.nb ? ` (${last.pb} of ${last.nb} before)` : ''}. You're holding the pocket, so keep it for now and watch high or light on the next good shots.`);
      out.moveSaid = true;
    } else if (last.result === 'didnt') {
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
    const C = (shots || []).filter(s => s && s.type !== 'gameStart').map(s => classify(s, prof.lefty));
    const R = moveReviews(C, prof);
    const cnt = (f) => R.filter(f).length;
    const res = { made: R.length, good: cnt(r => r.goodCall || r.result === 'worked'), afterPoorBad: cnt(r => r.afterPoor && r.result !== 'worked'), afterPoor: cnt(r => r.afterPoor), tooSoon: cnt(r => r.tooSoon), whileStriking: cnt(r => r.whileStriking), wrongDir: cnt(r => r.wrongDir), worked: cnt(r => r.result === 'worked'), didnt: cnt(r => r.result === 'didnt') };
    const nLine = cnt(r => r.lineMoved), nBall = cnt(r => r.ballChanged && !r.lineMoved), nBoth = cnt(r => r.ballChanged && r.lineMoved);
    const lx = (k) => C.filter(c => Array.isArray(c.shot.changed) && c.shot.changed.includes(k)).length, nLoft = lx('loft'), nSpd = lx('speed'), nRel = lx('hand');
    const lsr = [nLoft && `${nLoft} loft`, nSpd && `${nSpd} speed`, nRel && `${nRel} release`].filter(Boolean).join(', ');
    const bits = [`${res.made} changes (${nLine} line move${nLine === 1 ? '' : 's'}${nBall ? `, ${nBall} ball-only change${nBall === 1 ? '' : 's'}` : ''}${nBoth ? `; ${nBoth} changed ball and line together` : ''}; a line move counts per lane)${lsr ? ` + ${lsr} change${/,/.test(lsr) || /^[2-9]|^\d\d/.test(lsr) ? 's' : ''} (not in the count)` : ''}`];
    if (res.made) bits.push(`${res.good} good call${res.good === 1 ? '' : 's'}`);
    if (res.worked) bits.push(`${res.worked} worked`);
    if (res.didnt) bits.push(`${res.didnt} didn't help`);
    if (res.afterPoor) bits.push(`${res.afterPoor} right after a poor shot${res.afterPoorBad && res.afterPoorBad < res.afterPoor ? ` (${res.afterPoorBad} of them didn't help)` : ''}`);
    if (res.tooSoon) bits.push(`${res.tooSoon} before 2 good shots`);
    if (res.whileStriking) bits.push(`${res.whileStriking} while striking`);
    if (res.wrongDir) bits.push(`${res.wrongDir} the wrong way`);
    res.text = res.made ? `🔁 Your moves: ${bits.join(' · ')}.` : '🔁 Your moves: none tonight.';
    res.tip = res.afterPoorBad ? 'Next time: repeat the shot after a missed mark before you move.'
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
    C.filter(c => (c.execution !== 'poor' || c.laneInfo) && c.shot && c.shot.lane).forEach(c => { const k = String(c.shot.lane); (by[k] = by[k] || []).push(c); });
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
      const all = ((ctx && ctx.shots) || []).filter(s => s && s.type !== 'gameStart');
      const C = all.map(s => classify(s, prof.lefty));
      const W = C.filter(c => (c.execution !== 'poor' || c.laneInfo)).slice(-5);
      if (C.length >= 3) sideNotes(out, C, W, prof, patternProfile(ctx && ctx.pattern));
      if (C.length >= 2) moveNotes(out, C, prof);
      try { whyNotes(out, C); } catch (_e) {}
      try { burnNote(out, C, ctx, prof); } catch (_e) {}
      try { motionNote(out, C, ctx); } catch (_e) {}
      // ✋ Move brake: 2+ line or ball changes in your last 4 frames of this game = stop and let one change settle.
      try { const g = Number((C[C.length - 1] || {}).gameNo) || 1, G = C.filter(c => (Number(c.gameNo) || 1) === g);
        let ch = 0; const recent = G.slice(-5); for (let q = 1; q < recent.length; q++) { const a = recent[q - 1].shot, b = recent[q].shot; if (!a || !b) continue; const same = !a.lane || !b.lane || a.lane === b.lane; if ((same && ((a.feet != null && b.feet != null && a.feet !== b.feet) || (a.arrows != null && b.arrows != null && a.arrows !== b.arrows))) || (a.ball && b.ball && a.ball !== b.ball)) ch++; }
        if (ch >= 2) (out.notes = out.notes || []).unshift(`✋ ${ch} changes in your last few frames. Stop here: pick one and give it 2 good shots before anything else. After a missed mark, just repeat it.`); } catch (_e) {}
      laneNotes(out, C, prof);
      // 🛢️ Carrydown building (game 2+): the ball holds later than game 1 and right moves are working. Stronger with plastic / urethane on the pair.
      try { const E = root.BTEyes, T = ctx && ctx.traffic, c = E && E.carrySign ? E.carrySign(all, prof.lefty) : null;
        if (c && c.sign && ((T && T.carry >= 1) || (c.drift != null && c.drift <= -2)) && !(out.notes || []).some(n => /^🛢️ (Possible c|C)arrydown/.test(n))) {
          const dIn = prof.deeper || 'left', dOut = prof.outside || 'right'; let ball = ''; try { ball = suggestBall('late', ctx, prof); } catch (_e) {}
          const cnts = c.weakLate > c.weakEarly && c.eN ? `, light / flat hits ${c.wEn} of ${c.eN} in game 1 → ${c.wLn} of ${c.lN} since` : '';
          const opts = `feet 2 ${dOut}, eyes 1 ${dOut} to get outside the track; ${ball ? `${ball}, it reads earlier` : 'an earlier-reading ball from tonight\'s bag'}; or about ½ mph slower so it reads sooner`;
          const holding = out.status !== 'move';
          (out.notes = out.notes || [])[holding ? 'push' : 'unshift'](`🛢️ Possible carrydown${T && T.carry >= 1 ? ` (${T.carry} plastic / urethane on the pair)` : ''}: the ball is holding later than game 1${c.drift != null && c.drift < 0 ? ` (you've moved ${Math.abs(c.drift)} ${dOut})` : ''}${cnts}. ${holding ? `Nothing to change yet. If good shots start going light, don't chase it ${dIn}; pick one: ${opts}.` : `Don't chase it ${dIn}. Pick one: ${opts}.`}`); out.carrydown = c; } } catch (_e) {}
      // 🔔 Carry over/under (no new inputs: uses the ringing / flat tags you already log). Game Day: line + tonight's bag only, never surface.
      try { const E = root.BTEyes, pat = patternProfile(ctx && ctx.pattern);
        const mix = E && E.tenMix ? E.tenMix(all.slice(-24), prof.lefty, pat && pat.length) : null;
        if (mix) { const deep = prof.deeper || (prof.lefty ? 'right' : 'left'), outd = prof.outside || (prof.lefty ? 'left' : 'right');
          let t;
          if (mix.n < 3) t = `🔔 Carry over/under: a ringing ${mix.pin} and a flat ${mix.pin} from about the same line. Your line is close; the reaction isn't repeating. Don't chase a single ${mix.pin}: hold your feet and target, and move only if 2 of the same ${mix.pin} come in a row.`;
          else { const z = mix.zone === 'outside' ? `Your breakpoint (about ${mix.bp}) is well outside the exit board (about ${mix.exB}: app estimate from the ${mix.patLen} ft you entered), so the ball is finishing out in the dry. Move feet 2 ${deep}, eyes 1 ${deep} so it leaves the oil near board ${mix.exB}.`
              : mix.zone === 'inside' ? `Your breakpoint (about ${mix.bp}) is at or inside the exit board (about ${mix.exB}: app estimate from the ${mix.patLen} ft you entered): it's turning in the mud. Move feet 2 ${outd}, eyes 1 ${outd} so it gets further out before it turns.`
              : mix.lean === 'flat' ? `Mostly flat (${mix.flat} of ${mix.n}): the ball is giving up energy. Move feet 2 ${deep}, eyes 1 ${deep} to keep it in the oil longer.`
              : mix.lean === 'ring' ? `Mostly ringing (${mix.ring} of ${mix.n}): too much angle. Move feet 2 ${outd}, eyes 1 ${outd} for a straighter line.`
              : `Even split: your line is right; it's the ball's shape.`;
            let ball = ''; try { ball = suggestBall('overunder', ctx, prof); } catch (_e) {}
            t = `🔔 Possible carry over/under${mix.zone === 'inside' ? ' in the mud' : ''}: ${mix.ring} ringing and ${mix.flat} flat ${mix.pin}s on good shots from about the same line. ${z} ${ball ? `Smoother, more predictable shape in tonight's bag: ${ball}.` : `Nothing in tonight's bag is smoother: stay with your ball and move only your line.`}`; }
          if (!(out.notes || []).some(n => /^🔔 Carry over\/under/.test(n))) (out.notes = out.notes || []).unshift(t);
          out.carryOU = mix; } } catch (_e) {}
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
          const small = wear === 'sport' ? ' Keep it small: this house plays tight.' : wear === 'opens' ? ` Keep it small: the ${dIn} opens up on this league.` : wear === 'holds' ? ` The ${dIn} holds on this league, so this move is safe.` : '';
          if (prevOk && (last.lean || 0) >= 1) out.ready = { dir: 'early', text: `⚡ First sign the lane is changing: that one came in higher / read earlier than the two before it. If your next good shot does the same, make the move right away: feet 1 ${dIn}, eyes ½ ${dIn}.${small}` };
          else if (prevOk && (last.lean || 0) <= -1) out.ready = { dir: 'late', text: (ctx.traffic && ctx.traffic.carry >= 1)
            ? `⚡ First sign the lane is changing: that one held longer / came in lighter. With ${ctx.traffic.carry} urethane / plastic bowler${ctx.traffic.carry === 1 ? '' : 's'} on the pair this is likely carrydown: if the next good shot does the same, don't chase it ${dIn}: try an earlier-reading ball or a touch less speed, or move ${dOut} to get outside the track.`
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
          if (T && T.carry >= 1) parts.push(`${T.carry} on the pair throw${T.carry === 1 ? 's' : ''} urethane or plastic: by now they've pushed oil down the lane, so expect a weaker back end.`);
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
      // One verdict per move: if the move note already spoke, drop the separate "is working" line.
      if (out.notes && out.notes.some(n => /^(↔️ Since you|↩️ That change didn't help)/.test(n))) out.notes = out.notes.filter(n => !/^✅ Your last change/.test(n));
      if (out.whyVerdict && out.notes) out.notes = out.notes.filter(n => !/^(✅ Your last change|↔️ Since you|↩️ That change didn't help)/.test(n));
    } catch (_e) {}
    return out;
  }

  function evaluateCore(ctx) {
    ctx = ctx || {};
    const prof = bowlerProfile(ctx.bowler);
    const pat = patternProfile(ctx.pattern);
    const all = (ctx.shots || []).filter(s => s && s.type !== 'gameStart');
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
    const trustedAll = C.filter(c => (c.execution !== 'poor' || c.laneInfo));
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
        const bag = strikeBag(ctx);
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
    const trustedSince = since.filter(c => (c.execution !== 'poor' || c.laneInfo));
    const before = lastChange >= 0 ? C.slice(Math.max(0, lastChange - 5), lastChange).filter(c => (c.execution !== 'poor' || c.laneInfo)) : [];

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
    const G = C.filter(c => c.gameNo === gameNo && (c.execution !== 'poor' || c.laneInfo));
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
    // 🗣️ Kinds of change you already made for this same problem tonight that didn't fix it (from your Why? taps).
    const failedFor = {}; const KMAP = { feet: 'Aim', ball: 'Equipment', loft: 'Loft', speed: 'Speed', hand: 'Release' };
    const FAM = { early: ['early'], sharp: ['early', 'overunder'], gaveUp: ['carryWeak', 'late'], slowBurn: ['carryWeak', 'late'], skid: ['late'] };
    try { whyReview(C).filter(r => r.fix && !r.fix.ok && C.length - r.i <= 14).forEach(r => (FAM[r.why] || []).forEach(sit => (r.kinds || []).forEach(k => { if (KMAP[k]) (failedFor[sit] = failedFor[sit] || new Set()).add(KMAP[k]); }))); } catch (_e) {}

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
      { const tN = W.slice(-3).filter(c => c.shot && c.shot.swing === 'tight').length; if (tN >= 2) res.notes.push(`😬 Your swing felt tight on ${tN} of your last ${W.slice(-3).length}: the move below should also give your arm room to relax.`); }
      res.lens = lens || '';
      lastBallWhy = '';
      const ball = suggestBall(sit, ctx, prof);
      const step = (tried.has('Aim') && lastChange >= 0 && !(failedFor[sit] && failedFor[sit].has('Aim'))) ? 2 : 1; // no bigger move after a move that didn't fix it
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
      const failed = failedFor[sit] || new Set();
      if (failed.has('Aim') && favor === 'spot') {
        favor = '';
        setCompass('?', 'warn', 'move', `🧭 You already moved your feet and eyes for this tonight and it's still ${laneSays || 'doing it'}. A bigger move in the same direction isn't the answer: try a different kind of change.`);
      }
      const triedAll = new Set([...tried, ...failed]);
      let ranked = rankMoves(sit, prof, pat, !!ball, triedAll, angleClass, favor);
      // What has fixed this same problem for you before (your Why? record across nights) goes first.
      try { const sess = (typeof BT !== 'undefined' && BT.lsGet) ? (BT.lsGet(BT.KEYS.GAME_SESSIONS, []) || []) : []; const L = whyLearn(sess, ctx.bowler), good = new Set();
        Object.entries(FAM).filter(([w, sits]) => sits.includes(sit)).forEach(([w]) => Object.entries((L[w] || {}).kinds || {}).forEach(([k, q]) => { if (KMAP[k] && q.ok && q.ok * 2 >= q.n) good.add(KMAP[k]); }));
        if (good.size) ranked = ranked.filter(m => good.has(m.kind) && !failed.has(m.kind)).concat(ranked.filter(m => !(good.has(m.kind) && !failed.has(m.kind)))); } catch (_e) {}
      if (failed.size) ranked = ranked.filter(m => !failed.has(m.kind)).concat(ranked.filter(m => failed.has(m.kind)));
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
      { // ⚖️ Moving in while the ball rolls out: keep the angle (feet in, eyes the same) instead of a parallel move
        const weakN = W.slice(-4).filter(c => c.finish === 'weak').length, deep = prof.lefty ? 'right' : 'left';
        if (weakN >= 2 && first && (first.kind === 'Aim' || first.kind === 'Angle') && (sit === 'early' || sit === 'carryWeak' || sit === 'overunder'))
          res.notes.unshift(`⚖️ The ball has rolled out on ${weakN} of your last ${Math.min(4, W.length)}. When you move ${deep}, move your feet more than your eyes (feet 2 ${deep}, target the same) so it still gets out to the breakpoint and keeps its angle into the pocket.`); }
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
    // A bad shot you said still told you about the lane: don't move off it, but say what it showed and count it.
    if (last.execution === 'poor' && last.laneInfo) {
      res.status = 'repeat'; res.tone = 'info'; res.element = '🛣️ Lane read';
      const sh = last.shot || {}, obs = Array.isArray(sh.obs) ? sh.obs : [], pk = String(sh.pocket || '');
      const saw = obs.includes('Too early') ? 'it hooked early' : obs.includes('Too long') ? 'it skidded long' : obs.includes('Over/under') ? 'it went over/under'
        : last.missSide === 'outside' && !last.saved ? 'the outside isn\'t coming back (less room out there)'
        : last.missSide === 'inside' && !last.saved ? 'there\'s friction inside: a miss in there doesn\'t hold'
        : last.missSide === 'outside' ? 'a miss outside still recovers (room out there)' : last.missSide === 'inside' ? 'a miss inside still holds (room in there)'
        : /Pocket high|Brooklyn/.test(pk) ? 'it read the lane early' : /Pocket light/.test(pk) ? 'it held more than you expected' : 'what it showed you';
      res.headline = `Bad shot, but it still told you something: ${saw}. Coach counted it in the lane read. Don't move off one bad shot.`;
      res.why = 'You ticked "Bad shot, but it still told me about the lane", so this shot counts toward reading the pattern, not toward judging your line.';
      res.next = W.length ? `Lane read so far: ${res.read.toLowerCase()}. If your next good shot says the same thing, that's your move.` : 'If your next good shot says the same thing, that\'s your move.';
      setCompass('?', '?', 'watch', '🧭 One bad shot can show the pattern, but it can\'t tell you if it\'s the ball or the spot. Confirm it with a good one.');
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

    // 📝 What your notes say about this line (same ball, last good shots): backs up, or questions, "right ball, right spot".
    const noteBack = () => { let nm = null; try { nm = noteMix(W.map(c => c.shot), prof.lefty); } catch (_e) {} if (!nm) return;
      if (nm.read === 'strong') res.notes.push(`📝 Your notes back it up: ${nm.say}. ${nm.text}`);
      else if (nm.read === 'weak' || nm.read === 'hot') res.notes.push(`📝 But your notes say ${nm.say} on this line. ${nm.text}`); };
    // 😬 Swing felt tight: striking or not, a tight swing means you're steering. Open room before the pins tell you.
    const tightBack = (striking) => {
      const r3 = W.slice(-3), tN = r3.filter(c => c.shot && c.shot.swing === 'tight').length; if (tN < 2) return false;
      const lean = W.slice(-4).reduce((a, c) => a + (c.lean || 0), 0) / Math.max(1, W.slice(-4).length);
      const deep = prof.lefty ? 'right' : 'left', out = prof.lefty ? 'left' : 'right';
      const mv = lean > 0.2 ? `move deeper: feet 2 ${deep}, eyes 1 ${deep}` : lean < -0.2 ? `move out: feet 2 ${out}, eyes 1 ${out}` : `make a 2 & 1 move to the side that lets your arm hang: deeper (${deep}) if the lanes are starting to hook, out (${out}) if they're holding`;
      res.headline = `${striking ? 'You\'re striking, but y' : 'Y'}our swing felt tight on ${tN} of your last ${r3.length}. Free it up before the pins tell you: ${mv}.`;
      res.why = 'A tight swing means you\'re steering to hit the line. A small move with feet and eyes together keeps the same shape and gives your arm room to relax, which is how you stay in Utopia.';
      res.status = 'move'; res.tone = 'move'; res.element = '🎯 Direction';
      setCompass('ok', 'warn', 'move', '🧭 Right ball. The spot is costing you a free swing: a small 2 & 1 move.');
      return true; };
    // ---- 2. Utopia: room both ways ----
    if (outsideSaved && insideSaved) {
      res.status = 'utopia'; res.tone = 'good'; res.element = '🎯 Direction';
      res.headline = 'Wide window both ways. Stay right where you are.';
      res.why = `You missed outside and it recovered${outsideSaved.strike ? ' for a strike' : ' to the pocket'}, and missed inside and it held${insideSaved.strike ? ' for a strike' : ' in the pocket'}. That's the best look you can have.`;
      res.next = 'Don\'t change a thing until a good shot misses the pocket.';
      setCompass('ok', 'ok', 'stay', '🧭 Right ball, right spot. This is what you\'re looking for.');
      if (moveVerdict) res.notes.push(moveVerdict);
      noteBack();
      tightBack(true);
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
      noteBack();
      res.next = bk >= 2 ? 'Heads-up: those were Brooklyns. The lane is starting to hook early. Be ready to move deeper.' : 'Keep repeating. Coach will flag the first sign of change.';
      tightBack(true);
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
      const agree = Math.max(weak, strong) >= 2 && (Math.min(weak, strong) === 0 || Math.max(weak, strong) >= 2 * Math.min(weak, strong) + 1); // 2 vs 1 is mixed, not a call
      // A strike on the last good shot, or leaves that point both ways, is not a reason to change speed.
      // Leaves pointing both ways from the pocket on good shots = carry over/under (a "cliff"): the reaction isn't repeating.
      // More or less energy won't fix that; a smoother, more predictable ball will.
      if (weak >= 2 && strong >= 2 && !(lastT && lastT.strike))
        return decide('overunder', 'Carry over/under: from the pocket, some leaves are weak and some strong.', `${weak} weak and ${strong} strong leaves on your last good pocket shots (${carryFails.slice(-4).map(c => c.shot.leaveTag || pinsText(c.shot)).filter(Boolean).join(', ')}). The reaction isn't repeating (a cliff), so more or less energy won't fix it: you want a smoother, more predictable look.`, '🔀 Over/under');
      if ((lastT && lastT.strike) || !agree) {
        res.status = 'watch'; res.tone = 'info'; res.lens = '🌀 Energy';
        res.headline = lastT && lastT.strike ? 'Strike. Keep repeating; no speed change yet.' : lastT && !lastT.pocketHit ? 'That one missed the pocket. Your shots before it were in the pocket but not carrying. Repeat before changing anything.' : (weak && strong) ? 'In the pocket, but the leaves point both ways (weak and strong). That can be the start of over/under: if the next good shots keep switching, Coach will call a smoother ball.' : 'In the pocket, not carrying yet. Repeat before changing anything.';
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
      return decide(sit, head, `In the pocket with ${leaves.join(', ') || 'leaves'}${eyes.length ? ' (' + eyes.join(', ') + ')' : ''}. You're reaching the pocket, so start with energy before line: how much axis rotation the ball has left at the pins.`, '🌀 Energy');
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
  // Your edits: renamed labels (any reason) and reasons you've taken off your dropdown. Shots keep their tag either way.
  const FAULT_LABELS_KEY = 'bt_fault_labels_v1', FAULT_HIDE_KEY = 'bt_fault_hidden_v1';
  const jget = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (_e) { return d; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_e) {} };
  const faultLabels = () => { const o = jget(FAULT_LABELS_KEY, {}); return o && typeof o === 'object' ? o : {}; };
  const setFaultLabel = (v, label) => { const o = faultLabels(); const t = String(label || '').trim().slice(0, 40); if (t) o[v] = t; else delete o[v]; jset(FAULT_LABELS_KEY, o); };
  const hiddenFaults = () => { const a = jget(FAULT_HIDE_KEY, []); return Array.isArray(a) ? a : []; };
  const hideFault = (v) => jset(FAULT_HIDE_KEY, [...new Set([...hiddenFaults(), v])]);
  const unhideFault = (v) => jset(FAULT_HIDE_KEY, hiddenFaults().filter(x => x !== v));
  const faultLabel = (v) => faultLabels()[v] || (/^my:/.test(String(v || '')) ? String(v).slice(3) : (FAULTS.find(f => f.v === v) || {}).l || ({ target: 'Missed my target' }[v]) || v);
  const MY_FAULTS_KEY = 'bt_my_faults_v1';
  const myFaults = () => { try { const a = JSON.parse(localStorage.getItem(MY_FAULTS_KEY) || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string' && x.trim()) : []; } catch (_e) { return []; } };
  const setMyFaults = (a) => { try { localStorage.setItem(MY_FAULTS_KEY, JSON.stringify([...new Set(a.map(x => String(x).trim()).filter(Boolean))].slice(0, 20))); } catch (_e) {} };
  // Built-in list (Not sure last) with your own reasons before Not sure.
  const allFaults = (opt) => { const base = FAULTS.filter(f => f.v !== 'unsure'); const H = (opt && opt.all) ? [] : hiddenFaults(); return [...base, ...myFaults().map(t => ({ v: 'my:' + t, l: t, mine: true })), FAULTS.find(f => f.v === 'unsure')].filter(f => !H.includes(f.v)).map(f => Object.assign({}, f, { l: faultLabel(f.v) })); };
  // s: a logged shot; lefty: boolean. Returns { fit: 'fits'|'off'|'learn'|'na', side, room, text }.
  function faultRead(s, lefty) {
    if (!s || !s.fault) return null;
    const m = String(s.miss || 'didntTrack'), pk = String(s.pocket || ''), obs = Array.isArray(s.obs) ? s.obs : [];
    const IN = lefty ? 'right' : 'left';
    const side = /^left/.test(m) ? (IN === 'left' ? 'in' : 'out') : /^right/.test(m) ? (IN === 'right' ? 'in' : 'out') : m === 'noMiss' ? 'hit' : '';
    // Missed the mark but still found the pocket = the lane saved it (room), even if it was tagged a plain miss.
    const savedPk = (() => { try { return typeof BT !== 'undefined' && BT.isPocketHit ? BT.isPocketHit(s) : /pocket/i.test(pk) || s.leaveTag === 'Strike'; } catch (_e) { return false; } })();
    const room = m === 'leftHeld' || m === 'rightRecovered' ? 'room' : m === 'leftMiss' || m === 'rightMiss' ? (savedPk ? 'room' : 'tight') : m === 'noMiss' ? 'hit' : '';
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

  // ⚖️ Energy vs angle: how deep you stood vs how the ball finished (pocket, carry, rolled out vs still turning).
  function energyAngle(shots, lefty) {
    const C = (shots || []).filter(s => s && s.type !== 'gameStart' && Number.isFinite(Number(s.feet))).map(s => classify(s, lefty)).filter(c => c.execution !== 'poor' || c.laneInfo); // good shots only
    if (C.length < 8) return null;
    const by = {}; C.forEach(c => { const f = Math.round(Number(c.shot.feet)); const o = by[f] = by[f] || { feet: f, n: 0, p: 0, x: 0, weak: 0, strong: 0, bp: [] }; o.n++; if (c.pocketHit) o.p++; if (c.strike) o.x++; if (c.finish === 'weak') o.weak++; if (c.finish === 'strong') o.strong++; if (Number.isFinite(Number(c.shot.bp))) o.bp.push(Number(c.shot.bp)); });
    const rows = Object.values(by).filter(o => o.n >= 3).sort((a, b) => a.feet - b.feet).map(o => ({ ...o, bp: o.bp.length ? Math.round(o.bp.reduce((a, b) => a + b, 0) / o.bp.length * 10) / 10 : null, carry: o.p ? Math.round(o.x / o.p * 100) : 0, pocket: Math.round(o.p / o.n * 100) }));
    if (rows.length < 2) return { rows, text: '' };
    const deep = rows[rows.length - 1], out = rows[0]; // righty: higher slide board = deeper
    const D = lefty ? out : deep, O = lefty ? deep : out; if (O.weak >= 2 && D.p < 3) return { rows, text: '' };
    // Only call it when each spot has enough pocket hits to mean something, and say when the balls were different.
    const MIN = 6, enough = D.p >= MIN && O.p >= MIN, cnt = (o) => `${o.x} of ${o.p}`;
    const ballsAt = (f) => { const m = {}; C.filter(c => Math.round(Number(c.shot.feet)) === f).forEach(c => { m[c.shot.ball || '?'] = (m[c.shot.ball || '?'] || 0) + 1; }); const top = Object.entries(m).sort((a, b) => b[1] - a[1])[0]; return top ? { ball: top[0], share: top[1] / Object.values(m).reduce((a, b) => a + b, 0) } : null; };
    const bD = ballsAt(D.feet), bO = ballsAt(O.feet), mixed = !(bD && bO && bD.ball === bO.ball && bD.share >= 0.7 && bO.share >= 0.7);
    const caveat = mixed ? ' Different balls in each spot, so this mixes ball and line.' : '';
    const outW = lefty ? 'left' : 'right';
    let text = '';
    if (!enough) text = (D.p || O.p) ? `Too few pocket hits in each spot to compare (${cnt(D)} from slide ${D.feet}, ${cnt(O)} from ${O.feet}). Needs ${MIN}+ in each.` : '';
    else if (D.carry + 15 <= O.carry) text = `Deeper (slide ${D.feet}) carried ${cnt(D)} vs ${cnt(O)} from slide ${O.feet} on good shots: the deeper spot may be costing angle. Test: from ${O.feet}, same target, and see if carry holds.${caveat}`;
    else if (O.weak >= 3 && O.weak >= D.weak + 2) text = `From slide ${O.feet} the ball rolled out ${O.weak}×; from ${D.feet} ${D.weak}×. The outside line may be burning energy: test staying at ${D.feet}.${caveat}`;
    else if (D.carry >= O.carry + 15) text = `Deeper (slide ${D.feet}) carried ${cnt(D)} vs ${cnt(O)} from slide ${O.feet} on good shots.${caveat}`;
    return { rows, text, enough, mixed };
  }

  // ---------- 🗣️ Why you changed: what the bowler saw, checked against the logs, and scored over time ----------
  // The reason rides on the first shot after a change (any LASER change: feet / eyes, speed, loft, hand, ball).
  const WHY = { slowBurn: 'Slow burn (died at breakpoint)', gaveUp: 'Gave up downlane', skid: 'Skidding too far', sharp: 'Backend too sharp', early: 'Hooked early', missPocket: 'Missed the pocket', feel: 'Just a feel' };
  const CHG_LABEL = { loft: 'Loft', feet: 'Aim (feet / eyes)', speed: 'Speed', ball: 'Equipment (ball)', hand: 'Release (hand)' }; // LASER order
  // Does this shot's log back up what you saw? +1 agrees, -1 says the opposite, 0 no read.
  function whySays(reason, c) {
    if (reason === 'missPocket') return c.pocketHit || (c.strike && c.hit !== 'brooklyn') ? -1 : 1;
    if (c.strike && c.hit !== 'brooklyn') return 0;
    const weak = c.finish === 'weak' || c.lean < 0 || c.long, strong = c.finish === 'strong' || c.lean > 0 || c.early;
    if (reason === 'slowBurn') return burnSign(c) || (weak && !strong) ? 1 : strong && !weak ? -1 : 0;
    if (reason === 'gaveUp' || reason === 'skid') return weak && !strong ? 1 : strong && !weak ? -1 : 0;
    // An early read that burns up can still arrive light, so a light hit doesn't argue with "Hooked early"; only going long does.
    if (reason === 'early') return strong && !weak ? 1 : c.long && !c.early ? -1 : 0;
    if (reason === 'sharp') return strong && !weak ? 1 : weak && !strong ? -1 : 0;
    return 0;
  }
  const whyOpp = (r) => r === 'missPocket' ? 'in the pocket' : (r === 'gaveUp' || r === 'skid' || r === 'slowBurn') ? 'high / early or strong at the pins' : 'light / long or weak at the pins';
  // Did the change fix what you saw? First 3–4 good shots after it.
  function whyFixed(reason, A) {
    const n = A.length; if (n < 3) return null;
    const clean = A.filter(c => (c.strike && c.hit !== 'brooklyn') || c.hit === 'flush').length;
    const pk = A.filter(c => c.pocketHit || (c.strike && c.hit !== 'brooklyn')).length;
    const bad = reason === 'feel' ? n - clean : A.filter(c => whySays(reason, c) === 1).length;
    // Burn / gave up is an energy problem: fixed means it carries again (half strikes or flush), not just finds the pocket.
    const energy = reason === 'gaveUp' || reason === 'slowBurn';
    return { ok: reason === 'feel' ? pk * 3 >= n * 2 && clean * 2 >= n : bad <= 1 && pk * 3 >= n * 2 && (!energy || clean * 2 >= n), bad, clean, pk, n };
  }
  const whyLabel = (w) => WHY[w] || (/^c:/.test(String(w || '')) ? String(w).slice(2) : '');
  const whyType = (w) => WHY[w] ? w : 'feel'; // your own reasons: no log check, judged on pocket + carry
  function whyReview(C) {
    const out = [], idx = C.map((c, i) => i).filter(i => C[i].shot && whyLabel(C[i].shot.why));
    idx.forEach((i, k) => {
      const s = C[i].shot, why = whyType(s.why), key = s.why, kinds = (Array.isArray(s.changed) ? s.changed : []).filter(x => CHG_LABEL[x]);
      const prev = C[i - 1] || null, afterPoor = !!(prev && prev.execution === 'poor');
      const usable = (c) => c.execution !== 'poor' || c.laneInfo;
      const B = C.slice(Math.max(0, i - 6), i).filter(usable).slice(-3);
      const agree = B.filter(c => whySays(why, c) === 1).length, against = B.filter(c => whySays(why, c) === -1).length;
      const end = k + 1 < idx.length ? idx[k + 1] : C.length;
      const A = C.slice(i, end).filter(usable).slice(0, 4);
      // Two changes at once (another kind or a ball switch within the next 3 shots): the result can't be credited to either.
      const kindsSet = new Set(kinds); let confounded = false;
      for (let q = i + 1; q < Math.min(end, i + 4); q++) { const z = C[q] && C[q].shot; if (!z) continue; const zk = (Array.isArray(z.changed) ? z.changed : []).filter(x => CHG_LABEL[x] && !kindsSet.has(x)); const prevB = C[q - 1] && C[q - 1].shot && C[q - 1].shot.ball; if (zk.length || (z.ball && prevB && z.ball !== prevB && !kindsSet.has('ball'))) { confounded = true; break; } }
      if (!kindsSet.has('ball') && s.ball && C[i - 1] && C[i - 1].shot && C[i - 1].shot.ball && C[i - 1].shot.ball !== s.ball) confounded = true;
      out.push({ i, why, key, label: whyLabel(key), custom: !WHY[key], kinds, confounded, afterPoor, prevMiss: prev ? prev.missSide || '' : '', prevLean: prev ? prev.lean : 0, agree, against, nb: B.length, fix: whyFixed(why, A), gameNo: C[i].gameNo, frame: s.frame });
    });
    return out;
  }
  const LASER_ORDER = Object.keys(CHG_LABEL);
  const kindsText = (k) => k.length ? k.slice().sort((a, b) => LASER_ORDER.indexOf(a) - LASER_ORDER.indexOf(b)).map(x => CHG_LABEL[x]).join(' + ') : 'your change';
  // Across nights: for each thing you saw, which kind of change fixed it, and how often your logs agreed with your eye.
  function whyLearn(sessions, bowler) {
    const prof = bowlerProfile(bowler), L = {};
    (sessions || []).forEach(S => {
      const C = ((S && S.shots) || []).filter(x => x && x.type !== 'gameStart').slice().sort((a, b) => (a.at || 0) - (b.at || 0)).map(s => classify(s, prof.lefty));
      whyReview(C).forEach(r => { const o = L[r.key] = L[r.key] || { n: 0, agree: 0, against: 0, kinds: {} }; o.n++; if (r.agree && !r.against) o.agree++; if (r.against >= 2 && !r.agree) o.against++;
        if (r.fix && !r.confounded) (r.kinds.length ? r.kinds : ['other']).forEach(k => { const q = o.kinds[k] = o.kinds[k] || { ok: 0, n: 0 }; q.n++; if (r.fix.ok) q.ok++; }); });
    });
    return L;
  }
  function whyLearnText(why, L) {
    const o = L && L[why]; if (!o) return '';
    const ks = Object.entries(o.kinds).filter(([k, q]) => q.n >= 1 && CHG_LABEL[k]).sort((a, b) => b[1].ok / b[1].n - a[1].ok / a[1].n || b[1].n - a[1].n);
    const parts = ks.map(([k, q]) => `${CHG_LABEL[k]} fixed it ${q.ok} of ${q.n}`);
    return parts.length ? `When you saw "${whyLabel(why)}" before: ${parts.join(', ')}.` : '';
  }
  function whyNotes(out, C) {
    const R = whyReview(C); if (!R.length) return;
    const r = R[R.length - 1]; if (C.length - r.i > 8) return;
    const what = kindsText(r.kinds), notes = out.notes = out.notes || [];
    if (r.fix) {
      if (r.fix.ok) notes.unshift(`✅ Your change fixed what you saw ("${r.label}"): ${r.why === 'missPocket' || r.why === 'feel' ? `${r.fix.pk} of ${r.fix.n} good shots in the pocket` : `${r.fix.bad} of ${r.fix.n} good shots still ${r.why === 'gaveUp' || r.why === 'skid' || r.why === 'slowBurn' ? 'light / weak' : 'high / strong'}`}, ${r.fix.clean} strikes or flush. Keep it.`);
      else notes.unshift(`↩️ Still "${r.label}" after ${what}: ${r.why === 'missPocket' || r.why === 'feel' ? `${r.fix.pk} of ${r.fix.n} good shots in the pocket` : `${r.fix.bad} of ${r.fix.n} good shots still look that way`}. Try a different kind of change than ${what}.`);
      if (r.confounded) notes[0] += ' (Another change came at the same time, so Coach won\'t credit either one in your record.)';
      out.whyVerdict = true; return;
    }
    if (r.afterPoor) notes.unshift(`🗣️ You saw "${r.label}" on a shot that missed your mark, and changed ${what}. Coach counts that as a lane read${r.prevMiss ? ` (missed ${r.prevMiss}${r.prevLean > 0 ? ' and it still hooked' : r.prevLean < 0 ? ' and it held' : ''})` : ''}, not a reaction read. Your next good shots will tell.`);
    else if (r.custom) notes.unshift(`🗣️ Noted: "${r.label}" → ${what}. Coach can't check that one against your logs, so it judges the change on pocket and carry over your next 3 good shots.`);
    else if (r.against >= 2 && !r.agree) notes.unshift(`🤔 You saw "${r.label}", but ${r.against} of your last ${r.nb} good shots were logged ${whyOpp(r.why)}. Watch the next good shot closely before changing again.`);
    else if (r.agree) notes.unshift(`🗣️ You saw "${r.label}" and your logs agree (${r.agree} of ${r.nb}). Give the ${what.toLowerCase()} change 3 good shots.`);
    else notes.unshift(`🗣️ Noted: "${r.label}" → ${what}. Coach checks it over your next 3 good shots.`);
  }

  // ---------- 📝 End-of-night ball notes: what each ball did, in your words, checked against the night's logs ----------
  const BALL_NOTE = {
    read: { label: 'Where it read', opts: { fronts: 'Fronts', mid: 'Midlane', back: 'Backend', long: 'Went long' } },
    finish: { label: 'How it finished', opts: { strong: 'Strong', smooth: 'Smooth', flat: 'Rolled flat', burn: 'Slow burn', sharp: 'Too sharp' } },
    room: { label: 'Miss room', opts: { lots: 'Lots', some: 'Some', little: 'Little' } },
  };
  function ballNoteText(n) {
    if (!n) return '';
    const p = ['read', 'finish', 'room'].map(k => n[k] && BALL_NOTE[k].opts[n[k]] ? (k === 'read' ? `read ${BALL_NOTE[k].opts[n[k]].toLowerCase()}` : k === 'room' ? `${BALL_NOTE[k].opts[n[k]].toLowerCase()} miss room` : BALL_NOTE[k].opts[n[k]].toLowerCase()) : '').filter(Boolean);
    if (n.read === 'long') p[0] = 'went long';
    return p.join(', ') + (n.text ? `${p.length ? '. ' : ''}"${n.text}"` : '');
  }
  // How much the night's shots with that ball back up the note.
  function ballNoteCheck(note, shots, ball, bowler) {
    const prof = bowlerProfile(bowler);
    const C = (shots || []).filter(s => s && s.type !== 'gameStart' && s.ball === ball && !(Number(s.shotNo) >= 2)).map(s => classify(s, prof.lefty));
    const n = C.length, good = C.filter(c => c.execution !== 'poor');
    if (!note || !(note.read || note.finish || note.room)) return { n, text: '' };
    if (n < 3) return { n, text: `${n} shot${n === 1 ? '' : 's'} with it tonight: too few to check, so Coach keeps it as a lead.` };
    const out = [];
    // Read timing comes from your lane reads (early / long), not from where it hit: an early read that rolls out arrives light.
    const early = good.filter(c => c.early).length, late = good.filter(c => c.long).length;
    const hiH = good.filter(c => !c.strike && c.lean > 0).length, ltH = good.filter(c => !c.strike && c.lean < 0).length;
    const weak = good.filter(c => !c.strike && (c.finish === 'weak' || c.shot.leaveTag === 'Flat 10')).length, strong = good.filter(c => !c.strike && (c.finish === 'strong' || c.shot.leaveTag === 'Ringing 10')).length;
    const RD = { fronts: 'fronts', mid: 'midlane', back: 'backend', long: 'went long' };
    if (note.read && (early + late) >= 2 && ((/^(fronts|mid)$/.test(note.read) && late > early) || (/^(back|long)$/.test(note.read) && early > late))) out.push(`your note says ${RD[note.read]}; your logs say ${early} early, ${late} long (worth a second look next time)`);
    else if (note.read === 'fronts' || note.read === 'mid') out.push(early > late && early >= 2 ? `logs agree it read early (${early} early vs ${late} long)` : late > early && late >= 2 ? `logs say it went long more (${late} long vs ${early} early)` : ltH && (note.finish === 'flat' || weak > strong) ? `${ltH} light / weak hits fit an early read that rolled out` : hiH > ltH ? `${hiH} high hits fit an early read` : '');
    if ((note.read === 'long' || note.read === 'back') && !((early + late) >= 2 && early > late)) out.push(late > early && late >= 2 ? `logs agree (${late} long vs ${early} early)` : early > late && early >= 2 ? `logs say it read earlier (${early} early vs ${late} long)` : note.read === 'long' && ltH > hiH ? `${ltH} light hits fit it going long` : '');
    if (note.finish === 'burn') { const bs = good.map(burnSign).filter(Boolean), hi = good.filter(c => !c.strike && c.hit === 'high').length;
      out.push(bs.length ? `${bs.length} weak leave${bs.length === 1 ? '' : 's'} (${[...new Set(bs)].join(', ')}) that fit your slow-burn read` : strong > weak && strong >= 2 ? `logs show it finishing strong (${strong} vs ${weak} weak)` : '');
      if (hi >= 2 && hi > bs.length) out.push(`${bs.length ? 'but ' : ''}${hi} high hits say it also read early or hooked too much. Two different problems: high hits → a smoother / later ball or move left; weak, flat leaves → more loft or a cleaner ball`); }
    if (note.finish === 'flat') out.push(weak > strong && weak >= 2 ? `logs agree it finished weak (${weak} vs ${strong} strong)` : strong > weak ? `logs show it finishing strong (${strong} vs ${weak} weak)` : '');
    if (note.finish === 'strong' || note.finish === 'sharp') out.push(strong > weak && strong >= 2 ? `logs agree it finished strong (${strong} vs ${weak} weak)` : weak > strong && weak >= 2 ? `logs show it finishing weak (${weak} vs ${strong} strong)` : '');
    const poor = C.filter(c => c.execution === 'poor'), saved = poor.filter(c => c.pocketHit || c.strike).length;
    if (note.room && poor.length) out.push(`${saved} of ${poor.length} poor shots still found the pocket`);
    const t = out.filter(Boolean);
    return { n, text: t.length ? `${n} shots: ${t.join('; ')}.` : `${n} shots: nothing in the logs to check it against.` };
  }

  // ---------- 🕯️ Slow burn: looks fine going down, no energy at the breakpoint ----------
  // Signs on a non-strike: the bucket (2-4-5, with or without the 8) = rolling out / losing energy too early;
  // the 2 alone or 2-10 = light / weak; a flat 10 or a weak 6-pin; a finish logged weak. NOT the 2-8 (5 went down:
  // that's the ball finishing its hook too late, the opposite problem).
  function burnSign(c, lf) {
    if (!c || c.strike) return '';
    let pins = []; try { pins = (typeof BT !== 'undefined' && BT.standingPins) ? BT.standingPins(c.shot) : []; } catch (_e) {}
    const S = new Set(pins.map(Number)), L = (a) => a.every(p => S.has(p));
    const lefty = lf != null ? !!lf : !!c.lefty;
    const two = lefty ? 3 : 2, four = lefty ? 6 : 4, eight = lefty ? 9 : 8, ten = lefty ? 7 : 10;
    if (L([two, four, 5])) return S.has(eight) ? 'bucket (2-4-5-8)' : 'bucket (2-4-5)';
    if (S.has(two) && S.has(eight) && !S.has(5)) return '';
    if (S.has(two) && (S.size === 1 || (S.size === 2 && S.has(ten)))) return S.size === 1 ? '2 pin' : '2-10';
    const lt = String(c.shot.leaveTag || '');
    if (/flat/i.test(lt)) return lt.toLowerCase();
    if (c.finish === 'weak') return 'weak finish';
    return '';
  }
  // The next step when slow burn shows up: your own record first, then a cleaner ball from tonight's bag.
  function burnLadder(ctx, prof) {
    const steps = [];
    let sess = []; try { sess = (typeof BT !== 'undefined' && BT.lsGet) ? (BT.lsGet(BT.KEYS.GAME_SESSIONS, []) || []) : []; } catch (_e) {}
    const merge = (L) => { const o = {}; ['slowBurn', 'gaveUp'].forEach(w => Object.entries((L[w] || {}).kinds || {}).forEach(([k, q]) => { const t = o[k] = o[k] || { ok: 0, n: 0 }; t.ok += q.ok; t.n += q.n; })); return o; };
    const all = merge(whyLearn(sess, ctx.bowler));
    const here = ctx.house ? merge(whyLearn(sess.filter(s => s && s.house === ctx.house), ctx.bowler)) : {};
    Object.entries(all).filter(([k, q]) => CHG_LABEL[k] && q.ok && q.ok * 2 >= q.n && !(here[k] && here[k].n >= 2 && here[k].ok * 2 < here[k].n))
      .sort((a, b) => b[1].ok / b[1].n - a[1].ok / a[1].n || b[1].n - a[1].n)
      .forEach(([k, q]) => steps.push(`${CHG_LABEL[k]} (fixed it ${q.ok} of ${q.n} before)`));
    // Balls you've already ruled out for this here: your ball notes at this house said it read early / rolled flat / slow burn.
    const ruled = {};
    if (ctx.house) sess.filter(s => s && s.house === ctx.house).forEach(S => Object.entries(S.ballNotes || {}).forEach(([bn, nt]) => {
      if (nt && (nt.read === 'fronts' || nt.read === 'mid' || nt.finish === 'burn' || nt.finish === 'flat')) { const d = S.savedAt ? new Date(S.savedAt) : null;
        ruled[bn] = `you saw it ${nt.finish === 'burn' ? 'slow burn' : nt.finish === 'flat' && !nt.read ? 'roll flat' : 'read early'}${d ? ` (${d.getMonth() + 1}/${d.getDate()})` : ''}`; } }));
    let ball = ''; try { const cx = Object.assign({}, ctx, { setBalls: (ctx.setBalls || []).filter(b => !(b && ruled[b.name])) }); ball = suggestBall('carryWeak', cx, prof); } catch (_e) {}
    if (ball) steps.push(`${ball} (cleaner through the front, saves energy)`);
    // Nothing in tonight's bag goes longer than the ball that's burning: name the arsenal ball that would, for next time.
    else { try { const R = ballRowMap(), cur = R.get(ctx.currentBall);
      if (cur && typeof BT !== 'undefined' && BT.motionVector) { const cv = BT.motionVector(cur, ctx.bowler);
        const cand = [...R.entries()].filter(([n, r]) => n !== ctx.currentBall && !ruled[n] && !BT.isRetired(n) && !(BT.isSpareBall && BT.isSpareBall(r)))
          .map(([n, r]) => ({ n, v: BT.motionVector(r, ctx.bowler) })).filter(o => o.v && o.v.length >= cv.length + 0.08 && o.v.backend >= cv.backend - 0.05)
          .sort((a, z) => (z.v.length + z.v.backend * 0.5) - (a.v.length + a.v.backend * 0.5))[0];
        if (cand) steps.push(`next time, bring a ball that goes longer than ${ctx.currentBall}: ${cand.n} (nothing in tonight's bag is cleaner)`); } } catch (_e) {}
      // No cleaner ball tonight: fall back to LASER (Loft first: it carries the ball past the dry fronts; then Speed, Release), ranked by your own ratings on the Bowler page
      // and your Why? record. Kinds that failed here stay out; Equipment is out (nothing to change to); Aim is out (moving deeper adds dry boards to a burning ball) unless your record says it fixed burn.
      try { const KM = { feet: 'Aim', speed: 'Speed', loft: 'Loft', hand: 'Release' }, have = new Set(steps.map(t => (t.match(/^(Loft|Aim|Speed|Release)/) || [])[1]).filter(Boolean));
        const bad = new Set(Object.entries(here).filter(([k, q]) => q.n >= 1 && q.ok * 2 < q.n).map(([k]) => KM[k]).filter(Boolean));
        rankMoves('carryWeak', prof, null, false, bad, null, '').map(m => Object.assign({}, m, { score: m.score + (m.kind === 'Loft' ? 4 : 0) })).sort((a, z) => z.score - a.score).filter(m => m.kind !== 'Equipment' && m.kind !== 'Angle' && m.kind !== 'Aim' && !have.has(m.kind) && !bad.has(m.kind)).slice(0, 2)
          .forEach(m => { let t = ''; try { t = moveText(m.kind, 'carryWeak', prof, null, '', 1); } catch (_e) {} steps.push(`${m.kind} (LASER, your rating ${m.rating}/5)${t ? `: ${String(t).replace(/<[^>]+>/g, '')}` : ''}`); }); } catch (_e) {} }
    const ruledOut = Object.entries(ruled).filter(([bn]) => bn !== ctx.currentBall && (ctx.setBalls || []).some(b => b && b.name === bn)).map(([bn, why]) => `${bn}: not here, ${why}`);
    const avoid = ruledOut.concat(Object.entries(here).filter(([k, q]) => CHG_LABEL[k] && q.n >= 2 && q.ok * 2 < q.n).map(([k, q]) => `${CHG_LABEL[k].toLowerCase()} fixed it only ${q.ok} of ${q.n} here`));
    if (!steps.length) steps.push('Loft it a touch past the dry fronts, or a cleaner ball');
    return { steps, avoid, ruled };
  }
  function burnNote(out, C, ctx, prof) {
    const cur = ctx && ctx.currentBall; if (!cur) return;
    const G = C.filter(c => c.shot && c.shot.ball === cur && c.execution !== 'poor' && (c.pocketHit || c.strike || /pocket/i.test(String(c.shot.pocket || '')))).slice(-5);
    const signs = G.map(c => burnSign(c, prof.lefty)); const hits = signs.filter(Boolean);
    if (hits.length < 2 || !(signs[signs.length - 1] || signs[signs.length - 2])) return;
    const L = burnLadder(ctx, prof);
    // The leave is the alarm; what you saw is the diagnosis. Burn needs motion evidence: a logged early read, or you tapped
    // Slow burn / Gave up / Hooked early, or your ball note here says it reads early or burns. A logged long / skid says the opposite.
    const R = C.filter(c => c.shot && c.shot.ball === cur).slice(-6);
    const sawBurn = R.some(c => c.execution !== 'poor' && c.early) || C.slice(-6).some(c => c.shot && ['slowBurn', 'gaveUp', 'early'].includes(c.shot.why)) || !!(L.ruled && L.ruled[cur]);
    const sawSkid = R.some(c => c.execution !== 'poor' && c.long) || C.slice(-6).some(c => c.shot && c.shot.why === 'skid');
    const notes = out.notes = out.notes || [];
    if (!sawBurn || sawSkid) {
      notes.unshift(`🕯️ Possible slow burn with ${cur}: ${hits.join(', ')} on your last ${G.length} good pocket shots. The leaves are the alarm, not the answer: on the next good shot, watch it. Picked up early and straightened = burn (next: ${L.steps[0]}). Skidded long and turned late = it needs an earlier read instead.${sawSkid ? ' You logged it going long, so skid is the likelier read.' : ''}`);
      return;
    }
    notes.unshift(`🕯️ Slow burn with ${cur}: ${hits.join(', ')} on your last ${G.length} good pocket shots, and you saw it read early. Next: ${L.steps[0]}${L.steps[1] ? `; then ${L.steps[1]}` : ''}.${L.avoid.length ? ` Not ${L.avoid.join('; ')}.` : ''}`);
    out.slowBurn = true;
    // Light hits from slow burn look like "holding / going long". Don't send the bowler toward more friction for it.
    if (out.situation === 'late' || out.situation === 'carryWeak' || /holding|going long/i.test(String(out.headline || ''))) {
      out.headline = `🕯️ Slow burn, not a holding lane: you saw it read early, and the light hits are the ball running out of energy. Don't move toward the friction. Next: ${L.steps[0]}.`;
      out.situation = 'slowBurn'; out.tone = 'warn';
      if (Array.isArray(out.ways)) out.ways = out.ways.filter(w => !/toward the friction|feet \d+ boards? (right|left) and your eyes \d+ (right|left) \(toward/i.test(JSON.stringify(w)));
    }
  }

  // ---------- 🎯 Lane motion + short pin: short pins (low flare = control) play when the lane gives a downlane motion ----------
  // Read from the opening ball's good shots: strong / turning hard / high without an early read = downlane motion;
  // early read, hooked early, gave up, slow burn = the fronts are reading (no short pin); logged too long = it isn't moving at all.
  function ballRowMap() { const m = new Map(); try { const c = BT.lsGet(BT.KEYS.CSV_CACHE, null); BT.withCustomBalls((c && c.rows) || []).forEach(r => { const n = String(BT.ballName(r) || '').trim(); if (n) m.set(n, r); }); } catch (_e) {} return m; }
  // Your own "SP" naming counts too (e.g. Physix Blackout SP), along with a measured short pin-to-PAP.
  function isShortPinBall(name, row) { if (/\bSP\d*\b/.test(String(name || ''))) return true; try { return !!row && BT.layoutTypeFromRow(row) === 'short'; } catch (_e) { return false; } }
  function laneMotion(C) {
    const first = C.find(c => c.shot && c.shot.ball); if (!first) return null;
    const ball = first.shot.ball;
    const G = C.filter(c => c.shot && c.shot.ball === ball && c.execution !== 'poor').slice(0, 6);
    if (G.length < 3) return { kind: '', n: G.length, ball };
    const whyNext = (c) => { const i = C.indexOf(c); const nx = C[i + 1]; return nx && nx.shot ? nx.shot.why : ''; };
    let down = 0, early = 0, long = 0;
    G.forEach(c => { const w = whyNext(c);
      if (c.early || ['early', 'gaveUp', 'slowBurn'].includes(w)) early++;
      else if (c.long || w === 'skid') long++;
      else if ((!c.strike && (c.finish === 'strong' || c.lean > 0)) || (c.shot.leaveTag === 'Ringing 10') || w === 'sharp') down++; });
    const kind = down >= 2 && down > early + long ? 'down' : early >= 2 && early > down ? 'early' : long >= 2 && long > down ? 'long' : '';
    return { kind, down, early, long, n: G.length, ball };
  }
  // 🏆 Moving pairs: how each ball moved on each pair (game) so far. What carries from pair to pair is the ball's motion, not your line.
  function pairMotions(shots, bowler) {
    const prof = bowlerProfile(bowler), C = (shots || []).filter(x => x && x.type !== 'gameStart' && !(Number(x.shotNo) >= 2)).slice().sort((a, b) => (a.at || 0) - (b.at || 0)).map(s => classify(s, prof.lefty));
    const byBall = {};
    [...new Set(C.map(c => Number(c.shot.gameNo) || 1))].forEach(g => { const G = C.filter(c => (Number(c.shot.gameNo) || 1) === g);
      [...new Set(G.map(c => c.shot.ball).filter(Boolean))].forEach(b => { const m = laneMotion(G.filter(c => c.shot.ball === b)); if (!m || !m.kind) return;
        (byBall[b] = byBall[b] || []).push({ g, pair: G[0].shot.lanes || '', kind: m.kind }); }); });
    return Object.entries(byBall).map(([ball, L]) => { const k = {}; L.forEach(o => { k[o.kind] = (k[o.kind] || 0) + 1; }); const top = Object.entries(k).sort((a, z) => z[1] - a[1])[0];
      return { ball, n: L.length, kind: top[0], count: top[1], text: `${ball}: ${MOTION_TXT[top[0]]} on ${top[1]} of ${L.length} pair${L.length === 1 ? '' : 's'}` }; }).sort((a, z) => z.n - a.n);
  }
  const MOTION_TXT = { down: 'downlane motion', early: 'fronts reading early', long: 'ball going long' };
  // One night: lane motion + how short-pin balls did vs the rest (first balls only).
  function shortPinNight(S, bowler, rows) {
    const prof = bowlerProfile(bowler), R = rows || ballRowMap();
    const shots = ((S && S.shots) || []).filter(x => x && x.type !== 'gameStart').slice().sort((a, b) => (a.at || 0) - (b.at || 0));
    const C = shots.map(s => classify(s, prof.lefty));
    const lm = laneMotion(C);
    const agg = (A) => { const n = A.length, x = A.filter(c => c.strike).length, pk = A.filter(c => c.pocketHit || c.strike).length; return { n, x, pk, rate: n ? x / n : 0 }; };
    const sp = C.filter(c => c.shot && isShortPinBall(c.shot.ball, R.get(c.shot.ball))), ot = C.filter(c => c.shot && c.shot.ball && !isShortPinBall(c.shot.ball, R.get(c.shot.ball)));
    const a = agg(sp), b = agg(ot);
    return { motion: lm ? lm.kind : '', lm, sp: a, other: b, spBalls: [...new Set(sp.map(c => c.shot.ball))], worked: a.n >= 4 ? (b.n >= 4 ? a.rate > b.rate : a.rate >= 0.4) : (a.n >= 1 && b.n >= 4 && sp.length && C.indexOf(sp[sp.length - 1]) < C.length - 1 ? false : null), dropped: a.n >= 1 && a.n <= 3 && b.n >= 4 };
    // worked = beat your other balls that night (40%+ only when nothing else was thrown); dropped after 1–3 shots = didn't.
  }
  // 🔀 Over/under → the smoother, more predictable ball in tonight's bag (Barnes chart: smooth over sharp, then closest in strength).
  function smootherPick(current, names, bowler) {
    try { if (!root.BTChart || !root.BTChart.place) return null; const R = ballRowMap(), b = bowlerProfile(bowler || {});
      const pl = (n) => { const r = R.get(n); if (!r) return null; try { const p = root.BTChart.place([r], bowler || {})[0]; return p ? { n, key: String(p.rowKey || ''), x: Number(p.x), label: root.BTChart.label(p.rowKey) } : null; } catch (_e) { return null; } };
      const cur = pl(current), cand = (names || []).filter(n => n && n !== current && !(BT.isRetired && BT.isRetired(n))).map(pl).filter(Boolean);
      if (!cand.length) return null;
      const sm = (o) => /SMOOTH|URETHANE/.test(o.key) ? 1 : 0;
      cand.sort((a, z) => (sm(z) - sm(a)) || (cur && Number.isFinite(cur.x) ? Math.abs(a.x - cur.x) - Math.abs(z.x - cur.x) : 0));
      const best = cand[0]; if (!sm(best) && cur && sm(cur)) return null; return best;
    } catch (_e) { return null; }
  }
  // 🔁 Your ball switches, all houses: from X to Y, did the next shots beat the last ones? Dropping Y after 1–2 shots counts as didn't.
  function switchRecord(sessions, bowler) {
    const prof = bowlerProfile(bowler), rec = {};
    (sessions || []).forEach(S => {
      const C = ((S && S.shots) || []).filter(x => x && x.type !== 'gameStart' && x.ball && !(Number(x.shotNo) >= 2)).slice().sort((a, b) => (a.at || 0) - (b.at || 0)).map(s => classify(s, prof.lefty));
      const house = String((S && S.house) || '?').replace(/\s+lanes?$/i, '');
      for (let i = 1; i < C.length; i++) {
        const A = C[i - 1].shot.ball, B = C[i].shot.ball; if (A === B) continue;
        let j = i; while (j < C.length && C[j].shot.ball === B) j++;
        const before = C.slice(Math.max(0, i - 5), i).filter(c => c.shot.ball === A), after = C.slice(i, Math.min(j, i + 5));
        if (before.length < 2) continue;
        const rate = (a) => a.length ? a.filter(c => c.strike).length / a.length : 0, pk = (a) => a.length ? a.filter(c => c.strike || c.pocketHit).length / a.length : 0;
        const dropped = after.length <= 2 && j < C.length;
        if (after.length < 3 && !dropped) continue;
        const ok = !dropped && (rate(after) > rate(before) || (rate(after) === rate(before) && pk(after) > pk(before)));
        const k = `${A}→${B}`, o = rec[k] = rec[k] || { from: A, to: B, n: 0, ok: 0, houses: {} };
        o.n++; if (ok) o.ok++; const h = o.houses[house] = o.houses[house] || { n: 0, ok: 0 }; h.n++; if (ok) h.ok++;
      }
    });
    return Object.values(rec).sort((a, z) => z.n - a.n || z.ok - a.ok);
  }
  function switchLine(o) {
    const H = Object.entries(o.houses), good = H.filter(([, h]) => h.ok * 2 >= h.n && h.ok).map(([k]) => k), bad = H.filter(([, h]) => !h.ok).map(([k]) => k);
    return `${o.from} → ${o.to}: helped ${o.ok} of ${o.n}${good.length ? ` (${good.join(', ')}${bad.length ? `; not ${bad.join(', ')}` : ''})` : bad.length ? ` (not ${bad.join(', ')})` : ''}`;
  }
  function shortPinRecord(sessions, bowler) {
    const R = ballRowMap(), out = { down: { ok: 0, n: 0 }, early: { ok: 0, n: 0 }, long: { ok: 0, n: 0 }, '': { ok: 0, n: 0 } };
    (sessions || []).forEach(S => { const r = shortPinNight(S, bowler, R); if (r.worked == null) return; const o = out[r.motion || '']; o.n++; if (r.worked) o.ok++; });
    return out;
  }
  function shortPinRecordText(rec) {
    const p = [];
    if (rec.down.n) p.push(`when the lane gave a downlane motion, short pin worked ${rec.down.ok} of ${rec.down.n} night${rec.down.n === 1 ? '' : 's'}`);
    if (rec.early.n) p.push(`when the fronts read early: ${rec.early.ok} of ${rec.early.n}`);
    if (rec.long.n) p.push(`when the ball went long: ${rec.long.ok} of ${rec.long.n}`);
    if (rec[''].n) p.push(`motion not clear yet: ${rec[''].ok} of ${rec[''].n}`);
    return p.length ? `${p.join('; ')} (worked = more strikes than your other balls that night; dropped after 1–3 shots counts as didn't).`.replace(/^w/, 'W') : '';
  }

  // 🏆 League vs tournament (from the league name): fresh tournament shots are where your short pins have won.
  const isTourn = (lg) => /tourn|doubles|open|championship|polish|singles|scratch|sweeper|classic|qualif/i.test(String(lg || ''));
  // From your imported PinPal history: short pin vs other first-ball strike % by house and league / tournament.
  function shortPinHistory() {
    let H = null; try { H = JSON.parse(localStorage.getItem('bt_history_v1') || 'null'); } catch (_e) {}
    if (!H || !Array.isArray(H.games) || !Array.isArray(H.balls)) return null;
    const R = ballRowMap(), out = {}, add = (k, t, x) => { const o = out[k] = out[k] || { sp: [0, 0], ot: [0, 0] }; o[t][0] += x; o[t][1]++; };
    H.games.forEach(g => { if (!g || g.done === false) return; const kind = isTourn(g.lg) ? 'tourn' : 'league';
      (g.f || []).forEach(f => { if (!f || f[0] > 10) return; const bi = f[1] >= 0 ? f[1] : g.b; const b = H.balls[bi]; if (!b) return;
        const t = isShortPinBall(b, R.get(b)) ? 'sp' : 'ot', x = f[2] === 10 ? 1 : 0;
        add(`${g.h}|${kind}`, t, x); add(`*|${kind}`, t, x); }); });
    return out;
  }
  function shortPinHistoryLines(house) {
    const S = shortPinHistory(); if (!S) return [];
    const pc = (a) => a[1] ? Math.round(a[0] / a[1] * 100) : null;
    const line = (k, label) => { const o = S[k]; if (!o || o.sp[1] < 15) return ''; const a = pc(o.sp), b = pc(o.ot);
      const v = b == null ? '' : a - b >= 4 ? ' → short pin wins' : b - a >= 4 ? ' → short pin trails' : ' → even';
      return `${label}: short pin ${a}% (${o.sp[1]} shots) vs ${b == null ? '–' : b + '%'} (${o.ot[1]})${v}`; };
    return [house ? line(`${house}|tourn`, 'Tournaments here') : '', house ? line(`${house}|league`, 'League here') : '', line('*|tourn', 'All tournaments'), line('*|league', 'All leagues')].filter(Boolean);
  }
  function motionNote(out, C, ctx) {
    const lm = laneMotion(C); if (!lm || !lm.kind) return;
    if (C.length > 14) return; // early in the night only: this is the opening read
    const R = ballRowMap(), bag = (ctx.setBalls || []).filter(b => b && b.name), cur = ctx.currentBall || '';
    const sps = bag.filter(b => isShortPinBall(b.name, b.row || R.get(b.name)) && !(typeof BT !== 'undefined' && BT.isSpareBall && b.row && BT.isSpareBall(b.row))).map(b => b.name);
    const curSP = isShortPinBall(cur, R.get(cur));
    let rec = ''; try { const sess = BT.lsGet(BT.KEYS.GAME_SESSIONS, []) || []; const h = ctx.house ? sess.filter(s => s && s.house === ctx.house) : []; const r = shortPinRecord(h, ctx.bowler)[lm.kind]; if (r && r.n) rec = ` Here before, on a night like this: short pin worked ${r.ok} of ${r.n}.`; } catch (_e) {}
    try { const H = shortPinHistory(); const k = isTourn(ctx.league) ? 'tourn' : 'league'; const o = H && ctx.house && H[`${ctx.house}|${k}`];
      if (o && o.sp[1] >= 15 && o.ot[1]) rec += ` Your ${k === 'tourn' ? 'tournament' : 'league'} history here: short pin ${Math.round(o.sp[0] / o.sp[1] * 100)}% vs ${Math.round(o.ot[0] / o.ot[1] * 100)}% with the rest.`; } catch (_e) {}
    const notes = out.notes = out.notes || [];
    if (lm.kind === 'down') notes.push(curSP ? `🎯 Downlane motion (${lm.down} of ${lm.n} good shots strong / turning hard with ${lm.ball}): a short-pin look, and you're on one. It should keep you in play.${rec}` : sps.length ? `🎯 Downlane motion (${lm.down} of ${lm.n} good shots strong / turning hard with ${lm.ball}): a short-pin look. ${sps[0]} fits: low flare tames the backend.${rec}` : `🎯 Downlane motion with ${lm.ball}: a short-pin look, but there's no short pin in tonight's bag.${rec}`);
    else if (lm.kind === 'early') notes.push(`🎯 Fronts reading early (${lm.early} of ${lm.n} good shots with ${lm.ball}): not a short-pin night. A short pin reads early and has nothing to come back with; go cleaner with more flare instead.${rec}`);
  }
  root.BTCoach = { classifyShot: (s, bowler) => classify(s, bowlerProfile(bowler || (typeof BT !== 'undefined' ? BT.lsGet(BT.KEYS.BOWLER, {}) : {})).lefty), isTourn, shortPinHistory, shortPinHistoryLines, laneMotion: (shots, bowler) => laneMotion((shots || []).filter(x => x && x.type !== 'gameStart').map(s => classify(s, bowlerProfile(bowler).lefty))), isShortPinBall, shortPinNight, shortPinRecord, switchRecord, switchLine, smootherPick, pairMotions, shortPinRecordText, MOTION_TXT, burnSign, burnLadder, BALL_NOTE, ballNoteText, ballNoteCheck, WHY, whyLabel, whyReview: (shots, bowler) => whyReview((shots || []).filter(x => x && x.type !== 'gameStart').map(s => classify(s, bowlerProfile(bowler).lefty))), whyLearn, whyLearnText, setFaultLabel, hiddenFaults, hideFault, unhideFault, energyAngle, noteTags, noteMix, repeatability, repeatByGame, FAULTS, allFaults, myFaults, setMyFaults, faultLabel, faultRead, faultSummary, faultLines, moveSummary, lineCheck: (o) => lineMath(o.feet, o.arrows, patternProfile(o.pattern), bowlerProfile(o.bowler), o.phase, o.bp, o.bp0, o.targetFt), lineText, evaluate, eyeballScore, elementsProfile, elementsReport, arsenalCheck, ballGames, _internals: { timingNeed, bagTiming, classify, leaveMeaning, bowlerProfile, patternProfile, rankMoves, parseRatio } };
})(typeof window !== 'undefined' ? window : globalThis);
