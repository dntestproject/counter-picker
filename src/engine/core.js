// ─────────────────────────────────────────────────────────────────────────────
// ENGINE CORE — data maps, tiers, weights, pure helpers.
//
// Every computation below is reproduced from the original counterpicker.html
// engine. Formulas, constants and control flow are unchanged; only module
// boundaries moved. tools/verify-engine.mjs proves output equality against
// the original for thousands of inputs.
// ─────────────────────────────────────────────────────────────────────────────
import { HEROES } from '../data/heroes.js';

// ── DATA MAPS ──────────────────────────────────────────────────────────────
const HM = {};
HEROES.forEach(h => HM[h.id] = h);

// counterMap[candidateId][enemyId] = score  (candidate counters enemy)
const CM = {};
// CM_ALL: all ws scores per candidate for Bayesian confidence
const CM_ALL = {};
HEROES.forEach(enemy => {
  (enemy.cnt||[]).forEach(c => {
    if(!CM[c.id]) CM[c.id] = {};
    CM[c.id][enemy.id] = c.ws;
    if(!CM_ALL[c.id]) CM_ALL[c.id] = [];
    CM_ALL[c.id].push(c.ws);
  });
});

// synergyMap - use max to prevent double-counting when both A→B and B→A exist
const SM = {};
HEROES.forEach(h => {
  (h.syn||[]).forEach(s => {
    if(!SM[h.id]) SM[h.id] = {};
    if(!SM[s.id]) SM[s.id] = {};
    SM[h.id][s.id] = Math.max(SM[h.id][s.id]||0, s.ws);
    SM[s.id][h.id] = Math.max(SM[s.id][h.id]||0, s.ws * 0.7);
  });
});

// ── ENGINE PRE-COMPUTATION ─────────────────────────────────────────────────
// Bayesian confidence: sqrt(coverage) * normalized mean score
// Hard counters have high coverage + high mean → reliable recommendations
const _allWS = Object.values(CM_ALL).flat();
const _globalMaxWS = Math.max(..._allWS);
const CONFIDENCE = {};  // candidateId → 0-1 normalized confidence
(()=>{
  const raw = {};
  Object.entries(CM_ALL).forEach(([id, scores]) => {
    const mean = scores.reduce((a,b)=>a+b,0) / scores.length;
    raw[id] = Math.sqrt(scores.length) * (mean / _globalMaxWS);
  });
  const maxConf = Math.max(...Object.values(raw));
  Object.entries(raw).forEach(([id, c]) => CONFIDENCE[id] = c / maxConf);
})();

// Game phase classification from speciality
const PHASE_EARLY = new Set(['Chase','Charge','Control','Initiator','Crowd Control']);
const PHASE_LATE  = new Set(['Finisher','Guard','Regen','Push']);
function getPhase(hero) {
  const specs = hero.spec || [];
  let e=0, l=0;
  specs.forEach(s => { if(PHASE_EARLY.has(s)) e++; if(PHASE_LATE.has(s)) l++; });
  return e>l ? 'EARLY' : l>e ? 'LATE' : 'MID';
}

// A hero's phase is "decided" only when the EARLY/LATE spec counts differ;
// MID therefore means undecided (exact tie, or specs outside both sets).
function phaseInfo(hero) {
  const specs = hero.spec || [];
  let e=0, l=0;
  specs.forEach(s => { if(PHASE_EARLY.has(s)) e++; if(PHASE_LATE.has(s)) l++; });
  return {phase: e>l ? 'EARLY' : l>e ? 'LATE' : 'MID', decided: e!==l};
}

// Dominant phase of a lineup, voting only with decided heroes — unclassified
// specs must not masquerade as mid-game dominance. Zero decided votes falls
// back to MID (the legacy default). Ties resolve EARLY over LATE, matching
// the original EARLY > MID > LATE key-order tie-break (audit F3 + F4).
function dominantPhaseOf(heroes) {
  let e=0, l=0;
  heroes.forEach(h => { const p=phaseInfo(h); if(p.decided){ if(p.phase==='EARLY') e++; else l++; } });
  if(e===0 && l===0) return 'MID';
  return e>=l ? 'EARLY' : 'LATE';
}

// Lane pressure weights (Jungle > Exp > Mid > Gold > Roam by map impact)
const LANE_W = {'Exp Lane':0.22,'Jungle':0.28,'Mid Lane':0.20,'Gold Lane':0.18,'Roam':0.12};

// Velocity bonus
const VEL_BONUS = {SURGING:0.12, RISING:0.07, CLIMBING:0.03, '':0, FALLING:-0.05};

const TR = {SS:6,S:5,A:4,B:3,C:2,D:1};
const TC = {SS:'#ff4757',S:'#ffd700',A:'#a855f7',B:'#22d3ee',C:'#94a3b8',D:'#475569'};
const RCLS = {Fighter:'r-fighter',Tank:'r-tank',Mage:'r-mage',Marksman:'r-marksman',Assassin:'r-assassin',Support:'r-support'};
const LANES = ['Exp Lane','Jungle','Mid Lane','Gold Lane','Roam'];
const LANE_SHORT = {'Exp Lane':'EXP','Jungle':'JGL','Mid Lane':'MID','Gold Lane':'GOLD','Roam':'ROAM'};
const ALL_SCORES = HEROES.map(h=>h.score);
const MAX_SCORE = Math.max(...ALL_SCORES);

// Pure helpers — same signatures, same output strings as the original.

function sparkline(trend, w=58, h=18) {
  if(!trend||trend.length<2) return '<span style="font-size:11px;color:var(--text3)">N/A</span>';
  const mn=Math.min(...trend), mx=Math.max(...trend), rng=mx-mn||0.1;
  const pts=trend.map((v,i)=>{
    const x=(i/(trend.length-1))*w;
    const y=h-((v-mn)/rng)*(h-4)-2;
    return x+','+y;
  }).join(' ');
  const rising=trend[trend.length-1]>=trend[0];
  const c=rising?'#4ade80':'#f87171';
  const lx=w;
  const ly=h-((trend[trend.length-1]-mn)/rng)*(h-4)-2;
  const delta=(trend[trend.length-1]-trend[0]).toFixed(1);
  const dir=rising?'▲':'▼';
  return `<svg width="${w}" height="${h}" style="overflow:visible;vertical-align:middle"><polyline points="${pts}" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/><circle cx="${lx}" cy="${ly}" r="2.5" fill="${c}"/></svg><span style="font-size:11px;color:${c};font-family:'JetBrains Mono',monospace;margin-left:2px">${dir}${Math.abs(delta)}%</span>`;
}

function getVerdictLabel(adv){
  if(adv===null) return {text:'— SELECT HEROES —', cls:'', short:'—'};
  // Scale: adv is now aTotal - eTotal (same as summary modal, range ±50-150)
  if(adv>=40)   return {text:'DOMINATING', cls:'win',  short:'DOMINATING ▲'};
  if(adv>=15)   return {text:'OUR ADVANTAGE', cls:'win',  short:'ADVANTAGE ▲'};
  if(adv>-15)   return {text:'EVEN MATCH',   cls:'even', short:'EVEN ≈'};
  if(adv>=-40)  return {text:'THEIR ADVANTAGE', cls:'lose', short:'DISADVANTAGE ▼'};
  return          {text:'CRITICAL DEFICIT', cls:'lose', short:'CRITICAL ▼'};
}

export {
  HEROES,
  HM, CM, CM_ALL, SM, CONFIDENCE,
  PHASE_EARLY, PHASE_LATE, getPhase, phaseInfo, dominantPhaseOf,
  LANE_W, VEL_BONUS, TR, TC, RCLS, LANES, LANE_SHORT, ALL_SCORES, MAX_SCORE,
  sparkline, getVerdictLabel,
};
