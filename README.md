# Bowling Tool (beta)

A phone-first web app for game-day shot tracking, lane stats, and arsenal planning.
Everything is plain HTML/JS at the root of this repository, with no build step.

## Put it online for iPhone beta testing

The app has to be served over **https** for the iPhone install and offline mode to work.
Any static host works. Two free options:

**Current setup:** this repository is linked to Netlify. Every push to `main` publishes automatically to https://bowlinggameday.netlify.app (no build command, publish directory `/`).

**Option A: Netlify Drop (easiest)**
1. Go to https://app.netlify.com/drop and sign in (free account).
2. Drag the **`bowling-tool`** folder (not the whole project) onto the page.
3. You get a link like `https://something.netlify.app`. Rename it in Site settings if you like.
4. To update later: open the site in Netlify → Deploys → drag the folder again.

**Option B: GitHub Pages**
1. Create a GitHub repo and upload the contents of `bowling-tool/` to it.
2. Repo → Settings → Pages → Source: "Deploy from a branch", branch `main`, folder `/ (root)`.
3. Your link will be `https://<username>.github.io/<repo>/`.

## Installing on an iPhone (send this to testers)
1. Open the link in **Safari**.
2. Tap **Share** (square with the up-arrow) → **Add to Home Screen** → Add.
3. Open the app from the new **Bowling** icon. It runs full-screen and works with no signal.
4. Follow the **Get set up** checklist on the Home screen.
5. After each league night: Home → **Back up my data** → Save to Files (or email it to yourself).

## Data
- Data is stored on the device (browser localStorage, keys starting with `bt_`).
- **Back up / Restore** on the Home screen moves everything to a `.json` file and back,
  for switching phones or recovering after Safari data is cleared.
- Testers' data never leaves their phone unless they share a backup file with you.

## Releasing an update
Bump all three so phones pick up the new version:
1. `APP_VERSION` at the top of `bowling-tool/app.js`
2. The `?v=64` on `app.js` / `styles.css` in every `.html` file and in `sw.js`
3. `CACHE` name at the top of `bowling-tool/sw.js`

Installed apps update the next time they're opened with a connection (sometimes it takes two opens).

## Run locally on a computer (optional)
```bash
npm install
npm start
```
Then open http://localhost:3000

## Roadmap (ideas agreed, not built yet; checked at every update round)
- **Wear drift:** after ~60 games since a resurface, a ball's chart position drifts weaker/later; resurfacing snaps it back.
- **Self-correcting chart:** Game Day reads (Too early / Too long, breakpoints) nudge each ball's chart position toward how it actually rolls for you. Needs a few nights of data.
- **Tonight's overlay:** on Game Day / Bag, show the band tonight's pattern needs on the chart with your bag highlighted; Coach ball changes drawn as moves on the chart.
- **What's worked where:** color each ball by its results by house and pattern (carry %, strike %). Needs a few nights of data.
- **Pro-shop sheet:** one printable page with every ball, specs, layout, surface, games since resurface, chart position, gaps and the suggested next move.
- Spare shots + full game score for Game Day (history already covers past games).
- Open question from live test 1: "missed left with good execution" (A: good execution overrides the miss, or B: merge Execution into step 1).

## Changes in v178-beta115
- 🎳 Arsenal ball list: retired balls are grayed out with a "Retired" tag; Tune, Compare and Remove still work.

## Changes in v177-beta114
- 📐 Angles: "📍 On the ball path": type a board to get the distance(s) where the path is on it (both crossings on a hook), or a distance to get the board. The point is added to the table and the drawing.
## Changes in v176-beta113
- Game Plan: Game Day nights newer than your PinPal history now count in the house average, game-by-game and "last time here", with a note saying which nights aren't in PinPal yet.
- One strike definition everywhere (first ball of frames 1–10, fills not counted, same as PinPal): night recap, Scores page and season review.
- Bag: never more balls than you asked for; a cross-house switch ball isn't added when this house's record says it trails; switch houses list only where it helped.
- Backup and slow-burn balls are tied to tonight's bag, or labeled "not in tonight's bag".
- League named for another weekday is flagged; surface advice no longer contradicts itself.

## Changes in v175-beta112
- 🎒 Plan: a ball you've thrown here on Game Day shows its Game Day record ("Game Day here: 7 strikes in 10") instead of "untested here; picked for its specs".
- 🔁 Plan: the ball your switch record says to go to from the start ball (helped 60%+ of 3+ switches) joins the bag: "Your switch from Zero Mercy Hybrid (helped 3 of 4: …)".
- 📊 Plan, by game: uses this season when there are 9+ games here, and game 3 drops say "decide your game 3 change before you bowl. One change, then 2 good shots. Not deeper."
- 🏅 History lists renamed "Your history on lanes … / at the house" (the bag itself is below), numbered, retired balls left out.
- ↔️ IF / THEN: "Already 2 deeper than your start? Change balls instead of moving in again."
- 🐛 House book: "(line not logged)" instead of "null/null".

## Changes in v174-beta111
- 🧭 Season review: ball-at-house wins show their night count; 1–2 night records move to "Too early to call". Opening-ball item compares game 1 with that ball vs your other openers at the same house, and is marked "already replaced ✅" when you've changed openers.
- 🧪 Game 3 vs games 1–2 after one ball carried you through games 1–2 vs after a switch (2+ nights each): when staying put costs 15+, it says have your switch trigger ready by game 3.
- 🎯 Spares: multi-pin vs corner pin called out as the corner-pin shot, not spare shooting in general. Poor-shot reasons: chicken wing + pulled both go left and are execution, so repeat, don't move.
- 📈 Next goal for carry aims at whichever leads on good shots (high → smoother / later ball or move left; light → key pin, loft, cleaner ball).
- 🧰 Each Game Day shot now records the ball's surface at the time, so a resurfaced ball (e.g. RIP at 4000) gets its own record next to the earlier setup.
- 🏠 House card: the carrydown chip says "your nights: no clear effect yet" when your own carrydown test hasn't shown one.

## Changes in v173-beta110
- 🧭 Season review, carry: high / flush / light now from good shots only, with totals ("High 40 of 132 struck (30%) · Flush … · Light …"); the early-vs-weak read needs a 25% margin.
- 🎳 Ball by stage: best ball in game 1 / 2 / 3 at each house (8+ shots).
- ⚙️ Execution by game: poor-shot rate G1 / G2 / G3 on rated shots, top game-3 fault, and whether game 3 is you (more poor shots) or the lanes (same shots, fewer pins).
- 🔢 Moves: worked · didn't · not clear. 10-pin cost shows its math. Carrydown counts nights with no lane notes. Eyeball is defined under What's changing.

## Changes in v172-beta109
- 🧭 Season review: off the deck shows your last 3 nights next to the season total, and says "fixed ✅" (no longer in Going wrong / Top 3) when the last 3 nights are 80%+. Goals list newest first (✅ ❌).
- 🎳 Game 3 advice now matches Game Day: "one change, then 2 good shots. Not deeper" (was "move a frame early"). Low-game math uses 3-game nights only.
- 📈 What's changing: the game 3 line lists each of the last 5 nights; "Next" goes to a big drop even before it's clear (2× its minimum), then the first key part not going up. Game 3 uses 3-game nights only.
- 🎯 10-pin season read: a side is called only with a clear margin (3+ more, 1.5×) and fewer unlogged misses than logged; mostly left with your spare ball = "the line, not hook". Otherwise "No clear side yet".

## Changes in v171-beta108
- 📈 What's changing (Season review and Trends): your last 5 nights vs the 5 before for average, pocket, carry, strikes, spares, 10-pin, eyeball and game 3 vs games 1–2. ↑ ↓ only when the change is bigger than your normal night-to-night swing; otherwise "not clear yet". Plus your goal record (met N of the last N, by goal) and one next step tied to what isn't improving. Trends follows its house / lanes / league / period filters.
- 🧭 Season review: 💾 Save to Files (an HTML file through the share sheet: Files, Mail, Messages) and 📄 Save as PDF (print screen → share → Save to Files). Buttons and the goal button are left out of the saved copy.

## Changes in v170-beta107
- 🎯 Execution score: one formula everywhere (Good 5 · OK 3 · Poor 1, +1 for hitting your mark, max 5). Only shots you rated count; untapped shots no longer count as OK. Game Day shows "(28 of 33 rated)"; "—" when none rated.
- 👀 Off the deck: new "Didn't see" tap. An honest didn't-see gets partial credit on the eyeball score (0.6 vs 1 for watched, 0 for blank) and is never used in roll, slow-burn or over/under reads. Hint: "didn't see beats a guess".
- 🔀 Over/under on Game Day: also fires when the same ball both rings and finishes flat / weak on good shots; says "That's over/under, not slow burn" and names the smoother ball from tonight's bag (Barnes chart).
- 🏆 Tournament, moving pairs: "Next game starts on" → "Tournament: new pair each game" (turns on by itself for tournament league names). Each new game asks "Game N: new pair?" (Set / Same pair); lanes follow the new pair. Game Day: "New pair: start from your last line, let your first 2 good shots tell you", plus how each ball moved on the pairs so far. Night review notes the pair on each game.

## Changes in v169-beta106
- 🎒 Plan: when your Game Day history at a house is thin (under 2 nights) or old (60+ days), your recent workhorse balls from any house stay in the bag, labelled "Your recent workhorse (other houses; untested here)".
- 🔁 Your ball switches (all houses): X → Y, helped N of M (houses where it helped; not where it didn't). Next 5 shots vs the last 5; dropping the new ball after 1–2 shots counts as didn't help. In the Plan, and on Game Day when your ball has 0–1 strikes in its last 3.
- 🎯 Short pin "worked" now means more strikes than your other balls that night (40%+ only when nothing else was thrown); dropped after 1–3 shots counts as didn't.
- 🕯️ Slow-burn note check also counts high hits: "N high hits say it also read early or hooked too much. Two different problems…"
- 🔢 Moves line adds LASER changes outside the count: "+ 2 loft changes (not in the count)".

## Changes in v168-beta105
- 🎳 Night review, Balls: listed in the order you threw them, with when you used each (G1 F1 → G2 F4), how it started (first 5) and ended (last 5): pocket, strikes, early/long reads. Each switch says where, your Why? (or "no reason logged" plus the 3 shots before), and what Coach had said. Night totals below; the 📝 note buttons fold under "What you saw".

## Changes in v167-beta104
- 🎳 Open frames split two ways: "5 open frames: 3 splits (8-10, …; 3 off pocket hits) and 2 makeable spares missed" instead of "5 missed spares."
- 📋 Plan vs tonight (night review): the Plan's start ball and change-ups (from your saved bag's roles) against what you threw: opener, balls not in the plan's bag, change-ups not tried.
- 🔗 Two changes at once (e.g. loft and a ball switch together): the Why? verdict says it can't be credited to either, and it's left out of your "what fixed it" record.
- 🔎 Ball notes put your note next to the logs when they disagree: "your note says backend; your logs say 2 early, 0 long."
- 👁️ Eyeball line labelled "how often you logged it" so mark / pocket % aren't mistaken for accuracy.
- 🔢 Moves: "11 changes (N line moves, M ball-only changes; a line move counts per lane)" so it matches the game lines.
- 🧭 Game Day, start of game 3: "Game 3 plan (you decided this before you bowled): if it reads early / carry drops → X; if it goes long / light → Y. One change, then 2 good shots. Not deeper." From your saved bag's roles.
- ✋ Move brake: 2+ line or ball changes in your last few frames → "Stop here: pick one and give it 2 good shots."
- 🗣️ Why you changed: for "Slow burn" / "Gave up," fixed now also needs half strikes or flush (carry is the point), not just pocket hits.
- ↔️ "Lane X was tougher" only cites pocket when it was actually lower there; otherwise "(pocket similar: it was carry)."
- 🧐 What cost pins: light hits that mostly rolled out off the deck say "ran out of energy: more loft or a cleaner ball," not "more angle / feet left."
- Speed Versatility hint points to the LASER row.

## Changes in v166-beta103
- 🎳 Opener = best game 1 results on Game Day at the house (8+ game 1 shots, small edge for last time's opener), not the ball you opened with most often. Forecast and the Plan's First ball use it.
- 🧭 Your reads beat leave counts: when Game Day reads clearly lean long / light, "What the lanes are telling you" says the ball has been holding (carrydown fits), not burning early; it gives "If it holds / goes long … If it reads early and dies …"; the slow-burn section is marked "less common here."
- "No games on lanes 21-22 yet." instead of "Only 0 games."

## Changes in v165-beta102
- 🕯️ Slow-burn order: a slow-burn ball has to go longer than your opener. Game Day names an arsenal ball for next time when nothing in tonight's bag is cleaner; the Plan says "Bring X" when the bag has nothing longer than your opener.
- 🧭 No cleaner ball for slow burn? Coach falls back to LASER, ranked by your Bowler-page ratings and Why? record: Loft first (past the dry front), then Speed or Release. Aim (deeper) stays out unless your record says it fixed burn. Plan says the same when your whole arsenal has nothing longer than your opener.
- 🐛 Loft advice direction fixed: for a ball using its energy too early (carry weak / slow burn) Coach now says add loft, not "lay it down sooner."
- ↔️ Lanes: "Before game 3, lane 22 was converting 9 of 12 and lane 21 4 of 11 … adjust lane by lane: don't move on the lane that's still working."
- 📝 Ball notes: a flat 10 is a "weak leave that fits your slow-burn read," not proof of slow burn.
- ⚠️ 3-balls-in-a-game warning only when two balls got 2 shots or fewer; otherwise it notes ball and line changed together (not a clean comparison).
- 🔢 Moves: "4 right after a poor shot (3 of them didn't help)" so the two counts match.
- 📊 Honest grades: Roll grades only pocket hits you watched off the deck (each shot in one bucket; unwatched listed, 3+ to grade). Posture with no balance faults says "none recorded" and isn't graded 100%.

## Changes in v164-beta101
- 🎳 One opener: the ball you've opened with on most of your last 4 Game Day nights at the house (tie → the latest) is the forecast's ball and the Plan's First ball; the history pick becomes "test in practice." The history "best game 1s" pick now needs 8+ game 1s and use in the last 12 months.
- 🎒 A ball you've been throwing at the house (10+ shots on 2+ of your last 4 nights) stays in the bag as "Your recent ball here (backup)" instead of being cut for overlap.
- 🎯 Plan's goal banner drops the stale "you saw X% tonight."
- 🧽 Dark-horse surface tip only when the gap is real: 5+ pins over the ball's current surface band with 20+ games on each side.
- ✏️ "Plan the switch before game 1" → "Not an opener here: weaker in game 1"; bag labels: one "Strongest" / "Cleanest" at the end, "Stronger / Cleaner still" between.

- 🎯 10-pin tip: missing the 10 inside *with your spare ball* now says it's the line, not the ball (same target, feet 1–2 boards left; check you're not pulling), instead of "use your spare ball."
- 📐 Geometry (5 Elements) isn't graded when the oil pattern is unknown / estimated: the Baker Box is a guess there, so it can't be your "weakest part."
- 📐 Angle drill for high misses doesn't send you deeper when Energy vs angle says deeper cost carry that night: later / cleaner ball from the better spot, then loft.
- 📝 Ball notes say "poor shots" (not "missed shots") and need 2+ shots before "logs agree"; "1 strike or flush" grammar.

- 👀 Off the deck on Game Day: tap a pocket hit (Flush / Light / High) and the Off the deck row lights up and asks "where did it go?"; it hides for Left / Right of pocket and Brooklyn. Grading unchanged: every pocket hit, strikes included.

## Changes in v163-beta100
- ⚫ Retired balls are grayed out on the Barnes chart: dots, chips and the box list (with "show retired" ticked).
- 🎚️ Tune sliders (Strength, Length, Backend) save the moment you let go, with a "✓ Saved" tick. The ball's "Save changes" (specs) button no longer wipes slider moves you hadn't saved. Surface stays a what-if until the bottom Save.

## Changes in v162-beta99
- 🧺 Tune → Save no longer writes a surface unless you moved the surface slider. Before, every Save stamped the slider's starting surface as an override, which could cancel your Hook / Backend slider moves in the Barnes box.
- 🧪 Factory finishes read right: a sequence like "500/1000/1500 Siaair, Crown Factory Compound" is read at its last step plus compound (≈4500, shiny), not 500; "Reacta Gloss" and "Power Edge" count as polished.
- 🧹 One-time cleanup: surface overrides that were only that misread (and not a logged resurface to that grit) are cleared, so those balls go back to their real finish.

## Changes in v161-beta98
- 🎯 Lane motion read (Game Day, early in the night): from your opening ball's first 3–6 good shots. Strong / turning hard / high without an early read = "Downlane motion: a short-pin look" (names the short pin in tonight's bag); early read / hooked early / gave up / slow burn = "Fronts reading early: not a short-pin night." Adds your record here on nights like this.
- 🏆 Plan "Short pin: when it plays" adds your PinPal history split league vs tournament (from the league name): "Tournaments here: short pin 61% vs 45% → short pin wins · League here: 42% vs 42% → even." Game Day's lane-motion note adds your tournament or league record at that house.
- 🎯 Short pin = measured pin-to-PAP under 3" or your own "SP" in the ball name.
- 🎯 Night review: "Lane motion & short pin": tonight's motion, short pin strike % vs the rest, and whether it fit your rule.
- 🎯 Plan: "Short pin: when it plays": your record here and across houses by kind of night (worked = 40%+ strikes with it).
- ↔️ Lane fill-in works on the iPhone number pad: two lane boxes (the second fills in +1), then tap which lane game 1 started on. Game Day's pair box and Setup "Lanes" accept digits only too ("910" = 9-10, "2324" = 23-24).
- Lane note "energy at the pins, not your line" in the review reworded (watch high / light and the corner pin first).

## Changes in v160-beta97
- 🎯 No "bigger move" after a move that didn't fix it: if your Why? record tonight says a kind of change (e.g. Aim: feet / eyes) didn't fix the same problem, Coach moves it to last, doesn't escalate it (no 3-and-2 after a failed 2-and-1), and the compass stops saying "move your feet, keep the ball."
- 🤔 Poor shots: a missed mark that still found the pocket counts as "held or recovered" (the lane saved it), even when tagged a plain miss. Fixes "0 held or recovered" next to ball notes showing 7 missed shots in the pocket.
- 🗣️ Why you changed: "logs agreed" needs 2+ (1 of 3 now says "partly agreed"); "didn't fix it" shows how many were still high / light, not only the pocket count.
- ↔️ No lane report? The night review now says so and fixes it in one step: type the pair (9-10) and game 1's starting lane, tap "Fill in lanes"; every shot gets its lane (alternating frames, games alternate start) and the lane report appears.
- ↔️ Game Day: if no pair is entered, a small "Which pair?" box on the shot card sets it (skip hides it for the night).
- ⭐ What fixed this same problem for you before (your Why? record across nights, e.g. Loft for gave up / slow burn) is offered first.

## Changes in v159-beta96
- 🕯️ Leave = alarm, motion = diagnosis: slow-burn leaves alone now give "Possible slow burn… on the next good shot, watch: picked up early and straightened = burn; skidded long = needs an earlier read." The "Slow burn, not a holding lane" headline only replaces the line advice when you saw it read early (logged early read, a Slow burn / Gave up / Hooked early tap, or your ball note here). A logged "too long" or "Skidding" tap points to skid instead.
- 🚫 Ruled-out balls: a ball note at a house saying a ball read early / rolled flat / slow burned keeps that ball off the slow-burn ladder there ("Not Physix Blackout SP here: you saw it read early (11/19)"), on Game Day and in the Plan.

## Changes in v158-beta95
- 🕯️ Slow burn: new "Slow burn" Why? reason and ball-note finish. Game Day warns when 2 of your last 5 good pocket shots with a ball leave slow-burn signs (bucket 2-4-5 / 2-4-5-8, a lone 2 or 2-10, flat 10, weak 6; never the 2-8, which is the ball finishing late) and gives the next step: your own record first (e.g. Loft), then a cleaner ball from tonight's bag, plus "not X here" when a change has failed at this house.
- 🕯️ Plan: "If slow burn shows up here: next steps in order".
- 🕯️ When slow burn signs show, a "holding / going long" headline is replaced: light hits from slow burn are lost energy, so Coach doesn't send you toward the friction.

## Changes in v157-beta94
- 🔀 Carry over/under on Game Day: 2+ weak and 2+ strong leaves from the pocket on good shots → "Carry over/under … (a cliff): more or less energy won't fix it; you want a smoother, more predictable look." One each says it may be the start of over/under and Coach will call it if the next good shots keep switching.

## Changes in v156-beta93
- 📝 Ball notes (night review → 🎳 Balls): for each ball you threw, tap Where it read (Fronts / Midlane / Backend / Went long), How it finished (Strong / Smooth / Rolled flat / Too sharp), Miss room (Lots / Some / Little), plus your own words. Coach checks each note against that night's shots with the ball (too few shots = "a lead") and shows your latest notes per ball in the Plan for that house.
- 🚫 Strike-ball suggestions never pick a spare ball (TZone / plastic / spare-only), even when it's in tonight's bag.
- 🌀 Energy call needs the leaves to agree: 2 strong vs 1 weak is mixed, so Coach watches instead of calling a ball or speed change. "Your line is fine" softened.
- 🗣️ "Hooked early": light hits no longer count against it (an early read that rolls out arrives light); only going long does.

## Changes in v155-beta92
- 🎯 "Last time's goal" no longer repeats last night's stale "you saw X% tonight"; tonight's number shows once.
- 🧐 "What cost pins": flush hits that leave pins no longer say "not your aim"; it says to watch the corner pin and finish first.
- 🗣️ Why you changed: "No logs to check" now says why (shots before were strikes, or there were none).
- 🔄 Revs Versatility points to Release (hand) in the LASER row.
- 🔄 Revs Hook grade now counts too much hook (read early, a non-strike still turning hard, or the shot before you tapped Hooked early / Backend too sharp) and too little (long, rolled out, or before Gave up / Skidding).

## Changes in v154-beta91
- 🗣️ "Why?" on any change: when you change feet / eyes, speed, loft, hand or ball (tapped, or the app sees a new line or ball on that lane), one optional tap says what you saw: Gave up downlane · Skidding too far · Backend too sharp · Hooked early · Missed the pocket · Just a feel. Shows what fixed it last time you saw the same thing.
- 🤔 Coach checks your eye against your logs: agrees, says when 2+ of your last good shots were logged the opposite way, and treats a reason seen on a missed shot as a lane read. After 3 good shots it judges the change against your reason ("fixed what you saw" / "still giving up"), and that verdict replaces the generic move verdict.
- 🔤 LASER row: "LASER: what changed since last shot?" with pills in LASER order: Loft · Aim (feet / eyes) · Speed · Equipment (ball) · Release (hand). Coach and the review name changes the same way.
- ＋ My own reason: type your own "why"; it's saved as a pill for next time, removable with Edit. Coach can't check your own reasons against the logs, so it judges those changes on pocket and carry.
- 🗣️ Night review: "Why you changed" lists each change, whether the logs agreed, and whether it fixed it. Plan: "Your eye: what fixed what you saw" across all nights.
- ↔️ One verdict per move: when you're still in the pocket after a move (3 of 4+) but strikes are mixed, Coach says "keep it for now" in one line. No more "didn't help" next to "is working".
- ↩️ "That change didn't help" needs 3+ good shots before the move to compare against (1 of 1 isn't a baseline).
- 🛢️ "Possible carrydown" with counts (light / flat 3 of 8 → 5 of 10). While you're not being told to move, it's a watch item ("Nothing to change yet. If good shots start going light…") listed below the main call.
- 👀 Lane notes: when every miss on a lane was a poor shot and good shots all found the pocket, it leads with "the misses were execution." "Pocket but not carrying" no longer says "not your line"; it says to watch high / light and the corner pin first.

## Changes in v153-beta90
- 📐 Angle element says which way: "Which way" from your high vs light pocket reads; the Angle drill follows it (high → feet in / later ball; light → follow the miss / earlier ball; mixed → shape not repeating, hold the line).
- 🗣️ Coach said / you did: when you stayed, shows the next shots' pocket and strikes, and says when staying was the better call.
- 🔁 House book / Plan: "Repeating here" when your last 2–3 nights at a house missed the same way (high or light) or had the same top poor-shot reason.
- ⚠️ Game by game flags 3+ balls in one game (shots per ball) and says to give a ball 3–4 frames.
- ⚡ Speed isn't graded until 5 shots have a speed read.
- 🎯 A ball you only ever throw at spares (never a first ball) counts as a spare ball; a spare ball picked by name now checks its cover too.
- 🎒 Plan bag: change-up balls are named for what they fix ("If it reads early / carry drops", "If it goes long / light", "Cleaner / Stronger still"), not a game number. Line added: keep the start ball while it's working.
- 🏅 Best at the house: a ball left out for looking like one in the bag, but scoring 3+ higher here, is called out as that ball's backup.
- 🔀 Game Day: good shots with one ball going high, then light, then high (2+ each) → "the reaction isn't repeating; change balls, not lines."
- 🎳 "Fades here" heads-up says "keep it while it's working" when tonight's strike rate with it is 50%+.
- 📊 Night review: "Pocket held, carry dropped" when pocket % stays and carry falls 25+ points game to game, with high vs light on the late misses.
- 🔔 Carry over/under needs 2+ ringing and 2+ flat corner pins and says "possible"; carrydown chip says "possible".
- 🏷️ Sources shown: house read "(your read)", pattern length "(you entered)", exit board "(estimate)".
- 📏 Layout labels show the pin-to-PAP number; a blank or 0 pin-to-PAP reads "layout not entered" instead of a guess.
- 🎳 Splits: double wood (2-8, 3-9) is no longer called a split. Side-by-side leaves (4-5, 8-9…) still count as splits, now in PinPal history too.

## Changes in v152-beta89
- 🎳 Replay: "Pins view" button shows the shot from behind the pin deck looking back up the lane (perspective lane, 3-D pins, ball and trail; pins left standing stay up). Remembered; "Lane view" switches back.

## Changes in v151-beta88
- 🛣️ Two lanes, two lines: when you play a different line on each lane, a "move" is a change from your last shot on the same lane (moves, "right after a poor shot", game notes). The game line shows each lane's line, and the lane note says when separate lines made both lanes play the same.

## Changes in v150-beta87
- 📡 Ball sensor import (Witsee CSV; other sensors by column name). Game Day → Tonight: "Ball sensor tonight" and which ball it's in (remembered night to night), plus an optional warm-up file as tonight's baseline. No extra taps while you bowl.
- 📡 Scores → a night's review → Add sensor data: each throw is matched to that ball's shots by time (spare-ball shots aren't expected to have one). The review adds your release (speed, revs, rotation, tilt, loft, skid/hook/roll, PAP), start to finish, tonight vs the warm-up, game by game, strikes vs the rest, and your feel vs the sensor.
- 📡 Scores → New night from sensor file: practice sessions and nights not logged here, kept in their own list and out of league stats.

## Changes in v149-beta86
- 🧹 After Save session, Game Day starts blank for the next night: house, league, lanes, starting lane, pattern, bag, who's on the pair, line and any half-entered shot. Preferences stay (keep-score mode, lane alternation, spare-ball rule, folds, house reads).
- ✋ A shot in progress (mark, pocket, off the deck, quality, reason, ball / speed reads, pins, swing, changes, notes) is kept when you leave Game Day, switch apps or the phone closes the app; everything is also saved the moment the app goes to the background.

## Changes in v148-beta85
- 🌙 Night review headline lists where pins went (pocket hits that didn't strike, shots that missed the pocket, missed spares), biggest first, instead of blaming entry angle.
- ⚖️ Energy vs angle needs 6+ pocket hits in each spot, shows counts (4 of 9), says when the balls differed, and words the test move plainly.
- 📏 Rule-of-31 lines say when your pattern length is an estimate ("Unknown house shot").
- Labels: 5 Scoring Elements say they're grades of your logged shots (not measured angle / revs); Revs says the rpm is from your profile; fill balls now count everywhere (eyeball score, 5 Scoring Elements, repeatability, moves, Coach, lane cards, Trends, house card), so the counts match; lane 10s say "on pocket hits".

## Changes in v147-beta84
- 🎯 Spare ball rule on Game Day (default): right-side spares (3, 6, 9, 10) with your spare ball, left side with the ball you threw first; or every spare, or the 10 only (mirrored for lefties). The 2nd-ball screen has a quick "2nd ball with" dropdown, preset by the rule, to change it for that shot. "Fix past nights with this rule" puts the spare ball on past spares the rule covers.

## Changes in v146-beta83
- 🧪 Gap lab (Arsenal → Gaps & ideas): every active ball as drilled and surfaced, on your speed and revs. Finds the biggest gap inside your arsenal's range first, then the next-biggest once that one is filled. Each gap gets test ideas cheapest first: a surface on a ball you own, a new layout on another of a ball you own, or a new-ball spec. Surfaces you've already had (resurface log) and ideas marked "Testing this" are skipped.

## Changes in v145-beta82
- 🎚️ Ball tune: the Barnes box now sits right under the sliders with a live 6-box mini chart (now / if saved) and a caution when saving would move the ball to a different box.

## Changes in v144-beta81
- 🧺 Barnes boxes: drill angle now counts toward shape (smaller = sharper, larger = smoother, centered at 60°), alongside pin-to-PAP which already did.

## Changes in v143-beta80
- 🩺 Arsenal check shows a bag's Barnes boxes as the same 6-box chart as the Barnes chart page (open boxes dashed, crowded box outlined), instead of a text line.

## Changes in v142-beta79
- 🩺 Arsenal check always shows the Barnes boxes for a bag (filled / open), not only when a box is crowded or 3+ are empty.
- 💤 "Not thrown lately" checks only the bag you picked (was every saved bag).

## Changes in v141-beta78
- ⚡ A planned speed change carries on: tap Speed under Changed since last shot once, then keep marking Slower (or Faster); those shots count as planned until you mark Same or go the other way.
- 🎬 Replay: down-lane tracers (boards 15/25 at 34–37 ft, 10/30 at 40–43 ft) and the Baker Box drawn on the lane, each with a checkbox (remembered).
- ▶️ Replay: strikes shown for this game and for the night, every ball counted (fill balls included). Arrows drawn as a real V: 5 and 35 boards nearest the foul line (~12 ft), the center arrow farthest (~16 ft).
- Pro view lane cards now add up to Tonight: shots saved on Game Day without tonight's lane (blank or stray) get it from the frame order, the same fix Scores already made (the card says how many).

## Changes in v140-beta77
- 🏠 House & pair card at the top of the Plan: by-game averages vs your Game Day average, ball × game strike grid, where your feet went, condition chips (house read, pattern / exit board, carry over/under, carrydown, tougher lane, pocket / carry), and one forecast box clearly labeled "theory, not history". Uses the pair when it has 3+ nights, else the whole house.
- 🛢️ Night review: "On the pair: plastic / urethane" dropdowns to set or fix who was on the pair for any past night; it counts in the carrydown comparison.
- 🛢️ Carrydown: the pair line-up is saved with each night. Coach on Game Day calls carrydown when the ball holds later than game 1 (you're moving out, light / flat hits up), stronger with plastic / urethane on the pair: don't chase it in; get outside the track, an earlier-reading ball from tonight's bag, or a touch less speed. Plan / house book warn ahead; Season review compares nights with vs without plastic / urethane (and says when it could just be the house). One plastic / urethane bowler on the pair now counts (was 2).
- 🛠️ Angles: Ways to fix it shows again when no pattern length is picked (your breakpoint is checked at 45 ft, same as the warning).

## Changes in v139-beta76
- 🏠 "How the left plays" is now **House read** (Plan and Game Day): Plays easy, Tight (sport-like), Dry backends, Burns up fast, Carrydown, plus the old Left opens up / Left stays oily. Works without a league (saved on the house; on the league too when one is picked). The Plan's If / then adds one line for the read; Coach keeps moves small on a tight house.

## Changes in v138-beta75
- 🔔 Carry over/under: Coach spots ringing AND flat corner pins on good shots from about the same line (no new inputs; uses the Ringing / Flat tags). First pair: hold, don't chase a single 10. 3+: a line move based on where the breakpoint sits vs the pattern's exit board (Rule of 31: length − 31), plus the smoothest ball in tonight's bag.
- Game Day Coach no longer suggests surface changes. Surface ideas appear only in the Plan (house book) and the post-game review.
- Poor-shot reason is now one dropdown: only the reasons you've used (most used first, with counts) and your own; the rest behind "＋ More reasons…". ✏️ Edit list: rename or remove any reason (↩︎ puts a removed one back); tagged shots keep their reason.
- House book, Plan, post-game review and Season review flag houses with carry over/under (e.g. Imperial: 3 of 3 nights).

## Changes in v137-beta74
- 🧭 Season review (Scores menu): reads every logged night (3+ needed) for what keeps going right, what keeps going wrong, habits, and the top 3 to work on, ranked by cost. "Make #1 my next goal" feeds the goal loop.
- 🎯 Trends: 10-pin spares (7-pin for a lefty), single-pin leaves only, Game Day nights: make % by night plus a pie of Spare / Missed right / Missed left. "Chopped" no longer offered when only the corner pin was left.
- 📉 Game Day heads-up when a game is your low game (8+ under the others over 3+ three-game nights), shown for its first 2 frames.

## Changes in v136-beta73: Off the deck, slow starts, goal loop
- Game Day: "Off the deck" is step 3 of every shot; eyeball score weights off-the-deck (35) and the full routine (15).
- Game 1 alert: 3 pocket hits that don't carry with one ball → change balls now.
- Night review: slow-start headline (pins game 1 cost, what fixed it); one goal for next time, shown on Game Day / Game Plan and graded next night.
- Coach said / you did links moves within 3 frames only; moves that worked count as good calls; grades need 5+ shots; spare-ball check on 10-pin misses.

## Changes in v135-beta72: VLS ⇄ Dual angle
- Arsenal (Edit a ball, Add a ball): type Storm VLS (pin-to-PAP × PSA-to-PAP × pin buffer) or dual angle (drill × pin-to-PAP × VAL) and the app fills in the other (spherical conversion on a 27" ball).
- Symmetric balls use a 5¾" pin-to-PSA (PSA ends up in the thumb hole after drilling, per Mo Pinel); asymmetric uses the spec-sheet pin-to-PSA.

## Changes in v132-beta69: Shorter Game Plan, energy vs angle, tidy Tonight
- Game Plan about half as long: short bullets, no repeated caveats (surface rule, rule-of-31 disclaimers), top-4 lists, one-line trait trends, two-line bag jobs.
- Night review: ⚖️ Energy vs angle (good shots by where you stood: pocket, carry, rolled out, turning hard).
- Coach: when the ball keeps rolling out and you move in, move feet more than eyes to keep the angle.
- Game Day Tonight: finished steps fold to one line (tap to reopen); "Done: tuck it away" button.

## Changes in v131-beta68: House book, Pro view, swing feel, Angles → Game Day
- Angles: "✓ Use this line on Game Day" carries the slide / target / breakpoint back to Game Day.
- Game Day: optional "Swing felt 🙂 Free / 😬 Tight"; Coach calls a 2 & 1 move to free a tight swing even while striking.
- Coach Pro view (Quiet → Pro → Full): tonight, this line, each lane, 10-pin spares, energy and swing as numbers, plus one line.
- 📒 House book on Game Day and the Game Plan: opening line, best line by game, first move timing, tougher lane, 10-pin spares, last nights here.
- Night review: "How your swing felt" by line.

## Changes in v130-beta67: Read aloud everywhere, resurface log, 10-pin misses
- 🔊 Read aloud button on every text panel (bag card, best averages, review sections, Guide…).
- Arsenal: resurface log with date/time and surface; last resurfaced shown in Tune and on the ball list.
- Game Day score card: tabs for tonight's earlier games; tap any frame to fix it.
- "Bad shot, but it still told me about the lane": shows for missed marks too; Coach counts it and says what it showed; editable later.
- 10-pin (7 for lefties) spare misses: left / right (channel) / chopped after the 2nd ball; live pattern alert and a night-review line.
- Night review: 📤 Save to Files via the share sheet (no print pop-up).

## Changes in v129-beta66: Every ball counts, 10-pin story, lane checks
- Night review: total balls thrown, strikes include fill balls (every ball counts), spares made of attempted.
- "The 10-pin story": single corner-pin leaves on pocket hits, what the key pin did, and what it means.
- "Coach said / you did": each line move Coach called, what you actually did, and the next 3 shots.
- Lanes: misses split into poor shots vs good shots, single 10s, and each lane by game; easy-to-pocket-but-not-carrying lane called out.
- Game Day: live "lane X is tougher to get to the pocket / to strike" and "gets you to the pocket but isn't carrying" checks; flush 10-pin leaves no longer count as light hook reads.
- Coach no longer says "In the pocket" right after a shot that missed it.
- The same night saved twice is kept once; fixing a shot's ball corrects the next shot's ball-change flag.
- Fix: slide-outs (Tonight, Arsenal) were squished by the new one-line buttons in v128.

## Changes in v128-beta65: Notes Coach reads, A–Z arsenal, tap-to-edit, tidier Game Day
- Arsenal pages and ball lists sorted A–Z by ball name (lane-condition rankings stay ranked).
- Tap a scorecard frame (Game Day and night review) to edit that shot; tap a game header to edit the game score.
- Game Day: slide / target / BP and ball fold into one-line summaries; tap to change.
- Coach reads your shot notes: messenger and "drove through" = strong entry; 6 tapping the 10 / laying down = weak; wrapped / ringing = too much energy. Notes are tallied per ball and line to back up (or question) "right ball, right spot", with past notes at the house and a night-review takeaway.
- Game Day shot editor now has the key-pin read (6 / 4) and notes.
- Ball matchup line counts strikes as pocket hits.

## Changes in v127-beta64: Quiet Coach, lane map, second set of eyes
- 🤫 Quiet Coach (default): one short line while you bowl, only when something is new; Why › for the reasoning; Quiet/Full switch; repeats removed; short line-check and laydown badges; one-line lane scoreboard and shot log; help text hides after your first two nights.
- 👀 "Still told me about the lane" on poor shots (Coach uses them for lane reads); Lanes: Same / Hook more / Hook less per game, saved and shown in the review.
- Second set of eyes: lane vs lane tonight; this pair over your PinPal history (only when bigger than chance); when you usually move in game 2 here; a ball fading late.
- 🗺️ Lane map: your best lines at each house and pair, and how your best line moves game 1 → 3; on Game Day and the Game Plan, one tap to Angles.
- Barnes chart filters: cover, core, layout, surface, brand.
- Baker Box: night review, Stats and Trends use your Baker Box / Rule of 31 settings; Angles checks the box without a pattern length.

## Changes in v126-beta63: Trends, repeatability, lane totals
- 📈 Scores → Trends: every night on one timeline (average, repeatability, eyeball score, strikes, spares, pocket, carry, series, high game, 5 Scoring Elements); running-average and trend-line checkboxes; period / house / pair / league filters; tap a night, open Game Day nights.
- 🔁 Repeatability score: your mark, normal speed, release, and the same result from the same line and lane; in the night review (with each game), Stats and the Game Day summary.
- Lanes: shots saved without a lane get it from the night's alternation, so lane totals add up.
- Replay speeds ¼× ½× 1× 2× 4×.

## Changes in v125-beta62: Smoother replay, Game Day editor, report fix
- ▶ Replay: one smooth bird's-eye ball path (skid over the target, arc to the breakpoint, hook, roll into the pocket); the ball slows as it reaches the pins; pins at the far end of the lane.
- ✏️ Shot editor uses Game Day's choices: dropdowns for ball, game, frame, lane, mark, pocket, exit, key pin, execution, reason and speed; a pin deck for pins left and after the 2nd ball; ball reaction chips.
- Typed values from older edits ("Flush", "Left", "na") are cleaned up to Game Day's values.
- Reports: a strike with no pocket read counts as a pocket hit everywhere (night review, games, lanes, balls, Game Day, replay); "Try next time" about moves is recalculated after edits.

## Changes in v124-beta61: Replay lane and ball path
- ▶ Replay: longer, narrower lane with numbered pins; dotted rings show your target and breakpoint.
- Ball path follows what you logged: a miss at the target carries on the same angle past your breakpoint (right of mark can't go through it); recovered / held misses come back to the pocket you logged; the pocket read decides where it enters, else the mark and the leave do. Each shot says how its line was drawn.

## Changes in v123-beta60: Night replay, add missed frames, pair-first bag
- ▶ Watch replay on each night's review: shot-by-shot lane animation (laydown → target → breakpoint → pocket, pins left, spare ball), running scorecard and the night's numbers; play, pause, skip, 2× / 4×, drag to any shot.
- ➕ Add a frame, fill ball or whole game you skipped after the night; it goes in the right order and is marked "added later".
- 🎒 Bag pick: on the pair you're bowling, a ball with 6+ games there clearly above your pair average is the start ball; Best averages on the pair (3+ games) listed before the house.
- Scores: Min games dropdown in History and Stats; Stats ball breakdown sorted highest average first.

## Changes in v122-beta59: 5 Scoring Elements, smarter bag pick
- 🎳 Del Warren's 5 Scoring Elements (Kegel): Direction (geometry, targeting, posture), Speed (total, versatility), Angle (entry, exit point), Revs (hook, versatility), Roll. Each graded with its parts in the night review; planned speed / hand changes (Changed since last shot) count as versatility, not misses.
- 📊 Stats: 5 Scoring Elements by night, with the average and your lowest element; tap a night to open its review.
- Bowler page and Guide reworded to the new model.
- 🎒 Bag pick: the start ball is the one with the best game 1 record at the house; records are recency-weighted (last 12 months count fully); balls with games here come before untested ones, which are labeled; one-line reason per ball on the bag screen.
- 🏅 Best averages here: your top balls at the house, and why any of them didn't make the bag (recency, plays too close to another ball, lower recent form).

## Changes in v121-beta58: Full scoring, Stats dashboard, cloud backup

- **🎳 Full scoring in Game Day:** after each non-strike, tap the pins still standing after your 2nd ball (or Spare); splits flagged; 10th frame and fill balls; live 10-frame scorecard and running score; scores fill in on save. Setting: keep score here, or first ball only (scoring in PinPal).
- **📊 Scores → Stats:** one page for PinPal + Game Day games (a night in both counts once): average, high game/series, strikes, spares, single pins, splits made, clean games, the "every single pin" average, charts by score / game / frame / month, breakdowns with tap-to-filter, spare leaves, and the games behind the numbers.
- **Night review:** frame-by-frame scorecard per game; 2nd ball in the shot log and editors.
- **☁️ Cloud backup** (Home → Your data): sign in (Netlify Identity), back up now or after each saved night, restore on a new phone. The app still works offline as before.

## Changes in v120-beta57: Home without the Go to tiles

- **Home** opens straight to its five cards (Get set up, Every league night, Your data, Send feedback, Testing tools); the tab bar at the top goes to every page.

## Changes in v119-beta56: Home menu, Angles, laydown point

- **Home is condensed** like Arsenal: Go to tiles for every page, then Get set up, Every league night, Your data, Send feedback and Testing tools, one at a time.
- **📐 Angles** (renamed from Angle): the laydown offset field is gone; **Laydown point** shows in its place (slide − your laydown offset from the Bowler page, footnoted).
- **Game Day** shows your laydown point at the foul line under Slide / Target / Breakpoint.

## Changes in v118-beta55: Scores sections and the night review

- **Scores opens to a menu:** 📚 History (search your PinPal games) and 🎳 Game Day nights (review each night), with a tile bar to switch.
- **New night review:** the scores and one line on what the night meant, then What tonight says (what worked, what cost pins, try next time), game by game, lanes by number, balls with results, your moves, poor-shot reasons, More details folded, and a shot log grouped by game with moves and flush-but-left flags.
- **Double tap** a night (or its top card) for the shot log. **📄 Save as PDF** and **🔊 Read aloud** for the review.
- The night list uses the same numbers as the review (10th-frame fill balls left out).
- **🐎 Dark horse:** no predicted score; only your past results.

## Changes in v117-beta54: Poor-shot reasons, lane fixes, dark horse

- **🤔 Poor-shot reasons** (Game Day → More reads): tap **Poor** and pick what it felt like (thumb stuck, chicken wing, dropped it, squeezed, pulled / pushed, timing early / late, fell off the shot, released it well) or **+ Add your own**. Coach checks your read against Your mark, pocket, reaction and Speed vs normal, says whether the line had room (miss held / recovered), and sums it up tonight and on the Bowler page (Your read vs. the result).
- **Lanes:** each new game starts on the other lane by default (setting: same lane). Tap the lane / frame beside the pin deck (✎ fix) to fix a skipped shot or the starting lane, and move this game's logged shots to match.
- **📐 Angle → Back to Game Day** when you opened it from Game Day.
- **🐎 Dark horse** (Game Plan, Coach picks my bag): a ball you've hardly thrown at this house whose cover / core / layout / Barnes box match what has worked there, with a surface suggestion. A theory to test in practice.

## Changes in v116-beta53: Focal point

- **🎯 Angle → Focal point** at the bottom of the board list: where your line would be at the pins (60 ft) if the ball went straight (Kegel three-point targeting: laydown → target → focal point), plus a marker on the lane. Shown with Pocket on or off.

## Changes in v115-beta52: Pocket line, Rule of 31 checkbox, house drop-down

- **🎳 Angle → Pocket** (1-3, or 1-2 for a lefty): draws the hook from your breakpoint (or an estimated turn) into the pocket, lists the boards down to 60 ft, and shows a **Will this line work?** card: Baker Box / rule of 31, breakpoint fit, channel, recovery boards and an entry angle estimate (USBC: 4–6° carries best).
- **📏 Rule of 31 is a checkbox** on the angle page, Game Day and the Game Plan (one shared setting). Unchecked = no exit-point advice; sport patterns (3:1 or less) check it by themselves.
- **House drop-down** on Coach picks my bag and the Game Plan: your houses, houses from your PinPal history, and + Add a house.
- **Lanes tidy to 7-8** everywhere ("78", "13 & 14", "23" → 23-24).

## Changes in v114-beta51: Arsenal and Oil as sections

- **Arsenal opens to a menu** of 8 pages: Add a ball, Barnes chart, Coach picks my bag, Create your own bag, Arsenal check, Gaps / duplicates / ideas, Lane conditions, Ball list. Each page shows a 4 × 2 icon grid to jump to the others; "☰ Arsenal" returns to the menu; Back works.
- **Create your own bag** (the old Bag page) now lives under Arsenal; Bag is gone from the main tabs.
- **Oil & houses opens to a menu:** Add an oil pattern, Saved patterns (Load opens it for editing), Houses.
- **Houses** shows your houses plus every house in your PinPal history (games, last bowled), with + Add, Remove and Add all.
- Old links (e.g. Arsenal check from Bowler) land on the right page; a notice shows when the Ball list filter is narrowing other Arsenal pages.

## Changes in v113-beta50: Spare balls

- **🎯 Spare ball setting** (Arsenal → tap a ball → Tune): Not a spare ball / My spare ball (spares only) / Strike ball and spare ball (e.g. a Level that doubles as burn ball and spare). Plastic / polyester count as spare balls automatically.
- **Game Day → Tonight:** "Bringing my spare ball tonight" with a dropdown of spare balls, strike balls that double as spare, and any other ball in tonight's bag. Bags remember their spare.
- **Coach names your spare ball:** "Use your TZone: straight, flat release"; for a reactive or urethane spare, flat release with a board or two more angle; no spare tonight: flatten your release with your strike ball.
- **Game Plan:** "Plus your spare ball: TZone", or "Level doubles as your spare ball, so you can leave TZone home".

## Changes in v112-beta49: Barnes search, one bag everywhere

- **🔎 Search on the Barnes matrix:** type a name, brand, cover or surface; matching boxes light up, results show box and early / mid / late, tap one (or Enter) to open its box page at that ball, or Tune ›.
- **Spare balls are never strike balls:** plastic / polyester balls are left out of every bag pick; the bag names your spare ("Plus your spare ball: TZone").
- **Arsenal's Suggest my bag = the Game Plan bag,** even with "Only balls I added" or the list filter on; it says which balls the filter is hiding instead of swapping them.
- **Lanes shown as 77-78** everywhere.

## Changes in v111-beta48: Lane conditions, cleaner Game Plan

- **🛣️ Lane conditions** (Arsenal, replaces the role list): pick a condition (fresh / heavy oil, typical house shot, carrydown, moving left, lanes burning up, wet / dry, early friction) and see your top 3 balls rated Great / OK / Weak fit. Resurface tips only when a new surface moves the ball up a level, with warnings if it would then play like another ball or leave another job uncovered; "Best resurface option" when nothing you own fits well; "Use this ball on Game Day". Plastic spare balls are left out.
- **Game Plan bag and lane-condition sections:** one result per line with ⭐ on the best, small headings for "On lanes" / "Across the house" / "The bag", and each ball's reasons as sub-bullets.

## Changes in v110-beta47: Barnes matrix

- **Barnes chart is now a 3x2 matrix** (strength down, smooth / sharp across, the way Chris Barnes draws it): ball count, Covered / Deep / Gap, an early → late strip, and your top balls in each box. Urethane and spare on one line underneath.
- **Double-tap a box** (or tap its count or "+N more") for a full page: every ball on a big early → late chart, with brand, cover, surface, RG, differential, hook / backend bars and **Tune ›**. Back button or swipe back returns to the matrix.
- **Your slider adjustments:** a small gold * badge on the edge of the ball.
- Wording: "pro shop operator" instead of "driller".

## Changes in v109-beta46: matchup & risk, your notes tested against your games

- **🎯 Matchup & risk by game** (Game Plan): each bag ball's game 1 / 2 / 3 average at this house, with a warning when a ball fades (e.g. Fate at Sterling: 244 / 229 / 189, every game 3 well under).
- **🎯 Matchup meter** (Game Day, above Coach): Good / Watch / Not a matchup tonight for the ball in your hand. Starts from that ball's history for this game here, then updates from tonight's last 6 shots with it (pocket, strikes, and whether good shots read early / high or long / light). Names the bag ball to go to.
- **📓 From your PinPal notes:** "14 over 5" is read as slide 14 over breakpoint 5. Where you usually start game 1 and finish game 3, when you change line and ball in each game, and what your notes mention most.
- **Meter labels name the game:** "Good matchup for game 1", "Watch: game 3 drop-off", "Fading in game 3, as it usually does here: switch". A ball that's strong here in this game gets a line move before a ball change. When Coach calls a ball change, the meter names the same ball.
- **🧪 Your notes for a house** (Game Plan and Game Day): write what you've noticed; Coach tests each claim (10 pin, high / weak hits, a game that scores well or is hit-or-miss, ball changes, moving outside / inside) against your PinPal games and Game Day: ✅ supported, 🟡 partly, ❌ not supported, 👀 watch for, ⏳ not enough data.

## Changes in v108-beta45: Tonight in 3 steps, bags remember their house, bag picks by lane condition, tabs in order

- **Tabs in order:** Home · Bowler · Arsenal · Oil · Plan · Bag · Game Day · Scores, then Angle and Guide (tools you use any time).
- **Home:** "Get set up" (once, in order: Bowler, Arsenal, PinPal history, Oil) and "Every league night" (Game Plan → Game Day Tonight → practice and bowl → Scores).
- **Game Plan → 🎒 Save this bag & go to Game Day:** saves the plan's bag with the house, lanes, league and oil, and opens Game Day set up for it.
- **Bag picks by lane condition:** the start ball (fresh, game 1), then the ball that has beaten your game-2 average here (transition) and your game-3 average here (burn), 4+ games each. Where no ball has, Coach picks for motion spread and says so. Every ball still sits 10+ points apart on the Early → Late scale.
- **Tonight is 3 numbered steps:** ① Where you're bowling (house, league, lanes, oil), ② Your bag, ③ Who's on the pair (optional). Each step shows ✓ done or what it still needs, and the house is now a must-have.
- **A bag remembers the house it was built for.** Arsenal → Suggest my bag saves the house, lanes, league and oil with the bag. "Save & go to Game Day" sets Tonight to that house, so Coach's pregame plan is for the right house.
- **Bag / house mismatch warning:** pick a bag built for another house and Game Day asks: Bowl at Sterling, or Keep Shelby. Bags for tonight's house are listed first; changing house switches to your newest bag for that house.
- **Oil follows the house** (Game Day, Arsenal, Game Plan): a pattern saved for another house is swapped for this house's pattern, or cleared so you pick tonight's.
- Houses from your PinPal history are in Game Day's house list.

## Changes in v107-beta44: staying ahead of the lanes, 💬 Send feedback, team roster and carrydown heads-up

- **Who's on the pair** (Game Day → Tonight): your team's roster is saved on the league (name, right/left, one- or two-handed, reactive/urethane/plastic) with a team size (Monday 4, Thursday 5); tick who's bowling tonight. Tonight's opponent is counted by right / two-handed / left / urethane / plastic. Coach estimates the shots on each lane between your frames and games, how many reactive balls are on your side, and how many urethane/plastic balls are pushing oil down the lane.
- **🛢️ Carrydown heads-up:** with 2 or more urethane/plastic bowlers on the pair, the starting plan, the game 2/3 heads-up and the early warning say to expect a weaker back end and a longer lane, and to try a stronger solid ball, a touch less speed or more rotation before moving in.
- **🔁 Between-games heads-up:** at the start of games 2 and 3, Coach shows the shots on your lane since you were last on it (and on your side), how that game usually goes at this house, when you've moved in that game on past nights here, where you finished, and the move to have ready if your first good shot reads early or light.
- **⚡ Early warning:** the first good shot that reads differently after good ones gets "if your next good shot does the same, make the move right away", with the move.
- **Ways to do it:** when Coach calls a move it lists the top 2–3 ways (feet and eyes, speed, loft, ball...), ranked by the lane and your LASER ratings. Tap the one you'll use.
- **Changed since last shot:** Feet / eyes, Speed, Loft, Hand, Ball chips, saved on the shot (feet and ball are filled in automatically when your line or ball changed). This is what Coach will use to check your LASER ratings against what actually works.

- **Send feedback** on Home: opens the share sheet (Messages / Mail) with the app version, phone, iOS version, home-screen vs browser and hand filled in, plus "Which page / What happened / What I expected". Testers add a screenshot and send it. Falls back to copying the text, then to email.

## Changes in v106-beta43: 📦 Baker Box

- **Baker Box** (Angle page, shared with Game Day's Coach): boards 5–8 at 42–46 ft, where the ball splits the 8-9 for the best carry (Mark Baker). Drawn on the lane; the Angle page says whether your line goes through it, and Ways to fix it aims at its middle.
- **When it applies (per the poster):** almost all house shots, and sport shots 38–43 ft long. On other sport patterns the rule of 31 leads; on house shots the rule of 31 is shown as a suggestion.
- **Zone 1 exception:** playing boards 1–10 at the arrows, the box starts at 38 ft for speed-dominant bowlers (Bowler page) or a urethane ball (Game Day).
- **Coach's line check uses it:** "from slide 21 over target 14 the ball is on about board 10 at 44 ft, 2 boards inside your Baker Box".

## Changes in v105-beta42: breakpoint check fixed

- **Fix:** a line straight up one board (e.g. slide 20, laydown 6, target 14) with the breakpoint on that board was flagged as not fitting and showed "move 0 boards" fixes. It now fits.
- A breakpoint only counts as fitting when the line is on that board near the end of the oil (12 ft before to 8 ft after), not back at the arrows.
- **Back to pocket** row at the bottom of the Angle table: boards the ball has to come back from your breakpoint (or the oil exit) to the pocket, and in how many feet.
- **Target distance in Game Day:** a "Target is at" dropdown (arrows 15 ft, dots 7 ft, or 20–40 ft) under Slide / Target / Breakpoint. Log the board your eyes are on at the distance you look; Coach's line check, the angle of each shot and the Angle link all use it.
- **Gentler rule-of-31 advice:** when matching the exit point would take a feet move of more than 5 boards, Coach says the rule of 31 is an estimate (a few boards outside is common on a house shot) instead of telling you to make the big move.
- **Sport patterns (ratio 3:1 or less, USBC's line):** Coach labels them "sport pattern", medium ratios (3–7:1) "medium ratio", 7:1+ "house shot". Big-move advice depends on it: on a house shot a few boards outside the exit point is fine; on a sport pattern Coach works you back toward it in 2-board moves.
- **Angle page shows the ratio** of the pattern and tightens the exit-point check to ±1 board on sport patterns, with wording for each type.
- **Game Plan on a sport pattern** (pick it under Pattern) uses your PinPal games on that pattern, or on any named tournament pattern, instead of the house shot, and adds a 🏁 Sport pattern section: smoothest, most controllable ball, close to the exit point, smaller moves. With no sport games it says the records are from the house shot.
- **Fix:** ratios written "10-1" were read as 101; "10-1", "10:1", "10 to 1" and "10/1" all work now.
- **Fix:** a ball could show as the first pick and in "avoid opening with" at the same time (two PinPal names matched to one ball).
- The warning is reworded in plain terms: where the ball is at the end of the oil, how far off your breakpoint is, and which way.

## Changes in v104-beta41: placeholders and dropdowns

- **Example text is light gray and italic** everywhere (e.g. "e.g., 24.5"), so it can't be mistaken for a value you entered. A dropdown still on its "not set" choice looks the same way.
- **Slide shoe on the Angle lane:** a left shoe print for a right-hander (right shoe for a left-hander), with its inside edge on your slide board.
- **🛠️ Ways to fix it (Angle):** when your breakpoint doesn't fit your line (or the line leaves the oil 3+ boards from the exit point), the Angle page lists exact fixes: feet only, target only, 2-and-1, parallel (USBC's standard moves), a laydown-offset check, or "my breakpoint is really board X". Tap one to put it on the lane; Undo puts it back.
- **Dropdowns for short, fixed choices:** Bowler → axis tilt (0–30°), axis rotation (0–90° in 5s), laydown offset (2–10, or "Not measured yet (Coach uses 5)"); Oil → pattern length (30–52 ft); Arsenal → bag size (1–15); Angle → laydown offset and pattern length. Saved values that aren't on the list are kept.

## Changes in v103-beta40: tracer boards placed correctly

- Range finders now sit on boards 15 & 25 (34–37 ft) and boards 10 & 30 (40–43 ft), as on the lane.

## Changes in v102-beta39: Angle lane redraw + back end

- **Narrow lane** in the middle, with distances on the left and the ball's board on the right.
- **All 39 boards** drawn very lightly, every 5th board bold. Arrows are long, narrow darts staggered in a V (about 12.5 ft outside to 16 ft at board 20), the way you see them from the approach.
- **Downlane range finders / tracer boards** (boards 15 & 25 at 34–37 ft, boards 10 & 30 at 40–43 ft): a checkbox, for houses that have them. Their start and end are added to the table too.
- **Back end:** how many boards the ball must come back from the end of the oil (or your breakpoint) to the pocket, and in how many feet. 8 or fewer = direct line, 13 or more = big swing (same scale as Coach). It replaces "a straight ball hits board X at the pins".

## Changes in v101-beta38: 📐 Angle calculator

- **New Angle page** (nav → Angle, or "📐 Angle for this line" in Game Day). Put in your slide board and laydown offset, then aim at a target (arrows, 15 ft or any distance), a **pin focal point** (any pin; left edge / left / center / right / right edge, Kegel-style) or any board at any distance.
- It draws the straight line on a lane (dots, arrows, oil, exit point, pins) and lists the board at the foul line, 7, 15, 30, 45 and 60 ft, the end of the oil, and any distances you add (e.g. "32, 43").
- Alerts: leaving the oil outside the exit point (reads early) or inside it (skid, over/under), with the slide that fixes it for your target; reaching the channel; what a straight ball hits at the pins and how many boards the ball must hook back to the pocket; a breakpoint that this line can't reach (an alignment check); spare lines with the arrow board to look at.
- **Coach's line math now uses the real pattern length.** It used to measure the exit at 60 ft whatever the pattern; it now measures where the oil ends, so "slide X, lay down Y" matches the Angle page.

## Changes in v100-beta37: burn from game 3, how the left plays per league

- **Burn from your PinPal game 3s.** By lane condition is now Fresh (game 1), Transition (game 2) and Burn (game 3), all from PinPal, so a house with years of games always has a burn read. Game Day nights where the ball actually read early add a sharper line on top. Coach adds a game 3 note at the start of game 3.
- **How the left plays on this league.** Game Day → Tonight and the Game Plan have a setting saved on each league: "Left opens up (two-handers, high revs)", "Left stays oily (friction outside & down lane)" or "Not sure". Shelby Thursday and Sterling Saturday can be set differently. The Game Plan's If / Then, the lanes section, Game Day's "Watch for" line and Coach's notes on early reads follow it (mirrored for lefties).
- **League on the Game Plan page**, with "+ Add a league…" when the house doesn't have one yet.

## Changes in v99-beta36: short Game Day plan, lane beside the pins

- **Game Day starting plan is short.** Ball, line, what to watch for, spare and oil: one line each. The house history, ball records and fresh-lane lists stay in the Game Plan, which holds the detail and the reasons.
- **Lane and frame beside the pin deck.** "Lane 13 · G1 · Frame 4" sits on the left of the pins when you're on the left lane and on the right when you're on the right lane.
- **Game Plan, this house only.** "Where you stand" no longer lists your averages at other houses.

## Changes in v98-beta35: fixes from the Oct 15 Shelby night review

- **Local date everywhere.** The Game Plan, its PDF title, the bag-day check, the shared bag cache and backup file names used UTC, which is already tomorrow after 8 PM in Detroit. They now use the phone's own date.
- **PinPal lane notes with typos.** "Lames 13s & 14" and similar now count as lanes 13 & 14 (only real odd/even pairs, so "16 over 6" never does).
- **Coach energy calls wait for agreement.** A speed or energy change needs 2+ good pocket shots that leave the same kind of pin; a strike on the last good shot means "keep repeating". The compass no longer says "Move your feet" when the advice is about speed.
- **Lane by lane.** When one lane of the pair strikes less and reads early (or long) on good shots, Coach says which lane and suggests a 1-board move on that lane only.
- **Miss pattern.** 3+ missed marks the same way get a "that's the throw, not the lane" note.
- **Your shots beat "on paper".** When the ball is hitting the pocket and striking, Coach stops flagging it as "reads late on paper".
- **Coach's advice is saved with each shot**, and **game scores** are asked for (optionally) when you save the session.
- **PinPal check.** Importing PinPal adds the scores to each Game Day night and lists frames where the pins disagree, with a button to use PinPal's pins.
- **Pin check on Save shot.** If the pins tapped don't fit the pocket read (or 7+ pins are tapped), Game Day asks whether you tapped the pins that fell and offers to flip them.
- **League filled in** from the house and the weekday in the league's name.
- **Lane scoreboard fixed.** It now uses the lane saved on each shot and skips the "Start Game" markers, which had been counted as shots and shifted every later shot to the wrong lane. Carry % counts only strikes on pocket hits.
- **Plain percentages.** Pocket hit % and carry % count every shot once (they used to weight good shots 5× without saying so). "Quality %" is now "Good or OK shots".

## Changes in v97-beta34: 🔊 read aloud
- **Game Plan → 🔊 Read aloud** reads the whole plan (tap again to stop). **Game Day → Coach → 🔊 Read aloud** reads what Coach is showing (the pregame starting plan, or the current advice).
- Uses the phone's built-in voice, sentence by sentence; symbols are spoken naturally ("13 & 14" → "13 and 14", "%" → "percent", "43 ft" → "43 feet", "5.46″" → "5.46 inches", "G1" → "game 1"; emoji skipped). Hidden if the browser can't speak.

## Changes in v96-beta33: one bag answer everywhere
- **Game Plan, Arsenal "Suggest my bag" and Game Day Coach now give the same pick** for the same house, lanes, league, pattern and bag (shared `BTPlan.forContext`).
- **Arsenal → Role Planner → Suggest my bag** asks where you're bowling (house, lanes, league, pattern; prefilled from Game Day's Tonight / your last plan; picking a league fills its house). With history for that house it suggests the Game Plan's bag (start ball, earlier ball, later ball, with the reasons); with none it falls back to the motion roles and says so. More than 6 balls: extra slots add motion separation. "Use this bag on Game Day?" names the bag for the house and pair.
- **Game Day Coach** opens with the Game Plan's first ball when it's in tonight's bag ("📋 Same as your Game Plan…"), or says the plan's pick isn't in the bag.
- League now picks the matching PinPal league for "This season" in the Game Plan.
- Coach's bag-timing line says **"on paper"** and "trust what you see in practice".

## Changes in v95-beta32: Game Plan corrections (from the Shelby 13 & 14 review)
- Weak + high leaves rising together is presented as a **possibility** (early read and lost energy) alongside launch direction, speed / release changes and over/under lanes; leaves can't show where skid ends and roll begins. Suggestions are "worth testing in practice", with alignment checked first.
- First ball is "Top pick on **sample-weighted** record" (more games and recent form outweigh a high average on a few games), with a note that records mix seasons, surfaces, lanes and form. The bag recommendation now starts with the same first ball.
- Balls with no games at the house say "other balls with its cover / core / layout averaged about X (not this ball's own result)".
- Rule of 31 uses your saved pattern for the house (picked pattern, else tonight's / last Game Day pattern there, else a saved pattern named for the house), and calls the result an **exit area estimate**, not a required breakpoint. Alignment check uses the **ball's path** (slide board − laydown), not the slide foot.
- If / then is less absolute: no "don't move your feet" / "change balls first" rules; "later" (through the front) and "smoother" (at the back) kept distinct. **No surface changes during sanctioned competition**; do them before league.
- Warns when a bag named for another weekday is selected (e.g. "Monday" on a Thursday).

## Changes in v94-beta31: tuned balls marked
- A gold **\*** marks every ball you've adjusted with the sliders: on its Barnes chart dot and name chip (with a key entry), in Ball details, and in Compare (which also gets a "Your sliders" row).

## Changes in v93-beta30: sliders move balls between Barnes boxes
- **Sliders are the advanced player's own read.** Strength and Backend now count double in the Barnes box (about 2–5 clicks crosses a box edge), so you can put a ball in the box you see it in. Leave them at 0 and the app uses its own calculation. Coach (Game Day), the Game Plan, the Role Planner and the chart all use your saved setting.
- Clearer slider labels: **Strength** (weaker ↔ stronger: Weak / Medium / Strong), **Length** (earlier ↔ later on the chart), **Backend** (smoother ↔ sharper: Smooth / Sharp).
- **Live preview** in Ball details: "With these sliders: Strong / Smooth, reads mid (52)… ← a different box" before you tap Save.

## Changes in v92-beta29: high-flare pin position
- Pin-to-PAP around **3⅜–4¼″ is now "High flare"** (the core's maximum-flare position): the most total hook, strong but arcing, peaking near 3¾″. It was wrongly treated as neutral "benchmark". Short (< 3″) is lower flare and smoother; long (4¼–5½″) is the most angular, peaking near 5″; very long (past ~5½–6″) smooths out again.
- With the new PAP: Physix Blackout and Infinite Physix (≈3.3–3.4″) → Strong / Sharp; Code Black → Strong / Sharp; HyRoad 40 → Medium / Smooth.

## Changes in v91-beta28: pin distance on a smooth curve
- **No more 4.75″ cliff.** Pin-to-PAP now changes a ball's motion gradually: short (< 3″) earlier and smoother; benchmark (3–4½″) neutral; long (4½–5½″) more length and the most angular backend, peaking near 5″; **very long (past ~5½–6″) smooths out again** as flare drops off, while staying long through the front. "Pin down" keeps its control effect; with no number, the Pin Location label is used.
- New layout type **"Very long pin"** in Ball details, Compare, Game Plan and lane-condition patterns.
- With the new PAP, 8 balls change Barnes box (e.g. Zen Master #2, Phaze 2, ProMotion → Strong / Smooth; HyRoad #1 / #2, Crown Victory → Medium / Smooth; Venom Shock #1 / #2 → Weak / Smooth). Medium / Sharp drops from 19 balls to 16.

## Changes in v90-beta27: ⚖️ compare balls; "on paper" timing notes
- **Compare 2–3 balls side by side:** tap ⚖️ on a ball in the list or in Ball details; a Compare bar appears at the bottom. Columns = balls; rows = specs (brand, cover, core, RG, diff, intermediate diff, surface), layout (pin-to-PAP, PSA-to-PAP, pin buffer, drill, VAL, total, layout type, pin), on paper for you (Barnes box, Early→Late, hook / length / backend), and your record (PinPal games, average, strikes, best house, status, bags). Rows where they differ are highlighted.
- **Barnes chart notes say "on paper":** "most of your arsenal rates late" is a spec + layout + PAP rating, not how the balls rolled. When Game Day reads disagree (e.g., mostly early / high), the note says so, tells you to trust the lanes, and suggests checking the layouts against your PAP instead of adding surface.
- "N/A" in a ball's specs no longer shows as 0.00.

## Changes in v89-beta26: reading early vs weak, lane conditions, roles scaled to you
- **Fix: Add a ball → Save to Arsenal now saves the layout** (pin-to-PAP, PSA-to-PAP, pin buffer; new optional drill / VAL angles; "4 1/2" accepted) into the real layout columns, so ratings, the Barnes chart, Ball details and Edit all see it. Balls added earlier get their layout back automatically. Edit also works on what-if balls.
- **Game Plan, "What the lanes are telling you":** weak-hit leaves no longer automatically mean "more ball". Weak AND high leaves rising together (this season vs before, or here vs everywhere) = the ball reads early and burns up → start smoother and more controlled, change balls before chasing left (players inside you may have opened the left). Weak alone is called ambiguous unless Game Day reads (Early / Long, High / Light) say which. If/then and Focus follow the same read.
- **By lane condition (Game Plan + Coach):** fresh (game 1) and transition (games 2–3) compare your cover, core, layout and surface results and name your best balls, at the house or across all houses when there aren't enough games; burn comes from Game Day games where reads say early/high. Coach adds the fresh line to the starting plan and the transition picks as game 2 starts.
- **Role Planner scaled to you:** role targets sit inside your own hook / length / backend range (they were set for a higher-rev bowler, so everything looked like a gap). New **🛡️ Control check** for early-friction nights: balls that are clean through the front and smooth at the back, or a clear gap.

## Changes in v88-beta25: 🗑 delete a ball
- **Arsenal → tap a ball → 🗑 Delete** (next to Retire). Removes one entry: a double-entered ball deletes one copy and the other keeps its sliders, bags and history. A hand-added copy goes first.
- When the last copy is deleted it also comes out of saved bags, sliders, care and PinPal matches; Game Day shots thrown with it stay in history. The confirm explains Retire (ball you no longer throw) vs Delete (a mistake).

## Changes in v87-beta24: ✏️ edit a ball on the phone
- **Arsenal → tap a ball → ✏️ Edit:** change the name, brand, cover, core, RG, differential, intermediate diff, surface, pin location, and the layout (pin-to-PAP, PSA-to-PAP, pin buffer in inches, "4 1/2" works; drill and VAL angles in degrees; total angle = drill + VAL). Pin-to-PAP is written to both the VLS and dual-angle columns.
- **Renaming keeps everything:** sliders, surface change, weight / resurfaced / retired, saved bags, Game Day shots (current and saved sessions, last line) and PinPal ball matches move to the new name. Duplicate names are blocked.
- Edits are saved on the phone; uploading a new ball spreadsheet replaces them.

## Changes in v86-beta23: 🎒 bag recommendation + ball details
- **Game Plan → "How many balls?" (1–6):** Coach recommends a bag for that house and pair. It first reads your patterns there: averages by cover (solid / pearl / hybrid / urethane), core (sym / asym), layout (short / benchmark / long pin) and Barnes box, for games thrown with balls matched to your arsenal (small groups pulled toward the average). Each ball is scored on its own record there (3+ games, recent form blended in) plus what its traits predict; the pair adjusts the house read when it has games. Picks start with the best ball, then alternate earlier and later (what the lanes need first), each at least 10 points apart on the Early→Late scale, so every ball has a job. Tournament defaults to 6.
- **Arsenal → tap a ball = Ball details first:** core, RG, differential, intermediate diff, cover, surface, VLS (pin-to-PAP × PSA-to-PAP × pin buffer), dual angle (drill × pin-to-PAP × VAL), total angle, layout type, pin, and Barnes box. Adjustment sliders below.
- CSV: duplicate headers (VLS vs Dual Angle "PAP / PSA / Val") are all kept now ("PAP#1" etc.); the motion model reads the same columns as before.
- Arsenal data: layouts re-expressed against the new PAP (5.182 over, 0.293 up).

## Changes in v85-beta22
- Game Plan: lanes can be typed on the iPhone number pad. "1314" reads as lanes 13 & 14, and a single lane ("13" or "14") reads as its pair.

## Changes in v84-beta21: 📋 Game Plan + clearer Game Day labels
- Game Day ① **Your mark** buttons say what they mean: Hit my mark · Right of mark, recovered · Left of mark, held · Right of mark · Left of mark. ② Pocket uses Left of pocket / Right of pocket, so the two "missed left" buttons can't be confused.
- Rule (unchanged logic, now in the Guide): hit your mark with normal speed and release → where the ball goes is the lane; missed your mark → it's you, even if Good execution is tapped.
- ④ More reads: each group on one line with short labels (Execution: Good/OK/Poor · Reaction: Early/Long/Over/under/Carrydown · Exit: Left/Straight/Right · Speed: Slower/Same/Faster). "Didn't notice" buttons removed: skip it, or tap again to clear. Saved values unchanged, so older shots read the same.
- Quick result buttons on one line.
- **📋 Game Plan page (new):** type where you're bowling (+ lanes, bag, pattern, league or tournament) and Coach builds tonight's plan from PinPal history, Game Day nights, arsenal and bag: where you stand, what the lanes are telling you (leave signatures here vs everywhere), first ball + backup (record here, recent form blended in), starting line (last Game Day line, PinPal "X over Y" notes, rule of 31), if/then, spares, lanes, focus. Save as PDF (print sheet) or share as text. Linked from Home, the nav and Game Day. Guide section added.

## Changes in v83-beta20: 📚 PinPal history
- **Import a PinPal backup** (.pinpal) on Scores → History. Built-in read-only SQLite reader (no server, no library): games, frame-by-frame pins left after each ball, ball per frame (mid-game changes), house, league, pattern, date; lanes and starting lane parsed from night notes ("Lanes 23s & 24"); "X over Y" lines kept. Verified on a real backup: 1,869 games, recomputed scores match PinPal on 1,855 of 1,856 completed games.
- **Quick questions + filters**: houses, game 1·2·3, lane pairs, starting lane, best balls, year, league, spare leaves; filter by house / lanes / ball / year / game #. Tiles: games, average, high, 200+ %, strike %, spare %, single-pin %, opens/game.
- **Ball names** matched to the arsenal automatically when they agree; the rest mapped once by the user.
- **Coach**: Game Day starting plan adds history for tonight's house, lanes and bag (average, lane/start-lane split, best balls there, bag record there, costliest single-pin spare); warns at the start of game 2/3 when that game usually drops off at the house. Arsenal tune shows each ball's PinPal record.
- Game Day quick result buttons (Strike / Brooklyn / Flat 10 / Ringing 10) fit on one line.

## Changes in v82-beta19: 🎳 Barnes chart
- **Your Barnes chart** on Arsenal: Chris Barnes's six boxes (Strong/Medium/Weak × Smooth/Sharp) + Urethane (ZVL) + spare row; each ball placed Early → Late **for your release**. Numbered dots + names, color by cover, dashed what-if balls, scope = whole arsenal or a bag.
- **Gaps, steps and ideas:** empty boxes with what to look for, crowded boxes, near-duplicates, big hook steps, boxes that all read early/late, no urethane (info).
- **Resurface before you buy:** suggests sanding/polishing a ball you own when it fills an empty box without opening a new hole. Tune shows where any surface would move a ball; saving a tune that moves a ball tells you (and flags a new gap or duplicate).
- **Before you buy:** what-if preview gives a verdict (fills an empty box / duplicates X / fills a step / lands in Y).
- **Retire a ball:** leaves chart, bags, Bag page and Game Day (history kept); shows the gap it leaves and the replacement spec; un-retire anytime.
- **Coverage fixed:** Bowler page now shows "x of 6 Barnes boxes" (was "Matrix 5/6 • Roles 0/6"). Weak line recalibrated (strength < 0.56) so entry-level balls land in Weak. Role Planner explains why speed-dominant/lower-rev players see more Gaps.
- **New installs start with an empty ball list:** upload a ball spreadsheet (CSV, with a blank template) or add balls one at a time; "Try the sample arsenal (35 balls)" loads databalls.csv on purpose. Existing phones keep their ball list.
- Wording: removed "starter list" (the 35 balls are the owner's arsenal).

## Changes in v81-beta18: fixes from live test 1
- **Analyze is now "Bag"**: pick the balls you're bringing (✓ In bag, tap again to remove; your own balls first), name it, save. It becomes tonight's bag on Game Day. Gaps/overlaps moved into an optional "Check this bag". Arsenal page explains "every ball you own" with + Add a ball and "Pack my bag →" up top. CSV controls moved into an "advanced" fold on both pages.
- **Tonight is remembered** (house, league, lanes, pattern, bag) across games and app reloads; folds away once you start bowling. On a new night it opens once to check lanes. (Bug: these were not restored when the iPhone reloaded the app.)
- **10th frame + automatic games**: Game · Frame shown on top; 🔟 banner on the 10th; fill balls after a strike; "Did you make the spare?" otherwise; next game starts automatically (asks after game 3: Save the night / Bowl game 4).
- **Editable shots**: tap any shot in the session log to change mark, pocket, pins, line or ball, or delete it.
- More reads now numbered ④. Pin deck tightened (bigger pins, no empty gap).
- Removed the Pocket board box (standard pocket used automatically).
- Bowler page LASER in order: Loft, Aim, Speed, Equipment, Release.
- Houses with no speed display: Speed vs normal is "by feel, skip if no display"; night report no longer nags about it.

## Changes in v80-beta17: 🔁 Coach reviews your moves
- Every line or ball change (yours or Coach's) is graded: timing (after a missed mark / after only 1 good shot / while striking), direction (followed the miss or not), and result after 3 good shots (worked / didn't help → move further, come back halfway, or go back).
- Overshoot (hooking early → holding after the move): main call becomes "come back about halfway".
- 3+ changes in 5 shots: Coach asks you to stay on one line for 2 good shots.
- Save alert + Scores: "Your moves" summary with a tip for next time.

## Changes in v79-beta16: line check in two stages
- Game 1 before any move: **starting line** vs the rule-of-31 exit point, as a mild ⚠️ heads-up (not ❌).
- After a move or from game 2: **usable line**. The exit point moves by as many boards as the breakpoint has moved since the first shots; checks the slide + target still go through it (slide tolerance ±2).
- Line notes are heads-ups only; Coach's main call is unchanged.

## Changes in v78-beta15: 📐 three-point line math
- Kegel "Math for a Line" worked backwards from the **slide** at the foul line (inside of the slide foot): laydown = target + (target − exit)/3, slide = laydown + laydown offset. Focal point = rule-of-31 exit board.
- Game Day: the Feet box is now **Slide**; a live 📐 Line ✅/❌ check under the steppers shows where your slide + target send the ball versus the exit point, and the slide the math wants.
- Coach: starting plan includes the full line; an alignment note before any move; when the mark keeps being missed and the line is off, Coach says fix the slide first (alignment, not execution).
- Bowler page: new **Laydown offset** setting (default 5).
- Guide: new three-point line section.

## Changes in v77-beta14: Game Day screen in shot order
- One column on the phone, top to bottom in the order you use it: **Tonight** (folds to one line once set up; turns red if the pattern/bag/ball is missing) → **Coach** → **your line** (Feet / Target / Breakpoint with − / + buttons, no keyboard) → **the shot** (1 Your mark, 2 Pocket, 3 Pins left) → big **Log this shot**.
- After Log the screen jumps back to Coach. Coach shows the compass line + the move; the reasons fold under "Why & what's next" (remembers if you keep it open; the starting plan opens itself).
- Optional reads (execution, reaction, exit, speed, notes) fold under **More reads**; stays open once you open it.
- Mark labels renamed: **Hit target**, Missed right, recovered, Missed left, held, Missed right, Missed left, Didn't see. Saved data and Coach unchanged.
- Hidden from the main screen: Mode (unused), Frame / Fill / Next lane (automatic; under Tonight → Frame & lane).
- Bigger pin deck; scoreboard, session log, prep, bag list and lane geometry moved below.
- No inputs added or removed.

## Changes in v76-beta13 — 🧭 Coach compass (Benoit + Pinel)
- Every Coach call now answers two questions: **Right ball?** (is the friction timing right for tonight's pattern, for this bowler) and **Right spot?** (is the breakpoint outside the rule-of-31 exit point, out of the mud). Shown as a scoreboard line: Ball ✅/❌ · Spot ✅/❌ → what to do.
- Each ball's friction timing is worked out automatically from its specs + the bowler's speed/revs/tilt/rotation (replaces the hidden Friction Timing sliders).
- The compass decides between "move your feet, keep the ball" and "change the ball, keep your spot". A suggested ball must read in the direction the lane is asking for.
- Starting plan groups tonight's bag by timing (reads early / about right / late) and picks the starting ball by timing first.
- Guide: new "The compass" section.

## Changes in v75-beta12
- Friction Timing screen hidden from the menu and Home while it's being redesigned (the page still exists at lane.html).

## Changes in v74-beta11 — Testing tools
- Home → **Check for update**: clears cached files, fetches the newest version, reloads, and confirms the version.
- Home → **Test mode**: separate sandbox (copy of my setup, or empty). Real data is set aside and restored exactly on exit; orange TEST MODE bar on every page; reset test data anytime. Backups made in Test mode are named "TEST".

## Changes in v73-beta10 — Energy & the Mud
- Rule of 31 corrected: it estimates the **exit point** off the end of the pattern (e.g., 42 ft ≈ board 11), not the breakpoint.
- 🏈 **Mud**: over/under with the breakpoint at or inside the exit point = changing direction in the mud. Coach gets the ball to turn in clean friction (further out / smoother ball). Heads-up note when the breakpoint drifts inside the exit board.
- 🌀 **Energy**: carry problems are now read as axis rotation left at the pins. Rolled out → protect energy (stay in oil longer, cleaner ball, touch more speed). Too much → let it read sooner.
- Night report adds Energy wording and a Mud line with an exit-point drill. Guide section "Energy & the Mud".

## Changes in v72-beta9 — Arsenal check
- New 🩺 Arsenal check (Arsenal page; scope: all balls / balls I added / any saved bag):
  - Bowler ↔ ball: weight vs speed at the pins, late-night fatigue, speed/rev dominance vs covers, RG vs rev rate, tilt, LASER vs bag spread.
  - Bag shape: crowded categories, near-duplicates, step-down gaps, all-same surfaces, no spare ball.
  - History: bag vs the oil you bowl on, idle balls, a ball underperforming at a house/lane pair, resurfacing due (games counted from Game Day).
- Per-ball **weight** (default 15 lb) and **Just resurfaced** in the ball tune window; weight on Add a ball.
- Coach starting plan warns when tonight's bag doesn't fit tonight's pattern. Bowler page links to the check.

## Changes in v71-beta8 — The Five Elements
- Every Coach suggestion is tagged with its element: 🎯 Direction, 📐 Angle, ⚡ Speed, 🌀 Rev rate & roll, 🎳 Equipment.
- **Angle** is now part of Coach: target → breakpoint → pocket recovery. Weak on a direct line → open the angle; too strong on a big swing → tighten it.
- **Speed vs normal** is used: faster + long (or slower + early) is the bowler, not the lane, so no move.
- **Carrydown** tap, **lane-by-lane** differences, **game-to-game transition** and **breakpoint drift** now feed Coach notes.
- Five Elements profile card on the Bowler page; Five Elements night report (grades + one drill) at Save Session and on Scores.
- Fixed: an empty pocket-board field was read as board 0 (skewed angle and the geometry table).

## Changes in v70-beta7 — "Best ball is your eyeball"
- Coach now uses **ball exit off the deck** (righty: exit right = weak/deflecting, exit left = too strong; lefty mirrored).
- **6-pin pop-up** (4-pin for lefties): pocket hit + single 10-pin (7 for lefties) asks what the key pin did (laid down weak / hit kickback and missed / wrapped). Flat 10 / Ringing 10 taps fill it in automatically.
- Coach uses exit + key pin to decide "needs more finish" vs "too strong", and gives an **early warning** when the ball starts deflecting even while you're striking.
- **Eyeball score** (0–100): live in the Coach box, in the Save Session message, and on Scores (per night, with trend vs your recent average).

## Changes in v69-beta6 — Coach v2
- New decision engine (`coach.js`) using, in order: bowler profile → LASER confidence → oil pattern (length/volume/ratio) → ball cover/surface/core in tonight's bag → shot reads.
- Never moves off a poor shot; 2 good shots in a row telling the same story triggers a move; one change at a time with a "next step" if it doesn't work.
- Recognizes "wide window" (missed outside & recovered + missed inside & held, both to the pocket), pocket-but-not-carrying, over/under, and whether your last move worked.
- Starting plan before the first shot (rule of 31 breakpoint, best starting ball in the bag for the pattern).
- Fixed ball model: "1500 Polish"-style surfaces were treated as rough sanded balls.
- Game Day inputs unchanged.

## Changes in v68-beta5
- Game Day: oil pattern list now refreshes when you come back to the page, keeps your selection, shows a clear "no patterns yet" message, and has a quick **Add** button.
- Guide: troubleshooting for missing patterns/houses (Home Screen app vs Safari keep separate data).

## Changes in v67-beta4
- Arsenal → Role Planner: pick a bag size (2/3/4/6/9), Coach suggests the bag, then "Use this bag on Game Day?" lets you uncheck balls, name it, and save (or save & jump to Game Day). Option to plan only from balls you added.
- Game Day pre-selects the bag saved from Arsenal and remembers the last bag you used.
- Guide updated with "Let Coach pick your bag".

## Changes in v66-beta3
- Coach move directions fixed to "follow the miss" (2-and-1 rule): early/high → move left (RH), long/light → move right (RH); lefties mirrored.
- Old /bowling-tool/ address now redirects to the main address.

## Changes in v65-beta2
- New **Guide** page (in the top bar, and linked from Home and the Coach box): step-by-step setup, logging shots, how Coach works, backup, troubleshooting.
- Fixed: Coach never recommended a ball from your bag (it couldn't read the saved set). Same fix for the end-of-night arsenal review in Scores.
- Coach now updates automatically after every shot (from the 3rd shot on) and stays on screen while you enter the next shot.
- New 🔔 Coach alerts: lane read changed, pattern confirmed + best ball in your bag, repeating problem.
- Fixed: the "LASER next move" line was being cut off; it now shows right after the lane map.

## Changes in v64-beta1
- iPhone layout: nav bar scrolls and every button is reachable; Game Day collapses to one column; the "Log this shot" button can be tapped; no more zoom when tapping a field; dropdown text readable.
- Double-click actions are now single taps (edit shot in Scores, tune a ball in Arsenal, role suggestions in Analyze).
- Lane pairs typed as `23-24`, `23/24`, `23 24`, etc. now all read correctly (fixes per-lane stats).
- Installable to the Home Screen (icon, full-screen) and works offline.
- Back up / Restore of all data.
- Home screen setup checklist + Game Day "before you bowl" banner.
- Balls added with **Arsenal → + Add a ball → Save to Arsenal** now appear in Analyze, Game Day and Friction Timing.
- Removed 15 old `app_vXX.js` copies.
