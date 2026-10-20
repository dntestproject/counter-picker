// FULL DRAFT ANALYSIS modal — six sections, every figure produced by the
// untouched engine. Open/close semantics match the original (overlay click
// closes only on backdrop; ✕ always closes).
import { HM, CM, SM, LANES, LANE_SHORT, getVerdictLabel } from '../engine/core.js';
import { getUI, gS } from '../engine/engine.js';
import { INK, tierInk } from './ink.js';

export function openSummary() {
  const overlay = document.getElementById('summaryOverlay');
  overlay.classList.add('open');
  buildSummaryContent();
}

export function closeSummary(e) {
  if (e.target === document.getElementById('summaryOverlay'))
    document.getElementById('summaryOverlay').classList.remove('open');
}

export function closeSummaryDirect() {
  document.getElementById('summaryOverlay').classList.remove('open');
}

export function buildSummaryContent() {
  const { enemyPicks, allyPicks } = getUI();
  const body = document.getElementById('modalBody');
  body.innerHTML = '';

  // ── COMPUTE ALL SCORES UPFRONT ────────────────────────────────────────────
  // Counter: every enemy vs every ally pairwise
  const ePairs = [], aPairs = [];
  enemyPicks.forEach(eid => {
    allyPicks.forEach(aid => {
      const ws = (CM[eid] || {})[aid] || 0;
      if (ws > 0) ePairs.push({ eid, aid, ws });
    });
  });
  allyPicks.forEach(aid => {
    enemyPicks.forEach(eid => {
      const ws = (CM[aid] || {})[eid] || 0;
      if (ws > 0) aPairs.push({ aid, eid, ws });
    });
  });
  ePairs.sort((a, b) => b.ws - a.ws);
  aPairs.sort((a, b) => b.ws - a.ws);
  const eCtrTotal = ePairs.reduce((s, p) => s + p.ws, 0);
  const aCtrTotal = aPairs.reduce((s, p) => s + p.ws, 0);

  // Synergy: every within-team pairwise (sum both directions)
  function teamSynPairs(picks) {
    const pairs = [];
    for (let i = 0; i < picks.length; i++) for (let j = i + 1; j < picks.length; j++) {
      const a = picks[i], b = picks[j];
      const ws1 = (SM[a] || {})[b] || 0, ws2 = (SM[b] || {})[a] || 0;
      const combined = ws1 + ws2;
      if (combined > 0) pairs.push({ a, b, ws1, ws2, combined });
    }
    return pairs.sort((a, b) => b.combined - a.combined);
  }
  const eSynPairs = teamSynPairs(enemyPicks);
  const aSynPairs = teamSynPairs(allyPicks);
  const eSynTotal = eSynPairs.reduce((s, p) => s + p.combined, 0);
  const aSynTotal = aSynPairs.reduce((s, p) => s + p.combined, 0);

  // Lane coverage: 14pts per lane covered
  const eLanes = new Set(enemyPicks.flatMap(id => HM[id].lane));
  const aLanes = new Set(allyPicks.flatMap(id => HM[id].lane));
  const eLanePts = LANES.filter(l => eLanes.has(l)).length * 14;
  const aLanePts = LANES.filter(l => aLanes.has(l)).length * 14;

  // Tier: avg hero.score / 4.5
  const eTier = enemyPicks.reduce((s, id) => s + HM[id].score, 0) / enemyPicks.length / 4.5;
  const aTier = allyPicks.reduce((s, id) => s + HM[id].score, 0) / allyPicks.length / 4.5;

  // Totals
  const eTotal = eCtrTotal + eLanePts + eSynTotal + eTier;
  const aTotal = aCtrTotal + aLanePts + aSynTotal + aTier;
  const winner = aTotal > eTotal ? 'ALLY' : 'ENEMY';
  const margin = Math.abs(aTotal - eTotal).toFixed(1);

  // ── 1. HEADER VERDICT BANNER ─────────────────────────────────────────────
  const adv = aTotal - eTotal;
  const v = getVerdictLabel(adv); // same scale as header
  const verdictCls = v.cls;

  const sec1 = document.createElement('div');
  sec1.className = 'ms-section';

  const banner = document.createElement('div');
  banner.className = 'overall-banner';
  const mkHeroes = (picks, cls) => picks.map(id => {
    const h = HM[id];
    return `<div class="ob-hero ${cls}"><img src="${h.img}"><span>${h.hn}</span></div>`;
  }).join('');

  // Tier distribution label
  const tierDist = (picks) => {
    const d = {}; picks.forEach(id => { const t = HM[id].tier; d[t] = (d[t] || 0) + 1; });
    return ['SS', 'S', 'A', 'B', 'C', 'D'].filter(t => d[t]).map(t => `${t}:${d[t]}`).join(' ');
  };

  banner.innerHTML = `
    <div class="ob-side enemy">
      <div class="ob-side-label e">⚔ ENEMY · <span style="color:var(--text3);font-weight:600;font-size:11px">${tierDist(enemyPicks)}</span></div>
      <div class="ob-heroes">${mkHeroes(enemyPicks, 'enemy-h')}</div>
      <div style="font-size:24px;font-family:'Fraunces',serif;font-weight:600;color:var(--enemy);margin-top:6px">${eTotal.toFixed(1)}</div>
      <div style="font-size:11px;color:var(--text2);font-family:'JetBrains Mono',monospace;font-weight:500">TOTAL SCORE</div>
    </div>
    <div class="ob-center">
      <div class="ob-score ${verdictCls}" style="font-size:20px">${winner === 'ALLY' ? 'WE WIN' : 'THEY WIN'}</div>
      <div style="font-size:32px;font-weight:600;font-family:'Fraunces',serif;color:${verdictCls === 'win' ? 'var(--green)' : verdictCls === 'lose' ? 'var(--red)' : 'var(--ally)'};margin:4px 0">+${margin}</div>
      <div style="font-size:11px;color:var(--text2);font-family:'JetBrains Mono',monospace;font-weight:500">MARGIN</div>
    </div>
    <div class="ob-side ally">
      <div class="ob-side-label a">🛡 OUR TEAM · <span style="color:var(--text3);font-weight:600;font-size:11px">${tierDist(allyPicks)}</span></div>
      <div class="ob-heroes">${mkHeroes(allyPicks, 'ally-h')}</div>
      <div style="font-size:24px;font-family:'Fraunces',serif;font-weight:600;color:var(--ally);margin-top:6px">${aTotal.toFixed(1)}</div>
      <div style="font-size:11px;color:var(--text2);font-family:'JetBrains Mono',monospace;font-weight:500">TOTAL SCORE</div>
    </div>`;
  sec1.appendChild(banner);

  // Score bar comparison
  const maxTotal = Math.max(eTotal, aTotal) || 1;
  const scoreBar = document.createElement('div');
  scoreBar.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-top:8px';
  const dims = [
    { lbl: 'COUNTER', eV: eCtrTotal, aV: aCtrTotal, ec: INK.enemy, ac: INK.ally },
    { lbl: 'SYNERGY', eV: eSynTotal, aV: aSynTotal, ec: INK.rust, ac: INK.moss },
    { lbl: 'LANE', eV: eLanePts, aV: aLanePts, ec: INK.plum, ac: '#8A6BBE' },
    { lbl: 'TIER', eV: eTier, aV: aTier, ec: INK.ochre, ac: INK.ochreHi },
  ];
  dims.forEach(d => {
    const mx = Math.max(d.eV, d.aV) || 1;
    const aWins = d.aV > d.eV, even = Math.abs(d.aV - d.eV) < 0.5;
    const card = document.createElement('div');
    card.className = 'sbd-card';
    card.innerHTML = `
      <div class="sbd-label">${d.lbl}</div>
      <div class="sbd-vals">
        <span style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:700;color:var(--red)">${d.eV.toFixed(1)}</span>
        <span style="font-size:10px;color:var(--text3);font-family:'Archivo',sans-serif">vs</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:700;color:var(--ally)">${d.aV.toFixed(1)}</span>
      </div>
      <div class="sbd-edge ${even ? 'even' : aWins ? 'win' : 'lose'}">${even ? 'EQUAL' : aWins ? 'OUR EDGE' : 'THEIR EDGE'}</div>
      <div style="display:flex;height:4px;border-radius:2px;overflow:hidden;margin-top:4px;background:var(--line2)">
        <div style="width:${(d.eV / mx * 100).toFixed(0)}%;background:${d.ec};transition:width 0.4s"></div>
        <div style="width:${(d.aV / mx * 100).toFixed(0)}%;background:${d.ac};transition:width 0.4s"></div>
      </div>`;
    scoreBar.appendChild(card);
  });
  sec1.appendChild(scoreBar);
  body.appendChild(sec1);

  // ── 2. COUNTER TABLE ──────────────────────────────────────────────────────
  const sec2 = document.createElement('div');
  sec2.className = 'ms-section';
  sec2.innerHTML = `<div class="ms-sec-title">⚔ COUNTER MATCHUPS</div>`;

  const ctrGrid = document.createElement('div');
  ctrGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px';

  const mkCtrCol = (pairs, total, title, titleCls, scoreColor) => {
    const col = document.createElement('div');
    col.innerHTML = `
      <div style="font-size:11px;color:${titleCls};font-family:'Archivo',sans-serif;font-weight:700;letter-spacing:1.5px;margin-bottom:5px;display:flex;justify-content:space-between">
        <span>${title}</span>
        <span style="color:${scoreColor}">${total.toFixed(2)}</span>
      </div>`;
    if (!pairs.length) {
      col.innerHTML += `<div style="font-size:12px;color:var(--text3);font-family:'JetBrains Mono',monospace;padding:4px 0">No counter advantages</div>`;
    } else {
      const maxWS = pairs[0].ws || 1;
      pairs.forEach(p => {
        const attacker = HM[p.eid || p.aid], defender = HM[p.aid || p.eid];
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 7px;border-radius:4px;background:var(--bg3);border:1px solid var(--line);margin-bottom:3px';
        row.innerHTML = `
          <img src="${attacker.img}" style="width:22px;height:22px;border-radius:3px;object-fit:cover;object-position:top;border:1px solid ${scoreColor}40">
          <span style="font-size:11px;font-family:'Archivo',sans-serif;font-weight:700;color:var(--text)">${attacker.hn}</span>
          <span style="font-size:10px;color:var(--text3);font-family:'Archivo',sans-serif;font-weight:600">vs</span>
          <img src="${defender.img}" style="width:22px;height:22px;border-radius:3px;object-fit:cover;object-position:top;opacity:0.75">
          <span style="font-size:11px;font-family:'Archivo',sans-serif;font-weight:600;color:var(--text2)">${defender.hn}</span>
          <div style="margin-left:auto;display:flex;align-items:center;gap:5px">
            <div style="width:52px;height:3px;background:var(--line2);border-radius:2px;overflow:hidden">
              <div style="width:${(p.ws / maxWS * 100).toFixed(0)}%;height:100%;background:${scoreColor};border-radius:2px"></div>
            </div>
            <span style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;color:${scoreColor}">${p.ws.toFixed(2)}</span>
          </div>`;
        col.appendChild(row);
      });
    }
    return col;
  };

  // Enemy counters our team (threat to us)
  const ePairsMapped = ePairs.map(p => ({ eid: p.eid, aid: p.aid, ws: p.ws }));
  const aPairsMapped = aPairs.map(p => ({ eid: p.eid, aid: p.aid, ws: p.ws }));
  ctrGrid.appendChild(mkCtrCol(ePairsMapped, eCtrTotal, '⚔ THEIR COUNTERS', 'var(--enemy)', 'var(--red)'));
  ctrGrid.appendChild(mkCtrCol(aPairs.map(p => ({ eid: p.aid, aid: p.eid, ws: p.ws })), aCtrTotal, '🛡 OUR COUNTERS', 'var(--ally)', 'var(--green)'));
  sec2.appendChild(ctrGrid);
  body.appendChild(sec2);

  // ── 3. SYNERGY TABLE ──────────────────────────────────────────────────────
  const sec3 = document.createElement('div');
  sec3.className = 'ms-section';
  sec3.innerHTML = `<div class="ms-sec-title">✦ TEAM SYNERGY</div>`;

  const synGrid = document.createElement('div');
  synGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px';

  const mkSynCol = (pairs, total, title, titleCls, scoreColor) => {
    const col = document.createElement('div');
    col.innerHTML = `
      <div style="font-size:11px;color:${titleCls};font-family:'Archivo',sans-serif;font-weight:700;letter-spacing:1.5px;margin-bottom:5px;display:flex;justify-content:space-between">
        <span>${title}</span><span style="color:${scoreColor}">${total.toFixed(2)}</span>
      </div>`;
    if (!pairs.length) {
      col.innerHTML += `<div style="font-size:12px;color:var(--text3);font-family:'JetBrains Mono',monospace;padding:4px 0">No specific synergies found.</div>`;
    } else {
      const maxSyn = pairs[0].combined || 1;
      pairs.forEach(p => {
        const h1 = HM[p.a], h2 = HM[p.b];
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:5px;padding:4px 7px;border-radius:4px;background:var(--bg3);border:1px solid var(--line);margin-bottom:3px';
        row.innerHTML = `
          <img src="${h1.img}" style="width:22px;height:22px;border-radius:3px;object-fit:cover;object-position:top">
          <span style="font-size:11px;font-family:'Archivo',sans-serif;font-weight:700;color:var(--text)">${h1.hn}</span>
          <span style="font-size:11px;color:var(--text3);font-weight:600">+</span>
          <img src="${h2.img}" style="width:22px;height:22px;border-radius:3px;object-fit:cover;object-position:top">
          <span style="font-size:11px;font-family:'Archivo',sans-serif;font-weight:700;color:var(--text)">${h2.hn}</span>
          <div style="margin-left:auto;display:flex;align-items:center;gap:5px">
            <div style="width:52px;height:3px;background:var(--line2);border-radius:2px;overflow:hidden">
              <div style="width:${(p.combined / maxSyn * 100).toFixed(0)}%;height:100%;background:${scoreColor};border-radius:2px"></div>
            </div>
            <span style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;color:${scoreColor}">${p.combined.toFixed(2)}</span>
          </div>`;
        col.appendChild(row);
      });
    }
    return col;
  };

  synGrid.appendChild(mkSynCol(eSynPairs, eSynTotal, '⚔ ENEMY SYNERGY', 'var(--enemy)', INK.rust));
  synGrid.appendChild(mkSynCol(aSynPairs, aSynTotal, '🛡 OUR SYNERGY', 'var(--ally)', INK.moss));
  sec3.appendChild(synGrid);
  body.appendChild(sec3);

  // ── 4. LANE MATCHUP (our strength: actual NET, not just coverage) ─────────
  const sec4 = document.createElement('div');
  sec4.className = 'ms-section';
  sec4.innerHTML = `<div class="ms-sec-title">🗺 LANE MATCHUP</div>`;
  const laneGrid = document.createElement('div');
  laneGrid.className = 'lane-grid';
  let laneWins = 0, laneLoses = 0;
  LANES.forEach(lane => {
    const eH = enemyPicks.find(id => HM[id].lane.includes(lane));
    const aH = allyPicks.find(id => HM[id].lane.includes(lane));
    const row = document.createElement('div');
    let net = 0, rowCls = '';
    if (eH && aH) {
      const aAdv = (CM[aH] || {})[eH] || 0;
      const eAdv = (CM[eH] || {})[aH] || 0;
      net = aAdv - eAdv;
      if (net >= 0.5) { rowCls = 'lane-win'; laneWins++; }
      else if (net <= -0.5) { rowCls = 'lane-lose'; laneLoses++; }
    }
    row.className = `lane-row ${rowCls}`;
    const eHero = eH ? HM[eH] : null, aHero = aH ? HM[aH] : null;
    const mkLH = (h, borderColor) => h ? `<div class="lane-hero">
      <img src="${h.img}" style="width:26px;height:26px;border-radius:3px;object-fit:cover;object-position:top;border:1.5px solid ${borderColor}">
      <div><div class="lane-hero-name">${h.hn}</div>
      <div class="lane-hero-meta">${h.tier} · ${gS(h).wr.toFixed(1)}%WR</div></div>
    </div>` : `<span class="lane-empty">No pick</span>`;
    const netCls = net >= 0.5 ? 'win' : net <= -0.5 ? 'lose' : 'even';
    const absNet = Math.abs(net), barPct = Math.min(48, (absNet / 10) * 48);
    const barDir = net >= 0.5 ? 'af' : net <= -0.5 ? 'ef' : '';
    row.innerHTML = `
      <div class="lane-name">${LANE_SHORT[lane]}</div>
      ${mkLH(eHero, 'var(--enemy)')}
      <div class="lane-vs">VS</div>
      ${mkLH(aHero, 'var(--ally)')}
      <div class="lane-result">
        <div class="lane-net ${netCls}">${(eHero && aHero) ? ((net >= 0 ? '+' : '') + net.toFixed(2)) : '—'}</div>
        <div class="lane-adv-bar">${barDir ? `<div class="lane-adv-fill ${barDir}" style="width:${barPct}px"></div>` : ''}</div>
        <div style="font-size:7px;color:var(--text3);font-family:'Archivo',sans-serif;letter-spacing:0.5px">${(eHero && aHero) ? (net >= 0.5 ? 'OUR LANE' : net <= -0.5 ? 'THEIR LANE' : 'NEUTRAL') : '—'}</div>
      </div>`;
    laneGrid.appendChild(row);
  });
  const laneSumRow = document.createElement('div');
  laneSumRow.style.cssText = 'display:flex;justify-content:space-between;padding:4px 2px;font-size:10px;color:var(--text2);font-family:\'JetBrains Mono\',monospace;margin-top:2px';
  laneSumRow.innerHTML = `
    <span>Coverage: <strong style="color:var(--ally)">${LANES.filter(l => aLanes.has(l)).length}/5</strong> ally · <strong style="color:var(--enemy)">${LANES.filter(l => eLanes.has(l)).length}/5</strong> enemy</span>
    <span>Lane wins: <strong style="color:${laneWins > laneLoses ? 'var(--green)' : laneWins < laneLoses ? 'var(--red)' : 'var(--text2)'}">${laneWins}–${laneLoses}</strong> ${laneWins > laneLoses ? '(OUR FAVOR)' : laneWins < laneLoses ? '(THEIR FAVOR)' : '(EQUAL)'}</span>`;
  sec4.appendChild(laneGrid);
  sec4.appendChild(laneSumRow);
  body.appendChild(sec4);

  // ── 5. TIER BREAKDOWN ────────────────────────────────────────────────────
  const sec5 = document.createElement('div');
  sec5.className = 'ms-section';
  sec5.innerHTML = `<div class="ms-sec-title">🏆 TIER STRENGTH</div>`;
  const tierGrid = document.createElement('div');
  tierGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px';
  const mkTierCol = (picks, label, labelCls, barColor) => {
    const col = document.createElement('div');
    const dist = {};
    picks.forEach(id => { const t = HM[id].tier; dist[t] = (dist[t] || 0) + 1; });
    const distStr = ['SS', 'S', 'A', 'B', 'C', 'D'].filter(t => dist[t]).map(t => `<span style="font-family:'Archivo',sans-serif;font-weight:700;font-size:12px;padding:1px 7px;border-radius:999px;border:1px solid;color:${tierInk(t)};border-color:${tierInk(t)}55;background:${tierInk(t)}14">${t}:${dist[t]}</span>`).join('');
    const total = picks.reduce((s, id) => s + HM[id].score, 0) / picks.length / 4.5;
    const maxScore = Math.max(eTier, aTier) || 1;
    col.innerHTML = `
      <div style="font-size:11px;color:${labelCls};font-family:'Archivo',sans-serif;font-weight:700;letter-spacing:1.5px;margin-bottom:6px;display:flex;justify-content:space-between">
        <span>${label}</span><span style="color:${barColor}">${total.toFixed(1)}</span>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">${distStr}</div>
      <div style="display:flex;flex-direction:column;gap:3px">
        ${picks.map(id => {
          const h = HM[id];
          return `<div style="display:flex;align-items:center;gap:5px;padding:2px 0">
            <img src="${h.img}" style="width:20px;height:20px;border-radius:3px;object-fit:cover;object-position:top">
            <span style="font-size:11px;font-family:'Archivo',sans-serif;font-weight:600;color:var(--text2);flex:1">${h.hn}</span>
            <span style="font-size:10px;font-family:'Archivo',sans-serif;font-weight:700;color:${tierInk(h.tier)}">${h.tier}</span>
            <span style="font-size:10px;font-family:'JetBrains Mono',monospace;font-weight:500;color:var(--text3)">${(h.score / 4.5).toFixed(1)}</span>
          </div>`;
        }).join('')}
      </div>
      <div style="margin-top:6px;height:4px;background:var(--line2);border-radius:2px;overflow:hidden">
        <div style="width:${(total / maxScore * 100).toFixed(0)}%;height:100%;background:${barColor}"></div>
      </div>`;
    return col;
  };
  tierGrid.appendChild(mkTierCol(enemyPicks, '⚔ ENEMY', 'var(--enemy)', 'var(--red)'));
  tierGrid.appendChild(mkTierCol(allyPicks, '🛡 OUR TEAM', 'var(--ally)', 'var(--ally)'));
  sec5.appendChild(tierGrid);
  body.appendChild(sec5);

  // ── 6. KEY FACTORS TEXT ANALYSIS ─────────────────────────────────────────
  const sec6 = document.createElement('div');
  sec6.className = 'ms-section';
  sec6.innerHTML = `<div class="ms-sec-title">🔑 KEY FACTORS ANALYSIS</div>`;
  const factors = [];

  // Overall winner
  factors.push(`${winner === 'ALLY' ? 'Our team wins' : 'Enemy wins'} with an overall score advantage of ${margin} points (${aTotal.toFixed(1)} vs ${eTotal.toFixed(1)}).`);

  // Strongest synergy
  const topESyn = eSynPairs[0], topASyn = aSynPairs[0];
  if (topASyn) factors.push(`Strongest synergy on our team: <strong>${HM[topASyn.a].hn} + ${HM[topASyn.b].hn}</strong> with score ${topASyn.combined.toFixed(2)}.`);
  if (topESyn && topESyn.combined > (topASyn?.combined || 0)) factors.push(`Enemy has a stronger synergy pair: <strong>${HM[topESyn.a].hn} + ${HM[topESyn.b].hn}</strong> (${topESyn.combined.toFixed(2)}).`);

  // Top counter
  const topECtr = ePairs[0], topACtr = aPairs[0];
  if (topECtr) factors.push(`Top counter threat against us: <strong>${HM[topECtr.eid].hn}</strong> vs ${HM[topECtr.aid].hn} (${topECtr.ws.toFixed(2)}).`);
  if (topACtr) factors.push(`Top counter advantage for us: <strong>${HM[topACtr.aid].hn}</strong> vs ${HM[topACtr.eid].hn} (${topACtr.ws.toFixed(2)}).`);

  // Lane coverage
  const aMiss = LANES.filter(l => !aLanes.has(l)), eMiss = LANES.filter(l => !eLanes.has(l));
  if (aMiss.length) factors.push(`We are missing lane coverage: <strong style="color:var(--red)">${aMiss.map(l => LANE_SHORT[l]).join(', ')}</strong>.`);
  else if (eMiss.length) factors.push(`Enemy is missing lane coverage: <strong style="color:var(--green)">${eMiss.map(l => LANE_SHORT[l]).join(', ')}</strong>.`);
  else factors.push(`Lane Coverage Score: Both teams cover all 5 lanes (<span style="color:var(--green)">${aLanePts}</span> vs <span style="color:var(--red)">${eLanePts}</span>).`);

  // Tier comparison
  factors.push(`Overall Tier Score: Our team ${aTier.toFixed(1)} vs Enemy ${eTier.toFixed(1)}. ${aTier > eTier ? 'We have a tier advantage.' : 'Enemy has a tier advantage.'}`);

  const factorDiv = document.createElement('div');
  factorDiv.style.cssText = 'background:var(--bg3);border:1px solid var(--line);border-radius:6px;padding:12px 14px;display:flex;flex-direction:column;gap:7px';
  factors.forEach(f => {
    const p = document.createElement('p');
    p.style.cssText = 'font-size:13px;color:var(--text2);line-height:1.7;font-family:\'Archivo\',sans-serif;font-weight:400;border-bottom:1px solid var(--line);padding-bottom:7px';
    p.innerHTML = f;
    factorDiv.appendChild(p);
  });
  if (factorDiv.lastChild) factorDiv.lastChild.style.borderBottom = 'none';
  sec6.appendChild(factorDiv);
  body.appendChild(sec6);

  // Update subtitle
  document.getElementById('modalSubtitle').textContent =
    `${winner === 'ALLY' ? 'We lead' : 'They lead'} +${margin} · ${laneWins} lane wins · ${ePairs.length} threats incoming`;
}
