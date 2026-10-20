// COUNTER PICKS tab — ranked candidates with score bars, coverage dots,
// weaknesses, synergy rows. All scoring comes from the untouched engine;
// this module only formats it.
import { HEROES, HM, sparkline } from '../../engine/core.js';
import { getUI, getWRBounds, scoreCandidate, gS } from '../../engine/engine.js';
import { INK } from '../ink.js';

export function renderCounterPicks() {
  const { enemyPicks, allyPicks, banPicks, counterLane } = getUI();
  const ctrl = document.getElementById('panelCtrl');
  ctrl.style.display = '';
  const body = document.getElementById('panelBody');
  document.getElementById('recCount').style.display = '';

  if (!enemyPicks.length) {
    document.getElementById('cntTabCount').textContent = '0';
    document.getElementById('recCount').textContent = '0 PICKS';
    body.innerHTML = `<div class="empty-state"><div class="ei">⚔</div><h3>NO ENEMIES SELECTED</h3><p>Switch to <strong style="color:var(--enemy)">PICK ENEMY</strong> mode and select up to 5 enemy heroes</p></div>`;
    return;
  }

  const excluded = new Set([...enemyPicks, ...allyPicks, ...banPicks]);
  const bounds = getWRBounds();
  const recs = [];
  HEROES.forEach(h => {
    if (excluded.has(h.id)) return;
    if (counterLane !== 'ALL' && !h.lane.includes(counterLane)) return;
    const s = scoreCandidate(h.id, enemyPicks, allyPicks, bounds);
    if (s) recs.push({ ...s, hero: h });
  });
  recs.sort((a, b) => b.total - a.total);
  document.getElementById('cntTabCount').textContent = recs.length;
  document.getElementById('recCount').textContent = recs.length + ' PICKS';
  if (!recs.length) {
    body.innerHTML = `<div class="empty-state"><div class="ei">🔍</div><h3>NO RESULTS</h3><p>No picks found for current lane filter.</p></div>`;
    return;
  }
  const maxC = Math.max(...recs.map(r => r.cScore)) || 1;
  const maxM = Math.max(...recs.map(r => r.metaS)) || 10;
  const maxSyn = Math.max(...recs.map(r => r.synS)) || 1;

  body.innerHTML = '';
  recs.slice(0, 25).forEach((r, idx) => {
    const h = r.hero, stats = gS(h);
    const rk = idx === 0 ? 'r1' : idx === 1 ? 'r2' : idx === 2 ? 'r3' : '';
    const wrClass = stats.wr >= 52 ? 'good' : stats.wr >= 50 ? 'ok' : 'warn';

    let dots = '';
    enemyPicks.forEach(eid => {
      const hit = r.bd.some(b => b.eid === eid);
      dots += `<div class="cdot ${hit ? 'hit' : 'miss'}" title="${HM[eid]?.hn || ''}"></div>`;
    });

    const weakHtml = r.weaknesses.length ? `<span class="weak-badge">⚠ weak vs ${r.weaknesses.map(w => w.n).join(', ')}</span>` : '';
    const synHtml = r.synA.length ? `<span class="syn-badge">✦ synergy ×${r.synA.length}</span>` : '';
    const velHtml = h.vel ? `<span class="vel-badge vel-${h.vel}">${h.vel === 'SURGING' ? '▲▲' : h.vel === 'RISING' ? '▲' : h.vel === 'CLIMBING' ? '↑' : '▼'} ${h.vel}</span>` : '';
    const skpHtml = h.skp?.length ? `<div class="skp-tags">${h.skp.map(t => `<span class="skp-tag skp-${t.replace(' ', '-')}">${t}</span>`).join('')}</div>` : '';

    const maxBd = r.bd[0]?.sc || 1;
    const bdRows = r.bd.map(b => {
      const eh = HM[b.eid]; if (!eh) return '';
      return `<div class="bd-row"><div class="bd-hero"><img src="${eh.img}" alt="${eh.hn}"><span>${eh.hn}</span></div><div class="bd-bar-w"><div class="bd-bar" style="width:${Math.min(100, b.sc / maxBd * 100).toFixed(0)}%"></div></div><span class="bd-sc">+${b.sc.toFixed(2)}</span></div>`;
    }).join('');

    // Synergy rows
    let synRows = '';
    if (r.synA.length) {
      synRows = `<div class="syn-section"><div class="bd-title">✦ Synergizes with your picks</div><div class="syn-rows">`;
      r.synA.forEach(sa => {
        const ah = HM[sa.id];
        if (!ah) return;
        synRows += `<div class="syn-row"><div class="syn-hero"><img src="${ah.img}" alt="${ah.hn}"><span>${ah.hn}</span></div><span class="syn-sc">+${sa.sc.toFixed(2)}</span></div>`;
      });
      synRows += `</div></div>`;
    }

    const hasSyn = r.synS > 0.1;
    const synBarHtml = hasSyn ? `<div class="sbar"><div class="sbar-hdr"><span class="sbar-k">SYNERGY</span><span class="sbar-v">${r.synS.toFixed(1)}</span></div><div class="sbar-t"><div class="sbar-f syn" style="width:${Math.min(100, r.synS / maxSyn * 100).toFixed(0)}%"></div></div></div>` : '';

    // Phase badge
    const phaseColor = { EARLY: INK.rust, MID: INK.teal, LATE: INK.plum }[r.candPhase] || 'var(--text3)';
    const phaseBadge = `<span style="font-size:10px;padding:1px 7px;border-radius:999px;font-family:'Archivo',sans-serif;font-weight:600;letter-spacing:0.8px;color:${phaseColor};background:${phaseColor}14;border:1px solid ${phaseColor}55">${r.candPhase}</span>`;
    const hardBadge = r.conf >= 0.5 ? `<span style="font-size:10px;padding:1px 7px;border-radius:999px;font-family:'Archivo',sans-serif;font-weight:600;letter-spacing:0.8px;color:${INK.ochre};background:${INK.ochre}16;border:1px solid ${INK.ochre}55">HARD COUNTER</span>` : '';
    const gapBadge = r.gapFills > 0 ? `<span class="syn-badge">+${r.gapFills} GAP</span>` : '';

    const card = document.createElement('div');
    card.className = `rec-card ${rk}`;
    card.style.animationDelay = (idx * 0.022) + 's';
    card.innerHTML = `
      <div class="rec-top">
        <div class="rec-rank">${idx + 1}</div>
        <div class="rec-av">
          <img class="rec-img" src="${h.img}" alt="${h.hn}">
          <div class="rec-tbadge tier-${h.tier}">${h.tier}</div>
        </div>
        <div class="rec-center">
          <div class="rec-name">${h.hn} ${velHtml}</div>
          <div class="rec-tags">
            ${h.lane.map(l => `<span class="rtag lane">${l}</span>`).join('')}
            ${h.role.map(r2 => `<span class="rtag role">${r2}</span>`).join('')}
            ${h.spec.map(s2 => `<span class="rtag spec">${s2}</span>`).join('')}
            ${phaseBadge}${hardBadge}
          </div>
          ${skpHtml}
          <div class="rec-stats">
            <div class="rst">
              <div class="rsv ${wrClass}">${stats.wr.toFixed(1)}%</div>
              <div class="rsk">WIN RATE</div>
            </div>
            <div class="rst">
              <div class="rsv">${stats.br.toFixed(1)}%</div>
              <div class="rsk">BAN RATE</div>
            </div>
            <div class="rst">
              <div class="rsv ok">${r.covered}/${enemyPicks.length}</div>
              <div class="rsk">COVERAGE</div>
            </div>
            <div class="rst">
              <div class="rsv" style="color:${r.phaseBonus > 1 ? 'var(--green)' : r.phaseBonus < 1 ? 'var(--red)' : 'var(--text2)'}">${r.phaseBonus >= 1 ? ('+' + ((r.phaseBonus - 1) * 100).toFixed(0) + '%') : (((r.phaseBonus - 1) * 100).toFixed(0) + '%')}</div>
              <div class="rsk">PHASE ADV</div>
            </div>
          </div>
          <div class="sparkrow">
            <span class="spark-label">WR TREND (30d→1d):</span>
            ${sparkline(h.trend)}
          </div>
          <div class="cov-row">
            <span class="cov-lbl">COVERS:</span>
            <div class="cdots">${dots}</div>
            ${weakHtml}${synHtml}${gapBadge}
          </div>
        </div>
        <div class="rec-score-col">
          <div><div class="stotal-val">${r.total.toFixed(1)}</div><div class="stotal-lbl">TOTAL SCORE</div></div>
          <div class="sbars">
            <div class="sbar"><div class="sbar-hdr"><span class="sbar-k">COUNTER</span><span class="sbar-v">${r.cScore.toFixed(1)}</span></div><div class="sbar-t"><div class="sbar-f cnt" style="width:${Math.min(100, r.cScore / maxC * 100).toFixed(0)}%"></div></div></div>
            <div class="sbar"><div class="sbar-hdr"><span class="sbar-k">CONFIDENCE</span><span class="sbar-v">${(r.conf * 100).toFixed(0)}%</span></div><div class="sbar-t"><div class="sbar-f" style="width:${(r.conf * 100).toFixed(0)}%;background:linear-gradient(90deg,#6E4C06,#B98A1E)"></div></div></div>
            <div class="sbar"><div class="sbar-hdr"><span class="sbar-k">META</span><span class="sbar-v">${r.metaS.toFixed(1)}</span></div><div class="sbar-t"><div class="sbar-f meta" style="width:${Math.min(100, r.metaS / maxM * 100).toFixed(0)}%"></div></div></div>
            <div class="sbar"><div class="sbar-hdr"><span class="sbar-k">COVERAGE</span><span class="sbar-v">${r.covered}/${enemyPicks.length}</span></div><div class="sbar-t"><div class="sbar-f cov" style="width:${(r.covered / enemyPicks.length * 100).toFixed(0)}%"></div></div></div>
            ${synBarHtml}
          </div>
        </div>
      </div>
      <div class="rec-expand">
        <div class="bd-title">Counter Score vs Enemy Lineup</div>
        <div class="bd-rows">${bdRows || '<span style="font-size:10px;color:var(--text3)">No direct counter data available</span>'}</div>
        ${synRows}
      </div>`;
    body.appendChild(card);
  });
}
