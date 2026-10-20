// ─────────────────────────────────────────────────────────────────────────────
// ENGINE — draft state, scoring, selection commands.
//
// Every function below is reproduced from the original counterpicker.html
// engine with identical formulas, weights, iteration order and control flow.
// The only mechanical changes: `update()` / `showToast()` are injected bindings
// (the UI supplies them at boot), and state lives in this module instead of
// the page global scope. tools/verify-engine.mjs diffs this engine against the
// original across thousands of scenarios — outputs must match exactly.
// ─────────────────────────────────────────────────────────────────────────────
import { HM, CM, SM, CONFIDENCE, LANE_W, VEL_BONUS, TR, MAX_SCORE, LANES, getPhase, dominantPhaseOf } from './core.js';
import { HEROES } from '../data/heroes.js';

// ── UI bindings (injected by src/main.js at boot) ─────────────────────────
let update = () => {};
let showToast = () => {};
function bindUI(fns){
  if(typeof fns.update === 'function') update = fns.update;
  if(typeof fns.showToast === 'function') showToast = fns.showToast;
}

// ── STATE ──────────────────────────────────────────────────────────────────
let enemyPicks=[], allyPicks=[], banPicks=[];
let pickMode='e', activeLane='ALL', activeRoles=new Set();
let counterLane='ALL', activeTab='counter', activeRankId=1;
let sleeperLane='ALL', sleeperRole='ALL';
let myPickId=null;   // MY PICK planner selection (null = none) — view state only

// ── UNDO/REDO ─────────────────────────────────────────────────────────────
let history=[], future=[];
function pushHistory(){
  history.push({e:[...enemyPicks],a:[...allyPicks],b:[...banPicks]});
  future=[];
  if(history.length>40) history.shift();
}
function undo(){
  if(!history.length) return;
  future.push({e:[...enemyPicks],a:[...allyPicks],b:[...banPicks]});
  const prev=history.pop();
  enemyPicks=prev.e; allyPicks=prev.a; banPicks=prev.b||[];
  update(); showToast('Undo');
}
function redo(){
  if(!future.length) return;
  history.push({e:[...enemyPicks],a:[...allyPicks],b:[...banPicks]});
  const next=future.pop();
  enemyPicks=next.e; allyPicks=next.a; banPicks=next.b||[];
  update(); showToast('Redo');
}

// ── HELPERS ──────────────────────────────────────────────────────────────
function gS(h) {
  const s = h.sbr?.[String(activeRankId)];
  return s || h.sbr?.['1'] || {wr:h.wr, pr:h.pr, br:h.br};
}

function getWRBounds() {
  // SANCTIONED DEVIATION (audit F6): fallback chain now matches gS exactly
  // (active rank -> rank 1 -> base stats). Previously the rank-1 fallback was
  // skipped here, so a hero missing its active-rank block could push
  // normalized WR slightly outside [0,1]. No-op with current data (every hero
  // has all six rank blocks and sbr['1'].wr === wr); guards future data edits.
  const wrs = HEROES.map(h => (h.sbr?.[String(activeRankId)]?.wr || h.sbr?.['1']?.wr || h.wr));
  return {min: Math.min(...wrs), max: Math.max(...wrs)};
}

function computeAdv() {
  if(!enemyPicks.length || !allyPicks.length) return null;

  // ── same formula as buildSummaryContent ──────────────────────────────────
  // Counter: pairwise sum both directions
  let eCtr=0, aCtr=0;
  enemyPicks.forEach(eid=>{ allyPicks.forEach(aid=>{ eCtr+=(CM[eid]||{})[aid]||0; }); });
  allyPicks.forEach(aid=>{ enemyPicks.forEach(eid=>{ aCtr+=(CM[aid]||{})[eid]||0; }); });

  // Synergy: sum both directions per pair
  function synTotal(picks){
    let t=0;
    for(let i=0;i<picks.length;i++) for(let j=i+1;j<picks.length;j++){
      t+=((SM[picks[i]]||{})[picks[j]]||0)+((SM[picks[j]]||{})[picks[i]]||0);
    }
    return t;
  }
  const eSyn=synTotal(enemyPicks), aSyn=synTotal(allyPicks);

  // Lane coverage: 14pts per lane
  const eLanes=new Set(enemyPicks.flatMap(id=>HM[id].lane));
  const aLanes=new Set(allyPicks.flatMap(id=>HM[id].lane));
  const eLane=LANES.filter(l=>eLanes.has(l)).length*14;
  const aLane=LANES.filter(l=>aLanes.has(l)).length*14;

  // Tier: avg score / 4.5
  const eTier=enemyPicks.reduce((s,id)=>s+HM[id].score,0)/enemyPicks.length/4.5;
  const aTier=allyPicks.reduce((s,id)=>s+HM[id].score,0)/allyPicks.length/4.5;

  const eTotal=eCtr+eSyn+eLane+eTier;
  const aTotal=aCtr+aSyn+aLane+aTier;

  // Return ally advantage (positive = we're winning)
  return aTotal - eTotal;
}

function getWeakSpots() {
  const w={};
  allyPicks.forEach(aid => {
    const h=HM[aid];
    const threats=(h.wk||[]).filter(x=>enemyPicks.includes(x.id));
    if(threats.length) w[aid]=threats;
  });
  return w;
}

function getTeamComp(picks) {
  const lanes=new Set(), roles=new Set(), specs=new Set();
  picks.forEach(id => {
    const h=HM[id];
    h.lane.forEach(l=>lanes.add(l));
    h.role.forEach(r=>roles.add(r));
    h.spec.forEach(s=>specs.add(s));
  });
  const missingLanes=LANES.filter(l=>!lanes.has(l));
  return {lanes, roles, specs, missingLanes};
}

function scoreCandidate(cid, eids, aids=[], bounds) {
  const cm=CM[cid]||{};
  const h=HM[cid], stats=gS(h);
  const {min:wmin, max:wmax}=bounds||getWRBounds();

  // ── 1. COUNTER SCORE with Bayesian confidence ───────────────────────────
  const bd=[];
  let rawSum=0, covered=0;
  eids.forEach(eid => {
    const sc=cm[eid]; if(sc===undefined) return;
    rawSum+=sc; covered++; bd.push({eid, sc});
  });
  if(rawSum===0) return null;

  // Coverage bonus: each additional enemy covered adds 22%
  const covBonus=covered>1 ? 1+(covered-1)*0.22 : 1;

  // Hard counter bonus: up to 30% for heroes that reliably counter many enemies
  const conf=CONFIDENCE[cid]||0;  // pre-normalized 0-1
  const hardBonus=1 + conf*0.30;

  // Lane pressure weight: jungle picks matter more than roam picks
  const laneW=Math.max(...(h.lane.map(l=>LANE_W[l]||0.15)), 0.15);
  const laneFactor=0.70 + laneW*1.5;  // 0.88–1.12 range

  const counterScore=rawSum * covBonus * hardBonus * laneFactor;

  // ── 2. META SCORE (tier + WR + score) ──────────────────────────────────
  const tierV=TR[h.tier]||1;
  const wrN=(stats.wr-wmin)/(wmax-wmin+0.01);
  const scN=h.score/MAX_SCORE;
  const metaS=(tierV/6*0.5 + wrN*0.3 + scN*0.2)*10;

  // ── 3. GAME PHASE ADVANTAGE ────────────────────────────────────────────
  // SANCTIONED DEVIATION (audit F3/F4, see README): the dominant enemy phase
  // now votes only with heroes whose power curve is decided (EARLY or LATE).
  // Unclassified specs (Burst/Poke/Damage/Support...) return MID from getPhase
  // and used to leak into the vote, letting "unknown" pass as mid-game
  // dominance. Zero decided votes still falls back to MID; ties resolve
  // explicitly to EARLY.
  const dominantPhase=dominantPhaseOf(eids.map(eid=>HM[eid]));
  const candPhase=getPhase(h);
  let phaseBonus=1.0;
  if(dominantPhase==='EARLY' && candPhase==='LATE')  phaseBonus=1.14;
  if(dominantPhase==='LATE'  && candPhase==='EARLY') phaseBonus=1.10;
  if(dominantPhase===candPhase)                       phaseBonus=0.95;

  // ── 4. SYNERGY GRAPH with gap-filling bonus ────────────────────────────
  const synM=SM[cid]||{};
  let synRaw=0;
  const synA=[];
  aids.forEach(aid=>{
    const sv=synM[aid]||0;
    if(sv>0){synRaw+=sv; synA.push({id:aid, sc:sv});}
  });

  // Gap-filling: bonus for each skill profile candidate uniquely contributes
  const existingSkp=new Set(aids.flatMap(aid=>HM[aid]?.skp||[]));
  const candSkp=new Set(h.skp||[]);
  const gapFills=[...candSkp].filter(s=>!existingSkp.has(s)).length;
  const gapBonus=1 + gapFills*0.08;  // 8% per unique capability gap filled

  const synS=synRaw*1.5*gapBonus;

  // ── 5. THREAT FACTOR (tier velocity signal) ────────────────────────────
  const threatFactor=1+(VEL_BONUS[h.vel]||0);

  // ── WEAKNESS PENALTY (unchanged) ───────────────────────────────────────
  const weaknesses=(h.wk||[]).filter(w=>eids.includes(w.id));
  const wPenalty=weaknesses.length*1.5;

  // ── COMPOSITE TOTAL ─────────────────────────────────────────────────────
  // Weights: counter 50%, meta 28%, synergy 15%, conf-boosted meta 7%
  const total=Math.max(0,
    counterScore*0.50*phaseBonus*threatFactor
    + metaS*0.28
    + synS*0.15
    + conf*metaS*0.07
    - wPenalty
  );

  return {
    cid, total,
    cScore:counterScore, rawC:rawSum, metaS, synS,
    covered, conf, phaseBonus, candPhase, gapFills, threatFactor,
    bd:bd.sort((a,b)=>b.sc-a.sc), weaknesses, synA
  };
}

// Optional allyContext (sanctioned additive extension for the MY PICK planner):
// when supplied, the threat-to-ally term scores against that lineup instead of
// the live allyPicks. The default path is byte-identical to the original — all
// existing callers and the parity harness pass no second argument.
function scoreBan(heroId, allyContext) {
  const h=HM[heroId], stats=gS(h);
  const tierV=TR[h.tier]||1;
  // Tier + WR + ban rate base
  const tierBonus=(tierV/6)*5;
  const wrBonus=Math.max(0,stats.wr-50)*0.4;
  const brBonus=(stats.br/100)*3;
  // Threat to ally picks
  let threatScore=0;
  const threatenedAllies=[];
  (allyContext||allyPicks).forEach(aid=>{
    const sc=(CM[heroId]||{})[aid]||0;
    if(sc>0){threatScore+=sc*0.4; threatenedAllies.push(aid);}
  });
  // Composite: hard-counter heroes are more ban-worthy even at lower tier
  // High confidence = reliably counters many heroes = high ban priority
  const conf=CONFIDENCE[heroId]||0;
  const confBonus=conf*3;  // up to 3pts for most reliable counters
  // Rising meta heroes are underrated ban targets (ban rate hasn't caught up)
  const velBan={SURGING:1.5, RISING:0.8, CLIMBING:0.3, '':0, FALLING:-0.5}[h.vel]||0;
  const total=tierBonus+wrBonus+brBonus+threatScore+confBonus+velBan;
  return {heroId, total, tierBonus, wrBonus, brBonus, threatScore, confBonus, velBan, threatenedAllies};
}

function sleeperScore(h) {
  const stats=gS(h);
  const wr=stats.wr, pr=stats.pr, br=stats.br;
  const tierV={'SS':6,'S':5,'A':4,'B':3,'C':2,'D':1}[h.tier]||1;
  // pr is pick% (e.g. 0.1–4%), br is ban% (e.g. 0–90%)
  // normalize ban rate to same ~0–4 scale as pick rate: br/25 (so 100% ban = 4.0 units)
  const demand=pr+(br/25); const d=demand<0.01?0.01:demand;
  const wrAdv=Math.max(0,wr-49);
  return {total:parseFloat(((wrAdv*tierV)/d).toFixed(2)), wr, pr, br, tierV, demand:d};
}

function handlePick(id) {
  if(pickMode==='e'){
    // SANCTIONED DEVIATION (audit F2): the original guard only checked
    // enemyPicks, leaving cross-tray duplicates one caller away. Now matches
    // the ally/ban branches.
    if(enemyPicks.includes(id)||allyPicks.includes(id)||banPicks.includes(id)||enemyPicks.length>=5) return;
    pushHistory();
    enemyPicks.push(id);
    showToast(`⚔ ${HM[id].hn} added as enemy`);
  } else if(pickMode==='a'){
    // SANCTIONED DEVIATION (audit F2): the original ally guard never checked
    // the ban tray either — a banned hero could be picked as ally.
    if(allyPicks.includes(id)||enemyPicks.includes(id)||banPicks.includes(id)||allyPicks.length>=5) return;
    pushHistory();
    allyPicks.push(id);
    showToast(`🛡 ${HM[id].hn} added as ally`);
  } else {
    if(banPicks.includes(id)||enemyPicks.includes(id)||allyPicks.includes(id)||banPicks.length>=10) return;
    pushHistory();
    banPicks.push(id);
    showToast(`🚫 ${HM[id].hn} banned`);
  }
  update();
}

function rmE(id,e){e.stopPropagation();pushHistory();enemyPicks=enemyPicks.filter(x=>x!==id);update()}
function rmA(id,e){e.stopPropagation();pushHistory();allyPicks=allyPicks.filter(x=>x!==id);update()}
function rmB(id,e){e.stopPropagation();pushHistory();banPicks=banPicks.filter(x=>x!==id);update()}
function clearAll(){pushHistory();enemyPicks=[];allyPicks=[];banPicks=[];update()}

// Draft share loader — atomic: one history entry, one update, one toast.
// Validation: unknown ids dropped, within-tray dupes dropped, cross-tray
// collisions resolve bans → enemies → allies (first wins), slots capped at
// the same 10/5/5 the pick commands enforce. Replaces the whole draft,
// my-pick included (a link without m: means no my-pick). Returns applied
// counts so the caller can explain drops; {applied:null} means nothing
// valid arrived and state/history were left untouched.
function loadDraft(payload) {
  const applied = { bans: [], enemies: [], allies: [], myPick: null };
  let dropped = 0;
  const seen = new Set();
  const take = (ids, tray, cap) => {
    (ids || []).forEach(id => {
      if (!HM[id] || seen.has(id) || applied[tray].length >= cap) { dropped++; return; }
      seen.add(id);
      applied[tray].push(id);
    });
  };
  take(payload && payload.bans, 'bans', 10);
  take(payload && payload.enemies, 'enemies', 5);
  take(payload && payload.allies, 'allies', 5);
  const mp = payload ? payload.myPick : null;
  if (mp != null) {
    if (HM[mp]) applied.myPick = mp; else dropped++;
  }
  if (!applied.bans.length && !applied.enemies.length && !applied.allies.length && applied.myPick == null) {
    return { applied: null, dropped };
  }
  pushHistory();
  banPicks = applied.bans;
  enemyPicks = applied.enemies;
  allyPicks = applied.allies;
  myPickId = applied.myPick;
  update();
  showToast(dropped ? `Draft loaded (${dropped} entries dropped)` : 'Draft loaded');
  return { applied, dropped };
}

// Grid quick-ban (the ✕ on a free hero card). Same guard order as the original
// page-level handler: full-slot check first, then history + push + update.
// Returns false when the ban tray is full so the UI can toast "Ban slots full (10/10)".
function quickBanGrid(id){
  if(banPicks.length>=10) return false;
  pushHistory();
  banPicks.push(id);
  update();
  return true;
}

function randomizeEnemy(){
  const laneOrder=['Exp Lane','Jungle','Mid Lane','Gold Lane','Roam'];
  // SANCTIONED DEVIATION (audit F1): ally picks were not excluded, so a
  // random enemy lineup could land on a hero already picked as ally.
  const used=new Set([...enemyPicks,...allyPicks,...banPicks]);
  const newPicks=[];
  laneOrder.forEach(lane=>{
    const candidates=HEROES.filter(h=>h.lane.includes(lane) && !used.has(h.id));
    if(!candidates.length) return;
    const weights=candidates.map(h=>(TR[h.tier]||1)*0.6 + Math.random()*0.4);
    const maxW=Math.max(...weights);
    const pool=candidates.filter((_,i)=>weights[i]>=maxW*0.5);
    const pick=pool[Math.floor(Math.random()*pool.length)];
    if(pick && newPicks.length<5){ newPicks.push(pick.id); used.add(pick.id); }
  });
  if(!newPicks.length) return;
  pushHistory();
  enemyPicks=newPicks;
  update();
  showToast('Enemy lineup randomized!');
}

function randomizeAlly(){
  if(!enemyPicks.length){showToast('Select enemy heroes first!');return;}
  const bounds=getWRBounds();
  const used=new Set([...enemyPicks,...allyPicks,...banPicks]);
  const newPicks=[];

  // Score every possible candidate against current enemy lineup
  const candidates=[];
  HEROES.forEach(h=>{
    if(used.has(h.id)) return;
    const s=scoreCandidate(h.id, enemyPicks, [], bounds);
    if(s) candidates.push({...s, hero:h});
  });
  candidates.sort((a,b)=>b.total-a.total);

  // Fill 5 slots: prioritize lane coverage first, then raw score
  // Pass 1: one best-scoring hero per lane (in priority order: JGL > EXP > MID > GOLD > ROAM)
  const laneOrder=['Jungle','Exp Lane','Mid Lane','Gold Lane','Roam'];
  // audit F5: coveredLanes was dead in the original; removed.
  const pickedIds=new Set(enemyPicks);

  laneOrder.forEach(lane=>{
    if(newPicks.length>=5) return;
    const best=candidates.find(c=>
      !pickedIds.has(c.hero.id) &&
      c.hero.lane.includes(lane)
    );
    if(best){
      newPicks.push(best.hero.id);
      pickedIds.add(best.hero.id);
    }
  });

  // Pass 2: fill remaining slots with highest-scoring candidates not yet picked
  candidates.forEach(c=>{
    if(newPicks.length>=5) return;
    if(!pickedIds.has(c.hero.id)){
      newPicks.push(c.hero.id);
      pickedIds.add(c.hero.id);
    }
  });

  if(!newPicks.length) return;
  pushHistory();
  allyPicks=newPicks;
  update();
  showToast('Counter lineup generated!');
}

// ── UI-FACING ACCESSORS ────────────────────────────────────────────────────
// Renderers read through getUI(); setters below mirror the original state
// assignments that page-level handlers performed. No computation here.
function getUI(){
  return {
    pickMode, activeLane, activeRoles,
    counterLane, activeTab, activeRankId,
    sleeperLane, sleeperRole, myPickId,
    enemyPicks, allyPicks, banPicks,
  };
}
function setPickMode(m){ pickMode=m; }
function setActiveLane(l){ activeLane=l; }
function toggleActiveRole(r){ activeRoles.has(r)?activeRoles.delete(r):activeRoles.add(r); }
function setCounterLane(l){ counterLane=l; }
function setActiveTabState(t){ activeTab=t; }
function setActiveRankId(id){ activeRankId=id; }
function setSleeperLaneState(l){ sleeperLane=l; }
function setSleeperRoleState(r){ sleeperRole=r; }
function setMyPick(id){ myPickId=id; }

// Test/hydration surface used by tools/verify-engine.mjs. Not called by UI.
function __getState(){ return {enemyPicks, allyPicks, banPicks, activeRankId, history, future}; }
function __setState(p){
  if(p.enemyPicks) enemyPicks=p.enemyPicks;
  if(p.allyPicks) allyPicks=p.allyPicks;
  if(p.banPicks) banPicks=p.banPicks;
  if(p.activeRankId!=null) activeRankId=p.activeRankId;
  if(p.history) history=p.history;
  if(p.future) future=p.future;
}

export {
  HEROES,
  bindUI, getUI,
  setPickMode, setActiveLane, toggleActiveRole, setCounterLane,
  setActiveTabState, setActiveRankId, setSleeperLaneState, setSleeperRoleState, setMyPick,
  gS, getWRBounds,
  computeAdv, getWeakSpots, getTeamComp, scoreCandidate, scoreBan, sleeperScore,
  pushHistory, undo, redo,
  handlePick, rmE, rmA, rmB, clearAll, loadDraft, quickBanGrid, randomizeEnemy, randomizeAlly,
  __getState, __setState,
};
