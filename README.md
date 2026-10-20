# COUNTER DRAFT — MLBB Draft Assistant (rebuilt)

The original `counterpicker.html` was a single file holding everything: dataset,
engine, styles, UI. This folder is the same tool rebuilt as a modern multi-file
project. Every formula, weight, tie-break, sort order and random path is
byte-for-byte the logic of the original — plus exactly four enumerated
behaviour fixes signed off from a 2026-10-19 audit (see "Sanctioned engine
deviations" below) and additive features that touch no existing path: the
MY PICK planning tab and its WHY / SHARE / CHAIN upgrades (see below). Nothing
else deviates, and the harnesses enforce that.

`counterpicker.html` stays in the repo, untouched, as the parity reference.

## Run it

ES modules do not load over `file://`, so use the tiny zero-dependency server:

```bat
serve.cmd
:: or
node tools/dev-server.mjs 8787
```

Then open <http://localhost:8787>.

## Layout

```
index.html                 page shell — same element ids, same copy as the original
serve.cmd                  double-click helper for the dev server
src/
  main.js                  bootstrap: bind UI, wire listeners, first render
  data/heroes.js           the 133-hero dataset (baseline + 2026-10-20 refresh,
                           see "Dataset refresh" below)
  engine/
    core.js                maps (HM/CM/CM_ALL/SM), constants (CONFIDENCE, TR/TC/
                           RCLS/LANES), pure helpers (sparkline, getVerdictLabel)
    engine.js              state, undo/redo, scoring (scoreCandidate, scoreBan
                           with optional allyContext, sleeperScore), commands
                           (handlePick, rm*, clearAll, loadDraft, randomize*),
                           UI bindings via bindUI()
    planner.js             MY PICK report — threatReportFor(): read-only views
                           over the same maps and scoreBan; no new scoring;
                           carries banParts (WHY) and answers (CHAIN) per threat
  ui/
    shell.js               update() pipeline, setters (setTab/setMode/setLane/
                           tRole/setCLane/setRank/setSleeper*/setMyPick), wiring,
                           keyboard
    draft.js               draft board slots, ban tray, advantage readout
    teamcomp.js            lane coverage + role pills strip
    grid.js                hero browser: search, lane/role filters, pick states
    share-codec.js         pure draft ↔ URL-hash codec (no DOM; node-testable)
    share.js               draft-link copy button, load/dismiss banner, fallback
    tooltip.js / toast.js  hover card and bottom toast
    panels/                right rail: counter.js, ban.js, matrix.js, sleeper.js,
                           mypick.js
    summary.js             full draft analysis modal (6 sections)
  styles/
    tokens.css             design tokens ("Draft Almanac" paper palette, type, motion)
    base.css               reset, paper atmosphere (grain + washes), keyframes
    layout.css             masthead island, draft ledger, team comp, hero browser
    components.css         cards, stamps, bars, tooltip, toast
    panels.css             right rail: rec cards, ban cards, matrix, sleepers, my pick
    modal.css              summary overlay ("the match report")
tools/
  verify-engine.mjs        equivalence harness (see below)
  verify-planner.mjs       MY PICK + WHY/CHAIN harness (see below)
  verify-share.mjs         share codec + loadDraft harness (see below)
  import-hero-stats.mjs    dataset importer (see "Dataset refresh" below)
  dev-server.mjs           static file server
```

## Equivalence harness

`tools/verify-engine.mjs` extracts the engine from `counterpicker.html` at run
time and diffs it against this project's modules across thousands of generated
scenarios — picks, removes, randomize runs, undo/redo chains, every tab filter,
rank switch and sleeper scoring path.

```bat
node tools/verify-engine.mjs
```

Current result:

```
strict checks: 98963   failures: 0
sanctioned checks: 146   failures: 0
ENGINE PARITY: PASS — port matches the original plus the 4 enumerated sanctioned deviations, and every deviation behaves as signed off.
```

The harness runs two layers: the strict diff (port vs the original extraction,
patched with only the sanctioned deviations below) and a sanctioned layer that
asserts each deviation's intended behaviour in its own right — including
proof that it really changes the old behaviour. Run it after **any** touch of
`src/engine/*` or `src/data/*`. Do not hand-edit `tools/.old-engine.gen.mjs` —
it is regenerated on every run.

The check count scales with the dataset (every hero enters several loops):
97,513 checks at 131 heroes, 98,963 at 133 — failures stay at 0. The dataset
guard no longer demands equality with the embedded baseline; it demands
**structural invariants plus a declared refresh** (`DATASET_REFRESH` in the
harness). Both engines receive the current dataset in every scenario, so the
diff isolates engine code. An undeclared data change still aborts the run.

The MY PICK planner extension has its own harness — it re-derives every claim
from the raw maps and the live-state engine path instead of trusting the
report:

```bat
node tools/verify-planner.mjs
```

Current result:

```
planner checks: 5118   failures: 0
PLANNER VERIFICATION: PASS — report fidelity, WHY sum identity, CHAIN answers, context-arg semantics, default-path parity.
```

The 5,118 checks include the WHY identity (Σ`banParts` === `banScore` for
every sampled threat row, raw values, 1e-9 tolerance) and CHAIN fidelity
(every answer list re-derived from `HM[threat].wk` — sorted ws desc → id asc,
top 3, planned hero excluded, dangling dataset ids dropped). The count is
sampling-driven: 4,740 at 131 heroes, 5,118 at 133.

The share codec + loader run under their own harness — round trips, malformed
payloads, and the full `loadDraft` validation matrix, against raw state reads:

```bat
node tools/verify-share.mjs
```

Current result:

```
share checks: 63   failures: 0
SHARE VERIFICATION: PASS — codec round trips, loadDraft validation, atomicity (one update, one history entry).
```

### Sanctioned engine deviations (2026-10-19 audit)

Four behaviour fixes, signed off after an engine evaluation. Everything else
stays byte-identical to the original:

| # | Fix | Where |
|---|-----|-------|
| D1 | `randomizeEnemy` now excludes ally picks (was: a random enemy lineup could duplicate a hero already picked as ally) | `engine.js` |
| D2 | Pick guards now block all trays in every mode: enemy mode checks ally+ban (was: enemy only), ally mode checks ban (was: ally+enemy only) | `engine.js` |
| D3 | Dominant enemy phase now votes only with decided (EARLY/LATE) heroes; zero decided votes falls back to MID; ties resolve EARLY (was: unclassified specs — Burst/Poke/Damage… — returned MID, and "unknown" could dominate the vote) | `engine.js` + `core.js` (`phaseInfo`, `dominantPhaseOf`) |
| D4 | `getWRBounds` fallback now matches `gS` (active rank → rank 1 → base). No-op for the 131 original heroes; the two imported heroes exercise it — their only rank slice is 6, so ranks 1–5 resolve to their base rates | `engine.js` |

Non-behavioural cleanups in the same pass: dead `coveredLanes` removed from
`randomizeAlly`; the phase tie-break priority is now explicit in code. The
harness anchors every deviation in `SANCTIONED_PATCHES` — if an anchor stops
matching the original, the run aborts rather than drifting silently.

Measured impact of D3 (the only scoring-affecting fix): across the harness's
138 lineups × ranks, the **top recommendation never changed** (0/138), top-3
order shifted in 13, and the average per-candidate score delta is 0.04 points
(max 3.58). D1/D2 only close duplicate states, D4 is a no-op on current data.

## MY PICK tab (additive feature, 2026-10-19)

The tool was enemy-first; MY PICK is the planning half. Pick the hero you
intend to play and the rail answers *"what do I ban, and what answers do I
fear?"*:

- Threats ranked by the battle-tested `scoreBan`, with your hero as the ally
  context (`scoreBan(heroId, allyContext)` — an optional argument whose
  default path is byte-identical to the original; the strict layer passes with
  zero failures — 98,963 checks at the current 133-hero dataset).
- Per-row raw counter weight, a WEAKNESS chip when the threat is on your
  hero's own weakness list, and BANNED / IN LOBBY / ALLY status chips read
  live from the trays.
- A five-row ban shortlist (free threats only, one-click quick-ban through
  the original grid handler) and the reverse ledger — what your hero counters.
- Header danger readout: how many of your threats are already shown on the
  enemy side.

Design + decisions: `docs/plans/2026-10-19-my-pick-planner-design.md`.

## WHY / SHARE / CHAIN (additive upgrades, 2026-10-19)

Three upgrades on top of MY PICK — receipts, portability, depth. No scoring
behaviour changed; the strict layer still passes at zero failures after these
landed (its check count simply follows the dataset: 97,513 at 131 heroes,
98,963 at 133).

- **WHY — click any threat row** (shortlist or full list) and the expansion
  explains its ban score: the six `banParts` labeled, signed, bar-scaled, with
  a sum line. The sum line is computed from the *displayed* two-decimal values
  so the figures on screen always add up; the raw identity Σ(parts) ===
  `banScore` is verified in `verify-planner.mjs`.
- **CHAIN — same expansion**, below the receipts: the top 3 heroes that beat
  that threat (their own weakness lists), your planned hero excluded. When
  they take your counter, the pivot is already named.
- **SHARE — the draft travels.** `🔗 COPY DRAFT LINK` (next to CLEAR ALL)
  encodes bans + enemies + allies + my pick — order preserved — into a
  `#draft=...` URL hash. Opening such a link shows a Load/Dismiss banner;
  nothing applies without a click. `loadDraft` is a new atomic engine command
  (one history entry, one update, one honest toast) and is unreachable from
  any pre-existing flow.

Grammar + rules: `#draft=b:3,7;e:25,22;a:1;m:22`. Unknown ids dropped,
within-tray dupes dropped, cross-tray collisions resolve bans → enemies →
allies, slots capped at 10/5/5, every drop counted in the toast. Garbage
segments drop individually — a malformed hash never banners and never applies.

Honest notes:

- `Ctrl+Z` after a load restores the trays (single history entry). The
  my-pick selection stays where the link put it — my-pick is view state and
  never entered the undo history, same as before this feature.
- All pairwise weakness references now resolve: the refresh added Chang'e
  (id 61), the id 5 old `wk` entries pointed at. Before the refresh, CHAIN
  dropped those dangling entries defensively; now there is nothing to drop.
  (New heroes carry empty counter/synergy/weakness maps until a source
  supplies them — their own rows are honest blanks, never invented edges.)
- Clipboard API write can fail (permissions, non-secure context) — the UI
  then shows the link in a selectable field and says so, instead of a fake
  "copied".

Design + decisions: `docs/plans/2026-10-19-why-share-chain-design.md`.

## Dataset refresh (2026-10-20)

`src/data/heroes.js` was refreshed from `latest update.txt`. That file holds two
concatenated JSON documents:

| Doc | Rows | Content | Used? |
|---|---|---|---|
| 1 | 72 | editorial insights — weak / strong / gem blurbs, ranks Mythic / Mythical Honor / Mythical Glory+, past 1 day | no — no database fields |
| 2 | 133 | filtered hero statistics — id, name, portrait, role, lane, speciality, pick / win / ban rate | **yes** |

Document 2 carries exactly one slice: **Mythical Glory+, past 30 days**. In the
dataset's rank keys (`1` ALL · `2` EPIC · `3` LEGEND · `4` MYTHIC · `5` HONOR ·
`6` GLORY+) that is `sbr["6"]` — where it landed.

Replaced:

- `img`, `role`, `lane`, `spec` — refreshed for every payload hero. Concrete
  metadata diffs: 131 portraits, 1 role (Kaja loses Fighter), 6 lane lists
  (Jawhead / Badang / Gloo swap Exp↔Roam priority, Harith drops Mid, Barats and
  Aulus gain Exp), 2 specialities (Kaja → Initiator, Aulus → Charge).
- `sbr["6"]` `wr` / `pr` / `br` — every matched hero's Glory+ line. All 131
  changed, mean |ΔWR| 4.42 pt; extremes run from Aulus 31.96 → 58.62 and Freya
  87.15 → 1.14 ban rate. Full sorted lists print from the importer.
- Added heroes: **Chang'e** (id 61) and **Hirara** (id 133). None removed.
  Chang'e was the target of 17 pre-existing pairwise references (5 weakness
  entries plus counter/synergy), so those now resolve — CHAIN has nothing left
  to drop.

Left untouched on purpose:

- Base `wr`/`pr`/`br` and `sbr["1"]` — the ALL-rank aggregate. The payload has
  no ALL slice, so the default ALL pill keeps the original aggregate and the
  refreshed numbers appear under **GLORY+**. Pills 2–5 (EPIC…HONOR) stay stale
  for the same reason. Switching the default pill to GLORY+ is a one-line
  change in `index.html` if Olivia wants the new slice front and centre.
- `tier` / `ptier` / `score`, `trend`, `vel`, deltas, `skp`, `cnt`, `wk`, `syn`
  for existing heroes — no source in the payload.
- New heroes' `tier` / `ptier` / `score` are **provisional**: nearest-neighbour
  vote over existing ratings (standardised wr/pr/br, k=8, inverse-distance
  weighted) — Chang'e → D / 162, Hirara → SS / 801. Their `trend` is flat at
  their WR (no history exists), `vel` empty, deltas 0, pairwise maps empty, and
  each object carries `prov: true`. Their base rates double as the fallback for
  ranks 1–5.

Regenerate with:

```bat
node tools/import-hero-stats.mjs "latest update.txt"
```

The importer validates before writing: exactly one rank slice, one timeframe, no
hero missing relative to the current dataset, no duplicate ids after the merge,
and every pairwise reference resolving to a real hero. It prints the mapped
slice, metadata diff counts, provisional assignments with their nearest
neighbours, and the largest WR / BR movements.

Provenance guard: `tools/verify-engine.mjs` checks the dataset against the copy
embedded in `counterpicker.html`. After a refresh those differ by design, so the
guard now requires a declared `DATASET_REFRESH` plus structural invariants — an
undeclared change still fails the run. Both engines are fed the current dataset
in every scenario, so parity still measures engine code, not data vintage.

## Behavioural contracts kept

- Identical toasts and copy strings (`⚔ X added as enemy`, `Undo`, `Redo`,
  `Ban slots full (10/10)`, …).
- Same shortcuts: `E` / `A` mode switch (with toast), `Ctrl+Z` / `Ctrl+Shift+Z`
  undo/redo, `Escape` blurs the search field.
- `body.me / .ma / .mb` class contract (per-mode cursor on hero cards).
- `.active` toggling for lane/role/tab/rank pills, `.search-clear.visible`,
  `.undo-toast.show`, `#summaryOverlay.open`.
- Full-picks toggle for the analysis button; the modal stays closed on backdrop
  click, closes always on the ✕.
- Quick ban from a hero card's ✕: full-slot check → history push → state push →
  toast, in the original order.

## What changed

Presentation, plus the four sanctioned engine fixes documented above. The
interface was rebuilt from the ground up on the
**"Draft Almanac"** direction (per the design skills): a printed scouting ledger
— warm cream card stock on a deeper cream desk, espresso ink, one vermillion
stamp colour, ochre / prussian / plum / moss print inks, film grain over fixed
washes, double-bezel card trays drawn with stacked ring shadows, a floating
masthead island, ruled section heads, serif display numerals (Fraunces) over
expanded grotesk labels (Archivo) and tabular mono data (JetBrains Mono), and
one motion curve family (`cubic-bezier(0.32,0.72,0,1)`) with an orchestrated
load stagger. Every number the UI prints still comes straight from the
untouched engine — renderers were only retouched where they hardcoded legacy
hexes/logos in inline styles, through the presentation-only `src/ui/ink.js`
translation map (values mirror `tokens.css`; change both together).

Later addition: the **MY PICK** tab (fifth rail tab) with its planner module,
in the same almanac language — see the section above.

Later still: **WHY / SHARE / CHAIN** — row expansions that explain the ban
score and name the answers to each threat, plus a draft link that reopens the
exact board in another tab. See the section above.

## Notes

- Fonts: Fraunces (display serif) + Archivo (labels/body) + JetBrains Mono
  (data). Inter/Rajdhani/Space Grotesk were dropped per the design skills'
  banned-font list.
- Images load from the public MLBB portrait CDN the original used — offline
  machines will show empty frames but everything else works.
- The dev server binds `localhost` only and rejects path traversal; it is a
  development convenience, not a deployable host.
- After the 2026-10-20 refresh, the lowest Glory+ win rate in the dataset is
  Balmond at 43.95% (base 42.95%) — no longer the sub-30 outlier the original
  slice carried. The refresh replaced stale rates wholesale, exactly as asked.
