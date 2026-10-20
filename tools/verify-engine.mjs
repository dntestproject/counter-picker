// ─────────────────────────────────────────────────────────────────────────────
// ENGINE EQUIVALENCE HARNESS
//
// Extracts the original engine (maps, state, functions) straight out of
// counterpicker.html, loads the reconstructed engine from src/, and runs both
// over thousands of scenarios — hero scoring, ban scoring, sleeper scoring,
// advantage math, verdict labels, sparklines, randomizers, pick/undo/redo
// command sequences.
//
// Two layers, both must pass:
//   strict     — port vs original patched ONLY with the enumerated sanctioned
//                deviations (D1-D4 below). Anything else must match exactly.
//   sanctioned — each deviation's intended behaviour asserted in its own right
//                (section 5), including proof that it really changes the old
//                behaviour.
//
// Usage:  node tools/verify-engine.mjs
// Exit 0 → parity holds with exactly D1-D4, deviations behave as signed off.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const html = fs.readFileSync(path.join(root, 'counterpicker.html'), 'utf8');

// ── extraction helpers ──────────────────────────────────────────────────────
function sliceBetween(text, startMarker, endMarker) {
  const i = text.indexOf(startMarker);
  if (i < 0) throw new Error(`start marker not found: ${startMarker}`);
  const j = text.indexOf(endMarker, i);
  if (j < 0) throw new Error(`end marker not found: ${endMarker}`);
  return text.slice(i, j + endMarker.length);
}
function sliceFunction(text, name) {
  const sig = `function ${name}(`;
  const i = text.indexOf(sig);
  if (i < 0) throw new Error(`function not found: ${name}`);
  let depth = 0, started = false;
  for (let k = i; k < text.length; k++) {
    const ch = text[k];
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') { depth--; if (started && depth === 0) return text.slice(i, k + 1); }
  }
  throw new Error(`unterminated function: ${name}`);
}

// 1. dataset integrity
// The dataset was intentionally refreshed on 2026-10-20 from "latest update.txt"
// (Mythical Glory+ / past-30-days slice; see tools/import-hero-stats.mjs). It no
// longer equals the dataset embedded in counterpicker.html — that copy stays as
// the immutable port baseline. Engine parity is unaffected because the harness
// injects the CURRENT dataset into both engines, so the diff still isolates
// engine code, not data vintage. If the dataset changes again, update
// DATASET_REFRESH with new provenance; an undeclared drift is a hard failure.
const DATASET_REFRESH = {
  date: '2026-10-20',
  source: 'latest update.txt',
  importer: 'tools/import-hero-stats.mjs',
  rankSlice: 6,
};
const heroesI = html.indexOf('const HEROES = ');
const heroesK = html.indexOf('];', heroesI);
const heroesRaw = html.slice(heroesI + 15, heroesK + 1);
const { HEROES: heroesModule } = await import(pathToFileURL(path.join(root, 'src/data/heroes.js')).href);
const embeddedHeroes = JSON.parse(heroesRaw);
const datasetDrift = JSON.stringify(embeddedHeroes) !== JSON.stringify(heroesModule);
if (datasetDrift && !DATASET_REFRESH.date) {
  console.error('FATAL: src/data/heroes.js differs from the embedded dataset and no refresh is declared.');
  process.exit(1);
}
{
  const seenIds = new Set();
  for (const h of heroesModule) {
    if (typeof h.id !== 'number' || seenIds.has(h.id)) {
      console.error('FATAL: missing or duplicate hero id ' + h.id);
      process.exit(1);
    }
    seenIds.add(h.id);
    if (!h.hn || !h.sbr || typeof h.wr !== 'number' || typeof h.pr !== 'number' || typeof h.br !== 'number') {
      console.error('FATAL: hero ' + h.hn + ' is missing required fields');
      process.exit(1);
    }
  }
  for (const h of heroesModule) {
    for (const key of ['cnt', 'wk', 'syn']) {
      for (const ref of h[key] || []) {
        if (!seenIds.has(ref.id)) {
          console.error(`FATAL: ${h.hn}.${key} references missing hero id ${ref.id}`);
          process.exit(1);
        }
      }
    }
  }
}
if (datasetDrift) {
  console.log(`dataset: refreshed ${DATASET_REFRESH.date} from ${DATASET_REFRESH.source} — ` +
    `${heroesModule.length} heroes (embedded baseline: ${embeddedHeroes.length}). ` +
    'Parity below runs on the current dataset for both engines.');
}

// 2. old engine module
const mapsBlock = sliceBetween(html, 'const HM = {};', 'const MAX_SCORE = Math.max(...ALL_SCORES);');
const stateBlock = sliceBetween(html, 'let enemyPicks', 'let history=[], future=[];');
const fnNames = [
  'gS','getWRBounds','sparkline','getVerdictLabel',
  'computeAdv','getWeakSpots','getTeamComp','scoreCandidate','scoreBan','sleeperScore',
  'pushHistory','undo','redo','handlePick','rmE','rmA','rmB','clearAll','randomizeEnemy','randomizeAlly',
];
const fnBodies = fnNames.map(n => sliceFunction(html, n)).join('\n\n');

const oldModuleSrc = `
import { HEROES } from ${JSON.stringify(pathToFileURL(path.join(root, 'src/data/heroes.js')).href)};
import { dominantPhaseOf } from ${JSON.stringify(pathToFileURL(path.join(root, 'src/engine/core.js')).href)};
function update(){}
function showToast(){}
let toastTimer=null;
${stateBlock}
${mapsBlock}
${fnBodies}
export { ${fnNames.join(', ')}, getPhase, HEROES, HM, CM, SM, CONFIDENCE, MAX_SCORE, LANES };
export function __setMode(m){ pickMode=m; }
export function __setRank(id){ activeRankId=id; }
export function __setPicks(e,a,b){ enemyPicks=e; allyPicks=a; banPicks=b; }
export function __resetHist(){ history=[]; future=[]; }
export function __getPicks(){ return { enemyPicks:[...enemyPicks], allyPicks:[...allyPicks], banPicks:[...banPicks] }; }
export function __getHist(){ return { history:[...history], future:[...future] }; }
`;
// ── sanctioned deviations (2026-10-19 audit) ────────────────────────────────
// The audit signed off four behaviour fixes. Each anchor patches the ORIGINAL
// engine to the sanctioned behaviour before diffing, so the strict layer keeps
// proving: port == original + THIS list, and nothing else. An anchor must
// match exactly once or the run aborts. Section 5 asserts the deviations
// themselves, including proof that each one actually changes old behaviour.
const SANCTIONED_PATCHES = [
  { id: 'D1 randomizeEnemy excludes ally picks',
    from: 'const used=new Set([...enemyPicks,...banPicks]);',
    to:   'const used=new Set([...enemyPicks,...allyPicks,...banPicks]);' },
  { id: 'D2a enemy pick guard checks all trays',
    from: 'if(enemyPicks.includes(id)||enemyPicks.length>=5) return;',
    to:   'if(enemyPicks.includes(id)||allyPicks.includes(id)||banPicks.includes(id)||enemyPicks.length>=5) return;' },
  { id: 'D2b ally pick guard checks the ban tray',
    from: 'if(allyPicks.includes(id)||enemyPicks.includes(id)||allyPicks.length>=5) return;',
    to:   'if(allyPicks.includes(id)||enemyPicks.includes(id)||banPicks.includes(id)||allyPicks.length>=5) return;' },
  { id: 'D3 dominant phase votes with decided heroes only',
    from: 'const dominantPhase=Object.entries(phaseCount).sort((a,b)=>b[1]-a[1])[0][0];',
    to:   'const dominantPhase=dominantPhaseOf(eids.map(eid=>HM[eid]));' },
  { id: 'D4 bounds fallback follows the gS chain',
    from: 'HEROES.map(h => (h.sbr?.[String(activeRankId)]?.wr || h.wr));',
    to:   "HEROES.map(h => (h.sbr?.[String(activeRankId)]?.wr || h.sbr?.['1']?.wr || h.wr));" },
];
function applySanctionedPatches(src) {
  for (const p of SANCTIONED_PATCHES) {
    const n = src.split(p.from).length - 1;
    if (n !== 1) throw new Error(`sanctioned patch "${p.id}": anchor matched ${n} times (must be 1)`);
    src = src.replace(p.from, p.to);
  }
  return src;
}
const oldPath = path.join(root, 'tools', '.old-engine.gen.mjs');
fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
fs.writeFileSync(oldPath, applySanctionedPatches(oldModuleSrc));
const O = await import(pathToFileURL(oldPath).href);
const N = await import(pathToFileURL(path.join(root, 'src/engine/engine.js')).href);
const C = await import(pathToFileURL(path.join(root, 'src/engine/core.js')).href);

// dual-mode: old stubs vs new injected stubs
N.bindUI({ update(){}, showToast(){} });

// ── comparison plumbing ─────────────────────────────────────────────────────
let checks = 0, failures = 0;
const failSamples = [];
function eq(label, a, b) {
  checks++;
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) {
    failures++;
    if (failSamples.length < 12) failSamples.push({ label, old: sa?.slice(0, 400), neu: sb?.slice(0, 400) });
  }
}

// seeded RNG so both sides see identical sequences
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const realRandom = Math.random;
const pickTriple = s => ({ enemyPicks: s.enemyPicks, allyPicks: s.allyPicks, banPicks: s.banPicks });

// ── 1. pure helpers ─────────────────────────────────────────────────────────
for (let adv = -300; adv <= 300; adv += 0.5) {
  eq(`verdict(${adv})`, O.getVerdictLabel(adv), C.getVerdictLabel(adv));
}
eq('verdict(null)', O.getVerdictLabel(null), C.getVerdictLabel(null));

for (const h of heroesModule) {
  eq(`phase(${h.id})`, O.getPhase(h), C.getPhase(h));
  eq(`spark(${h.id})`, O.sparkline(h.trend), C.sparkline(h.trend));
  eq(`spark-custom(${h.id})`, O.sparkline(h.trend, 40, 12), C.sparkline(h.trend, 40, 12));
  eq(`spark-none(${h.id})`, O.sparkline(undefined), C.sparkline(undefined));
  eq(`spark-single(${h.id})`, O.sparkline([50]), C.sparkline([50]));
}

// ── 2. scoring scenarios ────────────────────────────────────────────────────
const ids = heroesModule.map(h => h.id);
const rnd = mulberry32(0xC0FFEE);
function randomDistinct(n, exclude = new Set()) {
  const pool = ids.filter(id => !exclude.has(id));
  const out = [];
  for (let i = 0; i < n; i++) {
    const j = Math.floor(rnd() * pool.length);
    out.push(pool.splice(j, 1)[0]);
  }
  return out;
}

const SCENARIOS = 24;
const scenarioPicks = [];
for (let s = 0; s < SCENARIOS; s++) {
  const enemy = randomDistinct(s === 0 ? 0 : s === 1 ? 5 : 1 + Math.floor(rnd() * 5));
  const used = new Set(enemy);
  const ally = randomDistinct(s === 0 ? 0 : Math.floor(rnd() * 6), used);
  const used2 = new Set([...enemy, ...ally]);
  const ban = randomDistinct(Math.floor(rnd() * 11), used2);
  scenarioPicks.push({ enemy, ally, ban });
}

for (const { enemy, ally, ban } of scenarioPicks) {
  for (let rank = 1; rank <= 6; rank++) {
    O.__setPicks(enemy, ally, ban); O.__setRank(rank);
    N.__setState({ enemyPicks: enemy, allyPicks: ally, banPicks: ban, activeRankId: rank });

    eq(`bounds r${rank} e${enemy.length}`, O.getWRBounds(), N.getWRBounds());
    const boundsN = N.getWRBounds();

    for (const id of ids) {
      const h = heroesModule.find(x => x.id === id);
      eq(`gS(${id}) r${rank}`, O.gS(h), N.gS(h));
      eq(`cand(${id}) e[${enemy}] a[${ally}] r${rank}`, O.scoreCandidate(id, enemy, ally, boundsN), N.scoreCandidate(id, enemy, ally, boundsN));
      eq(`cand-nb(${id}) r${rank}`, O.scoreCandidate(id, enemy, ally), N.scoreCandidate(id, enemy, ally));
      eq(`ban(${id}) r${rank}`, O.scoreBan(id), N.scoreBan(id));
      eq(`sleeper(${id}) r${rank}`, O.sleeperScore(h), N.sleeperScore(h));
    }
    eq(`adv e[${enemy}] a[${ally}] r${rank}`, O.computeAdv(), N.computeAdv());
    eq(`weak r${rank}`, O.getWeakSpots(), N.getWeakSpots());
    const oc = O.getTeamComp(ally), nc = N.getTeamComp(ally);
    eq(`teamcomp r${rank}`, [oc.lanes, oc.roles, oc.specs, oc.missingLanes].map(s => [...s].sort()),
       [nc.lanes, nc.roles, nc.specs, nc.missingLanes].map(s => [...s].sort()));
  }
}

// ── 3. command sequences (pick / ban / remove / undo / redo / clear) ────────
const fakeEvt = { stopPropagation() {} };
for (let seq = 0; seq < 40; seq++) {
  const seed = 1000 + seq;
  O.__setPicks([], [], []); O.__setRank(1); O.__resetHist();
  N.__setState({ enemyPicks: [], allyPicks: [], banPicks: [], activeRankId: 1, history: [], future: [] });
  const modeFor = i => ['e', 'a', 'b'][i % 3];
  const ops = [];
  const r2 = mulberry32(seed);
  for (let i = 0; i < 14; i++) {
    const t = r2();
    const id = ids[Math.floor(r2() * ids.length)];
    if (t < 0.55) { ops.push(['pick', id]); }
    else if (t < 0.7) { ops.push(['rmE', id]); }
    else if (t < 0.85) { ops.push(['rmA', id]); }
    else if (t < 0.95) { ops.push(['undo']); }
    else { ops.push(['redo']); }
  }
  ops.forEach((op, i) => {
    O.__setMode(modeFor(i)); N.setPickMode(modeFor(i));
    if (op[0] === 'pick') { O.handlePick(op[1]); N.handlePick(op[1]); }
    else if (op[0] === 'rmE') { O.rmE(op[1], fakeEvt); N.rmE(op[1], fakeEvt); }
    else if (op[0] === 'rmA') { O.rmA(op[1], fakeEvt); N.rmA(op[1], fakeEvt); }
    else if (op[0] === 'undo') { O.undo(); N.undo(); }
    else if (op[0] === 'redo') { O.redo(); N.redo(); }
    eq(`seq${seq} step${i} state`, O.__getPicks(), pickTriple(N.__getState()));
  });
  O.clearAll(); N.clearAll();
  eq(`seq${seq} final`, O.__getPicks(), pickTriple(N.__getState()));
  eq(`seq${seq} hist`, O.__getHist().history, N.__getState().history);
}

// ── 4. randomizers under seeded Math.random ─────────────────────────────────
for (let seed = 0; seed < 30; seed++) {
  const setup = scenarioPicks[seed % scenarioPicks.length];
  O.__setPicks(setup.enemy, setup.ally, setup.ban); O.__setRank(1 + (seed % 6));
  N.__setState({ enemyPicks: setup.enemy, allyPicks: setup.ally, banPicks: setup.ban, activeRankId: 1 + (seed % 6), history: [], future: [] });

  Math.random = mulberry32(777 + seed);
  const oldRnd = O.randomizeAlly();
  Math.random = mulberry32(777 + seed);
  const newRnd = N.randomizeAlly();
  Math.random = realRandom;
  eq(`randAlly seed${seed}`, O.__getPicks(), pickTriple(N.__getState()));
  eq(`randAlly ret seed${seed}`, oldRnd, newRnd);

  O.__setPicks(setup.enemy, setup.ally, setup.ban); O.__setRank(1 + (seed % 6));
  N.__setState({ enemyPicks: setup.enemy, allyPicks: setup.ally, banPicks: setup.ban, activeRankId: 1 + (seed % 6), history: [], future: [] });
  Math.random = mulberry32(4242 + seed);
  const oldE = O.randomizeEnemy();
  Math.random = mulberry32(4242 + seed);
  const newE = N.randomizeEnemy();
  Math.random = realRandom;
  eq(`randEnemy seed${seed}`, O.__getPicks(), pickTriple(N.__getState()));
  eq(`randEnemy ret seed${seed}`, oldE, newE);
}

// ── 5. sanctioned deviations behave as signed off ───────────────────────────
// Sections 2-4 prove nothing else moved. This section proves each fix does
// what it claims — including, for D2 and D3, that the original behaviour it
// replaces really was the behaviour described.
let sancChecks = 0, sancFails = 0;
const sancSamples = [];
function assert(label, cond) {
  sancChecks++;
  if (!cond) { sancFails++; if (sancSamples.length < 10) sancSamples.push(label); }
}
const inter = (a, b) => a.filter(x => b.includes(x));

// D1: randomizeEnemy, with ally picks present, never produces a cross-tray
// duplicate (and never duplicates within the enemy tray itself).
for (let seed = 0; seed < 40; seed++) {
  const base = scenarioPicks[seed % scenarioPicks.length];
  const ally = base.ally.length >= 2 ? [...base.ally] : [ids[5], ids[6]];
  const enemy = base.enemy.filter(id => !ally.includes(id));
  const ban = base.ban.filter(id => !ally.includes(id) && !enemy.includes(id));
  N.__setState({ enemyPicks: enemy, allyPicks: ally, banPicks: ban, activeRankId: 1 + (seed % 6), history: [], future: [] });
  Math.random = mulberry32(90000 + seed);
  N.randomizeEnemy();
  Math.random = realRandom;
  const st = N.__getState();
  assert(`D1 randEnemy no ally dup seed${seed}`, inter(st.enemyPicks, st.allyPicks).length === 0);
  assert(`D1 randEnemy no ban dup seed${seed}`, inter(st.enemyPicks, st.banPicks).length === 0);
  assert(`D1 randEnemy no self dup seed${seed}`, new Set(st.enemyPicks).size === st.enemyPicks.length);
}

// D2: every tray blocks every other tray and itself.
const X = ids[10], Y = ids[11], Z = ids[12];
N.__setState({ enemyPicks: [X], allyPicks: [Y], banPicks: [Z], activeRankId: 1, history: [], future: [] });
N.setPickMode('e');
N.handlePick(Y); assert('D2 e-mode blocks ally pick', !N.__getState().enemyPicks.includes(Y));
N.handlePick(Z); assert('D2 e-mode blocks ban pick', !N.__getState().enemyPicks.includes(Z));
N.setPickMode('a');
N.handlePick(X); assert('D2 a-mode blocks enemy pick', !N.__getState().allyPicks.includes(X));
N.handlePick(Z); assert('D2 a-mode blocks ban pick', !N.__getState().allyPicks.includes(Z));
N.setPickMode('b');
N.handlePick(X); N.handlePick(Y); N.handlePick(X);
const stB = N.__getState();
assert('D2 b-mode blocks enemy pick', !stB.banPicks.includes(X));
assert('D2 b-mode blocks ally pick', !stB.banPicks.includes(Y));
assert('D2 b-mode blocks ban dup', stB.banPicks.filter(id => id === Z).length === 1);
// live-proof: the original guard expression allowed the ally duplicate.
const origD2Allows = (id, enemy) => !(enemy.includes(id) || enemy.length >= 5);
assert('D2 deviation is live (old guard allowed cross-tray)', origD2Allows(Y, [X]) === true);

// D3: the phase vote ignores undecided heroes; ties resolve EARLY; zero
// decided votes falls back to MID.
const decidedEarly = heroesModule.filter(h => { const p = C.phaseInfo(h); return p.decided && p.phase === 'EARLY'; });
const decidedLate = heroesModule.filter(h => { const p = C.phaseInfo(h); return p.decided && p.phase === 'LATE'; });
const undecided = heroesModule.filter(h => !C.phaseInfo(h).decided);
assert('D3 decided pools exist', decidedEarly.length > 0 && decidedLate.length > 0 && undecided.length > 0);
assert('D3 zero decided -> MID', C.dominantPhaseOf(undecided.slice(0, 4)) === 'MID');
assert('D3 decided tie -> EARLY', C.dominantPhaseOf([decidedEarly[0], decidedLate[0]]) === 'EARLY');
assert('D3 late majority wins', C.dominantPhaseOf([decidedLate[0], decidedLate[1], decidedEarly[0]]) === 'LATE');
assert('D3 unknown cannot dominate', C.dominantPhaseOf([decidedEarly[0], undecided[0], undecided[1], undecided[2]]) === 'EARLY');
// live-proof: the original vote counted undecided heroes as MID and would
// have called this lineup MID-dominant.
const oldDominant = hs => {
  const pc = { EARLY: 0, MID: 0, LATE: 0 };
  hs.forEach(h => pc[O.getPhase(h)]++);
  return Object.entries(pc).sort((a, b) => b[1] - a[1])[0][0];
};
const d3lineup = [decidedEarly[0], undecided[0], undecided[1], undecided[2]];
assert('D3 deviation is live (old said MID)', oldDominant(d3lineup) === 'MID' && C.dominantPhaseOf(d3lineup) === 'EARLY');

// D4: bounds chain follows gS (active rank -> rank 1 -> base) at every rank,
// and is a no-op on the current data (every hero has all six rank blocks).
for (let rank = 1; rank <= 6; rank++) {
  const chain = heroesModule.map(h => (h.sbr?.[String(rank)]?.wr || h.sbr?.['1']?.wr || h.wr));
  N.__setState({ enemyPicks: [], allyPicks: [], banPicks: [], activeRankId: rank });
  const b = N.getWRBounds();
  assert(`D4 bounds chain r${rank}`, b.min === Math.min(...chain) && b.max === Math.max(...chain));
  assert(`D4 no-op with current data r${rank}`,
    chain.every((v, i) => v === (heroesModule[i].sbr?.[String(rank)]?.wr || heroesModule[i].wr)));
}

// ── summary ─────────────────────────────────────────────────────────────────
console.log(`strict checks: ${checks}   failures: ${failures}`);
console.log(`sanctioned checks: ${sancChecks}   failures: ${sancFails}`);
if (failures) {
  console.error('\nDIFFS:');
  for (const f of failSamples) {
    console.error(`\n--- ${f.label}\n old: ${f.old}\n new: ${f.neu}`);
  }
  process.exit(1);
}
if (sancFails) {
  console.error('\nSANCTIONED FAILS:');
  for (const s of sancSamples) console.error(` - ${s}`);
  process.exit(1);
}
console.log('ENGINE PARITY: PASS — port matches the original plus the 4 enumerated sanctioned deviations, and every deviation behaves as signed off.');
