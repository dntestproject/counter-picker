// Hover card for free heroes in the grid. Markup and stat sources match the
// original tooltip one-to-one.
import { gS } from '../engine/engine.js';

export function showTT(h, e) {
  const stats = gS(h);
  const wrClass = stats.wr >= 52 ? 'style="color:var(--green)"' : stats.wr >= 50 ? 'style="color:var(--ally)"' : 'style="color:var(--red)"';
  const rising = h.trend.length >= 2 && h.trend[h.trend.length - 1] > h.trend[0];
  document.getElementById('tt').innerHTML = `
    <div class="tt-name">${h.hn} <span class="tier-${h.tier}" style="font-size:11px">[${h.tier}]</span></div>
    <div class="tt-row"><span class="tt-k">ROLE</span><span class="tt-v">${h.role.join(', ')}</span></div>
    <div class="tt-row"><span class="tt-k">LANE</span><span class="tt-v">${h.lane.join(', ')}</span></div>
    <div class="tt-row"><span class="tt-k">WIN RATE</span><span class="tt-v" ${wrClass}>${stats.wr.toFixed(1)}%</span></div>
    <div class="tt-row"><span class="tt-k">BAN RATE</span><span class="tt-v">${stats.br.toFixed(1)}%</span></div>
    <div class="tt-row"><span class="tt-k">META SCORE</span><span class="tt-v">${h.score.toFixed(0)}</span></div>
    <div class="tt-row"><span class="tt-k">WR TREND</span><span class="tt-v" style="color:${rising ? 'var(--green)' : 'var(--red)'}">${rising ? '▲ RISING' : '▼ FALLING'}</span></div>`;
  document.getElementById('tt').classList.add('on');
  moveTT(e);
}

export function hideTT() {
  document.getElementById('tt').classList.remove('on');
}

export function moveTT(e) {
  const tt = document.getElementById('tt');
  let x = e.clientX + 14, y = e.clientY - 10;
  if (x + 210 > window.innerWidth) x = e.clientX - 220;
  if (y + 220 > window.innerHeight) y = e.clientY - 180;
  tt.style.left = x + 'px';
  tt.style.top = y + 'px';
}
