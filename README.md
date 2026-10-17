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
