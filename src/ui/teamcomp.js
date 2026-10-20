// Team-comp strip: lane coverage icons + role pills + gap warnings per side.
import { HM, LANES, LANE_SHORT, RCLS } from '../engine/core.js';
import { getUI, getTeamComp } from '../engine/engine.js';

export function renderTeamComp() {
  const { enemyPicks, allyPicks } = getUI();
  ['E', 'A'].forEach(side => {
    const picks = side === 'E' ? enemyPicks : allyPicks;
    const comp = getTeamComp(picks);
    const cls = side === 'E' ? 'filled-e' : 'filled-a';
    // lanes
    const lEl = document.getElementById(`tc${side}Lanes`);
    lEl.innerHTML = '';
    LANES.forEach(lane => {
      const filled = comp.lanes.has(lane);
      // Find a hero that plays this lane
      const heroInLane = picks.find(id => HM[id].lane.includes(lane));
      const div = document.createElement('div');
      div.className = 'tc-lane';
      const icon = document.createElement('div');
      icon.className = `tc-lane-icon ${filled ? cls : 'empty'}`;
      if (filled && heroInLane) {
        icon.innerHTML = `<img src="${HM[heroInLane].img}" alt="">`;
      } else {
        icon.textContent = LANE_SHORT[lane];
      }
      const lbl = document.createElement('div');
      lbl.className = 'tc-lane-lbl';
      lbl.textContent = LANE_SHORT[lane];
      div.appendChild(icon);
      div.appendChild(lbl);
      lEl.appendChild(div);
    });
    // roles + gaps
    const rEl = document.getElementById(`tc${side}Roles`);
    rEl.innerHTML = '';
    comp.roles.forEach(role => {
      const span = document.createElement('span');
      span.className = `tc-pill ${RCLS[role] || ''}`;
      span.textContent = role;
      rEl.appendChild(span);
    });
    comp.missingLanes.forEach(lane => {
      const span = document.createElement('span');
      span.className = 'tc-gap';
      span.textContent = `⚠ NO ${LANE_SHORT[lane]}`;
      rEl.appendChild(span);
    });
  });
}
