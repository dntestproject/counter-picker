// Draft board: enemy/ally slots, ban slots (5+5), header badges, status line,
// advantage readout. Values and strings match the original exactly.
import { HM } from '../engine/core.js';
import { getUI, getWeakSpots, computeAdv, rmE, rmA, rmB } from '../engine/engine.js';
import { getVerdictLabel } from '../engine/core.js';

export function renderDraftSlots() {
  const { enemyPicks, allyPicks, banPicks } = getUI();
  const ws = getWeakSpots();

  ['enemySlots', 'allySlots'].forEach((sid, idx) => {
    const picks = idx === 0 ? enemyPicks : allyPicks;
    const cls = idx === 0 ? 'es' : 'as';
    const el = document.getElementById(sid);
    el.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const id = picks[i];
      const s = document.createElement('div');
      s.className = `dslot ${cls}${id ? ' filled' : ''}`;
      if (id) {
        const h = HM[id];
        let extra = '';
        if (idx === 1 && ws[id]) extra = `<div class="weak-dot" title="Weak vs ${ws[id].map(w => w.n).join(', ')}">⚠</div>`;
        s.innerHTML = `<img src="${h.img}" alt="${h.hn}">${extra}<span class="stier tier-${h.tier}">${h.tier}</span><div class="rm" title="Remove">✕</div>`;
        s.querySelector('.rm').addEventListener('click', ev => {
          (idx === 0 ? rmE : rmA)(id, ev);
        });
      } else {
        s.innerHTML = `<span class="plus" style="color:${idx === 0 ? 'rgba(181,55,26,0.32)' : 'rgba(31,78,121,0.28)'}">+</span>`;
      }
      el.appendChild(s);
    }
  });

  // Ban slots: 5+5 across two rows
  ['banSlots1', 'banSlots2'].forEach((sid, rowIdx) => {
    const el = document.getElementById(sid);
    el.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const slotIdx = rowIdx * 5 + i;
      const id = banPicks[slotIdx];
      const s = document.createElement('div');
      s.className = `dslot bs${id ? ' filled' : ''}`;
      if (id) {
        const h = HM[id];
        s.innerHTML = `<img src="${h.img}" alt="${h.hn}"><div class="rm" title="Unban">✕</div>`;
        s.querySelector('.rm').addEventListener('click', ev => rmB(id, ev));
      } else {
        s.innerHTML = `<span class="plus" style="font-size:13px;color:rgba(138,96,7,0.34)">+</span>`;
      }
      el.appendChild(s);
    }
  });

  document.getElementById('hbadge').innerHTML = `ENEMY <strong>${enemyPicks.length}</strong> · ALLY <strong>${allyPicks.length}</strong> · BAN <strong>${banPicks.length}</strong>`;
  document.getElementById('ecnt').textContent = enemyPicks.length;
  document.getElementById('acnt').textContent = allyPicks.length;
  document.getElementById('bcnt').textContent = banPicks.length;
  document.getElementById('banCountBadge').textContent = `${banPicks.length}/10`;
  document.getElementById('draftStatus').textContent =
    enemyPicks.length === 0 ? 'SELECT ENEMY HEROES' :
    enemyPicks.length < 5 ? `${5 - enemyPicks.length} ENEMY SLOTS LEFT` : 'ENEMY LINEUP FULL';
  renderDraftAdv();
  updateSummaryBtn();
}

export function renderDraftAdv() {
  const adv = computeAdv();
  const el = document.getElementById('advValue');
  const v = getVerdictLabel(adv);
  if (adv === null) { el.textContent = v.text; el.className = 'adv-value'; return; }
  const n = Math.abs(adv).toFixed(1);
  el.textContent = `${v.short} ${n}`;
  el.className = `adv-value ${v.cls}`;
}

export function updateSummaryBtn() {
  const { enemyPicks, allyPicks } = getUI();
  const btn = document.getElementById('summaryBtn');
  if (btn) btn.style.display = (enemyPicks.length === 5 && allyPicks.length === 5) ? '' : 'none';
}
