// ─────────────────────────────────────────────────────────────────────────────
// SHARE — draft link UI. Copy button lives in the draft rail next to CLEAR
// ALL; an incoming #draft=... hash surfaces a Load/Dismiss banner. Nothing
// ever applies without a click, and a dismissed/garbage hash never banners.
// ─────────────────────────────────────────────────────────────────────────────
import { getUI, loadDraft } from '../engine/engine.js';
import { encodeState, decodeState, hasEntries } from './share-codec.js';
import { showToast } from './toast.js';

let lastHandledHash = null;   // guards hashchange re-fires for the same link
let pending = null;           // decoded payload waiting behind the banner

export function initShare() {
  const btn = document.getElementById('shareBtn');
  if (btn) btn.addEventListener('click', onCopy);
  const loadBtn = document.getElementById('shareBannerLoad');
  const dismissBtn = document.getElementById('shareBannerDismiss');
  const fallbackClose = document.getElementById('shareFallbackClose');
  if (loadBtn) loadBtn.addEventListener('click', onBannerLoad);
  if (dismissBtn) dismissBtn.addEventListener('click', onBannerDismiss);
  if (fallbackClose) fallbackClose.addEventListener('click', hideFallback);
  window.addEventListener('hashchange', checkHash);
  checkHash();
}

// Called from the render pipeline: an empty draft has nothing to hand over.
export function syncShareButton() {
  const b = document.getElementById('shareBtn');
  if (b) b.disabled = !encodeState(getUI());
}

function draftUrl() {
  const code = encodeState(getUI());
  if (!code) return null;
  return location.href.split('#')[0] + '#draft=' + code;
}

async function onCopy() {
  const url = draftUrl();
  if (!url) return;
  const fb = document.getElementById('shareFallback');
  try {
    await navigator.clipboard.writeText(url);
    if (fb) fb.style.display = 'none';
    showToast('🔗 Draft link copied');
  } catch (err) {
    showFallback(url);
    showToast('Clipboard unavailable — copy the link below');
  }
}

function showFallback(url) {
  const box = document.getElementById('shareFallback');
  const input = document.getElementById('shareUrl');
  if (!box || !input) return;
  input.value = url;
  box.style.display = 'flex';
  input.focus();
  input.select();
}
function hideFallback() {
  const box = document.getElementById('shareFallback');
  if (box) box.style.display = 'none';
}

// ── incoming link ───────────────────────────────────────────────────────────
function checkHash() {
  const h = location.hash;
  if (!h.startsWith('#draft=')) return;
  const code = h.slice(7);
  if (!code || code === lastHandledHash) return;
  const payload = decodeState(code);
  if (!hasEntries(payload)) return;   // garbage banners nothing
  pending = payload;
  lastHandledHash = code;
  showBanner(payload);
}

function showBanner(payload) {
  const el = document.getElementById('shareBanner');
  const txt = document.getElementById('shareBannerText');
  if (!el || !txt) return;
  const bits = [];
  if (payload.enemies.length) bits.push(payload.enemies.length + ' enemy');
  if (payload.allies.length) bits.push(payload.allies.length + ' ally');
  if (payload.bans.length) bits.push(payload.bans.length + ' ban');
  if (payload.myPick != null) bits.push('my pick');
  txt.textContent = 'Shared draft found — ' + bits.join(' · ');
  el.style.display = 'flex';
}

function hideBanner() {
  const el = document.getElementById('shareBanner');
  if (el) el.style.display = 'none';
}

function clearHash() {
  history.replaceState(null, '', location.pathname + location.search);
}

function onBannerLoad() {
  const payload = pending;
  pending = null;
  hideBanner();
  clearHash();
  if (!payload) return;
  const res = loadDraft(payload);
  if (!res.applied) showToast('Nothing valid in that link — ignored');
}

function onBannerDismiss() {
  pending = null;
  hideBanner();
  clearHash();
}
