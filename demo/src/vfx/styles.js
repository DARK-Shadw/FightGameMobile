// Per-essence visual kits. core → color → edge is the energy ramp (HDR core
// blooms); sprites pick the particle shapes that make each essence read.

export const STYLE = {
  fire:   { core: '#fff4c2', color: '#ff6a1a', edge: '#c0180c', glow: '#ffb547', spark: 'ember', puff: 'flame', bit: 'spark', smoke: '#5a3024', motif: 'flame', trailW: 0.5 },
  frost:  { core: '#ffffff', color: '#74dcff', edge: '#2a6fe0', glow: '#bff3ff', spark: 'snow', puff: 'smoke', bit: 'shard', smoke: '#d8f6ff', motif: 'shard', trailW: 0.35 },
  storm:  { core: '#ffffff', color: '#9aa6ff', edge: '#4a3df0', glow: '#d0d6ff', spark: 'spark', puff: 'star4', bit: 'bolt', smoke: '#3b3f7a', motif: 'lightning', trailW: 0.3 },
  stone:  { core: '#fff3d9', color: '#d6b184', edge: '#7a5a3a', glow: '#ffd9a0', spark: 'rock', puff: 'puff', bit: 'rock', smoke: '#b89c7c', motif: 'rock', trailW: 0.4 },
  tide:   { core: '#eaffff', color: '#3fc6ff', edge: '#1a4fe0', glow: '#9fe8ff', spark: 'drop', puff: 'bubble', bit: 'drop', smoke: '#cfefff', motif: 'wave', trailW: 0.45 },
  gale:   { core: '#ffffff', color: '#b6ff7a', edge: '#3fae5a', glow: '#e8ffd0', spark: 'leaf', puff: 'swirl', bit: 'streak', smoke: '#e8fff0', motif: 'swirl', trailW: 0.35 },
  light:  { core: '#ffffff', color: '#ffe066', edge: '#ffa01a', glow: '#fff4c0', spark: 'sparkle', puff: 'halo', bit: 'star4', smoke: '#fff8d8', motif: 'ray', trailW: 0.4 },
  shadow: { core: '#f0dcff', color: '#9a5cff', edge: '#3a1478', glow: '#c8a8ff', spark: 'crescent', puff: 'smoke', bit: 'eye', smoke: '#2a1440', motif: 'smoke', trailW: 0.45, dark: true },
  life:   { core: '#f4ffe6', color: '#6ee65a', edge: '#23863c', glow: '#d8ffb0', spark: 'leaf', puff: 'petal', bit: 'petal', smoke: '#e6ffd8', motif: 'vine', trailW: 0.35 },
  death:  { core: '#e6fff9', color: '#3cf0c8', edge: '#0f6a5a', glow: '#b8fff0', spark: 'soul', puff: 'smoke', bit: 'skull', smoke: '#1c3a38', motif: 'soul', trailW: 0.45 },
  blood:  { core: '#ffe6ec', color: '#ff2f5a', edge: '#7a0a22', glow: '#ff9ab0', spark: 'drop', puff: 'smoke', bit: 'drop', smoke: '#4a0a18', motif: 'blood', trailW: 0.4 },
  mind:   { core: '#ffeafc', color: '#ff66d8', edge: '#8a1f9e', glow: '#ffc6f2', spark: 'spiral', puff: 'ring', bit: 'eye', smoke: '#f8d8ff', motif: 'psy', trailW: 0.35 },
  time:   { core: '#fffbe6', color: '#ffc95c', edge: '#9a6414', glow: '#ffe9b0', spark: 'gear', puff: 'clock', bit: 'sparkle', smoke: '#f6e6c0', motif: 'clock', trailW: 0.35 },
  space:  { core: '#ffffff', color: '#d86bff', edge: '#34207a', glow: '#f0c8ff', spark: 'star5', puff: 'halo', bit: 'sparkle', smoke: '#1a1440', motif: 'stars', trailW: 0.4 },
  beast:  { core: '#fff2dc', color: '#ffa04a', edge: '#8a3a12', glow: '#ffd09a', spark: 'claw', puff: 'puff', bit: 'spark', smoke: '#c09070', motif: 'claw', trailW: 0.4 },
  void:   { core: '#ffffff', color: '#a9aecb', edge: '#0f0f1c', glow: '#d8dcf0', spark: 'square', puff: 'smoke', bit: 'crack', smoke: '#0c0c16', motif: 'void', trailW: 0.4, dark: true },
};

export function hexToRgb(h, k = 1) {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255 * k, ((n >> 8) & 255) / 255 * k, (n & 255) / 255 * k];
}
export const rgba = (h, k = 1, a = 1) => [...hexToRgb(h, k), a];
