# Feature: WHY / SHARE / CHAIN — receipts, portability, depth
Date: 2026-10-19
Status: implemented 2026-10-19 — all three shipped; harnesses green (engine
97513/0 + 146/0, planner 4740/0, share 63/0). Two post-validation micro-
deviations, both disclosed: (1) the sum line prints the sum of the displayed
2dp values, so on-screen receipts always add up — the raw Σ(parts) identity
is harness-proven; (2) MY PICK's list-open flag now starts false, so a draft
arriving via a shared link lands on its report instead of the picker.

Three additive features on top of the certified MY PICK release. The tool could
already answer *"what do I ban"* and *"what do I fear"* — these close the three
remaining gaps: **trust** (why a number is a number), **mobility** (the draft
travels), and **depth** (the answer to the answer). No scoring behavior
changes; default paths stay byte-identical under the existing harness.

## 1. Overview

**Goal.** Make the tool explain itself (WHY), share hands (SHARE), and think
one move deeper (CHAIN) — all within the existing rail and MY PICK tab.

**Scope.**

- **WHY** — any ban score decomposes into six existing parts (`tierBonus`,
  `wrBonus`, `brBonus`, `threatScore`, `confBonus`, `velBan`). An expandable
  row detail renders them labeled, signed, and proven to sum to the total.
- **SHARE** — full draft state (bans, enemies, allies, my pick, order
  preserved) serializes into the URL hash behind a Copy Draft Link button in
  the top rail. Opening a link shows a Load/Dismiss banner; nothing applies
  without a click.
- **CHAIN** — each threat row's detail lists the top 3 heroes that beat that
  threat (my pick excluded), so when they grab your counter, the pivot is
  already named.

**Out of scope.** No scoring formula changes; no new tabs; no server or
sharing backend; no image export; no compact/mini mode (considered, not
selected); no history/undo state in the shared payload (current draft only).

**Success metrics** — harness-checked, not vibes:

1. WHY: for every hero/threat pair, Σ(parts) === `banScore`, 0 mismatches.
2. SHARE: encode → decode → deep-equal round trip over scripted drafts, 0
   drift; malformed hash fails closed.
3. CHAIN: top-3 answers always come from real counter data, sorted by ws,
  never the planned hero itself.

**Sequence:** WHY → SHARE → CHAIN.

## 2. Architecture

**Engine (additive, parity-safe).**

- `src/engine/planner.js` (read-only) — `threatReportFor()` gains `answers`
  per threat: top 3 from `HM[threat.id].wk`, excluding `myPickId`, sorted ws
  desc → id asc. No scoring touched.
- `src/engine/engine.js` — new `loadDraft({bans, enemies, allies, myPick})`
  command: validates ids, resolves cross-tray duplicates by precedence, caps
  slots (10/5/5), one `pushHistory`, one `update()`, toast `Draft loaded`,
  returns `{applied, dropped}`. Unreachable from any existing default path.

**UI.**

- `src/ui/panels/mypick.js` — threat rows become click-to-expand; expansion
  keyed `section:id` (`s:22` shortlist / `t:22` threats), accordion-style, one
  open at a time; module-level state survives re-renders. Detail renders WHY
  (labeled parts + bars + sum line) and ANSWERS (from `t.answers`).
- `src/ui/share-codec.js` (new, pure) — `encodeState` / `decodeState`, no DOM
  at import, node-testable.
- `src/ui/share.js` (new, DOM) — COPY DRAFT LINK button in the top rail next
  to CLEAR ALL; boot + `hashchange` listener; Load/Dismiss banner; Dismiss
  strips the hash via `replaceState`; `lastHandledHash` guards re-fire.

**Data flow.** Draft → `getUI` → encode → clipboard. Recipient: hash → decode
→ validate → `loadDraft` → single `update()` → every panel re-renders.

**Untouched.** Draft board, grid, tooltip, summary modal, engine scoring
paths, `counterpicker.html` reference.

## 3. Data Model

**Hash format** (no version token; unknown keys ignored; malformed segments
dropped individually, never a whole-payload rejection):

```
#draft=b:3,7;e:25,22;a:1;m:22
         └ bans   └ enemies └ allies └ my pick (single)
```

Ids numeric, order preserved (draft meaning). Empty trays omitted; an empty
draft produces no hash and disables the copy button.

**`loadDraft` validation order** — fail-closed per item:

1. Unknown hero ids → dropped, counted.
2. Duplicates within a tray → first kept.
3. Cross-tray collision → precedence bans → enemies → allies; later
   occurrence dropped.
4. Slot overflow → bans 10, enemies 5, allies 5; overflow dropped, kept in
   URL order.
5. `myPick`: unknown → null; a my-pick hero may also sit in any tray — that's
   existing, legal state (the "BANNED — PICK ANOTHER" chip exists for it).
6. Returns `{applied: {bans, enemies, allies, myPick}, dropped: n}` so the
   banner can say `Draft loaded (2 entries dropped)`.

**banParts label map** — fixed order, bars scaled by max |part|, signed
2-decimal values; sum line = the sum of those displayed 2dp values (on-screen
receipts always add up; the raw identity is harness-proven):

```
tierBonus → "tier"     wrBonus → "winrate"    brBonus → "banrate"
threatScore → "threat" confBonus → "confidence" velBan → "velocity"
```

**Answers shape:** `{id, hn, ws}` — top 3, my-pick excluded, ws through the
existing `fmtWs`.

## 4. Error Handling

| Scenario | Response |
|---|---|
| Clipboard write fails | Fallback panel: read-only input holding the URL, pre-selected, manual copy. No fake "copied". |
| Hash present, syntax garbage | Per-segment drop, silent. Banner only appears when ≥1 valid tray entry or my-pick parses. URL left untouched. |
| Link valid, all ids unknown (stale dataset) | Toast `Nothing valid in that link — ignored`; state and history untouched. |
| Same hash re-fires | `lastHandledHash` equality guard; new hash banners again. |
| Expanded row's hero leaves the report | Expansion state reset silently when key not found. No orphaned panels. |
| Threat without recorded answers | One-line note `No recorded counters in this dataset.` |
| Zero/negative part | 2px minimum bar; signs rendered; negative uses warn color. |
| Copy on empty draft | Button disabled. |
| Load over an in-progress draft | Banner is the confirmation; one Ctrl+Z restores the prior draft (single history entry). |

## 5. Testing Strategy

| Layer | Coverage | Focus |
|---|---|---|
| `verify-planner.mjs` (extended) | Answers field | Top-3 sort order; my-pick absent from own threats' answers; answers match independent `HM.wk` recompute; Σ(parts) === `banScore` for every threat row. Existing 3264 checks unchanged. |
| `verify-engine.mjs` (rerun) | Default-path parity | Expect **97513/0 strict + 146/0 sanctioned** — unchanged counts are the proof the additions are inert. |
| `tools/verify-share.mjs` (new) | Codec + loadDraft | Round-trip deep-equal (empty, single tray, all trays, order-sensitive); per-segment malformed drop; unknown ids; cross-tray precedence; caps with overflow counts; my-pick alongside trays; exact `dropped` counts. Pure codec module enables node testing. |
| Browser smoke (live) | End-to-end | Expand row (DOM + screenshot evidence); copy link → second tab → banner → Load → states deep-equal; Dismiss strips hash; garbage hash → no banner; unknown-ids link → toast; Ctrl+Z after Load; console 0 messages. |

**Honesty notes.** The design-phase mock proved layout on real data via
runtime injection, not shipped CSS; smoke re-verifies against the real build.
No pixel-diff harness exists at this bench — visual checks stay DOM +
screenshot evidence.

## 6. Open Questions

None — all forks resolved during section validation (answers exclude the
planned hero; SHARE loads via confirm banner; one expandable row serves WHY +
CHAIN; SHARE gets one additive `loadDraft` command after command-replay
proved ugly).
