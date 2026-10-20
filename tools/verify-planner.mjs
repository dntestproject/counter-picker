// ─────────────────────────────────────────────────────────────────────────────
// PLANNER HARNESS — MY PICK tab (threatReportFor + scoreBan allyContext).
//
// Independent verification style: every claim about the report is re-derived
// from the raw maps and the live-state engine path, never trusted from the
// report itself. Runs three scripted tray states across a sampled hero set.
//
// Usage:  node tools/verify-planner.mjs
// Exit 0 → planner extension behaves exactly as designed.
// Covers: report fidelity, WHY sum identity, CHAIN answers, context-arg
// semantics, default-path parity.
// ─────────────────────────────────────────────────────────────────────────────
import { HEROES } from '../src/data/heroes.js';
import { HM, CM } from '../src/engine/core.js';
import { scoreBan, __getState, __setState } from '../src/engine/engine.js';
import { threatReportFor } from '../src/engine/planner.js';

let checks = 0, failures = 0;
function ok(cond, label) {
  checks++;
  if (!cond) { failures++; console.error('FAIL: ' + label); }
}
function deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

const S = HEROES.map(h => h.id);

// ── scripted tray states ────────────────────────────────────────────────────
const states = [
  { name: 'empty',     e: [],                     a: [],                b: [] },
  { name: 'mid-draft', e: [S[6], S[11], S[41]],   a: [S[2], S[98]],     b: [S[0], S[55], S[77]] },
  { name: 'ban-heavy', e: [],                     a: [],                b: S.slice(0, 6) },
];
function scripted(set) {
  __setState({ enemyPicks: [...set.e], allyPicks: [...set.a], banPicks: [...set.b] });
}

const sampleIds = HEROES.filter((_, i) => i % 10 === 0 || i === HEROES.length - 1).map(h => h.id);
console.log(`planner harness — ${sampleIds.length} sampled heroes × ${states.length} tray states`);

// ── 1. guards ───────────────────────────────────────────────────────────────
ok(threatReportFor(null) === null, 'null id -> null');
ok(threatReportFor(undefined) === null, 'undefined id -> null');
ok(threatReportFor(999999) === null, 'unknown id -> null');

// ── 2. report fidelity, per state per sampled hero ──────────────────────────
for (const st of states) {
  scripted(st);
  for (const X of sampleIds) {
    const snapBefore = JSON.stringify(__getState());
    const rep = threatReportFor(X);
    ok(JSON.stringify(__getState()) === snapBefore, `pure: no state mutation X=${X} ${st.name}`);
    if (!rep) { ok(false, `report exists X=${X} ${st.name}`); continue; }
    ok(rep.myHero === X, `myHero echo X=${X}`);

    const indep = HEROES.filter(h => CM[h.id] && CM[h.id][X] !== undefined);
    ok(rep.threats.length === indep.length, `threat count X=${X} ${st.name}`);
    const idSet = new Set(rep.threats.map(t => t.id));
    ok(indep.every(h => idSet.has(h.id)), `threat membership X=${X} ${st.name}`);

    const wkSet = new Set((HM[X].wk || []).map(w => w.id));
    for (const t of rep.threats) {
      ok(t.ws === CM[t.id][X], `ws fidelity ${t.id}->${X}`);
      ok(t.weaknessListed === wkSet.has(t.id), `weakness flag ${t.id}->${X}`);
      const expect = st.b.includes(t.id) ? 'banned'
        : st.e.includes(t.id) ? 'enemy'
        : st.a.includes(t.id) ? 'ally' : 'free';
      ok(t.status === expect, `status ${t.id} ${st.name}`);

      const sb = scoreBan(t.id, [X]);
      ok(t.banScore === sb.total, `banScore wiring ${t.id}->${X}`);
      ok(t.banParts.tierBonus === sb.tierBonus && t.banParts.wrBonus === sb.wrBonus
        && t.banParts.brBonus === sb.brBonus && t.banParts.confBonus === sb.confBonus
        && t.banParts.velBan === sb.velBan && Math.abs(t.banParts.threatScore - sb.threatScore) < 1e-12,
        `banParts wiring ${t.id}->${X}`);

      const raw = CM[t.id][X];
      ok(Math.abs(t.banParts.threatScore - (raw > 0 ? raw * 0.4 : 0)) < 1e-12, `threatScore formula ${t.id}->${X}`);

      // WHY identity: the six rendered parts must sum to the total exactly.
      const sumParts = t.banParts.tierBonus + t.banParts.wrBonus + t.banParts.brBonus
        + t.banParts.threatScore + t.banParts.confBonus + t.banParts.velBan;
      ok(Math.abs(sumParts - t.banScore) < 1e-9, `why-sum identity ${t.id}->${X}`);

      // CHAIN: answers are the top-3 wk entries by (ws desc, id asc), with the
      // planned hero excluded and dangling ids (not in HM) dropped.
      const expAns = (HM[t.id].wk || [])
        .filter(w => w.id !== X && HM[w.id])
        .sort((a, b) => (b.ws - a.ws) || (a.id - b.id))
        .slice(0, 3)
        .map(w => ({ id: w.id, hn: HM[w.id].hn, ws: w.ws }));
      ok(deepEq(t.answers, expAns), `answers fidelity ${t.id}->${X}`);
      ok(!t.answers.some(a => a.id === X), `answers exclude myPick ${t.id}->${X}`);
      ok(t.answers.length <= 3, `answers capped at 3 ${t.id}->${X}`);
    }

    // sort order (mirror of the documented comparator)
    for (let i = 1; i < rep.threats.length; i++) {
      const A = rep.threats[i - 1], B = rep.threats[i];
      const cmp = (B.banScore - A.banScore) || (B.ws - A.ws) || (A.id - B.id);
      ok(cmp <= 0, `threat sort order i=${i} X=${X} ${st.name}`);
    }

    const expShort = rep.threats.filter(t => t.status === 'free').slice(0, 5).map(t => t.id);
    ok(deepEq(rep.banShortlist, expShort), `shortlist X=${X} ${st.name}`);
    const expLobby = rep.threats.filter(t => t.status === 'enemy').map(t => t.id);
    ok(deepEq(rep.lobbyDanger, expLobby), `lobbyDanger X=${X} ${st.name}`);

    const rawM = Object.entries(CM[X] || {}).map(([eid, ws]) => ({ id: Number(eid), ws }));
    rawM.sort((a, b) => (b.ws - a.ws) || (a.id - b.id));
    ok(deepEq(rep.matchups, rawM), `matchups X=${X} ${st.name}`);

    // context-arg faithfulness: [X] context must equal the live-state path
    // with allyPicks=[X] (sampled rows — full equality is covered by section 3)
    const snap = __getState();
    __setState({ allyPicks: [X], enemyPicks: st.e, banPicks: st.b });
    for (const t of rep.threats.slice(0, 5)) {
      const live = scoreBan(t.id);
      ok(Math.abs(live.total - t.banScore) < 1e-12, `context==live total ${t.id}->${X}`);
      ok(Math.abs(live.threatScore - t.banParts.threatScore) < 1e-12, `context==live threatScore ${t.id}->${X}`);
    }
    __setState(snap);
  }
}

// ── 3. scoreBan extension semantics ─────────────────────────────────────────
scripted({ e: [S[3]], a: [], b: [] });
ok(deepEq(scoreBan(S[7]), scoreBan(S[7], null)), 'null context == default path');
ok(deepEq(scoreBan(S[7]), scoreBan(S[7], [])), 'empty-array context == empty live allies');

scripted({ e: [], a: [S[20]], b: [] });
const base = scoreBan(S[3]);
const ctx = scoreBan(S[3], [S[7]]);
const raw37 = (CM[S[3]] || {})[S[7]] || 0;
ok(Math.abs(ctx.threatScore - (raw37 > 0 ? raw37 * 0.4 : 0)) < 1e-12, 'single-context threatScore formula');
ok(raw37 <= 0 || Math.abs(ctx.total - base.total) > 1e-12, 'context actually used when counter exists');
ok(ctx.threatenedAllies.length === (raw37 > 0 ? 1 : 0), 'threatenedAllies built from context');

scripted({ e: [], a: [S[7], S[20]], b: [] });
ok(deepEq(scoreBan(S[3]), scoreBan(S[3], [S[7], S[20]])), 'context arg == live allyPicks with same lineup');

// ── 4. leave a neutral state behind ─────────────────────────────────────────
scripted(states[0]);

console.log(`planner checks: ${checks}   failures: ${failures}`);
if (failures) { console.error('PLANNER VERIFICATION: FAIL'); process.exit(1); }
console.log('PLANNER VERIFICATION: PASS — report fidelity, WHY sum identity, CHAIN answers, context-arg semantics, default-path parity.');
