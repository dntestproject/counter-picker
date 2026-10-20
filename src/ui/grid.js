// Hero grid: search + lane/role filters, tier sections, pick states,
// hover tooltips, quick ban. Filter logic and label strings match the original.
import { HEROES } from '../engine/core.js';
import { getUI, handlePick, rmE, rmA, rmB, quickBanGrid } from '../engine/engine.js';
import { showToast } from './toast.js';
import { showTT, hideTT, moveTT } from './tooltip.js';
import { tierInk } from './ink.js';

export function renderGrid() {
  const { activeLane, activeRoles, enemyPicks, allyPicks, banPicks } = getUI();
  const search = document.getElementById('srch').value.toLowerCase();
  const wrap = document.getElementById('hgw');
  let filtered = HEROES.filter(h => {
    if (search && !h.hn.toLowerCase().includes(search)) return false;
    if (activeLane !== 'ALL' && !h.lane.includes(activeLane)) return false;
    if (activeRoles.size > 0 && !h.role.some(r => activeRoles.has(r))) return false;
    return true;
  });
  const tO = { SS: 0, S: 1, A: 2, B: 3, C: 4, D: 5 };
  filtered.sort((a, b) => (tO[a.tier] || 5) - (tO[b.tier] || 5) || b.score - a.score);
  const groups = {};
  filtered.forEach(h => { if (!groups[h.tier]) groups[h.tier] = []; groups[h.tier].push(h); });
  wrap.innerHTML = '';
  ['SS', 'S', 'A', 'B', 'C', 'D'].forEach(tier => {
    if (!groups[tier]?.length) return;
    const lbl = document.createElement('div');
    lbl.className = 'gsl';
    lbl.innerHTML = `<span style="color:${tierInk(tier)}">${tier} TIER</span> <span style="font-size:10px;color:var(--text3);font-family:var(--f-mono)">(${groups[tier].length})</span>`;
    wrap.appendChild(lbl);
    const grid = document.createElement('div');
    grid.className = 'hgrid';
    groups[tier].forEach(h => {
      const isE = enemyPicks.includes(h.id), isA = allyPicks.includes(h.id), isB = banPicks.includes(h.id);
      const card = document.createElement('div');
      card.className = 'hero-card' + (isE ? ' se' : '') + (isA ? ' sa' : '') + (isB ? ' sb' : '');
      const velDot = h.vel ? `<div class="vel-dot ${h.vel}" title="${h.vel}: WR ${h.wr_delta > 0 ? '+' : ''}${h.wr_delta}% (30d)"></div>` : '';
      card.innerHTML = `<img src="${h.img}" alt="${h.hn}" loading="lazy"><div class="cn">${h.hn}</div><div class="ct tier-${h.tier}">${h.tier}</div><div class="pi">${isE ? 'ENM' : isA ? 'ALY' : isB ? 'BAN' : ''}</div>${velDot}<div class="card-remove" title="Remove">✕</div>`;
      if (!isE && !isA && !isB) {
        card.addEventListener('click', () => handlePick(h.id));
        card.addEventListener('mouseenter', ev => showTT(h, ev));
        card.addEventListener('mouseleave', hideTT);
        card.addEventListener('mousemove', ev => moveTT(ev));
      }
      // Card-remove button for already-picked heroes: remove from list
      if (isE || isA || isB) {
        card.style.pointerEvents = 'auto';
        const rmBtn = card.querySelector('.card-remove');
        rmBtn.style.display = 'flex';
        rmBtn.title = isB ? 'Unban' : 'Remove';
        rmBtn.addEventListener('click', e => {
          e.stopPropagation();
          if (isE) rmE(h.id, e);
          else if (isA) rmA(h.id, e);
          else rmB(h.id, e);
        });
      } else {
        // Free hero: X button = quick ban (no need to switch to ban mode)
        const rmBtn = card.querySelector('.card-remove');
        rmBtn.title = 'Ban hero';
        rmBtn.addEventListener('click', e => {
          e.stopPropagation();
          hideTT();
          if (!quickBanGrid(h.id)) { showToast('Ban slots full (10/10)'); return; }
          showToast(`🚫 ${h.hn} banned`);
        });
      }
      grid.appendChild(card);
    });
    wrap.appendChild(grid);
  });
  if (!wrap.children.length) wrap.innerHTML = '<div style="padding:44px;text-align:center;color:var(--text3);font-family:\'Fraunces\',serif;font-style:italic;letter-spacing:0.5px;font-size:14px">No heroes found.</div>';
}

export function onSearchInput() {
  const val = document.getElementById('srch').value;
  document.getElementById('srchClear').classList.toggle('visible', val.length > 0);
  renderGrid();
}

export function clearSearch() {
  const el = document.getElementById('srch');
  el.value = '';
  document.getElementById('srchClear').classList.remove('visible');
  renderGrid();
}
