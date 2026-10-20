// SLEEPER PICKS tab — hidden gems ranked by WR×Tier÷Demand formula readout.
import { HEROES, sparkline } from '../../engine/core.js';
import { getUI, sleeperScore, gS } from '../../engine/engine.js';

export function renderSleeperTab() {
  const { sleeperLane, sleeperRole } = getUI();
  const ctrl = document.getElementById('panelCtrl');
  ctrl.style.display = 'none';
  document.getElementById('recCount').style.display = 'none';
  const body = document.getElementById('panelBody');
  body.innerHTML = '';

  const all = HEROES.filter(h => {
    if (sleeperLane !== 'ALL' && !h.lane.includes(sleeperLane)) return false;
    if (sleeperRole !== 'ALL' && !h.role.includes(sleeperRole)) return false;
    return true;
  });

  const scored = all.map(h => ({ h, ...sleeperScore(h) }));
  scored.sort((a, b) => b.total - a.total);

  // Formula explanation
  const info = document.createElement('div');
  info.style.cssText = 'padding:0 2px 6px;flex-shrink:0';
  info.innerHTML = `
    <div class="sleeper-formula">
      <span class="sf-label">FORMULA</span>
      <span class="sf-formula">(WinRate − 49%) × TierWeight ÷ Demand</span>
      <span style="margin-left:auto;font-size:10px;color:var(--text3);font-family:'Archivo',sans-serif">High WR · Low PR+BR = Hidden Gem</span>
    </div>`;
  body.appendChild(info);

  const maxScore = scored[0]?.total || 1;

  scored.slice(0, 20).forEach((s, idx) => {
    const h = s.h, stats = gS(h);
    const rk = idx === 0 ? 's1' : idx === 1 ? 's2' : idx === 2 ? 's3' : '';
    const wrClass = s.wr >= 53 ? 'good' : s.wr >= 51 ? 'ok' : 'warn';
    const velHtml = h.vel ? `<span class="vel-badge vel-${h.vel}">${h.vel === 'SURGING' ? '▲▲' : h.vel === 'RISING' ? '▲' : h.vel === 'CLIMBING' ? '↑' : '▼'} ${h.vel}</span>` : '';
    const skpHtml = h.skp?.length ? `<div class="skp-tags">${h.skp.map(t => `<span class="skp-tag skp-${t.replace(' ', '-')}">${t}</span>`).join('')}</div>` : '';

    const card = document.createElement('div');
    card.className = `sleeper-card ${rk}`;
    card.style.animationDelay = (idx * 0.025) + 's';
    card.innerHTML = `
      <div class="sleeper-rank">${idx + 1}</div>
      <div class="sleeper-av">
        <img class="sleeper-img" src="${h.img}" alt="${h.hn}">
        <div class="sleeper-tbadge tier-${h.tier}">${h.tier}</div>
      </div>
      <div class="sleeper-center">
        <div class="sleeper-name-row">
          <div class="sleeper-name">${h.hn}</div>
          ${velHtml}
        </div>
        <div class="rec-tags">
          ${h.lane.map(l => `<span class="rtag lane">${l}</span>`).join('')}
          ${h.role.map(r => `<span class="rtag role">${r}</span>`).join('')}
        </div>
        ${skpHtml}
        <div class="sleeper-stats">
          <div class="rst"><div class="rsv ${wrClass}">${s.wr.toFixed(1)}%</div><div class="rsk">WIN RATE</div></div>
          <div class="rst"><div class="rsv" style="color:var(--text2)">${s.pr.toFixed(2)}%</div><div class="rsk">PICK RATE</div></div>
          <div class="rst"><div class="rsv" style="color:var(--text2)">${s.br.toFixed(1)}%</div><div class="rsk">BAN RATE</div></div>
          <div class="rst"><div class="rsv" style="color:var(--text2)">${h.score.toFixed(0)}</div><div class="rsk">META PTS</div></div>
        </div>
        <div style="margin-top:2px">
          <div class="demand-bar-wrap">
            <span class="demand-lbl">WIN RATE</span>
            <div class="demand-track"><div class="demand-fill-wr" style="width:${Math.min(100, Math.max(0, (s.wr - 43) / (57 - 43) * 100)).toFixed(0)}%"></div></div>
            <span style="font-size:10px;color:var(--green);font-family:'JetBrains Mono',monospace;width:36px;text-align:right">${s.wr.toFixed(1)}%</span>
          </div>
          <div class="demand-bar-wrap">
            <span class="demand-lbl">PICK RATE</span>
            <div class="demand-track"><div class="demand-fill-pr" style="width:${Math.min(100, s.pr / 4 * 100).toFixed(0)}%"></div></div>
            <span style="font-size:10px;color:var(--ally);font-family:'JetBrains Mono',monospace;width:36px;text-align:right">${s.pr.toFixed(2)}%</span>
          </div>
          <div class="demand-bar-wrap">
            <span class="demand-lbl">BAN RATE</span>
            <div class="demand-track"><div class="demand-fill-br" style="width:${Math.min(100, s.br / 100 * 100).toFixed(0)}%"></div></div>
            <span style="font-size:10px;color:var(--accent);font-family:'JetBrains Mono',monospace;width:36px;text-align:right">${s.br.toFixed(1)}%</span>
          </div>
        </div>
        <div style="margin-top:2px">
          ${sparkline(h.trend)}
          <span style="font-size:10px;color:var(--text3);font-family:'Archivo',sans-serif;margin-left:6px">WR TREND (30d→1d)</span>
        </div>
      </div>
      <div class="sleeper-score-col">
        <div class="slp-val">${s.total.toFixed(1)}</div>
        <div class="slp-lbl">SLEEPER SCORE</div>
        <div style="margin-top:4px;width:100%">
          <div class="sbar-hdr"><span class="sbar-k" style="font-size:7px">SCORE BAR</span></div>
          <div class="sbar-t" style="height:5px;margin-top:2px"><div class="sbar-f meta" style="width:${Math.min(100, s.total / maxScore * 100).toFixed(0)}%"></div></div>
        </div>
        <div style="font-size:10px;color:var(--text3);font-family:'Archivo',sans-serif;margin-top:4px;text-align:right">
          ${s.tierV}/6 tier weight<br>
          ${s.demand.toFixed(2)} demand
        </div>
      </div>`;
    body.appendChild(card);
  });
}
