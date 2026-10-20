# Feature: MY PICK — own-pick planning tab
Date: 2026-10-19
Status: implemented 2026-10-19 — all five sections built; see README "MY PICK tab"

The tool today is enemy-first: the counter rail, ban recommender, matrix, and
report all answer *"what beats them"*. MY PICK is the missing half — a planning
surface for your own hero, answering *"I want to play X: what do I ban, and
what answers do I fear?"* in under five seconds, inside the existing right rail.

## 1. Overview

**Goal.** Answer "I want to play X — what do I ban, and what answers do I
fear?" in under five seconds, before and during the pick phase.

**In scope (v1).**
- Hero selection inside the tab — search field plus click-to-select list.
- Threat report — heroes ranked by `scoreBan` with context `[X]`; each row
  shows raw counter weight (`CM[threat][X].ws`) and a weakness-list badge.
- Ban shortlist — top threats with status `free`, one-click quick-ban reusing
  the existing handler.
- MY matchups — what X actually beats (`CM[X]` sorted descending).
- Lobby danger — threats ∩ shown enemy picks, as "IN LOBBY" chips and a
  headline count.

**Success metrics.**
- Hero-to-ban-shortlist in under 5s.
- Top-5 threats include X's documented weaknesses where the data has them.
- 97,513 strict + 146 sanctioned harness checks stay green; new planner is
  covered by `tools/verify-planner.mjs`.

**Out of scope.** Auto safe-alternative suggestions; synergy planning;
per-lane variants; persistence/sharing (separate value axis); any change to
the existing four tabs' semantics.

## 2. Architecture

**Engine (additive, parity-safe).**
- `scoreBan(heroId, allyContext)` gains one optional argument. Default path
  (`undefined`) reads `allyPicks` exactly as today — the existing harness
  proves zero drift; the planner script covers the new argument.
- New `src/engine/planner.js` — pure `threatReportFor(heroId)`; reads `CM`,
  `HM`, `CONFIDENCE` and live trays via `getUI()`.
- New UI-facing state: `myPickId` + `setMyPick(id)`, surfaced through `getUI()`.

**UI.**
- `index.html`: fifth `.ptab` button (`id="tab-mypick"`, `data-tab="mypick"`).
  Existing tab wiring in `shell.js` picks it up with zero JS changes.
- `src/ui/panels/mypick.js`: renders into `panelBody`, hides `panelCtrl` (the
  same move sleeper makes). Search → hero list → select → report.
- `src/ui/panels/index.js`: one dispatcher branch. `update()` re-renders the
  whole rail, so bans/picks refresh the report automatically.
- Search query is UI-local and restored across re-renders; selection lives in
  engine state.
- Styles: `panels.css` additions in the Draft Almanac language only.

**Untouched.** Draft board, grid, tooltip, summary modal, engine scoring
paths, `counterpicker.html` reference.

## 3. Data Model

No dataset changes. `threatReportFor(myPickId)` returns:

```js
{
  myHero: 42,
  threats: [
    {
      id: 7, hn: 'Gusion',
      ws: 8.75,                 // CM[threat][myPick].ws — raw counter weight
      banScore: 11.2,           // scoreBan(threat, [myHero]).total
      banParts: { tierBonus, wrBonus, brBonus, threatScore, confBonus, velBan },
      weaknessListed: true,     // threat appears in HM[myHero].wk
      status: 'free'            // free | banned | enemy | ally
    }, ...
  ],                            // sorted banScore desc, ALL threats kept
  matchups:   [ { id, ws } ],   // CM[myHero] entries, ws desc — what I beat
  banShortlist: [ id, ... ],    // top 5 threats with status 'free'
  lobbyDanger: [ id, ... ]      // threats ∩ enemyPicks
}
```

**Decisions.**
- `banParts` survives into each row even though v1 renders only `ws`/badges —
  zero-cost (already computed) and it is the payload for the later
  "why-explain" axis. No re-plumbing when that axis ships.
- `status` computed per call against live trays; the UI never recomputes
  state logic.
- Shortlist is a filter, not a second ranking — same order, `free`, cap 5.
- UI-local state: `query` only. Selection: `myPickId` in engine state.
- No persistence, no history integration, no dataset extensions.

## 4. Error Handling

| Scenario | Response |
|---|---|
| No hero selected | Empty state: "Search a hero to plan around them." |
| Search matches nothing | "No heroes found" mini empty state; same filter semantics as the main grid. |
| `myPickId` not in `HM` | Planner returns `null`; renderer shows the no-hero empty state. Pure defense. |
| My hero gets banned | Report keeps rendering; header chip "BANNED — pick another". No auto-clearing. |
| My hero taken as enemy pick | Header chip "IN ENEMY TRAY"; report stays valid. |
| My hero already in ally tray | Header chip "IN YOUR PICK". |
| Hero has zero counter entries | Section-level empty line: "No recorded counters in this dataset." |
| Ban tray at 10 | Row quick-ban → existing `quickBanGrid` false → standard "Ban slots full (10/10)" toast. |
| Re-render during typing | Query restored; focus + caret-to-end restored if field had focus (mid-string caret not preserved — accepted). |
| Undo/redo while planning | Statuses recompute on next `update()`; planning never creates history entries. |
| Input safety | Search query never reaches `innerHTML` — filters only. Hero strings are static dataset values. |

Performance: ≤131 tiny rows worst case — under the counter rail's existing DOM
budget; single render pass, no virtualization.

## 5. Testing Strategy

| Type | Coverage | Focus |
|---|---|---|
| Parity (existing) | `tools/verify-engine.mjs` | `scoreBan` default path byte-identical after the signature change. |
| Unit (new) | `tools/verify-planner.mjs` | Sorting, `ws` fidelity, `weaknessListed`, `status`, shortlist = first 5 free in order, matchups order, `lobbyDanger` intersection against scripted tray states. |
| Independence | Same script | `threatScore` component of `scoreBan(T, [X])` equals `CM[T][X] × 0.4` (positive) or 0, recomputed independently — catches a swallowed argument. |
| Integration (browser) | Dev-server smoke | Tab opens, search works, select → report, quick-ban row → tray + toast + status flip + shortlist backfill; console clean. |
| Regression | Both scripts after any engine touch | `node tools/verify-engine.mjs` and `node tools/verify-planner.mjs`, non-zero exit on failure. |

No DOM test framework is introduced — the project has none, and the browser
smoke covers wiring as it has for every previous change.

## 6. Open Questions

- None blocking implementation.
- Deferred by design: why-explain breakdowns (banParts already carried),
  safe-alternative suggester, persistence/sharing.
- Repo note: the folder is not a git repository, so the skill's "commit the
  design document" step is skipped until a repo is initialized.
