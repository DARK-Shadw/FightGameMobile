// Level-up picker: slides up at the bottom of the screen while the fight goes
// on. Tap a card to read it, tap again (or FORGE IT) to take it. It can be
// tucked away into a pulsing pill and reopened. Keys: 1–3 pick, Enter forges.

import { describePower, chipsHTML, linesHTML, icon } from './text.js';
import { dnaOf, statById, tierIndex } from './progression.js';
import { iconCanvas, TIER_NAMES } from './hud.js';
import { STYLE } from '../vfx/styles.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STAT_ICON = { heart: 'help', claw: 'dmg', feather: 'shape', clock: 'time', bolt: 'range', swirl: 'passive', drop: 'dot' };

export class Picker {
  constructor(root, o) {
    this.root = root;
    this.onChoose = o.onChoose;         // (offerId, index)
    this.slotName = o.slotName;         // index → current power name (for evolve/trade copy)
    this.el = document.createElement('div');
    this.el.className = 'picker';
    this.root.appendChild(this.el);
    this.offer = null;
    this.sel = -1;
    this.pending = 0;
  }

  get open() { return !!this.offer; }

  show(offer, pending = 1) {
    if (this.offer && this.offer.id === offer.id && this.pending === pending) return;
    const same = this.offer?.id === offer.id;
    this.offer = offer;
    this.pending = pending;
    if (!same) { this.sel = -1; this.el.classList.remove('collapsed'); }
    this.render();
    if (!same) this.el.animate([{ transform: 'translate(-50%, 60px)', opacity: 0 }, { transform: 'translate(-50%, 0)', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,1.4,.4,1)' });
  }

  hide() {
    this.offer = null;
    this.sel = -1;
    this.el.innerHTML = '';
  }

  collapse(v = true) { this.el.classList.toggle('collapsed', v); }
  reopen() { this.collapse(false); }

  choose(i) {
    if (!this.offer) return;
    const id = this.offer.id;
    this.hide();
    this.onChoose(id, i);
  }

  // keyboard: returns true when it used the key
  key(k) {
    if (!this.offer || this.el.classList.contains('collapsed')) return false;
    if (['1', '2', '3'].includes(k)) {
      const i = Number(k) - 1;
      if (i >= this.offer.options.length) return true;
      if (this.sel === i) this.choose(i); else this.select(i);
      return true;
    }
    if (k === 'enter' && this.sel >= 0) { this.choose(this.sel); return true; }
    return false;
  }

  select(i) {
    this.sel = i;
    this.el.querySelectorAll('.mini').forEach((c, j) => c.classList.toggle('sel', j === i));
    const d = this.el.querySelector('.detail');
    d.innerHTML = this.detailHTML(this.offer.options[i]);
    d.classList.add('on');
    d.style.setProperty('--kc', this.keyColor(this.offer.options[i]));
  }

  keyColor(o) {
    if (o.type === 'stat') return '#ffe14a';
    const dna = dnaOf(o.code);
    return STYLE[dna.essences[0]]?.glow ?? '#ffe14a';
  }

  cardHTML(o, i) {
    if (o.type === 'stat') {
      const s = statById(o.stat);
      return `<button type="button" class="mini stat tier-legendary" data-i="${i}" style="--ec:#8a5a1a">
        <div class="rib ol"><span>Boost</span><span class="kind">${i + 1}</span></div>
        ${icon(STAT_ICON[s.icon] || 'ult', 'ic-big')}
        <div class="big ol">${esc(s.v)}</div>
        <div class="headline">${esc(s.d)}</div>
        <div class="go ol">TAKE IT</div></button>`;
    }
    const dna = dnaOf(o.code);
    const d = describePower(dna);
    const st = STYLE[dna.essences[0]] || STYLE.fire;
    const kind = o.type === 'evolve' ? 'Evolve' : o.type === 'fuse' ? 'Fuse' : o.passive || d.passive ? 'Auto' : o.replaces !== undefined ? 'Trade' : 'New';
    let sub = '';
    if (o.type === 'evolve') sub = `<div class="arrow">${esc(this.slotName(o.from) || '')} ▸ ${TIER_NAMES[dna.tier]}</div>`;
    if (o.type === 'fuse') sub = `<div class="arrow">${o.from.map(j => esc(this.slotName(j) || '')).join(' + ')}</div>`;
    if (o.replaces !== undefined) sub = `<div class="arrow">Replaces ${esc(this.slotName(o.replaces) || '')}</div>`;
    return `<button type="button" class="mini tier-${dna.tier} ${dna.tier === 'godly' ? 'godly-card' : ''}" data-i="${i}" style="--ec:${st.color};--kc:${st.glow}">
      <div class="rib ol"><span>${TIER_NAMES[dna.tier]}</span><span class="kind">${kind}</span></div>
      <div class="top"><div class="emb"><canvas></canvas></div><div class="nm ol">${esc(dna.info.name)}</div></div>
      ${sub}
      <div class="headline">${d.headline}</div>
      <div class="chips">${chipsHTML(d.chips)}</div>
      <div class="go ol">FORGE IT</div></button>`;
  }

  detailHTML(o) {
    if (o.type === 'stat') { const s = statById(o.stat); return `<div class="dt"><span class="ol">${esc(s.v)}</span></div><div class="headline">${esc(s.d)}. Stacks with every other boost.</div>`; }
    const dna = dnaOf(o.code);
    const d = describePower(dna);
    const ess = dna.essences.map(e => `<span class="chip" style="color:${STYLE[e]?.glow ?? '#fff'}">${e[0].toUpperCase() + e.slice(1)}</span>`).join('');
    return `<div class="dt"><span class="ol" style="color:${STYLE[dna.essences[0]]?.glow ?? '#fff'}">${esc(dna.info.name)}</span>${d.flavor ? `<span class="flavor">${esc(d.flavor)}</span>` : ''}</div>
      <div class="headline" style="margin-bottom:6px">${d.headline}</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">${chipsHTML(d.chips)}${ess}</div>
      ${linesHTML(d)}`;
  }

  render() {
    const o = this.offer;
    const more = this.pending > 1 ? `<span class="more">+${this.pending - 1} more</span>` : '';
    this.el.innerHTML = `
      <div class="detail"></div>
      <div class="head"><div class="lvbadge ol">${o.level}</div><div class="title ol">FORGE A POWER<small>LEVEL ${o.level} · TAP TWICE TO TAKE</small></div>${more}<button type="button" class="hide">Later</button></div>
      <div class="row">${o.options.map((x, i) => this.cardHTML(x, i)).join('')}</div>
      <button type="button" class="pill ol">LEVEL UP ▲</button>`;
    o.options.forEach((x, i) => {
      if (x.type === 'stat') return;
      const dna = dnaOf(x.code);
      const c = this.el.querySelector(`.mini[data-i="${i}"] canvas`);
      if (c) iconCanvas(c, { ess: dna.essences[0], dna });
    });
    this.el.querySelectorAll('.mini').forEach(b => b.addEventListener('pointerdown', e => {
      e.stopPropagation();
      const i = Number(b.dataset.i);
      if (this.sel === i) this.choose(i); else this.select(i);
    }));
    this.el.querySelector('.hide').addEventListener('pointerdown', e => { e.stopPropagation(); this.collapse(true); });
    this.el.querySelector('.pill').addEventListener('pointerdown', e => { e.stopPropagation(); this.reopen(); });
    void tierIndex;
  }
}
