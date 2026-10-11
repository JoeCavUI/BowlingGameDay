/* Bowling Tool - shared app.js (no modules)
   - One stable CSV loader used everywhere
   - Standardized localStorage keys
   - Small UI helpers
*/

(function () {
  // Bump this string each build so pages can display it and cache-bust resources.
  const APP_VERSION = 'v71-beta8';
  const KEYS = {
    CSV_CACHE: 'bt_csv_cache_v1',          // stringified { savedAt, name, rows }
    BOWLER: 'bt_bowler_v1',               // stringified object
    OIL_PATTERNS: 'bt_oil_patterns_v1',   // stringified array
    HOUSES: 'bt_houses_v1',               // stringified array
    ARSENAL_SETS: 'bt_arsenal_sets_v1',   // stringified array
    LEAGUES: 'bt_leagues_v1',             // stringified array
    GAME_SESSIONS: 'bt_game_sessions_v1', // stringified array
    BALL_TWEAKS: 'bt_ball_tweaks_v1',      // stringified { [ballName]: { hook, length, backend } } where values are ints -10..+10
  };


  // Bundled fallback CSV (works even when opening via file:// where fetch is blocked)
  const DEFAULT_DATABALLS_CSV = `#,Brand,Ball Name,Pin Location,Cover,Core,VLS,PAP,PSA,Val,Dual Angle,Drill Angle,PAP,Val,Total Angle,Specs,RG,Diff,PSA,Surface
1,900 Global,Reality Check #1,Up,Hybrid,Asym,,3.75,4.5,1.5,,49,3.75,27,76,,2.49,0.052,0.018,4000
2,900 Global,Reality Check #2,Up,Hybrid,Asym,,4.25,6.25,1.125,,82,4.25,18,100,,2.49,0.052,0.018,4000
3,Motiv,Venom Blue Coral,Up,Hybrid,Asym,,4.5,3.75,2.625,,42,4.5,41,83,,2.47,0.036,0.013,4000
4,Storm,Absolute,Up,Hybrid,Asym,,4.25,5.375,2.125,,68,4.25,35,103,,2.48,0.05,0.021,4000
5,Brunswick,Crown Victory,Up,Hybrid,Sym,,4.812,N/A,2.75,,75,4.812,42,117,,2.54,0.045,N/A,Compound
6,Storm,HyRoad #1,Up,Hybrid,Sym,,5.125,N/A,3,,76,5.125,44,120,,2.57,0.046,N/A,3000
7,Storm,HyRoad #2,Up,Hybrid,Sym,,5.125,N/A,3.25,,76,5.125,48,124,,2.57,0.046,N/A,4000
8,Storm,All Road,Up,Hybrid,Sym,,4.25,N/A,2.5,,74,4.25,41,115,,2.57,0.046,N/A,4000
9,Storm,All Road SP,Short,Hybrid,Sym,,1.937,N/A,1.875,,58,1.937,76,134,,2.57,0.046,N/A,4000
10,Storm,Code Black,Up,Pearl,Asym,,3.625,4.25,1.375,,43,3.625,25,68,,2.5,0.058,0.02,Compound
11,Storm,Dark Code,Up,Pearl,Asym,,4.437,4,2.375,,46,4.437,38,84,,2.5,0.058,0.02,1500 Polish
12,Storm,Infinite Physix,Up,Pearl,Asym,,2.375,5.25,1.25,,49,2.375,33,82,,2.48,0.053,0.017,4000
13,Storm,Equinox,Up,Pearl,Asym,,5,4,3,,49,5,44,93,,2.48,0.054,0.018,4000
14,Storm,DNA Coil,Up,Pearl,Asym,,5,4,2,,49,5,29,78,,2.47,0.053,0.023,4000
15,Storm,Physix Blackout,Short,Pearl,Asym,,2.25,6,1.25,,70,2.25,35,105,,2.47,0.055,0.018,4000
16,Storm,Vitual Energy Blackout,Up,Pearl,Asym,,4,4,3,,42,4,53,95,,2.48,0.052,0.02,4000
17,Roto Grip,Gremlin,Up,Pearl,Asym,,4.5,4,2.75,,46,4.5,44,90,,2.5,0.058,0.01,Polish
18,Storm,Next Factor,Up,Pearl,Asym,,5,4,2.687,,49,5,40,89,,2.56,0.051,0.017,Polish
19,Roto Grip,Exotic Gem #1,Up,Pearl,Asym,,3.75,4.5,1.625,,49,3.75,29,78,,2.47,0.053,0.016,Polish
20,Roto Grip,Exotic Gem #2,Down,Pearl,Asym,,3.687,6,3.5,,77,3.687,74,151,,2.47,0.053,0.016,Polish
21,Motiv,Evoke Hysteria,Up,Pearl,Asym,,5.75,5.25,3.5,,69,5.75,48,117,,2.48,0.05,0.015,4000
22,900 Global,Zen Gold Label,Up,Pearl,Sym,,5,N/A,2,,75,5,29,104,,2.49,0.051,N/A,Polish
23,Storm,Typhoon,Up,Pearl,Sym,,5,N/A,4,,75,5,61,136,,2.53,0.042,N/A,Polish
24,900 Global,Zen 25,Up,Pearl,Sym,,5,N/A,2.5,,75,5,37,112,,2.48,0.053,N/A,4000
25,900 Global,Ember,Up,Pearl,Sym,,5.25,N/A,1.75,,76,5.25,25,101,,2.49,0.044,N/A,Polish
26,Storm,HyRoad 40,Short,Pearl,Sym,,2.25,N/A,2.25,,63,2.25,90,153,,2.57,0.046,N/A,Polish
27,Storm,Ion Pro,Down,Solid,Asym,,4.5,4,4,,46,4.5,68,114,,2.47,0.035,0.014,5000
28,900 Global,Zen Master #1,Up,Solid,Sym,,3.625,N/A,1.312,,72,3.625,24,96,,2.49,0.051,N/A,4000
29,900 Global,Zen Master #2,Up,Solid,Sym,,5.125,N/A,2.25,,76,5.125,33,109,,2.49,0.051,N/A,4000
30,Storm,Phaze 2,Up,Solid,Sym,,5,N/A,2.375,,75,5,35,110,,2.48,0.051,N/A,4000
31,Storm,Level,Up,Solid,Sym,,4.75,N/A,2.75,,75,4.75,42,117,,2.59,0.027,N/A,4000
32,Motiv,Venom Shock #1,Up,Solid,Sym,,4.875,N/A,2.875,,75,4.875,43,118,,2.48,0.034,N/A,4000
33,Motiv,Venom Shock #2,Up,Solid,Sym,,5.25,N/A,3,,76,5.25,43,119,,2.48,0.034,N/A,4000
34,Roto Grip,Hustle Camo,Up,Solid,Sym,,4.5,N/A,2.5,,75,4.5,39,114,,2.53,0.03,N/A,4000
35,Storm,ProMotion,Up,Solid,Sym,,4.75,N/A,2.75,,75,4.75,42,117,,2.52,0.049,N/A,4000
`;

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $all(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function safeParse(json, fallback) {
    try {
      const v = JSON.parse(json);
      return v ?? fallback;
    } catch (_e) {
      return fallback;
    }
  }

  function lsGet(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return safeParse(raw, fallback);
  }

  function lsSet(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function lsMergeObject(key, patchObj) {
    const cur = lsGet(key, {});
    const next = Object.assign({}, (cur && typeof cur === 'object') ? cur : {}, patchObj || {});
    lsSet(key, next);
    return next;
  }

  
  // --- League helpers ---
  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now().toString(36);
  }

  function getLeagues() {
    const arr = lsGet(KEYS.LEAGUES, []);
    return Array.isArray(arr) ? arr : [];
  }

  function addLeague(name, houseId) {
    const nm = String(name || '').trim();
    if (!nm) return null;
    const leagues = getLeagues();
    const exists = leagues.find(l => String(l.name || '').toLowerCase() === nm.toLowerCase() && String(l.houseId||'')===String(houseId||''));
    if (exists) return exists;
    const obj = { id: uid('lg'), name: nm, houseId: houseId || '' , createdAt: Date.now() };
    leagues.unshift(obj);
    lsSet(KEYS.LEAGUES, leagues);
    return obj;
  }

  function getLeagueById(id) {
    const leagues = getLeagues();
    return leagues.find(l => String(l.id) === String(id)) || null;
  }

// --- CSV parsing (quoted fields supported) ---
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (ch === '"' && next === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          row.push(cur);
          cur = '';
        } else if (ch === '\n') {
          row.push(cur);
          cur = '';
          if (row.some(c => String(c).trim() !== '')) rows.push(row);
          row = [];
        } else if (ch === '\r') {
          // ignore
        } else {
          cur += ch;
        }
      }
    }

    row.push(cur);
    if (row.some(c => String(c).trim() !== '')) rows.push(row);
    if (rows.length < 2) return [];

    const header = rows[0].map(h => String(h || '').trim());
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const obj = {};
      for (let c = 0; c < header.length; c++) {
        const k = header[c] || `col_${c}`;
        obj[k] = rows[r][c] ?? '';
      }
      out.push(obj);
    }
    return out;
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => reject(fr.error || new Error('Failed to read file'));
      fr.readAsText(file);
    });
  }

  async function loadCSVFromUpload(file) {
    const text = await readFileAsText(file);
    const rows = parseCSV(text);
    const payload = {
      savedAt: Date.now(),
      name: file.name,
      rows
    };
    lsSet(KEYS.CSV_CACHE, payload);
    return payload;
  }

  async function loadCSVFromFetch(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
    const text = await res.text();
    const rows = parseCSV(text);
    const payload = {
      savedAt: Date.now(),
      name: url,
      rows
    };
    lsSet(KEYS.CSV_CACHE, payload);
    return payload;
  }

  // Balls added by hand on the Arsenal page ("Save to Arsenal").
  const CUSTOM_BALLS_KEY = 'bt_custom_balls_v1';
  function customBalls() {
    const v = lsGet(CUSTOM_BALLS_KEY, []);
    return Array.isArray(v) ? v : [];
  }
  function withCustomBalls(rows) {
    const base = (Array.isArray(rows) ? rows : []).filter(r => !(r && r.__custom));
    const names = new Set(base.map(r => ballName(r).toLowerCase()));
    const extra = customBalls().filter(r => r && !names.has(ballName(r).toLowerCase()));
    return base.concat(extra);
  }

  // Returns the CSV payload with hand-added balls appended (custom balls are never written into the CSV cache).
  async function ensureCSVLoaded() {
    const p = await ensureCSVLoadedRaw();
    const rows = withCustomBalls(p && Array.isArray(p.rows) ? p.rows : []);
    if (!p && !rows.length) return null;
    return Object.assign({}, p || { name: 'my balls', savedAt: Date.now() }, { rows });
  }

  // Try cache first; if empty, try fetching local databalls.csv
  async function ensureCSVLoadedRaw() {
    const cached = lsGet(KEYS.CSV_CACHE, null);
    if (cached && Array.isArray(cached.rows) && cached.rows.length) return cached;
    // Try fetch first (works when served over http(s)).
    try {
      return await loadCSVFromFetch('databalls.csv');
    } catch (e) {
      // Fallback to bundled CSV for file:// usage.
      try {
        if (DEFAULT_DATABALLS_CSV && DEFAULT_DATABALLS_CSV.trim().length) {
          const rows = parseCSV(DEFAULT_DATABALLS_CSV);
          const p = { savedAt: Date.now(), name: 'databalls.csv (bundled)', rows };
          lsSet(KEYS.CSV_CACHE, p);
          return p;
        }
      } catch (_e2) {}
      return null;
    }
  }

  // --- Data helpers ---
  function normKey(s) {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
  }

  function toNum(v) {
    const n = Number(String(v ?? '').trim().replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }

  function getField(row, names, fallback = '') {
    const keys = Object.keys(row);
    const map = new Map(keys.map(k => [normKey(k), k]));
    for (const n of names) {
      const hit = map.get(normKey(n));
      if (hit) return row[hit];
    }
    return fallback;
  }

  function asNum(v) {
    const n = Number(String(v ?? '').trim());
    return Number.isFinite(n) ? n : NaN;
  }

  // Accepts: "4 1/2 over, 1/2 up" / "4.5 over 0.5 up" / "4.5 x 0.5".
  // Returns inches; over/right = +x, left = -x, up = +y, down = -y.
  function parsePAP(papStr) {
    const s = String(papStr || '').toLowerCase();
    if (!s.trim()) return { x: NaN, y: NaN };

    // Convert common fractions to decimals
    const fracMap = {
      '1/8': 0.125, '1/4': 0.25, '3/8': 0.375, '1/2': 0.5,
      '5/8': 0.625, '3/4': 0.75, '7/8': 0.875
    };

    function parseMixedNumber(token) {
      const t = String(token || '').trim();
      if (!t) return NaN;
      if (fracMap[t] != null) return fracMap[t];
      const m = t.match(/^(\d+)\s+(\d\/\d)$/);
      if (m && fracMap[m[2]] != null) return Number(m[1]) + fracMap[m[2]];
      const n = toNum(t);
      return Number.isFinite(n) ? n : NaN;
    }

    const parts = s.split(/[,;]/).map(x => x.trim()).filter(Boolean);
    let x = NaN, y = NaN;

    function parseAxis(chunk, axis) {
      const m = chunk.match(/(\d+(?:\.\d+)?(?:\s+\d\/\d)?|\d\/\d)/);
      const val = m ? parseMixedNumber(m[1]) : NaN;
      if (!Number.isFinite(val)) return NaN;
      if (axis === 'x') {
        if (chunk.includes('left')) return -val;
        return val; // over/right
      }
      if (chunk.includes('down')) return -val;
      return val; // up
    }

    for (const p of parts) {
      if (p.includes('over') || p.includes('right') || p.includes('left')) x = parseAxis(p, 'x');
      if (p.includes('up') || p.includes('down')) y = parseAxis(p, 'y');
    }

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      const mx = s.match(/(\d+(?:\.\d+)?(?:\s+\d\/\d)?|\d\/\d)\s*(?:x|\*)\s*(\d+(?:\.\d+)?(?:\s+\d\/\d)?|\d\/\d)/);
      if (mx) {
        x = Number.isFinite(x) ? x : parseMixedNumber(mx[1]);
        y = Number.isFinite(y) ? y : parseMixedNumber(mx[2]);
      }
    }

    return { x, y };
  }

  function clamp(x, a, b) {
    const n = Number(x);
    if (!Number.isFinite(n)) return a;
    return Math.max(a, Math.min(b, n));
  }

  function norm(v, a, b, fallback = 0.5) {
    if (!Number.isFinite(v)) return fallback;
    return clamp((v - a) / (b - a), 0, 1);
  }

  // Surface field can be: "4000", "1500 Polish", "Polish", "Compound", "5000".
  // Returns representative grit number.
  function surfaceToGrit(surfaceStr) {
    const s = String(surfaceStr || '').toLowerCase();
    const m = s.match(/(\d{3,4})/);
    // "1500 Polish" = sanded to 1500 then polished: it rolls like a polished ball, not a 1500 sanded one.
    if (s.includes('polish')) return m ? Math.max(5000, Number(m[1]) + 3500) : 5500;
    if (m) return Number(m[1]);
    if (s.includes('compound')) return 4500;
    return 4000;
  }

  function coverDeltas(coverStr) {
    const c = String(coverStr || '').toLowerCase();
    if (c.includes('solid')) return { s: +0.25, l: -0.25, b: -0.10 };
    if (c.includes('hybrid')) return { s: +0.10, l: -0.10, b: +0.00 };
    if (c.includes('pearl')) return { s: -0.05, l: +0.25, b: +0.25 };
    if (c.includes('urethane')) return { s: +0.05, l: -0.05, b: -0.15 };
    if (c.includes('plastic') || c.includes('poly')) return { s: -0.25, l: +0.35, b: +0.05 };
    return { s: 0, l: 0, b: 0 };
  }

  // --- Per-ball perception tweaks (user sliders) ---
  // Stored as ints -10..+10 for hook/length/backend.
  // Converted to model deltas with a small scale so tweaks nudge, not replace, the math.
  const TWEAK_SCALE = 0.015; // 10 clicks => +/-0.15 in the 0..1 motion space

  function ballTweaksAll() {
    const v = lsGet(KEYS.BALL_TWEAKS, {});
    return (v && typeof v === 'object') ? v : {};
  }

  function ballTweaksFor(ballNameStr) {
    const nm = String(ballNameStr || '').trim();
    if (!nm) return { hook: 0, length: 0, backend: 0, surfaceOverride: '' };
    const all = ballTweaksAll();
    const t = all[nm];
    if (!t || typeof t !== 'object') return { hook: 0, length: 0, backend: 0, surfaceOverride: '' };
    const hook = Number(t.hook);
    const length = Number(t.length);
    const backend = Number(t.backend);
    return {
      hook: Number.isFinite(hook) ? clamp(hook, -10, 10) : 0,
      length: Number.isFinite(length) ? clamp(length, -10, 10) : 0,
      backend: Number.isFinite(backend) ? clamp(backend, -10, 10) : 0,
      surfaceOverride: String(t.surfaceOverride || '').trim(),
    };
  }

  function setBallTweaks(ballNameStr, tweaks) {
    const nm = String(ballNameStr || '').trim();
    if (!nm) return;
    const existing = ballTweaksFor(nm);
    const next = {
      [nm]: {
        hook: Number.isFinite(Number(tweaks?.hook)) ? clamp(Number(tweaks.hook), -10, 10) : existing.hook,
        length: Number.isFinite(Number(tweaks?.length)) ? clamp(Number(tweaks.length), -10, 10) : existing.length,
        backend: Number.isFinite(Number(tweaks?.backend)) ? clamp(Number(tweaks.backend), -10, 10) : existing.backend,
        surfaceOverride: (tweaks && Object.prototype.hasOwnProperty.call(tweaks, 'surfaceOverride')) ? String(tweaks.surfaceOverride || '').trim() : existing.surfaceOverride,
      }
    };
    lsMergeObject(KEYS.BALL_TWEAKS, next);
  }

  function clearBallTweaks(ballNameStr) {
    const nm = String(ballNameStr || '').trim();
    if (!nm) return;
    const all = ballTweaksAll();
    delete all[nm];
    lsSet(KEYS.BALL_TWEAKS, all);
  }


  function setBallSurfaceOverride(ballNameStr, surfaceStr) {
    const nm = String(ballNameStr || '').trim();
    if (!nm) return;
    const existing = ballTweaksFor(nm);
    setBallTweaks(nm, { hook: existing.hook, length: existing.length, backend: existing.backend, surfaceOverride: String(surfaceStr || '').trim() });
  }

  function clearBallSurfaceOverride(ballNameStr) {
    const nm = String(ballNameStr || '').trim();
    if (!nm) return;
    const existing = ballTweaksFor(nm);
    setBallTweaks(nm, { hook: existing.hook, length: existing.length, backend: existing.backend, surfaceOverride: '' });
  }

  // Convert foul-line speed to an estimated speed at the pins.
  // Rule of thumb: ball loses ~15–20% speed from foul line to pins.
  // We use 15% by default.
  function speedAtPinsFromFoulLine(mphAtLine) {
    const mph = Number(mphAtLine);
    if (!Number.isFinite(mph)) return null;
    return Math.max(0, mph * 0.85);
  }

  // Bowler type derived from mph and rpm when available.
  // Uses a simple ratio: higher mph per rev = speed dominant.
  function bowlerType(bowler) {
    // Prefer foul-line speed if provided; fall back to legacy `mph`.
    const mph = Number(bowler?.mphLine ?? bowler?.mph);
    const rpm = Number(bowler?.rpm);
    if (!Number.isFinite(mph) || !Number.isFinite(rpm) || rpm <= 0) return 'matched';
    const ratio = mph / (rpm / 100); // mph per 100 rpm
    if (ratio >= 5.2) return 'speed';
    if (ratio <= 4.3) return 'rev';
    return 'matched';
  }

  // Continuous bowler dynamics used by the motion model.
  // Returns a scalar in [-1, +1] where:
  //   -1 = strongly speed-dominant
  //    0 = matched
  //   +1 = strongly rev-dominant
  // Also returns normalized speed and rev components for small additional shaping.
  function bowlerDynamics(bowler) {
    const mph = Number(bowler?.mphLine ?? bowler?.mph);
    const rpm = Number(bowler?.rpm);
    if (!Number.isFinite(mph) || !Number.isFinite(rpm) || rpm <= 0) {
      return { dom: 0, speedN: 0, revN: 0 };
    }

    // Same ratio used by bowlerType(), but converted to a smooth dominance scalar.
    // Ratio is mph per 100 rpm. Typical "matched" range is ~4.3–5.2.
    const ratio = mph / (rpm / 100);
    const mid = 4.75;
    const halfRange = 0.45; // (5.2 - 4.3)/2
    const dom = clamp((mid - ratio) / halfRange, -1, 1);

    // Mild independent components so 1mph or 50rpm changes still matter
    // even if the dominance bucket wouldn't change.
    const speedN = clamp((mph - 18) / 4, -1, 1);   // 14–22 mph typical
    const revN = clamp((rpm - 375) / 175, -1, 1);  // 200–550 rpm typical
    return { dom, speedN, revN };
  }

  // Ball motion vector for THIS bowler (coaching model, not physics).
  // Returns { hook, length, backend } in [0,1].
  function motionVector(row, bowler) {
    const rg = ballRG(row);
    const diff = ballDiff(row);
    const psa = ballPSA(row);
    const cover = ballCover(row);
    const surface = ballSurface(row);

    // Layout fields live in the CSV too; use flexible header lookup.
    const drill = asNum(getField(row, ['Drill Angle', 'DrillAngle'], ''));
    const totalAngle = asNum(getField(row, ['Total Angle', 'TotalAngle'], ''));
    const val = ballVal(row);
    const pinToPAP = ballPAP(row); // in your CSV this is pin-to-PAP

    const diffN = norm(diff, 0.020, 0.060, 0.45);
    const psaN = norm(psa, 0.000, 0.020, 0.25);
    const rgN = norm(rg, 2.46, 2.60, 0.5);

    const grit = surfaceToGrit(surface);
    const rough = clamp((4000 - grit) / 3000, 0, 1); // 1000≈1, 4000≈0

    const pinN = norm(pinToPAP, 2.0, 6.0, 0.55);
    const valN = norm(val, 20, 70, 0.45);
    const drillN = norm(drill, 20, 90, 0.5);
    const taN = norm(totalAngle, 60, 150, 0.5);

    const coverInf = 1.0; // B level (20–30%) comes from the weight mix below
    const cd = coverDeltas(cover);

    const flareEff = diffN * (0.6 + 0.4 * (1 - pinN));
    const midFromLayout = (1 - taN) * 0.6 + (1 - pinN) * 0.4;
    const resp = (1 - valN) * 0.55 + (1 - drillN) * 0.45;

    // cd.* are roughly [-0.25..+0.25]. Convert to a small centered term.
    const coverStrengthTerm = cd.s * coverInf; // ~[-0.05..+0.25]
    const coverLengthTerm = cd.l * coverInf;
    const coverBackendTerm = cd.b * coverInf;

    let hook =
      0.34 * diffN +
      0.26 * rough +
      0.16 * psaN +
      0.14 * flareEff +
      0.10 * (0.5 + coverStrengthTerm);

    let length =
      0.32 * rgN +
      0.26 * (1 - rough) +
      0.18 * (0.5 + coverLengthTerm) +
      0.14 * (1 - midFromLayout) +
      0.10 * (1 - diffN);

    // Retuned backend: clean/polish + diff matter more for downlane response,
    // even when PSA is small. This better matches "medium sharp" polished pearls.
    let backend =
      0.28 * resp +
      0.22 * (1 - rough) +
      0.20 * diffN +
      0.16 * (0.5 + coverBackendTerm) +
      0.10 * psaN +
      0.04 * (1 - rgN);

    // Bowler dynamics adjustment (continuous, not bucketed)
    // This preserves the old endpoints:
    //  - speed-dominant: hook×0.92, length+0.08, backend+0.06
    //  - rev-dominant:   hook×1.08, length-0.08, backend-0.05
    // while allowing small speed/rev changes to matter between those extremes.
    const dyn = bowlerDynamics(bowler);
    hook *= 1 + 0.08 * dyn.dom;
    length += -0.08 * dyn.dom;
    backend += 0.005 - 0.055 * dyn.dom;

    // Additional mild continuous effects so "mph" and "rpm" aren’t only a ratio.
    // Faster speed = a little less hook, more length, slightly sharper response.
    hook += -0.03 * dyn.speedN;
    length += 0.04 * dyn.speedN;
    backend += 0.02 * dyn.speedN;

    // Higher revs = a little more hook, earlier read, slightly rounder response.
    hook += 0.04 * dyn.revN;
    length += -0.03 * dyn.revN;
    backend += -0.015 * dyn.revN;

    // Axis tilt & rotation adjustments (personalizes motion to the bowler's release)
    // - Higher tilt generally adds length and can reduce early read
    // - Higher rotation increases downlane response / "shape"
    // These are intentionally moderate (not a physics sim) but should be noticeable.
    const pap = parsePAP(bowler?.pap);
    const tilt = Number(bowler?.tilt);
    const rot = Number(bowler?.rotation);

    // Normalize to 0..1 using typical practical ranges.
    // Tilt: 0–30°, Rotation: 0–90°.
    const tiltN = Number.isFinite(tilt) ? clamp(tilt / 30, 0, 1) : 0.5;
    const rotN = Number.isFinite(rot) ? clamp(rot / 90, 0, 1) : 0.5;
    const papX = Number.isFinite(pap.x) ? norm(Math.abs(pap.x), 3.0, 6.0, 0.5) : 0.5;

    // Apply adjustments (centered at 0.5 = neutral).
    // Max effects (roughly): length ±0.06, backend ±0.075, hook ±0.04.
    length += (tiltN - 0.5) * 0.12 + (papX - 0.5) * 0.06;
    backend += (rotN - 0.5) * 0.15;
    hook += (0.5 - tiltN) * 0.08;

    // Apply user perception tweaks (nudges, not overrides)
    const tw = ballTweaksFor(ballName(row));
    hook += tw.hook * TWEAK_SCALE;
    length += tw.length * TWEAK_SCALE;
    backend += tw.backend * TWEAK_SCALE;

    // Base shape / asymmetry channels for overlap + role logic.
    let shape = clamp(
      0.42 * backend +
      0.18 * (1 - rough) +
      0.16 * resp +
      0.14 * (0.5 + coverBackendTerm) +
      0.10 * diffN,
      0,
      1
    );
    let asym = clamp(isAsymCore(row) ? (0.35 + 0.65 * psaN) : (0.10 + 0.20 * psaN), 0, 1);

    // Layout from CSV is the source of truth for drilled motion.
    const lm = layoutMotionMods(row);
    hook += lm.hook;
    length += lm.length;
    backend += lm.backend;
    shape += lm.shape;
    asym += lm.asym;

    return {
      hook: clamp(hook, 0, 1),
      length: clamp(length, 0, 1),
      backend: clamp(backend, 0, 1),
      shape: clamp(shape, 0, 1),
      asym: clamp(asym, 0, 1),
      layoutType: lm.kind,
    };
  }

  function motionDistance(a, b, weights = { hook: 1.1, length: 1.0, backend: 1.0, shape: 0.95, asym: 0.55 }) {
    const dh = (a.hook - b.hook) * (weights.hook ?? 1);
    const dl = (a.length - b.length) * (weights.length ?? 1);
    const db = (a.backend - b.backend) * (weights.backend ?? 1);
    const ds = ((a.shape ?? 0.5) - (b.shape ?? 0.5)) * (weights.shape ?? 0);
    const da = ((a.asym ?? 0.0) - (b.asym ?? 0.0)) * (weights.asym ?? 0);
    return Math.sqrt(dh * dh + dl * dl + db * db + ds * ds + da * da);
  }

  function matrixCellForRow(row) {
    const est = estimateStrengthShape(row);
    return {
      strength: strengthBucket(est.strength),
      shape: shapeBucket(est.shape),
      strengthScore: est.strength,
      shapeScore: est.shape,
      layoutType: est.layoutType,
    };
  }

  function roleAnchorForRole(role) {
    const id = String(role && role.id || '').toLowerCase();
    if (id === 'early') return { strength: 'STRONG', shape: 'SMOOTH' };
    if (id === 'benchmark') return { strength: 'MEDIUM', shape: 'SMOOTH' };
    if (id === 'corner') return { strength: 'STRONG', shape: 'SHARP' };
    if (id === 'clean') return { strength: 'MEDIUM', shape: 'SHARP' };
    if (id === 'burn') return { strength: 'WEAK', shape: 'SHARP' };
    if (id === 'blend') return { strength: 'WEAK', shape: 'SMOOTH' };
    return { strength: 'MEDIUM', shape: 'SMOOTH' };
  }

  function matrixStrengthIndex(v) {
    const s = String(v || '').toUpperCase();
    if (s === 'STRONG') return 2;
    if (s === 'MEDIUM') return 1;
    return 0;
  }

  function matrixShapeIndex(v) {
    return String(v || '').toUpperCase() === 'SHARP' ? 1 : 0;
  }

  function roleAnchorPenalty(role, row) {
    const cell = matrixCellForRow(row);
    const want = roleAnchorForRole(role);
    const ds = Math.abs(matrixStrengthIndex(cell.strength) - matrixStrengthIndex(want.strength));
    const dh = Math.abs(matrixShapeIndex(cell.shape) - matrixShapeIndex(want.shape));
    const total = ds + dh;
    if (total === 0) return -0.05;
    if (total === 1) return 0.07;
    if (total === 2 && ds === 1 && dh === 1) return 0.15;
    return 0.24;
  }

  function tuneRealismPenalty(role, row, vec) {
    const cell = matrixCellForRow(row);
    const want = roleAnchorForRole(role);
    const rowRough = roughnessRow(row);
    const cover = String(ballCover(row) || '').toLowerCase();
    const diff = ballDiff(row);

    let p = 0;
    const ds = Math.abs(matrixStrengthIndex(cell.strength) - matrixStrengthIndex(want.strength));
    const dh = Math.abs(matrixShapeIndex(cell.shape) - matrixShapeIndex(want.shape));
    if (ds >= 2) p += 0.08;
    if (ds >= 1 && dh >= 1) p += 0.05;

    if (role.id === 'early') {
      if (rowRough < 0.08) p += 0.05;
      if (cover.includes('pearl')) p += 0.04;
      if ((vec.backend ?? 0) > 0.62) p += 0.03;
    }
    if (role.id === 'benchmark') {
      if ((vec.hook ?? 0) < 0.44 || (vec.hook ?? 0) > 0.70) p += 0.03;
      if ((vec.backend ?? 0) > 0.66) p += 0.03;
    }
    if (role.id === 'corner') {
      if (!isAsymRow(row)) p += 0.05;
      if (Number.isFinite(diff) && diff < 0.042) p += 0.04;
      if ((vec.backend ?? 0) < 0.58) p += 0.03;
    }
    if (role.id === 'clean' || role.id === 'burn') {
      if ((vec.length ?? 0) < 0.56) p += 0.03;
    }
    if (role.id === 'blend') {
      if ((vec.backend ?? 0) > 0.58) p += 0.03;
    }
    return p;
  }


  // --- Equipment (arsenal) readiness scoring ---
  // 0–100 score derived from Analyze saved sets.
  // Uses: (1) role coverage in motion space, (2) duplication/overlap penalty, (3) motion spread.
  function normalizeName(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function equipmentRoleDefs() {
    // Mirrors Analyze coach roles (keep stable).
    return [
      {
        id: 'early',
        label: 'Early / Control',
        tag: 'Strong + Smooth',
        when: 'Fresh / higher volume, or when you need the ball to slow down.',
        why: 'Reads earlier and smoother to control the pocket and reduce big misses.',
        target: { hook: 0.78, length: 0.42, backend: 0.36 },
        avoidPearl: true,
        minRough: 0.12,
      },
      {
        id: 'benchmark',
        label: 'Benchmark / Readable',
        tag: 'Medium + Smooth',
        when: 'First ball out of the bag to read the pattern and establish a baseline.',
        why: 'Balanced motion shows if you need earlier read, more length, or more backend.',
        target: { hook: 0.58, length: 0.55, backend: 0.48 },
      },
      {
        id: 'corner',
        label: 'Shape / Corner',
        tag: 'Strong + Sharp',
        when: 'Carrydown / flat 10s / ball not finishing through the pins.',
        why: 'More backend continuation and angle helps the ball finish and carry corners.',
        target: { hook: 0.68, length: 0.54, backend: 0.72 },
        preferAsym: true,
      },
      {
        id: 'clean',
        label: 'Clean / Angle',
        tag: 'Medium + Sharp',
        when: 'Fronts are hooking or you move left and need the ball to clear and turn the corner.',
        why: 'Cleaner through the fronts with faster response creates entry angle.',
        target: { hook: 0.52, length: 0.68, backend: 0.82 },
        preferPearl: true,
        maxRough: 0.55,
      },
      {
        id: 'burn',
        label: 'Burn / Friction',
        tag: 'Weak + Sharp',
        when: 'Lanes are hooking early and you see high pocket hits / 4-pin clusters.',
        why: 'Cleaner motion helps you stay in control as fronts go away.',
        target: { hook: 0.32, length: 0.78, backend: 0.66 },
        maxRough: 0.70,
      },
      {
        id: 'blend',
        label: 'Control / Blend',
        tag: 'Medium-Weak + Smooth',
        when: 'Wet/dry or over/under where the ball jumps off friction or skids past the spot.',
        why: 'Smoother response blends the lane and reduces overreaction.',
        target: { hook: 0.40, length: 0.62, backend: 0.34 },
      },
    ];
  }

  function coverLower(row) {
    return String(ballCover(row) || '').toLowerCase();
  }
  function isAsymRow(row) {
    const core = String(ballCore(row) || '').toLowerCase();
    return core.includes('asym');
  }
  function roughnessRow(row) {
    const grit = surfaceToGrit(ballSurface(row) || '');
    return clamp((4000 - grit) / 3000, 0, 1);
  }

  function scoreEquipmentRole(role, row, vec) {
    let d = motionDistance(role.target, vec);
    const c = coverLower(row);
    const rough = roughnessRow(row);

    d += roleAnchorPenalty(role, row);
    d += tuneRealismPenalty(role, row, vec);

    if (role.preferAsym && !isAsymRow(row)) d += 0.06;
    if (role.preferPearl && !c.includes('pearl') && !c.includes('hybrid')) d += 0.08;
    if (role.avoidPearl && c.includes('pearl')) d += 0.10;
    if (typeof role.minRough === 'number' && rough < role.minRough) d += 0.08;
    if (typeof role.maxRough === 'number' && rough > role.maxRough) d += 0.08;
    return Math.max(0, d);
  }

  // ================================
  // Execution + Reaction indices
  // ================================

  function computeIndices(shots) {
    const arr = Array.isArray(shots) ? shots : [];
    const N = arr.length;
    if (N < 3) return null;

    const stddev = (vals) => {
      const xs = vals.filter(v => typeof v === "number" && Number.isFinite(v));
      if (xs.length < 2) return 0;
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      const variance = xs.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / xs.length;
      return Math.sqrt(variance);
    };

    // 1) Execution Stability Index (ESI)
    const feetVals = arr.map(s => s && s.feetBoard).filter(v => typeof v === "number");
    const arrowVals = arr.map(s => s && s.arrowsBoard).filter(v => typeof v === "number");
    const sigmaFeet = stddev(feetVals);
    const sigmaArrows = stddev(arrowVals);
    const P_scatter = clamp((sigmaFeet / 2) * 10 + (sigmaArrows / 2) * 10, 0, 30);

    const missSeq = arr.map(s => {
      const p = String((s && s.pocket) || "").toLowerCase();
      if (p === "missr") return "R";
      if (p === "missl") return "L";
      return null;
    }).filter(Boolean);
    let flips = 0;
    for (let i = 1; i < missSeq.length; i++) {
      if (missSeq[i] !== missSeq[i - 1]) flips++;
    }
    const P_flips = clamp(flips * 8, 0, 24);

    const qCount = arr.filter(s => s && s.qualityShot === true).length;
    const qRatio = qCount / N;
    const P_quality = clamp((1 - qRatio) * 20, 0, 20);

    let ESI = 100 - (P_scatter + P_flips + P_quality);
    ESI = clamp(ESI, 0, 100);

    // 2) Reaction Stability Score (RSS)
    const pocketShots = arr.filter(s => {
      const p = String((s && s.pocket) || "").toLowerCase();
      return ["flush", "light", "high"].includes(p);
    });
    const pocketRate = pocketShots.length / N;
    const P_pocket = clamp((0.7 - pocketRate) * 50, 0, 35);

    const obs = arr.map(s => String((s && s.observation) || "").toLowerCase());
    const hasEarly = obs.includes("tooearly");
    const hasLong = obs.includes("toolong");
    const hasOverUnder = obs.includes("overunder");
    let contr = 0;
    if (hasEarly && hasLong) contr++;
    if (hasOverUnder) contr++;
    const P_contra = contr * 12;

    const leaves = arr.map(s => String((s && s.leave) || "").toLowerCase()).filter(Boolean);
    const uniqueLeaves = new Set(leaves).size;
    const diversity = uniqueLeaves / N;
    const P_leaves = (diversity > 0.6 && pocketRate < 0.5) ? 10 : 0;

    let RSS = 100 - (P_pocket + P_contra + P_leaves);
    RSS = clamp(RSS, 0, 100);

    // 3) Carry Quality Index (CQI)
    const carryScores = pocketShots.map(s => {
      const leave = String((s && s.leave) || "").toLowerCase();
      if (leave === "strike") return 1.0;
      if (["flat10", "ringing10", "7"].includes(leave)) return 0.3;
      if (["9", "8", "10"].includes(leave)) return 0.6;
      if (["split", "washout", "bucket"].includes(leave)) return 0.2;
      return 0.5;
    });
    const carry = carryScores.length ? (carryScores.reduce((a, b) => a + b, 0) / carryScores.length) : 1;
    const CQI = clamp(carry * 100, 0, 100);

    return { ESI, RSS, CQI, pocketRate };
  }

  function classifySession(indices, shots) {
    if (!indices) return null;
    const arr = Array.isArray(shots) ? shots : [];
    const N = arr.length || 1;
    const { ESI, RSS, CQI } = indices;

    const pocketShots = arr.filter(s => {
      const p = String((s && s.pocket) || "").toLowerCase();
      return ["flush", "light", "high"].includes(p);
    });
    const pocketRate = pocketShots.length / N;

    if (ESI < 70 && RSS >= 60) {
      return { type: "execution", confidence: (ESI < 55) ? "high" : "medium" };
    }

    if (ESI >= 75 && RSS >= 70 && pocketRate >= 0.6 && CQI < 60) {
      return { type: "carry", confidence: "medium" };
    }

    if (ESI >= 75 && RSS < 60) {
      return { type: "mismatch", confidence: (RSS < 50) ? "high" : "medium" };
    }

    if (ESI >= 75 && RSS >= 60 && pocketRate < 0.6) {
      return { type: "transition", confidence: "medium" };
    }

    return { type: "stable", confidence: "low" };
  }

  function equipmentScoreFromRows(rows, bowler) {
    const ballRows = (Array.isArray(rows) ? rows : []).filter(Boolean);
    if (!ballRows.length) {
      return { score: 0, covered: 0, totalRoles: equipmentRoleDefs().length, overlaps: 0, spread: 0, notes: ['No balls in set.'] };
    }

    const b = bowler || lsGet(KEYS.BOWLER, {});
    const balls = ballRows.map(r => {
      const vec = motionVector(r, b);
      return { name: ballName(r), row: r, vec };
    });

    const roles = equipmentRoleDefs();
    const ROLE_OK = 0.22;
    const ROLE_WARN = 0.30;

    // Role coverage
    let covered = 0;
    let warn = 0;
    for (const role of roles) {
      let best = Infinity;
      for (const ball of balls) {
        const d = scoreEquipmentRole(role, ball.row, ball.vec);
        if (d < best) best = d;
      }
      if (best <= ROLE_OK) covered++;
      else if (best <= ROLE_WARN) warn++;
    }

    const roleCoverage = covered / roles.length;              // 0..1
    const roleAlmost = (covered + warn * 0.5) / roles.length; // partial credit

    // Overlaps (duplication)
    let overlaps = 0;
    let maxD = 0;
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const d = motionDistance(balls[i].vec, balls[j].vec);
        if (d > maxD) maxD = d;
        // Treat d <= 0.12 as a near-duplicate in motion.
        if (d <= 0.12) overlaps++;
      }
    }
    const overlapPenalty = clamp(overlaps / Math.max(1, balls.length - 1), 0, 1); // 0..1

    // Spread (arsenal range)
    // Typical useful maxD tends to land ~0.55–0.75 with a good set.
    const spread = clamp(maxD / 0.65, 0, 1);

    // Weighted score
    let score = 0;
    score += 40 * roleCoverage;
    score += 20 * roleAlmost;
    score += 25 * spread;
    score += 15 * (1 - overlapPenalty);
    score = Math.round(clamp(score, 0, 100));

    const notes = [];
    if (covered < roles.length) notes.push(`${covered}/${roles.length} key roles covered.`);
    if (overlaps) notes.push(`${overlaps} near-duplicate pair${overlaps === 1 ? '' : 's'}.`);
    if (spread < 0.55) notes.push('Set motion range is tight (may need a bigger step up/down).');

    return {
      score,
      covered,
      totalRoles: roles.length,
      overlaps,
      spread: Number(spread.toFixed(2)),
      notes,
    };
  }

  function equipmentScoreFromSavedSet(setObj, allRows, bowler) {
    const set = setObj && typeof setObj === 'object' ? setObj : null;
    if (!set || !Array.isArray(set.balls)) return null;
    const rows = Array.isArray(allRows) ? allRows : [];
    const byNorm = new Map(rows.map(r => [normalizeName(ballName(r)), r]));
    const pickedRows = set.balls
      .map(nm => byNorm.get(normalizeName(nm)))
      .filter(Boolean);
    const out = equipmentScoreFromRows(pickedRows, bowler);
    out.setId = set.id;
    out.setName = set.name;
    out.ballCount = pickedRows.length;
    return out;
  }

  function ballName(row) {
    return String(getField(row, ['Ball Name', 'Ball', 'Name'], '')).trim();
  }

  function ballBrand(row) {
    return String(getField(row, ['Brand', 'Company'], '')).trim();
  }

  function ballSurface(row) {
    const nm = ballName(row);
    const t = ballTweaksFor(nm);
    if (t && t.surfaceOverride) return String(t.surfaceOverride).trim();
    return String(getField(row, ['Surface', 'Finish'], '')).trim();
  }

  function ballCover(row) {
    return String(getField(row, ['Cover', 'Coverstock', 'Cover Stock'], '')).trim();
  }

  function ballCore(row) {
    return String(getField(row, ['Core'], '')).trim();
  }

  function ballRG(row) {
    return asNum(getField(row, ['RG'], ''));
  }

  function ballDiff(row) {
    return asNum(getField(row, ['Diff', 'Differential'], ''));
  }

  function ballPSA(row) {
    return asNum(getField(row, ['PSA'], ''));
  }

  function ballVal(row) {
    return asNum(getField(row, ['Val'], ''));
  }

  function ballPAP(row) {
    return asNum(getField(row, ['PAP'], ''));
  }

  function ballPinLocation(row) {
    return String(getField(row, ['Pin Location', 'PinLocation'], '')).trim();
  }

  function isAsymCore(row) {
    return String(ballCore(row) || '').toLowerCase().includes('asym');
  }

  function layoutTypeFromRow(row) {
    const pinLoc = ballPinLocation(row).toLowerCase();
    const pin = ballPAP(row);
    if (pinLoc.includes('short') || (Number.isFinite(pin) && pin <= 2.75)) return 'short';
    if (pinLoc.includes('down')) return 'control';
    if (Number.isFinite(pin) && pin >= 4.75) return 'long';
    return 'benchmark';
  }

  function layoutMotionMods(row) {
    const kind = layoutTypeFromRow(row);
    if (kind === 'short') {
      return { kind, hook: -0.05, length: -0.10, backend: -0.15, shape: -0.15, asym: -0.04 };
    }
    if (kind === 'long') {
      return { kind, hook: +0.03, length: +0.10, backend: +0.15, shape: +0.20, asym: +0.03 };
    }
    if (kind === 'control') {
      return { kind, hook: +0.05, length: -0.15, backend: -0.10, shape: -0.10, asym: -0.02 };
    }
    return { kind, hook: 0, length: 0, backend: 0, shape: 0, asym: 0 };
  }

  // clamp is defined above (used by motion model)

  // Strength/Shape estimate (simple, explainable):
  // Strength: based on Diff + cover type + surface grit.
  // Shape: based on PSA (asymmetry proxy) + cover pearl/solid.
  function estimateStrengthShape(row) {
    const diff = ballDiff(row);
    const psa = ballPSA(row);
    const cover = ballCover(row).toLowerCase();
    const core = ballCore(row).toLowerCase();
    const surfRaw = ballSurface(row).toLowerCase();

    const grit = (function () {
      if (surfRaw.includes('polish')) return NaN; // polished: handled as polish below, whatever grit it was sanded to first
      const m = surfRaw.match(/(\d{3,4})/);
      if (!m) return NaN;
      return Number(m[1]);
    })();

    // cover weight
    let coverW = 0.5;
    if (cover.includes('solid')) coverW = 1.0;
    else if (cover.includes('hybrid')) coverW = 0.75;
    else if (cover.includes('pearl')) coverW = 0.45;

    // surface weight (lower grit = earlier/stronger)
    let surfW = 0.6;
    if (Number.isFinite(grit)) {
      if (grit <= 2000) surfW = 1.0;
      else if (grit <= 3000) surfW = 0.8;
      else surfW = 0.6;
    } else if (surfRaw.includes('polish')) {
      surfW = 0.45;
    } else if (surfRaw.includes('compound')) {
      surfW = 0.50;
    }

    // diff normalized rough range 0.02-0.06
    const diffN = Number.isFinite(diff) ? clamp((diff - 0.02) / 0.04, 0, 1) : 0.4;
    // Make polish/pearl a bit less likely to look like "heavy oil" even with high diff.
    const strength = clamp((diffN * 0.50) + (coverW * 0.25) + (surfW * 0.25), 0, 1);

    // shape: Cleaner covers/surfaces drive faster response; PSA helps but isn't everything.
    // If PSA is missing and the ball is symmetric, default much lower (prevents weak sym pearls
    // like Hustle / Level from being mislabeled as "sharp" just due to polish).
    const psaN = Number.isFinite(psa)
      ? clamp((psa - 0.008) / 0.02, 0, 1)
      : (core.includes('sym') ? 0.08 : 0.30);
    let pearlW = 0.55;
    if (cover.includes('pearl')) pearlW = 1.0;
    else if (cover.includes('hybrid')) pearlW = 0.7;
    else if (cover.includes('solid')) pearlW = 0.35;

    // cleanW: polish / high grit tends to look sharper downlane.
    let cleanW = 0.6;
    if (surfRaw.includes('polish')) cleanW = 1.0;
    else if (surfRaw.includes('compound')) cleanW = 0.85;
    else if (Number.isFinite(grit)) {
      if (grit >= 4500) cleanW = 0.95;
      else if (grit >= 4000) cleanW = 0.85;
      else if (grit >= 3000) cleanW = 0.65;
      else cleanW = 0.45;
    }

    // Low-diff balls tend to be smoother even when clean/polished.
    // Make diff a stronger governor so Hustle/Level stay weak-smooth, while
    // higher-diff clean pearls can still land medium-sharp.
    const diffShapeW = 0.60 + 0.40 * diffN; // 0.60–1.00

    // Retune weights: polish/clean + pearl bias matter more than PSA alone.
    const shapeBase = clamp((psaN * 0.35) + (cleanW * 0.40) + (pearlW * 0.25), 0, 1);
    let shape = clamp(shapeBase * diffShapeW, 0, 1);

    // Apply user perception tweaks (backend slider nudges shape).
    const tw = ballTweaksFor(ballName(row));
    shape = clamp(shape + (tw.backend * TWEAK_SCALE), 0, 1);

    // Layout from CSV should influence matrix placement too.
    const lm = layoutMotionMods(row);
    const strength2 = clamp(strength + (tw.hook * TWEAK_SCALE) + (lm.hook * 0.60) - (lm.length * 0.25), 0, 1);
    shape = clamp(shape + (lm.shape * 0.70) + (lm.backend * 0.15), 0, 1);

    return { strength: strength2, shape, layoutType: lm.kind };
  }

  function strengthBucket(strength) {
    if (strength >= 0.72) return 'STRONG';
    if (strength >= 0.46) return 'MEDIUM';
    return 'WEAK';
  }

  function shapeBucket(shape) {
    return shape >= 0.55 ? 'SHARP' : 'SMOOTH';
  }

  // --- Navbar injection ---
  function renderNav(active) {
    const nav = $('.navlinks');
    if (!nav) return;
    const items = [
      { key: 'home', label: 'Home', href: 'index.html' },
      { key: 'bowler', label: 'Bowler', href: 'bowler.html' },
      { key: 'arsenal', label: 'Arsenal', href: 'arsenal.html' },
      { key: 'analyze', label: 'Analyze', href: 'analyze.html' },
      { key: 'lane', label: 'Friction Timing', href: 'lane.html' },
      { key: 'oil', label: 'Oil', href: 'oil.html' },
      { key: 'gameday', label: 'Game Day', href: 'gameday.html' },
      { key: 'scores', label: 'Scores', href: 'scores.html' },
      { key: 'guide', label: 'Guide', href: 'guide.html' },
    ];
    nav.innerHTML = items.map(i => {
      const cls = i.key === active ? 'navbtn active' : 'navbtn';
      return `<a class="${cls}" href="${i.href}">${i.label}</a>`;
    }).join('');
  }

  // --- Backup / restore (all app data lives in localStorage keys starting with "bt_") ---
  const LAST_BACKUP_KEY = 'bt_last_backup_v1';
  function appDataKeys() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('bt_') && k !== LAST_BACKUP_KEY) out.push(k);
    }
    return out.sort();
  }

  function buildBackup() {
    const data = {};
    appDataKeys().forEach(k => { data[k] = localStorage.getItem(k); });
    return { app: 'bowling-tool', version: APP_VERSION, exportedAt: new Date().toISOString(), data };
  }

  async function exportBackup() {
    const backup = buildBackup();
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `bowling-backup-${stamp}.json`;
    const json = JSON.stringify(backup, null, 1);
    const blob = new Blob([json], { type: 'application/json' });
    let done = false;
    // iPhone: the share sheet lets you "Save to Files", AirDrop, or email it to yourself.
    try {
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Bowling Tool backup' });
        done = true;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return false; // user closed the share sheet
    }
    if (!done) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
    return true;
  }

  async function importBackupFile(file) {
    const text = await readFileAsText(file);
    let obj;
    try { obj = JSON.parse(text); } catch (_e) { throw new Error('That file is not a Bowling Tool backup.'); }
    if (!obj || obj.app !== 'bowling-tool' || !obj.data || typeof obj.data !== 'object') {
      throw new Error('That file is not a Bowling Tool backup.');
    }
    const keys = Object.keys(obj.data).filter(k => k.startsWith('bt_'));
    if (!keys.length) throw new Error('That backup is empty.');
    appDataKeys().forEach(k => localStorage.removeItem(k));
    keys.forEach(k => {
      const v = obj.data[k];
      localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    });
    return { keys: keys.length, exportedAt: obj.exportedAt || '' };
  }

  function lastBackupAt() {
    const n = Number(localStorage.getItem(LAST_BACKUP_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  // Setup progress used by the Home checklist and Game Day banner.
  function setupStatus() {
    const arr = (k) => { const v = lsGet(k, []); return Array.isArray(v) ? v : []; };
    const bowler = lsGet(KEYS.BOWLER, {});
    const sets = arr(KEYS.ARSENAL_SETS).filter(s => s && Array.isArray(s.balls) && s.balls.length);
    return {
      bowler: !!(bowler && (bowler.name || bowler.rpm || bowler.mphLine || bowler.mph || bowler.pap)),
      houses: arr(KEYS.HOUSES).length > 0,
      patterns: arr(KEYS.OIL_PATTERNS).length > 0,
      sets: sets.length > 0,
      customBalls: customBalls().length,
      sessions: arr(KEYS.GAME_SESSIONS).length,
    };
  }

  function isStandalone() {
    return !!(window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches));
  }

  // Ask the browser not to clear our data (honoured for home-screen apps).
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (_e) {}

  // --- Offline support / installable app ---
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // --- Public API ---
  window.BT = {
    APP_VERSION,
    KEYS,
    $, $all,
    lsGet, lsSet,
    getLeagues, addLeague, getLeagueById,
    parseCSV,
    ensureCSVLoaded,
    customBalls,
    withCustomBalls,
    loadCSVFromUpload,
    estimateStrengthShape,
    strengthBucket,
    shapeBucket,
    ballName,
    ballBrand,
    ballCover,
    ballCore,
    ballSurface,
    ballRG,
    ballDiff,
    ballPSA,
    ballPAP,
    ballPinLocation,
    layoutTypeFromRow,
    layoutMotionMods,
    ballVal,
    parsePAP,
    bowlerType,
    speedAtPinsFromFoulLine,
    ballTweaksAll,
    ballTweaksFor,
    setBallTweaks,
    clearBallTweaks,
    setBallSurfaceOverride,
    clearBallSurfaceOverride,
    surfaceToGrit,
    motionVector,
    motionDistance,
    computeIndices,
    classifySession,
    equipmentRoleDefs,
    scoreEquipmentRole,
    matrixCellForRow,
    roleAnchorForRole,
    roleAnchorPenalty,
    equipmentScoreFromRows,
    equipmentScoreFromSavedSet,
    renderNav,
    exportBackup,
    importBackupFile,
    lastBackupAt,
    setupStatus,
    isStandalone,
  };
})();
