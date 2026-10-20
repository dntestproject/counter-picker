// BAN RECOMMENDER tab — priority-ranked ban targets with reason chips.
import { HEROES, HM } from '../../engine/core.js';
import { getUI, scoreBan, gS } from '../../engine/engine.js';

export function renderBanTab() {
  const { enemyPicks, allyPicks, banPicks } = getUI();
  const ctrl = document.getElementById('panelCtrl');
  ctrl.style.display = 'none';
  document.getElementById('recCount').style.display = 'none';
  const body = document.getElementById('panelBody');

  const excluded = new Set([...enemyPicks, ...allyPicks, ...banPicks]);
  const bans = [];
  HEROES.forEach(h => {
    if (excluded.has(h.id)) return;
    const s = scoreBan(h.id);
    bans.push({ ...s, hero: h });
  });
  bans.sort((a, b) => b.total - a.total);

  body.innerHTML = '';
  bans.slice(0, 20).forEach((b, idx) => {
    const h = b.hero, stats = gS(h);
    const card = document.createElement('div');
    card.className = 'ban-card';
    card.style.animationDelay = (idx * 0.022) + 's';

    const reasons = [];
    if (h.tier === 'SS' || h.tier === 'S') reasons.push(`<span class="ban-reason tier">TOP TIER ${h.tier}</span>`);
    if (stats.wr >= 52) reasons.push(`<span class="ban-reason wr">WR ${stats.wr.toFixed(1)}%</span>`);
    if (b.threatenedAllies.length) reasons.push(`<span class="ban-reason threat">COUNTERS OUR PICK</span>`);

    const threatHtml = b.threatenedAllies.length ?
      `<div class="ban-threat">⚠ Counters: <div class="ban-threat-heroes">${b.threatenedAllies.map(aid => `<img src="${HM[aid].img}" alt="" title="${HM[aid].hn}">`).join('')}</div></div>` : '';

    card.innerHTML = `
      <div class="ban-rank">${idx + 1}</div>
      <div class="ban-av">
        <img class="ban-img" src="${h.img}" alt="${h.hn}">
        <div class="ban-tbadge tier-${h.tier}">${h.tier}</div>
      </div>
      <div class="ban-info">
        <div class="ban-name">${h.hn}</div>
        <div class="ban-tags">
          ${h.lane.map(l => `<span class="rtag lane">${l}</span>`).join('')}
          ${h.role.map(r => `<span class="rtag role">${r}</span>`).join('')}
        </div>
        <div class="ban-stats">
          <div class="rst"><div class="rsv" style="font-size:11px">${stats.wr.toFixed(1)}%</div><div class="rsk">WIN RATE</div></div>
          <div class="rst"><div class="rsv" style="font-size:11px">${stats.br.toFixed(1)}%</div><div class="rsk">BAN RATE</div></div>
        </div>
        ${threatHtml}
      </div>
      <div class="ban-score-col">
        <div class="ban-score-val">${b.total.toFixed(1)}</div>
        <div class="ban-score-lbl">BAN PRIORITY</div>
        <div class="ban-reasons">${reasons.join('')}</div>
      </div>`;
    body.appendChild(card);
  });
}
