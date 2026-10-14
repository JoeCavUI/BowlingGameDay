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
