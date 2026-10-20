// ─────────────────────────────────────────────────────────────────────────────
// SHARE HARNESS — codec round-trips + loadDraft validation.
//
// Independent style: loadDraft claims are checked against raw __getState /
// getUI reads after the call, never trusted from the return object alone.
// The engine's injected update/toast bindings are replaced with counters so
// atomicity (one update, one honest toast) is measurable.
//
// Usage:  node tools/verify-share.mjs
// Exit 0 → codec + loader behave exactly as designed.
// ─────────────────────────────────────────────────────────────────────────────
import { HEROES } from '../src/data/heroes.js';
import { bindUI, loadDraft, setMyPick, __getState, __setState, getUI, undo } from '../src/engine/engine.js';
import { encodeState, decodeState, hasEntries } from '../src/ui/share-codec.js';

let checks = 0, failures = 0;
function ok(cond, label) {
  checks++;
  if (!cond) { failures++; console.error('FAIL: ' + label); }
}
function deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

const S = HEROES.map(h => h.id);
const BAD = 999999; // not in HEROES

// capture injected bindings
const toasts = [];
let updCount = 0;
bindUI({ update: () => { updCount++; }, showToast: m => { toasts.push(m); } });

function plant({ e = [], a = [], b = [], mp = null }) {
  __setState({ enemyPicks: [...e], allyPicks: [...a], banPicks: [...b] });
  setMyPick(mp);
}
function uiNow() { const u = getUI(); return { bans: u.banPicks, enemies: u.enemyPicks, allies: u.allyPicks, myPick: u.myPickId }; }

console.log('share harness — codec + loadDraft');

// ── 1. encode ───────────────────────────────────────────────────────────────
ok(encodeState({ banPicks: [], enemyPicks: [], allyPicks: [], myPickId: null }) === null, 'empty draft -> null');
ok(encodeState({ banPicks: [3, 7], enemyPicks: [], allyPicks: [], myPickId: null }) === 'b:3,7', 'bans only');
ok(encodeState({ banPicks: [], enemyPicks: [25, 22], allyPicks: [], myPickId: null }) === 'e:25,22', 'enemies only');
ok(encodeState({ banPicks: [], enemyPicks: [], allyPicks: [1], myPickId: null }) === 'a:1', 'allies only');
ok(encodeState({ banPicks: [], enemyPicks: [], allyPicks: [], myPickId: 22 }) === 'm:22', 'myPick only');
ok(encodeState({ banPicks: [3, 7], enemyPicks: [25], allyPicks: [1], myPickId: 22 }) === 'b:3,7;e:25;a:1;m:22', 'full draft exact grammar');
ok(encodeState({ banPicks: [7, 3], enemyPicks: [], allyPicks: [], myPickId: null }) === 'b:7,3', 'order preserved (7,3)');
ok(encodeState({ banPicks: [3, 7], enemyPicks: [], allyPicks: [], myPickId: null }) === 'b:3,7', 'order preserved (3,7)');
ok(encodeState({ banPicks: [3, 7], enemyPicks: [], allyPicks: [], myPickId: null }) !== encodeState({ banPicks: [7, 3], enemyPicks: [], allyPicks: [], myPickId: null }), 'order is payload-significant');

// ── 2. decode ───────────────────────────────────────────────────────────────
ok(deepEq(decodeState('b:3,7;e:25,22;a:1;m:22'), { bans: [3, 7], enemies: [25, 22], allies: [1], myPick: 22 }), 'decode full');
ok(deepEq(decodeState(''), { bans: [], enemies: [], allies: [], myPick: null }), 'decode empty string');
ok(deepEq(decodeState(null), { bans: [], enemies: [], allies: [], myPick: null }), 'decode null');
ok(deepEq(decodeState('x:9;zz:1,2'), { bans: [], enemies: [], allies: [], myPick: null }), 'unknown keys ignored');
ok(deepEq(decodeState('b:3;;e:25'), { bans: [3], enemies: [25], allies: [], myPick: null }), 'empty segment dropped');
ok(deepEq(decodeState('b:3;e:bad,25;m:abc'), { bans: [3], enemies: [25], allies: [], myPick: null }), 'non-numeric pieces dropped (25abc strictness)');
ok(deepEq(decodeState('b:25abc'), { bans: [], enemies: [], allies: [], myPick: null }), 'strict integer: 25abc is garbage');
ok(deepEq(decodeState('b:0,-5,3'), { bans: [3], enemies: [], allies: [], myPick: null }), 'zero/negative ids dropped');
ok(deepEq(decodeState('m:22;m:7'), { bans: [], enemies: [], allies: [], myPick: 22 }), 'first m wins');
ok(deepEq(decodeState('m:0;m:7'), { bans: [], enemies: [], allies: [], myPick: 7 }), 'invalid m does not claim the slot');
ok(hasEntries(decodeState('b:3')) === true, 'hasEntries true');
ok(hasEntries(decodeState('garbage')) === false, 'hasEntries false for garbage');
ok(hasEntries(decodeState('b:0')) === false, 'hasEntries false for invalid-only');

// ── 3. round trip: encode -> decode -> encode ──────────────────────────────
const roundtrips = [
  { banPicks: [], enemyPicks: [], allyPicks: [], myPickId: null },
  { banPicks: [3], enemyPicks: [], allyPicks: [], myPickId: null },
  { banPicks: [], enemyPicks: [25, 22], allyPicks: [], myPickId: null },
  { banPicks: [], enemyPicks: [], allyPicks: [1], myPickId: 99 },
  { banPicks: [3, 7], enemyPicks: [25, 22], allyPicks: [1], myPickId: 22 },
  { banPicks: [...S.slice(0, 10)], enemyPicks: [...S.slice(20, 25)], allyPicks: [...S.slice(30, 35)], myPickId: S[40] },
];
for (const ui of roundtrips) {
  const code = encodeState(ui);
  const back = decodeState(code);
  ok(deepEq(back, { bans: ui.banPicks, enemies: ui.enemyPicks, allies: ui.allyPicks, myPick: ui.myPickId }), 'round trip ' + code);
  ok(encodeState({ banPicks: back.bans, enemyPicks: back.enemies, allyPicks: back.allies, myPickId: back.myPick }) === code, 're-encode stable ' + code);
}

// ── 4. loadDraft — valid full load ─────────────────────────────────────────
plant({ e: [S[1]], a: [S[2]], b: [S[3]], mp: S[4] });
let t0 = toasts.length, u0 = updCount;
let res = loadDraft(decodeState('b:' + S[0] + ';e:' + S[10] + ',' + S[11] + ';a:' + S[20] + ';m:' + S[30]));
ok(deepEq(uiNow(), { bans: [S[0]], enemies: [S[10], S[11]], allies: [S[20]], myPick: S[30] }), 'loadDraft replaces whole state');
ok(res.applied !== null && res.dropped === 0, 'loadDraft applied, zero dropped');
ok(updCount === u0 + 1, 'loadDraft: exactly one update()');
ok(toasts.length === t0 + 1 && toasts[toasts.length - 1] === 'Draft loaded', 'loadDraft: one honest toast');
ok(__getState().history.length === 1, 'loadDraft: exactly one history entry');

// undo restores prior trays
undo();
ok(deepEq(uiNow().bans, [S[3]]) && deepEq(uiNow().enemies, [S[1]]) && deepEq(uiNow().allies, [S[2]]), 'undo restores prior trays');

// ── 5. loadDraft — validation rules ────────────────────────────────────────
plant({});
res = loadDraft({ bans: [S[0], BAD], enemies: [], allies: [], myPick: null });
ok(deepEq(res.applied.bans, [S[0]]) && res.dropped === 1, 'unknown id dropped + counted');

plant({});
res = loadDraft({ bans: [S[0], S[0]], enemies: [], allies: [], myPick: null });
ok(deepEq(res.applied.bans, [S[0]]) && res.dropped === 1, 'within-tray dupe dropped + counted');

plant({});
res = loadDraft({ bans: [S[0]], enemies: [S[0]], allies: [], myPick: null });
ok(deepEq(res.applied.bans, [S[0]]) && deepEq(res.applied.enemies, []) && res.dropped === 1, 'cross-tray: bans win over enemies');

plant({});
res = loadDraft({ bans: [], enemies: [S[0]], allies: [S[0]], myPick: null });
ok(deepEq(res.applied.enemies, [S[0]]) && deepEq(res.applied.allies, []) && res.dropped === 1, 'cross-tray: enemies win over allies');

plant({});
res = loadDraft({ bans: S.slice(0, 12), enemies: [], allies: [], myPick: null });
ok(res.applied.bans.length === 10 && deepEq(res.applied.bans, S.slice(0, 10)) && res.dropped === 2, 'ban cap 10, first-come order kept');

plant({});
res = loadDraft({ bans: [], enemies: S.slice(0, 7), allies: [], myPick: null });
ok(res.applied.enemies.length === 5 && res.dropped === 2, 'enemy cap 5');

plant({});
res = loadDraft({ bans: [], enemies: [], allies: S.slice(0, 7), myPick: null });
ok(res.applied.allies.length === 5 && res.dropped === 2, 'ally cap 5');

plant({});
res = loadDraft({ bans: [], enemies: [], allies: [], myPick: BAD });
ok(res.applied === null && res.dropped === 1, 'unknown myPick alone = nothing valid');

plant({});
res = loadDraft({ bans: [S[0]], enemies: [], allies: [], myPick: BAD });
ok(res.applied !== null && res.applied.myPick === null && res.dropped === 1, 'unknown myPick dropped, trays still load');
ok(uiNow().myPick === null, 'loadDraft without valid m: leaves myPick null (full replace)');

plant({ mp: S[5] });
loadDraft({ bans: [], enemies: [S[1]], allies: [], myPick: null });
ok(uiNow().myPick === null, 'planted myPick is cleared when payload has none');

plant({});
res = loadDraft({ bans: [S[0]], enemies: [], allies: [S[0]], myPick: S[0] });
ok(uiNow().myPick === S[0] && deepEq(uiNow().bans, [S[0]]), 'myPick may duplicate a tray hero (legal state)');

// nothing valid: state + history untouched, no toast, no update
plant({ e: [S[1]], a: [S[2]], b: [S[3]], mp: S[4] });
t0 = toasts.length; u0 = updCount;
const before = JSON.stringify(__getState());
res = loadDraft({ bans: [BAD], enemies: [BAD], allies: [], myPick: null });
ok(res.applied === null, 'all-invalid -> applied null');
ok(JSON.stringify(__getState()) === before, 'all-invalid: state untouched');
ok(updCount === u0, 'all-invalid: no update()');
ok(toasts.length === t0, 'all-invalid: no toast from engine (caller explains)');

// dropped suffix toast
plant({});
t0 = toasts.length;
loadDraft({ bans: [S[0], BAD], enemies: [], allies: [], myPick: null });
ok(toasts[toasts.length - 1] === 'Draft loaded (1 entries dropped)', 'dropped count appears in toast');

// ── 6. codec -> loader full pipeline, scripted ─────────────────────────────
const scripted = [
  { banPicks: [S[3], S[7]], enemyPicks: [S[25]], allyPicks: [S[1], S[2]], myPickId: S[22] },
  { banPicks: [], enemyPicks: [S[25], S[22], S[21]], allyPicks: [], myPickId: null },
  { banPicks: [...S.slice(0, 10)], enemyPicks: [], allyPicks: [], myPickId: null },
];
for (const ui of scripted) {
  plant({});
  const code = encodeState(ui);
  const res2 = loadDraft(decodeState(code));
  ok(res2.dropped === 0, 'pipeline zero drops ' + code);
  ok(deepEq(uiNow(), { bans: ui.banPicks, enemies: ui.enemyPicks, allies: ui.allyPicks, myPick: ui.myPickId }), 'pipeline state equality ' + code);
}

// ── 7. leave a neutral state behind ────────────────────────────────────────
plant({});

console.log(`share checks: ${checks}   failures: ${failures}`);
if (failures) { console.error('SHARE VERIFICATION: FAIL'); process.exit(1); }
console.log('SHARE VERIFICATION: PASS — codec round trips, loadDraft validation, atomicity (one update, one history entry).');
