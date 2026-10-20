// SHELL — update pipeline, UI state setters, event wiring, keyboard map.
// Behavioural contract identical to the original page: same handlers, same
// toasts on keyboard mode switches, same undo/redo shortcuts, same Escape blur.
import {
  getUI, setPickMode, setActiveLane, toggleActiveRole, setCounterLane,
  setActiveTabState, setActiveRankId, setSleeperLaneState, setSleeperRoleState,
  undo, redo, randomizeEnemy, randomizeAlly, clearAll,
} from '../engine/engine.js';
import { renderDraftSlots } from './draft.js';
import { renderGrid, onSearchInput, clearSearch } from './grid.js';
import { renderTeamComp } from './teamcomp.js';
import { renderRightPanel } from './panels/index.js';
import { renderSleeperTab } from './panels/sleeper.js';
import { showToast } from './toast.js';
import { initShare, syncShareButton } from './share.js';
import { openSummary, closeSummary, closeSummaryDirect } from './summary.js';

// ── MAIN UPDATE ──────────────────────────────────────────────────────────
export function update() {
  renderDraftSlots();
  renderGrid();
  renderTeamComp();
  renderRightPanel();
  syncShareButton();
}

// ── SETTERS (mirror the original page-level handlers) ────────────────────
export function setTab(t) {
  setActiveTabState(t);
  document.querySelectorAll('.ptab').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + t).classList.add('active');
  // Show/hide sleeper filter bar
  const slpCtrl = document.getElementById('sleeperCtrl');
  if (slpCtrl) slpCtrl.style.display = (t === 'sleeper') ? '' : 'none';
  renderRightPanel();
}

export function setMode(m) {
  setPickMode(m);
  document.body.className = m === 'e' ? 'me' : m === 'a' ? 'ma' : 'mb';
  document.getElementById('btnE').className = 'pmb' + (m === 'e' ? ' ae' : '');
  document.getElementById('btnA').className = 'pmb' + (m === 'a' ? ' aa' : '');
  document.getElementById('btnB').className = 'pmb' + (m === 'b' ? ' ab' : '');
}

export function setLane(l, btn) {
  setActiveLane(l);
  document.querySelectorAll('#lf .fb').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderGrid();
}

export function tRole(r, btn) {
  toggleActiveRole(r);
  btn.classList.toggle('ra');
  renderGrid();
}

export function setCLane(l, btn) {
  setCounterLane(l);
  document.querySelectorAll('#panelCtrl .mf').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (getUI().activeTab === 'counter') renderRightPanel();
}

export function setRank(id, btn) {
  setActiveRankId(id);
  document.querySelectorAll('.rank-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  update();
}

export function setSleeperLane(l, btn) {
  setSleeperLaneState(l);
  document.querySelectorAll('.slp-lane-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderSleeperTab();
}

export function setSleeperRole(r, btn) {
  setSleeperRoleState(r);
  document.querySelectorAll('.slp-role-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderSleeperTab();
}

// ── WIRING ───────────────────────────────────────────────────────────────
export function wireUI() {
  // rank pills
  document.querySelectorAll('#rankPills .rank-pill').forEach(btn => {
    btn.addEventListener('click', () => setRank(Number(btn.dataset.rank), btn));
  });

  // pick-mode bar
  document.getElementById('btnE').addEventListener('click', () => setMode('e'));
  document.getElementById('btnA').addEventListener('click', () => setMode('a'));
  document.getElementById('btnB').addEventListener('click', () => setMode('b'));

  // panel tabs
  document.querySelectorAll('#panelTabs .ptab').forEach(btn => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });

  // hero browser filters
  document.querySelectorAll('#lf .fb').forEach(btn => {
    btn.addEventListener('click', () => setLane(btn.dataset.lane, btn));
  });
  document.querySelectorAll('#rf .fb').forEach(btn => {
    btn.addEventListener('click', () => tRole(btn.dataset.role, btn));
  });

  // counter lane filter
  document.querySelectorAll('#panelCtrl .mf').forEach(btn => {
    btn.addEventListener('click', () => setCLane(btn.dataset.clane, btn));
  });

  // sleeper filters
  document.querySelectorAll('.slp-lane-btn').forEach(btn => {
    btn.addEventListener('click', () => setSleeperLane(btn.dataset.slpLane, btn));
  });
  document.querySelectorAll('.slp-role-btn').forEach(btn => {
    btn.addEventListener('click', () => setSleeperRole(btn.dataset.slpRole, btn));
  });

  // search
  document.getElementById('srch').addEventListener('input', onSearchInput);
  document.getElementById('srchClear').addEventListener('click', clearSearch);

  // draft board actions
  document.getElementById('rngBtn').addEventListener('click', randomizeEnemy);
  document.getElementById('rngAllyBtn').addEventListener('click', randomizeAlly);
  document.getElementById('clearBtn').addEventListener('click', clearAll);

  // draft share
  initShare();

  // summary modal
  document.getElementById('summaryBtn').addEventListener('click', openSummary);
  document.getElementById('modalCloseBtn').addEventListener('click', closeSummaryDirect);
  document.getElementById('summaryOverlay').addEventListener('click', closeSummary);
}

// ── KEYBOARD SHORTCUTS (same map as the original) ────────────────────────
export function initKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'e' || e.key === 'E') { setMode('e'); showToast('Enemy mode'); }
    else if (e.key === 'a' || e.key === 'A') { setMode('a'); showToast('Ally mode'); }
    else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    }
    else if (e.key === 'Escape') { document.getElementById('srch').blur(); }
  });
}
