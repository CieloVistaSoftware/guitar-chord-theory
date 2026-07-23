/**
 * <gt-diatonic-chords root="C"></gt-diatonic-chords>
 *
 * Shows the seven diatonic triads of a major key, built by actually
 * harmonizing the scale (see theory.js) rather than a hard-coded answer
 * table -- labeled with Nashville Number System notation, each with a real
 * open-position fingering (hand-verified for C in chord-shapes.js, derived
 * from spelling for every other key via chord-shape-generator.js).
 */
import { harmonizeMajorScale, noteNameToPitchClass, pitchClassName, STANDARD_TUNING } from './theory.js';
import { getChordShape, buildChordShapeEventDetail, buildExtendedChordPositions, playChordAudio, playFormulaChordAudio } from './chord-shape-builder.js';
import { setAudioEnabled } from './audio.js';

const EXTENSION_LABELS = { triad: 'Triads', '7th': '7th chords', '9th': '9th chords', '13th': '13th chords' };
// Root/3rd/5th/7th/9th/13th labels, in harmonizeMajorScale's own stacking
// order -- matches chord-shape-builder.js's DIATONIC_DEGREE_LABELS, needed
// again here for the mini fingering-chart labels below.
const DEGREE_LABELS = ['1', '3', '5', '7', '9', '13'];

const QUALITY_COLOR = {
  major: '#22c55e',
  minor: '#6366f1',
  diminished: '#ef4444',
};

const STRING_GAP = 26;
const FRET_GAP = 28;
const PAD_LEFT = 16;
const PAD_TOP = 26;
const DOT_RADIUS = 10;
const FRETS_SHOWN = 4;

export class GTDiatonicChords extends HTMLElement {
  static get observedAttributes() {
    return ['root'];
  }

  constructor() {
    super();
    this._selectedChord = null;
    this._showNoteNames = false; // click same chord again to flip to note names
    this._fingeringMode = 'notes'; // opposite of gt-fretboard's mode -- never show the same thing twice
    this._chordDelayMs = 1100; // Play All tempo -- time each chord stays up before the next one
    this._inversion = 'root'; // synced from the top fretboard's inversion selector
    this._openLabelMode = 'O'; // 'O' | 'number' | 'note' -- open-string label on these small fingering charts only, never the big fretboard
    // 'triad' | '7th' | '9th' | '13th' -- harmonize the key in bigger
    // stacks of thirds (see theory.js#harmonizeMajorScale). Extended chords
    // have no hand-curated shape and (for 4+ notes) no inversions, unlike
    // the triad's Root/1st/2nd system -- see _renderFingering/the click
    // handler below for how the two paths diverge.
    this._extension = 'triad';
  }

  connectedCallback() {
    this.render();
    this._onChordCleared = (e) => {
      this._selectedChord = null;
      this._showNoteNames = false;
      this._fingeringMode = e.detail.mode === 'notes' ? 'intervals' : 'notes';
      this.render();
    };
    document.addEventListener('gt:chord-cleared', this._onChordCleared);

    // The top fretboard's Root Position / 1st Inversion / 2nd Inversion
    // selector should retune every card's small diagram (and its audio)
    // too, so the whole page agrees on which voicing is "the" shape.
    this._onInversionChanged = (e) => {
      this._inversion = e.detail.inversion;
      this.render();
    };
    document.addEventListener('gt:inversion-changed', this._onInversionChanged);
  }

  disconnectedCallback() {
    document.removeEventListener('gt:chord-cleared', this._onChordCleared);
    document.removeEventListener('gt:inversion-changed', this._onInversionChanged);
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }

  render() {
    const rootName = this.getAttribute('root') || 'C';
    const rootPc = noteNameToPitchClass(rootName);
    const diatonicChords = harmonizeMajorScale(rootPc, this._extension);
    // An 8th card completing the sequence back at the octave -- same chord
    // as degree 1 (the octave of the tonic IS the tonic), labeled "8" so
    // the 1-2-3-4-5-6-7-8 numbering visibly closes the loop instead of
    // just stopping at 7.
    const chords = [...diatonicChords, { ...diatonicChords[0], degree: 8, nashville: '8' }];
    this._chords = chords;
    const isExtended = this._extension !== 'triad';

    const INVERSION_LABEL = { root: 'Root Position', first: '1st Inversion', second: '2nd Inversion' };

    const OPEN_LABEL_MODES = [
      { key: 'O', label: 'O' },
      { key: 'number', label: 'Number' },
      { key: 'note', label: 'Note Name' },
    ];

    this.innerHTML = `
      <div class="gt-diatonic__toolbar">
        <button type="button" class="gt-diatonic__play-all">▶ Play all chords</button>
        <label class="gt-diatonic__tempo">
          Tempo
          <input type="range" class="gt-diatonic__tempo-slider" min="500" max="2000" step="100" value="${this._chordDelayMs}">
          <span class="gt-diatonic__tempo-value">${(this._chordDelayMs / 1000).toFixed(1)}s/chord</span>
        </label>
        <label class="gt-diatonic__extension">
          Chord color
          <select class="gt-diatonic__extension-select">
            ${Object.entries(EXTENSION_LABELS).map(([key, label]) => `
              <option value="${key}" ${this._extension === key ? 'selected' : ''}>${label}</option>
            `).join('')}
          </select>
        </label>
        ${isExtended ? '' : `<span class="gt-diatonic__inversion-badge">Showing: ${INVERSION_LABEL[this._inversion]}</span>`}
        <span class="gt-diatonic__open-label-group">
          Open strings show:
          ${OPEN_LABEL_MODES.map((m) => `
            <button type="button" class="gt-diatonic__open-label-btn ${this._openLabelMode === m.key ? 'is-active' : ''}" data-open-label="${m.key}">${m.label}</button>
          `).join('')}
        </span>
      </div>
      <div class="gt-diatonic">
        ${chords.map((c) => `
          <button type="button" class="gt-diatonic__chord" style="--quality-color:${QUALITY_COLOR[c.quality]}"
                  data-chord="${c.chordName}" data-degree="${c.degree}" data-quality="${c.quality}"
                  data-notes="${c.notes.join(',')}" aria-label="Show ${c.chordName}'s ${INVERSION_LABEL[this._inversion]} on the fretboard">
            <div class="gt-diatonic__nashville">${c.nashville}</div>
            <div class="gt-diatonic__name">${c.chordName}</div>
            <div class="gt-diatonic__quality">${c.quality}</div>
            ${this._renderFingering(c, QUALITY_COLOR[c.quality])}
            <div class="gt-diatonic__notes">${c.notes.join(' – ')}</div>
          </button>
        `).join('')}
      </div>
    `;

    this.querySelector('.gt-diatonic__play-all').addEventListener('click', () => this._playAll(undefined, true));

    const tempoSlider = this.querySelector('.gt-diatonic__tempo-slider');
    const tempoValue = this.querySelector('.gt-diatonic__tempo-value');
    tempoSlider.addEventListener('input', () => {
      this._chordDelayMs = Number(tempoSlider.value);
      tempoValue.textContent = `${(this._chordDelayMs / 1000).toFixed(1)}s/chord`;
    });

    this.querySelectorAll('.gt-diatonic__open-label-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._openLabelMode = btn.dataset.openLabel;
        this.render();
      });
    });

    const extensionSelect = this.querySelector('.gt-diatonic__extension-select');
    extensionSelect.addEventListener('change', () => {
      this._extension = extensionSelect.value;
      // A prior triad selection's inversion doesn't carry over meaningfully
      // once there's a 4+ note chord on screen -- back to root position.
      if (this._extension !== 'triad') this._inversion = 'root';
      this._selectedChord = null;
      this.render();
    });

    this.querySelectorAll('.gt-diatonic__chord').forEach((card) => {
      card.addEventListener('click', () => {
        setAudioEnabled(true); // this click is the user gesture the browser needs to unlock audio -- no separate toggle button anymore
        // Looked up by degree, not chordName -- the octave card (degree 8)
        // shares degree 1's exact chordName, so chordName alone can't tell
        // the two cards apart.
        const degree = Number(card.dataset.degree);

        // Same card clicked again -> flip between interval labels (1-♭3-5)
        // and note names (e.g. D-F-A). A different card always starts
        // fresh on interval labels.
        if (this._selectedChord === degree) {
          this._showNoteNames = !this._showNoteNames;
        } else {
          this._selectedChord = degree;
          this._showNoteNames = false;
        }

        const c = this._chords.find((ch) => ch.degree === degree);
        // Extended (7th/9th/13th) chords have no hand-picked inversions --
        // buildExtendedChordPositions is always root position (see its own
        // doc comment), and rootOnly:true tells the big fretboard to skip
        // the inversion buttons/diatonic-degree picker it'd otherwise show.
        const detail = isExtended
          ? (() => {
            const positions = buildExtendedChordPositions(c, this._showNoteNames);
            return { name: c.chordName, positionsByInversion: { root: positions, first: positions, second: positions }, inversionSummary: null, showNoteNames: this._showNoteNames, degree: c.degree, rootOnly: true };
          })()
          : buildChordShapeEventDetail(c, this._showNoteNames);
        this.dispatchEvent(new CustomEvent('gt:chord-shape-selected', { bubbles: true, detail }));

        const onNote = (midi) => this.dispatchEvent(new CustomEvent('gt:chord-note-plucked', { bubbles: true, detail: { midi } }));
        if (isExtended) playFormulaChordAudio(detail.positionsByInversion.root, onNote);
        else playChordAudio(c, this._inversion, onNote);

        // The big fretboard above is now showing this chord's root position
        // as note names or intervals (whichever _showNoteNames just picked).
        // Flip every fingering diagram below to the opposite, same rule as
        // the scale-wide Notes button -- never show the same thing twice.
        this._fingeringMode = this._showNoteNames ? 'intervals' : 'notes';
        this.render();
      });
    });
  }

  /**
   * Walk through all seven diatonic chords in order, strumming and
   * highlighting each in turn. `delayMs`, if given, overrides this card's
   * own tempo slider -- a fixed number, or a function returning the
   * current value (pass a function, e.g. a shared modal slider's live
   * value, so changing it mid-playthrough affects the very next chord, not
   * just the next full run).
   */
  async _playAll(delayMs, updateFretboard) {
    if (this._playingAll) return;
    this._playingAll = true;
    setAudioEnabled(true);
    const btn = this.querySelector('.gt-diatonic__play-all');
    btn.disabled = true;
    btn.textContent = '▶ Playing…';

    const currentDelay = () => (delayMs === undefined ? this._chordDelayMs : (typeof delayMs === 'function' ? delayMs() : delayMs));
    const isExtended = this._extension !== 'triad';

    for (const c of this._chords) {
      this.querySelectorAll('.gt-diatonic__chord.is-playing').forEach((el) => el.classList.remove('is-playing'));
      const card = this.querySelector(`.gt-diatonic__chord[data-degree="${c.degree}"]`);
      if (card) {
        card.classList.add('is-playing');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // Only drives the big fretboard's own chord-shape display when asked
      // to -- the Chords lesson (src/lessons-data.js) plays through this
      // same grid without touching the fretboard/scrolling to it, since the
      // grid itself is the whole point of that lesson and already has its
      // own play control.
      const positions = isExtended ? buildExtendedChordPositions(c, false) : null;
      if (updateFretboard) {
        const detail = isExtended
          ? { name: c.chordName, positionsByInversion: { root: positions, first: positions, second: positions }, inversionSummary: null, showNoteNames: false, degree: c.degree, rootOnly: true }
          : buildChordShapeEventDetail(c, false);
        this.dispatchEvent(new CustomEvent('gt:chord-shape-selected', { bubbles: true, detail }));
      }
      const onNote = (midi) => this.dispatchEvent(new CustomEvent('gt:chord-note-plucked', { bubbles: true, detail: { midi } }));
      if (isExtended) playFormulaChordAudio(positions ?? buildExtendedChordPositions(c, false), onNote);
      else playChordAudio(c, this._inversion, onNote);

      await new Promise((resolve) => setTimeout(resolve, currentDelay()));
    }

    this.querySelectorAll('.gt-diatonic__chord.is-playing').forEach((el) => el.classList.remove('is-playing'));
    this._playingAll = false;
    btn.disabled = false;
    btn.textContent = '▶ Play all chords';
  }

  /** Public wrapper so a page-level lesson sequence can drive this same walkthrough, optionally overriding the tempo (see _playAll). Defaults to NOT updating the big fretboard's chord-shape display -- the Chords lesson stays inside this grid; pass updateFretboard:true for the old behavior (e.g. this component's own "Play all seven chords" button). */
  playAll(delayMs, { updateFretboard = false } = {}) {
    return this._playAll(delayMs, updateFretboard);
  }

  /** The diatonic chord at this scale degree (1-7), e.g. getChord(1) is the I chord (C major in the key of C). */
  getChord(degree) {
    return this._chords?.find((c) => c.degree === degree) || null;
  }

  _renderFingering(c, color) {
    const isExtended = c.notes.length > 3;

    // Triads use getChordShape's hand-curated/3-inversion system; extended
    // (4+ note) chords have neither, so they get a { string -> {fret,
    // label, color} } map from buildExtendedChordPositions instead (always
    // root position -- see its own doc comment). Both paths converge below
    // into the same shape-agnostic drawing code.
    let positionsByString;
    if (isExtended) {
      const positions = buildExtendedChordPositions(c, false, 0);
      if (!positions.length) return `<p class="gt-diatonic__no-shape">No fingering chart available for ${c.chordName}.</p>`;
      positionsByString = new Array(6).fill(null);
      positions.forEach((p) => { positionsByString[p.string] = p; });
    } else {
      const shape = getChordShape(c, this._inversion);
      // getChordShape() always derives a real shape from the chord's
      // spelling when no hand-verified one exists (chord-shape-
      // generator.js) -- null here would mean every pitch class's 0-4 fret
      // coverage was violated, which shouldn't happen, but say so plainly
      // rather than a blank gap.
      if (!shape) return `<p class="gt-diatonic__no-shape">No fingering chart available for ${c.chordName}.</p>`;
      const [rootName, thirdName, fifthName] = c.notes;
      const rootPc = noteNameToPitchClass(rootName);
      const thirdPc = noteNameToPitchClass(thirdName);
      const fifthPc = noteNameToPitchClass(fifthName);
      const intervalLabelFor = (pc) => {
        if (pc === rootPc) return '1';
        if (pc === thirdPc) return c.quality === 'major' ? '3' : '♭3';
        if (pc === fifthPc) return c.quality === 'diminished' ? '♭5' : '5';
        return '';
      };
      positionsByString = shape.map((fret, s) => {
        if (fret === null) return null;
        const pc = (STANDARD_TUNING[s] + fret) % 12;
        return { fret, label: intervalLabelFor(pc), color };
      });
    }

    const width = PAD_LEFT + 5 * STRING_GAP + 16;
    const height = PAD_TOP + FRETS_SHOWN * FRET_GAP + 10;

    let grid = '';
    for (let f = 0; f <= FRETS_SHOWN; f++) {
      const y = PAD_TOP + f * FRET_GAP;
      grid += `<line x1="${PAD_LEFT}" y1="${y}" x2="${PAD_LEFT + 5 * STRING_GAP}" y2="${y}"
                      stroke="${f === 0 ? '#e5e7eb' : '#4b5563'}" stroke-width="${f === 0 ? 4 : 1}" />`;
    }
    for (let s = 0; s < 6; s++) {
      const x = PAD_LEFT + s * STRING_GAP;
      grid += `<line x1="${x}" y1="${PAD_TOP}" x2="${x}" y2="${PAD_TOP + FRETS_SHOWN * FRET_GAP}"
                      stroke="#6b7280" stroke-width="1" />`;
    }

    let markers = '';
    let dots = '';
    positionsByString.forEach((p, s) => {
      const x = PAD_LEFT + s * STRING_GAP;
      if (!p) {
        markers += `<text x="${x}" y="${PAD_TOP - 12}" text-anchor="middle" font-size="11" fill="#6b7280">✕</text>`;
        return;
      }
      const { fret, label: intervalLabel, color: toneColor } = p;
      const pc = (STANDARD_TUNING[s] + fret) % 12;
      const noteLabel = pitchClassName(pc);
      if (fret === 0) {
        const openY = PAD_TOP - 12;
        // Open strings on these fingering charts follow the "Open strings
        // show" selector (O / Number / Note Name), independent of the
        // fretted-note interval/note-name toggle above.
        if (this._openLabelMode === 'O') {
          dots += `<text x="${x}" y="${openY + 3}" text-anchor="middle" font-size="9" font-weight="700" fill="#ffffff">O</text>`;
        } else {
          const openLabel = this._openLabelMode === 'number' ? intervalLabel : noteLabel;
          dots += `
            <g>
              <circle cx="${x}" cy="${openY}" r="7" fill="${toneColor}" stroke="#111827" stroke-width="1" />
              <text x="${x}" y="${openY + 3}" text-anchor="middle" font-size="7" font-weight="700" fill="#111827">${openLabel}</text>
            </g>`;
        }
        return;
      }
      const y = PAD_TOP + (fret - 1) * FRET_GAP + FRET_GAP / 2;
      const label = this._fingeringMode === 'intervals' ? intervalLabel : noteLabel;
      dots += `
        <g>
          <circle cx="${x}" cy="${y}" r="${DOT_RADIUS}" fill="${toneColor}" stroke="#111827" stroke-width="1" />
          <text x="${x}" y="${y + 3}" text-anchor="middle" font-size="8" font-weight="700" fill="#111827">${label}</text>
        </g>`;
    });

    return `
      <svg class="gt-diatonic__fingering" viewBox="0 0 ${width} ${height}" role="img" aria-label="${c.chordName} fingering">
        ${grid}${markers}${dots}
      </svg>`;
  }
}

if (!customElements.get('gt-diatonic-chords')) {
  customElements.define('gt-diatonic-chords', GTDiatonicChords);
}
