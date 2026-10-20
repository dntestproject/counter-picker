#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// HERO DATASET IMPORTER
//
// Reads a "latest update.txt"-style payload — one or more concatenated JSON
// documents — finds the document carrying `data.heroes`, and rewrites
// src/data/heroes.js in place.
//
// What it replaces (per matched hero):
//   · img / role / lane / spec          metadata refresh
//   · sbr[<rankKey>] wr / pr / br       the rank slice the payload carries
// What it adds (heroes new to the dataset):
//   · a full entry with the payload's stats; tier / ptier / score are
//     PROVISIONAL — nearest-neighbour vote over the existing ratings (k=8,
//     inverse-distance weighted). Counter / synergy / weakness maps stay
//     empty until a source supplies them.
// What it never touches:
//   · base wr/pr/br and sbr["1"] (the ALL-rank aggregate — the payload has no
//     such slice), tier/ptier/score of existing heroes, trend, vel, deltas,
//     skp, cnt, wk, syn.
//
// Usage:  node tools/import-hero-stats.mjs ["latest update.txt"]
// Exit 0 → dataset rewritten; report printed to stdout.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const inputPath = path.resolve(root, process.argv[2] || 'latest update.txt');
const heroesPath = path.join(root, 'src/data/heroes.js');

// Rank pill order used by the UI: 1 ALL · 2 EPIC · 3 LEGEND · 4 MYTHIC ·
// 5 HONOR · 6 GLORY+. The keys of sbr mirror those ids.
const RANK_KEY = {
  'ALL': 1, 'Epic': 2, 'Legend': 3, 'Mythic': 4,
  'Mythical Honor': 5, 'Mythical Glory+': 6,
};
const FIELD_ORDER = [
  'id', 'hn', 'img', 'role', 'lane', 'spec', 'tier', 'ptier', 'score',
  'wr', 'pr', 'br', 'sbr', 'trend', 'vel', 't_delta', 'wr_delta', 'skp',
  'cnt', 'wk', 'syn',
];

// ── payload parsing ─────────────────────────────────────────────────────────
// The payload may contain several top-level JSON documents back to back.
// Split on brace depth, ignoring braces inside strings.
function splitJsonDocs(text) {
  const docs = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        docs.push(text.slice(start, i + 1));
        start = -1;
      }
      if (depth < 0) throw new Error('unbalanced JSON payload');
    }
  }
  if (depth !== 0) throw new Error('unterminated JSON document in payload');
  return docs.map((d, i) => {
    try { return JSON.parse(d); }
    catch (e) { throw new Error(`document ${i + 1} is not valid JSON: ${e.message}`); }
  });
}

const payloadDocs = splitJsonDocs(fs.readFileSync(inputPath, 'utf8'));
const statsDoc = payloadDocs.find(d => Array.isArray(d?.data?.heroes));
if (!statsDoc) throw new Error('no document with data.heroes in the payload');
const rows = statsDoc.data.heroes;
const insightDoc = payloadDocs.find(d => Array.isArray(d?.data?.insights));

const rankNames = [...new Set(rows.map(r => r.rank_name))];
if (rankNames.length !== 1) throw new Error('payload mixes rank slices: ' + rankNames.join(', '));
const rankKey = RANK_KEY[rankNames[0]];
if (!rankKey) throw new Error('unknown rank_name: ' + rankNames[0]);
const timeframes = [...new Set(rows.map(r => r.timeframe_name))];
if (timeframes.length !== 1) throw new Error('payload mixes timeframes: ' + timeframes.join(', '));

// ── current dataset ─────────────────────────────────────────────────────────
const { HEROES } = await import(pathToFileURL(heroesPath).href + '?v=' + Date.now());

function ordered(h) {
  const out = {};
  for (const k of FIELD_ORDER) if (h[k] !== undefined) out[k] = h[k];
  // keep any unexpected keys rather than silently dropping data
  for (const k of Object.keys(h)) if (!(k in out)) out[k] = h[k];
  return out;
}

// ── provisional tier / score for new heroes ─────────────────────────────────
// The payload carries rates but no tier/score. Nearest-neighbour over the
// existing ratings (standardised wr/pr/br, k=8, inverse-distance weights) keeps
// the placeholder in the same band as heroes with similar public stats instead
// of inventing a letter by hand.
const FEATS = ['wr', 'pr', 'br'];
const mean = {}, sd = {};
for (const k of FEATS) {
  mean[k] = HEROES.reduce((s, h) => s + h[k], 0) / HEROES.length;
  sd[k] = Math.sqrt(HEROES.reduce((s, h) => s + (h[k] - mean[k]) ** 2, 0) / HEROES.length) || 1;
}
function provisional(rate) {
  const probe = { wr: rate.wr, pr: rate.pr, br: rate.br };
  const ranked = HEROES
    .map(h => ({
      h,
      d: Math.sqrt(FEATS.reduce((s, k) => s + ((probe[k] - h[k]) / sd[k]) ** 2, 0)),
    }))
    .sort((a, b) => a.d - b.d);
  const near = ranked.slice(0, 8).filter(r => r.d > 0);
  const wsum = near.reduce((s, r) => s + 1 / r.d, 0);
  const score = near.reduce((s, r) => s + r.h.score / r.d, 0) / wsum;
  const votes = {};
  near.forEach(r => { votes[r.h.tier] = (votes[r.h.tier] || 0) + 1 / r.d; });
  const tier = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
  return {
    tier, score: +score.toFixed(1),
    neighbours: near.slice(0, 5).map(r => `${r.h.hn}(${r.h.tier}/${r.h.score})`),
  };
}

// ── merge ───────────────────────────────────────────────────────────────────
const byId = new Map(HEROES.map(h => [h.id, h]));
const updated = [];
const added = [];
const report = {
  payloadHeroes: rows.length,
  rank: rankNames[0] + ' · ' + timeframes[0] + ' → sbr["' + rankKey + '"]',
  sbrBefore: {}, metadata: { img: 0, role: 0, lane: 0, spec: 0 },
  wrMoves: [], brMoves: [],
};

for (const row of rows) {
  const id = row.hero_id;
  if (typeof id !== 'number' || !row.hero_name) throw new Error('malformed hero row: ' + JSON.stringify(row).slice(0, 120));
  const base = byId.get(id);
  const rate = { wr: row.win_rate, pr: row.pick_rate, br: row.ban_rate };
  for (const v of Object.values(rate)) {
    if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`hero ${row.hero_name}: bad rate ${JSON.stringify(rate)}`);
  }

  if (!base) {
    const prov = provisional(rate);
    const entry = ordered({
      id, hn: row.hero_name, img: row.img_src,
      role: [...(row.role || [])], lane: [...(row.lane || [])], spec: [...(row.speciality || [])],
      tier: prov.tier, ptier: prov.tier, score: prov.score,
      wr: rate.wr, pr: rate.pr, br: rate.br,
      sbr: { [String(rankKey)]: { wr: rate.wr, pr: rate.pr, br: rate.br } },
      trend: [rate.wr, rate.wr, rate.wr, rate.wr, rate.wr],
      vel: '', t_delta: 0, wr_delta: 0,
      skp: [], cnt: [], wk: [], syn: [], prov: true,
    });
    added.push({ entry, prov });
    updated.push(entry);
    continue;
  }

  // metadata diffs (report counts before overwriting)
  if (base.img !== row.img_src) report.metadata.img++;
  if (JSON.stringify(base.role) !== JSON.stringify(row.role || [])) report.metadata.role++;
  if (JSON.stringify(base.lane) !== JSON.stringify(row.lane || [])) report.metadata.lane++;
  if (JSON.stringify(base.spec) !== JSON.stringify(row.speciality || [])) report.metadata.spec++;

  const old6 = base.sbr?.[String(rankKey)] || {};
  const dWr = +(rate.wr - (old6.wr ?? NaN)).toFixed(2);
  const dBr = +(rate.br - (old6.br ?? NaN)).toFixed(2);
  report.sbrBefore[base.hn] = { wr: old6.wr, br: old6.br, pr: old6.pr };
  report.wrMoves.push({ hn: base.hn, from: old6.wr, to: rate.wr, d: dWr });
  report.brMoves.push({ hn: base.hn, from: old6.br, to: rate.br, d: dBr });

  const next = ordered({
    ...base,
    img: row.img_src,
    role: [...(row.role || [])],
    lane: [...(row.lane || [])],
    spec: [...(row.speciality || [])],
    sbr: { ...base.sbr, [String(rankKey)]: { wr: rate.wr, pr: rate.pr, br: rate.br } },
  });
  updated.push(next);
}

const missing = HEROES.filter(h => !rows.some(r => r.hero_id === h.id)).map(h => h.id + ':' + h.hn);
if (missing.length) throw new Error('payload is missing heroes present in the dataset: ' + missing.join(', '));

// ── validate before writing ─────────────────────────────────────────────────
const ids = new Set();
for (const h of updated) {
  if (ids.has(h.id)) throw new Error('duplicate hero id after merge: ' + h.id);
  ids.add(h.id);
  for (const k of ['id', 'hn', 'img', 'tier', 'wr', 'pr', 'br', 'sbr', 'cnt', 'wk', 'syn']) {
    if (h[k] === undefined) throw new Error(`hero ${h.hn} lost required field ${k}`);
  }
}
// every pairwise reference must resolve to a hero after the merge
for (const h of updated) {
  for (const key of ['cnt', 'wk', 'syn']) {
    for (const ref of h[key] || []) {
      if (!ids.has(ref.id)) throw new Error(`${h.hn}.${key} references unknown hero id ${ref.id}`);
    }
  }
}

// ── write ───────────────────────────────────────────────────────────────────
const stamp = new Date().toISOString().slice(0, 10);
const header = [
  '// MLBB hero dataset.',
  '// Base: extracted verbatim from counterpicker.html (independent port baseline).',
  `// Refreshed ${stamp} from "latest update.txt" — ${report.rank}:`,
  `//   · img / role / lane / spec refreshed for ${rows.length} heroes`,
  `//   · sbr["${rankKey}"] wr/pr/br replaced from the new snapshot`,
  '//   · added: ' + (added.length ? added.map(a => `${a.entry.hn} (${a.entry.id}, provisional tier/score)`).join(', ') : 'none'),
  '//   · base wr/pr/br and sbr["1"] stay the original ALL-rank aggregate —',
  '//     the payload carries no ALL slice',
  '//   · cnt / wk / syn are carried over; new heroes start with empty maps',
];
const body = 'export const HEROES = ' + JSON.stringify(updated) + ';\n';
fs.writeFileSync(heroesPath, header.join('\n') + '\n' + body);

// ── report ──────────────────────────────────────────────────────────────────
console.log(`payload: ${path.basename(inputPath)} | ${payloadDocs.length} JSON document(s)` +
  (insightDoc ? `, insights doc with ${insightDoc.data.insights.length} rows (not imported — editorial blurbs, no DB fields)` : ''));
console.log(`slice:   ${report.rank}`);
console.log(`heroes:  ${HEROES.length} → ${updated.length} (+${added.length}: ${added.map(a => a.entry.hn + ' #' + a.entry.id).join(', ') || 'none'})`);
console.log('metadata changes:', report.metadata);
console.log('added heroes (provisional):');
for (const a of added) console.log(`  ${a.entry.hn.padEnd(10)} #${a.entry.id} tier ${a.prov.tier} score ${a.prov.score} | nearest: ${a.prov.neighbours.join(', ')}`);
report.wrMoves.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
console.log('largest win-rate moves at rank ' + rankKey + ':');
report.wrMoves.slice(0, 10).forEach(m => console.log(`  ${m.hn.padEnd(14)} ${String(m.from).padStart(6)} → ${String(m.to).padStart(6)}  (${m.d > 0 ? '+' : ''}${m.d})`));
report.brMoves.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
console.log('largest ban-rate moves at rank ' + rankKey + ':');
report.brMoves.slice(0, 10).forEach(m => console.log(`  ${m.hn.padEnd(14)} ${String(m.from).padStart(6)} → ${String(m.to).padStart(6)}  (${m.d > 0 ? '+' : ''}${m.d})`));
const moved = report.wrMoves.filter(m => m.d !== 0).length;
const meanMove = report.wrMoves.reduce((s, m) => s + Math.abs(m.d), 0) / Math.max(1, report.wrMoves.length);
console.log(`rank-${rankKey} win-rate changed for ${moved}/${report.wrMoves.length} heroes | mean |Δ| ${meanMove.toFixed(2)} pt`);
console.log('wrote', path.relative(root, heroesPath));
