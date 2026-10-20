// ─────────────────────────────────────────────────────────────────────────────
// SHARE CODEC — pure draft ↔ URL-hash serialization. No DOM at import, so the
// harness (tools/verify-share.mjs) exercises it in node.
//
// Grammar:  b:3,7;e:25,22;a:1;m:22   (bans / enemies / allies / my pick)
// Unknown keys are ignored; malformed segments drop individually — one bad
// segment never kills the rest of the payload. Order inside a tray is draft
// meaning and is always preserved.
// ─────────────────────────────────────────────────────────────────────────────

const TRAY_KEYS = { b: 'bans', e: 'enemies', a: 'allies' };

// Engine UI state → hash payload, or null when there is nothing to share.
export function encodeState(ui) {
  const seg = [];
  if (ui.banPicks.length) seg.push('b:' + ui.banPicks.join(','));
  if (ui.enemyPicks.length) seg.push('e:' + ui.enemyPicks.join(','));
  if (ui.allyPicks.length) seg.push('a:' + ui.allyPicks.join(','));
  if (ui.myPickId != null) seg.push('m:' + ui.myPickId);
  return seg.length ? seg.join(';') : null;
}

// Hash payload → {bans, enemies, allies, myPick}. Pure shape parse — id
// validity, caps and collisions belong to engine.loadDraft(). Strict integer
// segments only: "25abc" is garbage, not a 25.
export function decodeState(code) {
  const out = { bans: [], enemies: [], allies: [], myPick: null };
  if (typeof code !== 'string' || !code) return out;
  let myPickSeen = false;
  for (const seg of code.split(';')) {
    const i = seg.indexOf(':');
    if (i <= 0) continue;
    const key = seg.slice(0, i), rest = seg.slice(i + 1);
    if (key === 'm') {
      if (!myPickSeen && /^\d+$/.test(rest)) {
        const n = Number(rest);
        if (n > 0) { out.myPick = n; myPickSeen = true; }
      }
      continue;
    }
    const tray = TRAY_KEYS[key];
    if (!tray) continue;
    for (const part of rest.split(',')) {
      if (!/^\d+$/.test(part)) continue;
      const n = Number(part);
      if (n > 0) out[tray].push(n);
    }
  }
  return out;
}

// True when a decoded payload carries anything at all.
export function hasEntries(p) {
  return p.bans.length > 0 || p.enemies.length > 0 || p.allies.length > 0 || p.myPick != null;
}
