// MATCH-UP MATRIX tab — pairwise net counter grid ally×enemy.
import { HM, CM } from '../../engine/core.js';
import { getUI } from '../../engine/engine.js';

export function renderMatrixTab() {
  const { enemyPicks, allyPicks } = getUI();
  const ctrl = document.getElementById('panelCtrl');
  ctrl.style.display = 'none';
  document.getElementById('recCount').style.display = 'none';
  const body = document.getElementById('panelBody');
  body.innerHTML = '';

  if (!enemyPicks.length || !allyPicks.length) {
    body.innerHTML = `<div class="empty-state"><div class="ei">⬛</div><h3>MATRIX UNAVAILABLE</h3><p>Add at least 1 enemy hero <em>and</em> 1 ally hero to see the matchup matrix</p></div>`;
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'matrix-wrap';

  // Legend
  const leg = document.createElement('div');
  leg.className = 'matrix-legend';
  leg.innerHTML = `
    <div class="ml-item"><div class="ml-dot" style="background:rgba(63,107,37,0.55)"></div>Our advantage</div>
    <div class="ml-item"><div class="ml-dot" style="background:rgba(169,50,38,0.5)"></div>Their advantage</div>
    <div class="ml-item"><div class="ml-dot" style="background:rgba(58,42,22,0.12)"></div>Neutral</div>
    <div style="font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace;margin-left:auto">NET = ALLY COUNTER − ENEMY COUNTER</div>`;
  wrap.appendChild(leg);

  // Table
  const tbl = document.createElement('table');
  tbl.className = 'matrix-table';

  // Header row (ally heroes)
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  hr.innerHTML = '<th></th>';
  allyPicks.forEach(aid => {
    const ah = HM[aid];
    hr.innerHTML += `<th><div style="display:flex;flex-direction:column;align-items:center;gap:2px"><img src="${ah.img}" style="width:28px;height:28px;border-radius:4px;object-fit:cover;object-position:top;border:1px solid var(--ally)"><span style="font-size:10px;color:var(--ally)">${ah.hn}</span></div></th>`;
  });
  thead.appendChild(hr);
  tbl.appendChild(thead);

  const tbody = document.createElement('tbody');
  let allyWins = 0, enemyWins = 0, neutrals = 0;

  enemyPicks.forEach(eid => {
    const eh = HM[eid];
    const row = document.createElement('tr');
    row.innerHTML = `<td><div class="mhero-cell"><img src="${eh.img}" alt="${eh.hn}" style="border:1px solid var(--enemy)"><span>${eh.hn}</span></div></td>`;
    allyPicks.forEach(aid => {
      const allyAdv = (CM[aid] || {})[eid] || 0;   // ally counters enemy
      const enemyAdv = (CM[eid] || {})[aid] || 0;  // enemy counters ally
      const net = allyAdv - enemyAdv;
      let cls = 'neutral', netStr = (net >= 0 ? '+' : '') + net.toFixed(1), lbl = '';
      if (net >= 1) { cls = 'ally-win'; allyWins++; lbl = 'OUR ADV'; }
      else if (net <= -1) { cls = 'enemy-win'; enemyWins++; lbl = 'THEIR ADV'; }
      else { neutrals++; lbl = 'NEUTRAL'; }
      row.innerHTML += `<td><div class="mcell ${cls}"><span class="mcell-net">${netStr}</span><span class="mcell-label">${lbl}</span></div></td>`;
    });
    tbody.appendChild(row);
  });
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);

  // Summary
  const total = allyPicks.length * enemyPicks.length;
  const summ = document.createElement('div');
  summ.className = 'matrix-summary';
  summ.innerHTML = `
    <div class="ms-item"><div class="ms-val" style="color:var(--green)">${allyWins}</div><div class="ms-lbl">Our advantages</div></div>
    <div class="ms-item"><div class="ms-val" style="color:var(--red)">${enemyWins}</div><div class="ms-lbl">Their advantages</div></div>
    <div class="ms-item"><div class="ms-val" style="color:var(--text3)">${neutrals}</div><div class="ms-lbl">Neutral</div></div>
    <div class="ms-item" style="margin-left:auto"><div class="ms-val" style="color:${allyWins >= enemyWins ? 'var(--green)' : 'var(--red)'}">${allyWins >= enemyWins ? 'WE LEAD' : 'THEY LEAD'}</div><div class="ms-lbl">${allyWins}-${enemyWins} matchup wins</div></div>`;
  wrap.appendChild(summ);
  body.appendChild(wrap);
}
