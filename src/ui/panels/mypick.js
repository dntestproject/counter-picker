// MY PICK tab — own-pick planning surface. Pick a hero you intend to play:
// threats ranked by scoreBan against you, a bannable shortlist, the matchups
// you win, and which threats are already in the lobby. Presentation only —
// every number comes from threatReportFor().
import { HEROES, HM } from '../../engine/core.js';
import { getUI, setMyPick, quickBanGrid } from '../../engine/engine.js';
import { threatReportFor } from '../../engine/planner.js';
import { showToast } from '../toast.js';

// UI-local state (selection lives in engine state). The query survives
// re-renders triggered by engine updates — the search field would otherwise
// lose its text whenever a pick or ban lands elsewhere on the page.
// Expansion is keyed "<section>:<heroId>" so the same hero open in the
// shortlist and in the full threats list are independent panels.
let mpQuery = '';
let mpFocus = false;
// The list shows when there is no report yet or the user explicitly opened
// it. Starting false means a pre-set pick (e.g. arriving via a shared draft)
// lands straight on its report instead of the picker.
let mpListOpen = false;
let mpExpandedKey = null;

const D_PART_LABELS = [
  ['tierBonus', 'tier'], ['wrBonus', 'winrate'], ['brBonus', 'banrate'],
  ['threatScore', 'threat'], ['confBonus', 'confidence'], ['velBan', 'velocity'],
];

export function renderMyPickTab() {
  const ui = getUI();
  const report = threatReportFor(ui.myPickId);

  document.getElementById('panelCtrl').style.display = 'none';
  document.getElementById('recCount').style.display = 'none';
  const body = document.getElementById('panelBody');
  body.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'mp-wrap';

  const searchRow = document.createElement('div');
  searchRow.className = 'mp-search-row';
  searchRow.innerHTML = `
    <span class="mp-search-ico">⌕</span>
    <input type="text" class="mp-search" id="mpSearch" placeholder="Search a hero to plan around" autocomplete="off" spellcheck="false">
    ${report ? '<button type="button" class="mp-change" id="mpChange">✕ CHANGE</button>' : ''}`;

  const list = document.createElement('div');
  list.className = 'mp-list';
  list.id = 'mpList';
  const reportEl = document.createElement('div');
  reportEl.className = 'mp-report';

  wrap.appendChild(searchRow);
  wrap.appendChild(list);
  wrap.appendChild(reportEl);
  body.appendChild(wrap);

  if (mpListOpen || !report) {
    fillList(list, ui);
    reportEl.style.display = 'none';
  } else {
    fillReport(reportEl, report, ui);
    list.style.display = 'none';
  }
  wireSearch();
}

// ── hero selection list ─────────────────────────────────────────────────────
function fillList(el, ui) {
  el.innerHTML = '';
  const q = mpQuery.trim().toLowerCase();
  const matches = HEROES.filter(h => !q || h.hn.toLowerCase().includes(q));
  if (!matches.length) { el.appendChild(emptyNote('No heroes found.')); return; }
  matches.forEach(h => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'mp-lrow' + (h.id === ui.myPickId ? ' sel' : '');
    row.innerHTML = `
      <img class="mp-limg" src="${h.img}" alt="">
      <span class="mp-lname">${h.hn}</span>
      <span class="mp-ltags">${h.lane.map(l => `<span class="rtag lane">${l}</span>`).join('')}</span>
      <span class="mp-ltier tier-${h.tier}">${h.tier}</span>`;
    row.addEventListener('click', () => selectHero(h.id));
    el.appendChild(row);
  });
}

function selectHero(id) {
  setMyPick(id);
  mpQuery = '';
  mpListOpen = false;
  mpExpandedKey = null;
  renderMyPickTab();
}

// Keystroke path: refresh only the list container so the search field keeps
// focus and caret while typing.
function refreshList() {
  const list = document.getElementById('mpList');
  const reportEl = document.querySelector('.mp-report');
  if (!list) return;
  fillList(list, getUI());
  list.style.display = '';
  if (reportEl) reportEl.style.display = 'none';
}

function wireSearch() {
  const input = document.getElementById('mpSearch');
  const change = document.getElementById('mpChange');
  if (change) change.addEventListener('click', () => {
    setMyPick(null);
    mpQuery = '';
    mpListOpen = true;
    mpFocus = true;
    mpExpandedKey = null;
    renderMyPickTab();
  });
  if (!input) return;
  input.value = mpQuery;
  input.addEventListener('input', () => { mpQuery = input.value; mpListOpen = true; refreshList(); });
  input.addEventListener('focus', () => { mpFocus = true; });
  input.addEventListener('blur', () => { mpFocus = false; });
  if (mpFocus) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

// ── report ──────────────────────────────────────────────────────────────────
function fillReport(el, rep, ui) {
  const h = HM[rep.myHero];
  const st = heroStatus(rep.myHero, ui);
  const danger = rep.lobbyDanger.length;

  const head = document.createElement('div');
  head.className = 'mp-head';
  head.innerHTML = `
    <img class="mp-head-img" src="${h.img}" alt="${h.hn}">
    <div class="mp-head-info">
      <div class="mp-head-name">${h.hn}<span class="mp-ltier tier-${h.tier}">${h.tier}</span></div>
      <div class="mp-head-tags">
        ${h.lane.map(l => `<span class="rtag lane">${l}</span>`).join('')}
        ${h.role.map(r => `<span class="rtag role">${r}</span>`).join('')}
      </div>
      <div class="mp-head-chips">
        ${st ? `<span class="mp-chip ${st.cls}">${st.text}</span>` : ''}
        ${danger ? `<span class="mp-chip inl">⚔ ${danger} THREAT${danger > 1 ? 'S' : ''} IN LOBBY</span>`
                 : '<span class="mp-chip clear">LOBBY CLEAR</span>'}
      </div>
    </div>`;
  el.appendChild(head);

  const short = rep.threats.filter(t => t.status === 'free').slice(0, 5);
  el.appendChild(buildSection('Ban shortlist', short.length, short.length
    ? short.map((t, i) => threatRow(t, i + 1, 's'))
    : [emptyNote(rep.threats.length ? 'Nothing free to ban — top threats are off the board.' : 'No recorded counters in this dataset.')]));

  el.appendChild(buildSection('Threats — who counters me', rep.threats.length, rep.threats.length
    ? rep.threats.map((t, i) => threatRow(t, i + 1, 't'))
    : [emptyNote('No recorded counters in this dataset.')]));

  el.appendChild(buildSection('I counter — my matchups', rep.matchups.length, rep.matchups.length
    ? rep.matchups.map(matchupRow)
    : [emptyNote('No recorded matchups in this dataset.')]));

  // An expansion key whose hero left the report clears silently — no orphan.
  if (mpExpandedKey && !el.querySelector('.mp-trow[data-key="' + mpExpandedKey + '"]')) mpExpandedKey = null;
}

function buildSection(title, count, rows) {
  const sec = document.createElement('div');
  sec.className = 'mp-sec';
  const t = document.createElement('div');
  t.className = 'mp-sec-title';
  t.innerHTML = `<span>${title}</span><span class="mp-sec-n">${count}</span>`;
  sec.appendChild(t);
  rows.forEach(r => sec.appendChild(r));
  return sec;
}

function threatRow(t, rank, secKey) {
  const h = HM[t.id];
  const key = secKey + ':' + t.id;
  const row = document.createElement('div');
  row.className = 'mp-trow' + (t.status === 'free' ? '' : ' off');
  row.dataset.key = key;
  const chips = [];
  if (t.weaknessListed) chips.push('<span class="mp-chip wk">WEAKNESS</span>');
  if (t.status === 'enemy') chips.push('<span class="mp-chip inl">IN LOBBY</span>');
  else if (t.status === 'banned') chips.push('<span class="mp-chip off">BANNED</span>');
  else if (t.status === 'ally') chips.push('<span class="mp-chip ally">ALLY</span>');
  row.innerHTML = `
    <span class="mp-trank">${rank}</span>
    <img class="mp-timg" src="${h.img}" alt="">
    <span class="mp-tname">${h.hn}</span>
    <span class="mp-tchips">${chips.join('')}</span>
    <span class="mp-tws"><b>${fmtWs(t.ws)}</b><i>CTR WT</i></span>
    <span class="mp-tsc"><b>${t.banScore.toFixed(1)}</b><i>BAN SCORE</i></span>`;
  if (t.status === 'free') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mp-ban';
    btn.textContent = '🚫';
    btn.title = `Ban ${h.hn}`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!quickBanGrid(t.id)) { showToast('Ban slots full (10/10)'); return; }
      showToast(`🚫 ${h.hn} banned`);
    });
    row.appendChild(btn);
  }
  const expanded = mpExpandedKey === key;
  row.classList.toggle('exp', expanded);
  row.addEventListener('click', () => toggleDetail(row, t, key));
  if (!expanded) return row;
  const frag = document.createDocumentFragment();
  frag.appendChild(row);
  frag.appendChild(renderDetail(t));
  return frag;
}

// Surgical open/close: the row's detail is its adjacent sibling, so toggling
// never re-renders the panel (scroll position and search focus stay put).
// One open at a time — opening a key evicts any other detail in the report.
function toggleDetail(row, t, key) {
  const open = mpExpandedKey === key;
  const report = row.closest('.mp-report');
  if (report) {
    report.querySelectorAll('.mp-detail').forEach(d => d.remove());
    report.querySelectorAll('.mp-trow.exp').forEach(r => r.classList.remove('exp'));
  }
  mpExpandedKey = open ? null : key;
  row.classList.toggle('exp', !open);
  if (!open) row.insertAdjacentElement('afterend', renderDetail(t));
}

// WHY (receipts for the ban score) + CHAIN (who beats this threat).
function renderDetail(t) {
  const el = document.createElement('div');
  el.className = 'mp-detail';

  const why = document.createElement('div');
  why.className = 'mp-d-sec';
  why.textContent = 'WHY THIS SCORE';
  el.appendChild(why);

  // Receipts must sum on screen: the total is the sum of the DISPLAYED
  // (2dp) values, so the six figures above always add up to this line. The
  // raw identity Σ(parts) === banScore is proven separately in the harness.
  const parts = D_PART_LABELS.map(([k, label]) => [label, t.banParts[k]]);
  const max = Math.max(...parts.map(p => Math.abs(p[1])), 0.0001);
  let shownSum = 0;
  parts.forEach(([label, v]) => {
    const line = document.createElement('div');
    line.className = 'mp-d-part';
    const n = document.createElement('span');
    n.className = 'mp-d-pl';
    n.textContent = label;
    const track = document.createElement('span');
    track.className = 'mp-d-ptrack';
    const fill = document.createElement('span');
    fill.className = 'mp-d-pb' + (v < 0 ? ' neg' : '');
    fill.style.width = Math.max(2, Math.round(Math.abs(v) / max * 100)) + '%';
    track.appendChild(fill);
    const val = document.createElement('span');
    val.className = 'mp-d-pv' + (v < 0 ? ' neg' : '');
    val.textContent = (v >= 0 ? '+' : '') + v.toFixed(2);
    shownSum += parseFloat(val.textContent);
    line.appendChild(n); line.appendChild(track); line.appendChild(val);
    el.appendChild(line);
  });

  const tot = document.createElement('div');
  tot.className = 'mp-d-total';
  tot.textContent = '= ' + shownSum.toFixed(2) + ' ban score';
  el.appendChild(tot);

  const ans = document.createElement('div');
  ans.className = 'mp-d-sec';
  ans.textContent = 'IF THEY TAKE IT — ANSWER WITH';
  el.appendChild(ans);

  if (t.answers && t.answers.length) {
    t.answers.forEach((a, i) => {
      const line = document.createElement('div');
      line.className = 'mp-d-arow';
      line.innerHTML = `
        <span class="mp-d-arank">${i + 1}</span>
        <img class="mp-d-aimg" src="${HM[a.id].img}" alt="">
        <span class="mp-d-aname">${a.hn}</span>
        <span class="mp-d-aws">ws ${fmtWs(a.ws)}</span>`;
      el.appendChild(line);
    });
  } else {
    el.appendChild(emptyNote('No recorded counters in this dataset.'));
  }
  return el;
}

function matchupRow(m) {
  const h = HM[m.id];
  const row = document.createElement('div');
  row.className = 'mp-mrow';
  row.innerHTML = `
    <img class="mp-mimg" src="${h.img}" alt="">
    <span class="mp-mname">${h.hn}</span>
    <span class="mp-mws">${fmtWs(m.ws)}</span>`;
  return row;
}

function heroStatus(id, ui) {
  if (ui.banPicks.includes(id)) return { cls: 'warn', text: 'BANNED — PICK ANOTHER' };
  if (ui.enemyPicks.includes(id)) return { cls: 'inl', text: 'IN ENEMY TRAY' };
  if (ui.allyPicks.includes(id)) return { cls: 'ally', text: 'IN YOUR PICK' };
  return null;
}

function emptyNote(text) {
  const el = document.createElement('div');
  el.className = 'mp-empty';
  el.textContent = text;
  return el;
}

// Display rounding only — the raw weight stays untouched in the report.
function fmtWs(ws) { return String(Number(ws.toFixed(2))); }
