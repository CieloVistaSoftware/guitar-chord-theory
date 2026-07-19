/**
 * <gt-fretboard root="C" frets="12"></gt-fretboard>
 *
 * Renders a horizontal guitar neck (standard tuning, low E on top) and
 * highlights every major-scale interval from the given root note, across
 * every string. Click an interval chip to isolate just that interval;
 * click it again (or "All") to go back to showing the whole scale.
 *
 * Light DOM, no build step -- matches wb-starter's own component
 * conventions (composition over inheritance, no Shadow DOM).
 */
import { STANDARD_TUNING, STANDARD_TUNING_NAMES, STANDARD_TUNING_MIDI, intervalAt, noteNameToPitchClass, pitchClassName } from './theory.js';
import { playMidi } from './audio.js';

const FRET_WIDTH = 60;
const STRING_GAP = 40;
const FRETBOARD_PAD_LEFT = 75; // wide enough that the open-string dot never overlaps the string-name label
const FRETBOARD_PAD_TOP = 20;
const FRETBOARD_PAD_BOTTOM = 8; // 0.5rem of breathing room below the fret-number row
const DOT_RADIUS = 15;
const OPEN_DOT_X = FRETBOARD_PAD_LEFT - 30;

const INTERVAL_COLORS = {
  R: '#ef4444',
  M2: '#f59e0b',
  M3: '#eab308',
  P4: '#22c55e',
  P5: '#06b6d4',
  M6: '#6366f1',
  M7: '#a855f7',
};

export class GTFretboard extends HTMLElement {
  static get observedAttributes() {
    return ['root', 'frets'];
  }

  constructor() {
    super();
    this._chord = null; // null = full-scale mode; otherwise { name, positionsByInversion, inversionSummary, showNoteNames }
    this._inversion = 'root'; // 'root' | 'first' | 'second' -- which voicing of the selected chord to show
    this._labelMode = 'number'; // 'number' | 'note' -- how scale-view dots are labeled
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }

  get rootNote() {
    return this.getAttribute('root') || 'C';
  }

  get fretCount() {
    return parseInt(this.getAttribute('frets') || '12', 10);
  }

  /**
   * Switch the whole fretboard to "chord mode": highlight only the exact
   * fretted/open positions of this chord's real playable shape, not every
   * occurrence of its tones across the whole neck. `positionsByInversion`
   * is { root, first, second }, each [{ string, fret, label, color }] --
   * the inversion selector below picks which one is currently shown.
   * `inversionSummary` is { root, first, second }, each { intervals, notes }
   * (bass-note-first) -- shown as each inversion button's subtitle.
   * `showNoteNames` says whether the neck itself is currently showing real
   * note names or intervals, so the subtitles can show the opposite.
   */
  showChordShape(name, positionsByInversion, inversionSummary, showNoteNames) {
    this._chord = { name, positionsByInversion, inversionSummary, showNoteNames };
    this.render();
  }

  /** Switches the scale-view dot labels between scale-degree numbers and real note names. */
  setLabelMode(mode) {
    this._labelMode = mode;
    this.render();
  }

  setInversion(inversion) {
    this._inversion = inversion;
    this.render();
    // Tell gt-diatonic-chords to switch every card's small fingering diagram
    // (and its audio) to this inversion too, so the whole page stays in sync.
    this.dispatchEvent(new CustomEvent('gt:inversion-changed', { bubbles: true, detail: { inversion } }));
  }

  clearChord() {
    this._chord = null;
    this.render();
    // Let gt-diatonic-chords reset its own click-toggle state (which chord
    // was last selected / interval-vs-note-name mode) so re-clicking the
    // same chord after backing out starts fresh on interval labels again.
    // The full-scale neck always shows numeric degrees, so the small
    // fingering diagrams below re-sync to note names (the complementary
    // display) whenever we return to it.
    this.dispatchEvent(new CustomEvent('gt:chord-cleared', { bubbles: true, detail: { mode: 'degree' } }));
  }

  render() {
    const rootPc = noteNameToPitchClass(this.rootNote);
    const frets = this.fretCount;
    const width = FRETBOARD_PAD_LEFT + frets * FRET_WIDTH + 20;
    const height = FRETBOARD_PAD_TOP + 5 * STRING_GAP + 20 + FRETBOARD_PAD_BOTTOM;

    const INVERSIONS = [
      { key: 'root', label: 'Root Position' },
      { key: 'first', label: '1st Inversion' },
      { key: 'second', label: '2nd Inversion' },
    ];

    // Inversion subtitle shows the opposite of whatever the neck itself is
    // showing: if the chord tones are currently numeric (intervals), the
    // subtitle names the actual notes bass-first; if the chord is showing
    // real note names, the subtitle shows the intervals instead.
    const summaryKey = this._chord?.showNoteNames ? 'intervals' : 'notes';

    const controls = this._chord ? `
      <div class="gt-fretboard__chord-banner">
        Showing <strong>${this._chord.name}</strong>
        <button type="button" class="gt-mode-btn gt-mode-btn--back">← back to the full scale</button>
      </div>
      <div class="gt-fretboard__mode-switch gt-fretboard__mode-switch--inversions">
        ${INVERSIONS.map((inv) => `
          <button type="button" class="gt-mode-btn ${this._inversion === inv.key ? 'is-active' : ''}" data-inversion="${inv.key}">
            ${inv.label}
            <span class="gt-mode-btn__subtitle">${this._chord.inversionSummary[inv.key][summaryKey].join(' – ')}</span>
          </button>
        `).join('')}
      </div>
    ` : '';

    this.innerHTML = `
      ${controls}
      <svg class="gt-fretboard__svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img"
           aria-label="${this._chord ? `Guitar fretboard showing ${this._chord.name}'s ${this._inversion === 'root' ? 'root position' : this._inversion === 'first' ? '1st inversion' : '2nd inversion'} shape` : `Guitar fretboard showing ${this.rootNote} major scale intervals`}">
        ${this._renderFrets(frets, width, height)}
        ${this._renderStrings(frets, width)}
        ${this._chord ? this._renderShapeDots() : this._renderDots(rootPc, frets)}
        ${this._renderStringLabels()}
      </svg>
    `;

    this.querySelectorAll('.gt-mode-btn[data-inversion]').forEach((btn) => {
      btn.addEventListener('click', () => this.setInversion(btn.dataset.inversion));
    });
    const backBtn = this.querySelector('.gt-mode-btn--back');
    if (backBtn) backBtn.addEventListener('click', () => this.clearChord());

    this.querySelectorAll('.gt-dot').forEach((dot) => {
      dot.addEventListener('click', () => playMidi(Number(dot.dataset.midi)));
    });
  }

  _renderFrets(frets, width, height) {
    let out = '';
    for (let f = 0; f <= frets; f++) {
      const x = FRETBOARD_PAD_LEFT + f * FRET_WIDTH;
      const isNut = f === 0;
      out += `<line x1="${x}" y1="${FRETBOARD_PAD_TOP}" x2="${x}" y2="${FRETBOARD_PAD_TOP + 5 * STRING_GAP}"
                     stroke="${isNut ? '#e5e7eb' : '#6b7280'}" stroke-width="${isNut ? 6 : 2}" />`;
      if (f > 0) {
        out += `<text x="${x - FRET_WIDTH / 2}" y="${FRETBOARD_PAD_TOP + 5 * STRING_GAP + 20}"
                       text-anchor="middle" font-size="12" fill="#9ca3af">${f}</text>`;
      }
    }
    return out;
  }

  // Row position for string index s (0 = low E ... 5 = high E). Low E draws
  // at the bottom row, high E at the top -- the physical top-to-bottom
  // order you see looking down at the neck while playing.
  _rowY(s) {
    return FRETBOARD_PAD_TOP + (5 - s) * STRING_GAP;
  }

  _renderStrings(frets, width) {
    let out = '';
    for (let s = 0; s < 6; s++) {
      const y = this._rowY(s);
      out += `<line x1="${FRETBOARD_PAD_LEFT}" y1="${y}" x2="${FRETBOARD_PAD_LEFT + frets * FRET_WIDTH}" y2="${y}"
                     stroke="#9ca3af" stroke-width="${1 + s * 0.4}" />`;
    }
    return out;
  }

  _renderStringLabels() {
    let out = '';
    for (let s = 0; s < 6; s++) {
      const y = this._rowY(s);
      out += `<text x="15" y="${y + 5}" text-anchor="middle" font-size="14" font-weight="600" fill="#d1d5db">${STANDARD_TUNING_NAMES[s]}</text>`;
    }
    return out;
  }

  // A note dot: a colored circle with its label, or -- when it's an open
  // string in "O" mode -- just the bare white letter, no circle. A full
  // solid dot for "O" was too visually loud next to the actual note dots,
  // which need the circle to carry color-coded meaning; "O" doesn't.
  _dotSvg({ x, y, label, color, midi, bare }) {
    if (bare) {
      return `
        <g class="gt-dot gt-dot--bare" data-tone="${label}" data-midi="${midi}">
          <text x="${x}" y="${y + 5}" text-anchor="middle" font-size="16" font-weight="700" fill="#ffffff">${label}</text>
        </g>`;
    }
    return `
      <g class="gt-dot" data-tone="${label}" data-midi="${midi}">
        <circle cx="${x}" cy="${y}" r="${DOT_RADIUS}" fill="${color}" stroke="#111827" stroke-width="1.5" />
        <text x="${x}" y="${y + 5}" text-anchor="middle" font-size="12" font-weight="700" fill="#111827">${label}</text>
      </g>`;
  }

  // Scale view never marks open strings at all -- the string-name row on
  // the left already identifies them, and a dot on every single string
  // there added nothing but clutter. Only fret 1+ gets a dot here; open
  // strings still appear in chord mode below, where they're an actual part
  // of the shape you have to play.
  _renderDots(rootPc, frets) {
    let out = '';
    for (let s = 0; s < 6; s++) {
      const y = this._rowY(s);
      const openPc = STANDARD_TUNING[s];
      for (let f = 1; f <= frets; f++) {
        const iv = intervalAt(rootPc, openPc, f);
        if (!iv) continue;
        const x = FRETBOARD_PAD_LEFT + f * FRET_WIDTH - FRET_WIDTH / 2;
        const color = INTERVAL_COLORS[iv.short];
        const midi = STANDARD_TUNING_MIDI[s] + f;
        const label = this._labelMode === 'note' ? pitchClassName(openPc + f) : iv.degree;
        out += this._dotSvg({ x, y, label, color, midi, bare: false });
      }
    }
    return out;
  }

  // Only the real fretted/open positions of the chord's currently selected
  // inversion -- exactly what you'd actually put your fingers on, not every
  // occurrence of the chord tones across all 12 frets.
  _renderShapeDots() {
    let out = '';
    const positions = this._chord.positionsByInversion[this._inversion];
    positions.forEach(({ string: s, fret: f, label, color }) => {
      const y = this._rowY(s);
      const x = f === 0 ? OPEN_DOT_X : FRETBOARD_PAD_LEFT + f * FRET_WIDTH - FRET_WIDTH / 2;
      const midi = STANDARD_TUNING_MIDI[s] + f;
      // Same rule as the scale view -- the neck always just says "O" for an
      // open string, regardless of what the small chord charts are showing.
      const displayLabel = f === 0 ? 'O' : label;
      out += this._dotSvg({ x, y, label: displayLabel, color, midi, bare: f === 0 });
    });
    return out;
  }
}

if (!customElements.get('gt-fretboard')) {
  customElements.define('gt-fretboard', GTFretboard);
}
