// INK — presentation-only colour translation layer for inline styles.
// The engine emits legacy neon hexes (TC tier map, trend flags); the CSS can
// override attribute-drawn SVG but not inline styles, so the renderers land
// their colours through this map instead. Values mirror tokens.css exactly;
// change both together. No engine value or format string is touched here.
export const INK = {
  enemy:  '#B5371A',  // vermillion — enemy side
  enemyHi:'#D4481F',
  ally:   '#1F4E79',  // prussian — our side
  accent: '#C03A1A',  // house accent
  ochre:  '#8A6007',
  ochreHi:'#B98A1E',
  moss:   '#3F6B25',
  oxide:  '#A93226',
  plum:   '#6B4A9B',
  teal:   '#1D6E6A',
  rust:   '#A34A16',
};

export const TIER_INK = {
  SS: '#B0301E', S: '#8F6305', A: '#6B4A9B',
  B: '#1D6E6A',  C: '#7C7159', D: '#A79A82',
};

export function tierInk(tier) {
  return TIER_INK[tier] || '#75674F';
}
