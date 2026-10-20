// ─────────────────────────────────────────────────────────────────────────────
// PLANNER — MY PICK tab computation.
//
// Read-only views built on the existing dataset maps and the battle-tested
// scoreBan. No state mutation, no new scoring formulas: threats against a
// planned hero are ranked by scoreBan(threat, [myPick]) — the same scoring the
// ban recommender uses, with the planned hero as the ally context.
// ─────────────────────────────────────────────────────────────────────────────
import { HEROES, HM, CM } from './core.js';
import { scoreBan, getUI } from './engine.js';

// Deterministic order: ban score desc, raw counter weight desc, id asc.
function byThreatRank(a, b){
  if(b.banScore !== a.banScore) return b.banScore - a.banScore;
  if(b.ws !== a.ws) return b.ws - a.ws;
  return a.id - b.id;
}
function byWeightDesc(a, b){
  if(b.ws !== a.ws) return b.ws - a.ws;
  return a.id - b.id;
}

// Full threat report for a planned hero, or null when the id is unknown.
// Threats keep every mapped counter even when the hero sits in a tray —
// statuses let the UI dim them instead of hiding information.
export function threatReportFor(myPickId){
  if(myPickId == null || !HM[myPickId]) return null;
  const { enemyPicks, allyPicks, banPicks } = getUI();
  const weaknessIds = new Set((HM[myPickId].wk || []).map(w => w.id));

  const threats = [];
  HEROES.forEach(h => {
    const ws = (CM[h.id] || {})[myPickId];
    if(ws === undefined) return;
    const sb = scoreBan(h.id, [myPickId]);
    const status = banPicks.includes(h.id) ? 'banned'
      : enemyPicks.includes(h.id) ? 'enemy'
      : allyPicks.includes(h.id) ? 'ally'
      : 'free';
    // CHAIN: who beats this threat — the planned hero is excluded, answering
    // your own pick with your own pick is noise. filter() copies, so the
    // dataset's wk arrays are never mutated by the sort. Entries pointing at
    // ids absent from HM are dropped (the dataset carries a few dangling wk
    // references); a missing hero must never crash the report.
    const answers = (HM[h.id].wk || [])
      .filter(w => w.id !== myPickId && HM[w.id])
      .sort(byWeightDesc)
      .slice(0, 3)
      .map(w => ({ id: w.id, hn: HM[w.id].hn, ws: w.ws }));
    threats.push({
      id: h.id, hn: h.hn, ws,
      banScore: sb.total,
      banParts: {
        tierBonus: sb.tierBonus, wrBonus: sb.wrBonus, brBonus: sb.brBonus,
        threatScore: sb.threatScore, confBonus: sb.confBonus, velBan: sb.velBan,
      },
      weaknessListed: weaknessIds.has(h.id),
      answers,
      status,
    });
  });
  threats.sort(byThreatRank);

  const matchups = Object.entries(CM[myPickId] || {})
    .map(([eid, ws]) => ({ id: Number(eid), ws }))
    .sort(byWeightDesc);

  return {
    myHero: myPickId,
    threats,
    matchups,
    banShortlist: threats.filter(t => t.status === 'free').slice(0, 5).map(t => t.id),
    lobbyDanger: threats.filter(t => t.status === 'enemy').map(t => t.id),
  };
}
