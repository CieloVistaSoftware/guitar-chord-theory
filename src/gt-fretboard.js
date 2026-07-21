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
import { STANDARD_TUNING, STANDARD_TUNING_NAMES, STANDARD_TUNING_MIDI, MAJOR_SCALE_INTERVALS, intervalAt, fretForPitchClass, noteNameToPitchClass, pitchClassName, harmonizeMajorScale } from './theory.js';
import { playMidi, setAudioEnabled } from './audio.js';
import { buildChordShapeEventDetail, playChordAudio } from './chord-shape-builder.js';

const PLUCK_FLASH_MS = 380; // how long a note's dot glows after it's plucked

const FRET_WIDTH = 60;
const STRING_GAP = 40;
const FRETBOARD_PAD_LEFT = 75; // wide enough that the open-string dot never overlaps the string-name label
const FRETBOARD_PAD_TOP = 20;
const DOT_RADIUS = 15;
const OPEN_DOT_X = FRETBOARD_PAD_LEFT - 30;
const NOTE_TO_FRET_NUMBER_GAP = 8; // 0.5rem -- fret numbers always sit exactly this far under the lowest note row
const FRET_NUMBER_FONT_SIZE = 12;
const FRETBOARD_PAD_BOTTOM = 8; // 0.5rem of breathing room below the fret-number row

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
    this._focusRange = null; // null = show the whole neck; otherwise { start, end } fret numbers a lesson zoomed to
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
  showChordShape(name, positionsByInversion, inversionSummary, showNoteNames, degree) {
    this._chord = { name, positionsByInversion, inversionSummary, showNoteNames, degree };
    this.render();
  }

  /** The scale degree (1-7) of the chord currently shown, or undefined if the neck is in plain scale view. Lets a Key change re-show the equivalent chord in the new key -- see index.html's applyKey(). */
  getChordDegree() {
    return this._chord?.degree;
  }

  /** Whether the currently-shown chord (if any) is labeled with real note names vs. intervals -- see getChordDegree(). */
  getShowNoteNames() {
    return this._chord?.showNoteNames;
  }

  /**
   * Crop the visible neck to just frets [start, end] -- e.g. "open position"
   * is (0, 4). A lesson calls this before it starts so the learner sees a
   * tight, relevant slice of the neck instead of the whole thing; a
   * "Show full neck" control or clearFocus() backs out of it. Purely a view
   * crop via the SVG's own viewBox -- independent of pinch-zoom.js's
   * separate visual scale-in-place, which still works on top of whatever
   * range is focused. Dispatches gt:focus-changed so the page-level header
   * (index.html) can show/hide its own "Zoomed to frets X-Y" indicator --
   * the fretboard doesn't render that banner itself.
   */
  focusFrets(start, end) {
    this._focusRange = { start, end };
    this.render();
    this.dispatchEvent(new CustomEvent('gt:focus-changed', { bubbles: true, detail: { range: this._focusRange } }));
  }

  clearFocus() {
    if (!this._focusRange) return;
    this._focusRange = null;
    this.render();
    this.dispatchEvent(new CustomEvent('gt:focus-changed', { bubbles: true, detail: { range: null } }));
  }

  getFocusRange() {
    return this._focusRange;
  }

  /**
   * Slide the currently-visible fret window by deltaFrets (positive = move
   * toward higher frets), keeping its width constant. If nothing is focused
   * yet, starts from the whole current neck. Clamped to [0, fretCount] --
   * see fretboard-pan.js for the actual drag gesture that drives this.
   */
  panBy(deltaFrets) {
    const current = this._focusRange || { start: 0, end: this.fretCount };
    const width = current.end - current.start;
    const maxStart = Math.max(0, this.fretCount - width);
    const start = Math.max(0, Math.min(maxStart, current.start + deltaFrets));
    this.focusFrets(start, start + width);
  }

  /** Same as panBy(), but takes an on-screen pixel delta (e.g. straight from a pointermove event) and converts it via the SVG's actual rendered size. Dragging right reveals lower frets, like panning a photo. */
  panByScreenPixels(dxScreenPixels) {
    const svg = this.querySelector('.gt-fretboard__svg');
    if (!svg) return;
    const renderedWidth = svg.getBoundingClientRect().width;
    if (!renderedWidth) return;
    const unitsPerPixel = svg.viewBox.baseVal.width / renderedWidth;
    this.panBy(-(dxScreenPixels * unitsPerPixel) / FRET_WIDTH);
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

  getInversion() {
    return this._inversion;
  }

  /** Briefly flash the dot for this exact pitch -- fired in sync with a note as it's actually plucked (see gt:chord-note-plucked). No-op if that pitch isn't currently on screen (e.g. an open string during a scale run). */
  pulseNote(midi) {
    const dot = this.querySelector(`.gt-dot[data-midi="${midi}"]`);
    if (!dot) return;
    dot.classList.remove('is-plucked');
    // Force a reflow so re-adding the class restarts the CSS animation even
    // if the same note is plucked twice in a row (e.g. root position doubles
    // back on itself in some inversions).
    void dot.getBoundingClientRect();
    dot.classList.add('is-plucked');
    setTimeout(() => dot.classList.remove('is-plucked'), PLUCK_FLASH_MS);
  }

  /** The fret on the 6th string (low E) where this fretboard's current root falls -- the standard starting position for a movable scale pattern. Used by playScaleDemo() and by lessons that need to zoom the neck to wherever "the 1" actually is for whatever key is active. */
  rootFretOnSixthString() {
    return fretForPitchClass(STANDARD_TUNING[0], noteNameToPitchClass(this.rootNote));
  }

  /**
   * Play and flash one note, then wait `delayMs` (fixed number, or a
   * function returning the current value -- pass a function, e.g. a tempo
   * slider's live value, when the delay needs to take effect on the very
   * next note if it changes mid-playthrough, not just on the next call).
   */
  async _playAndWait(midi, delayMs) {
    this.pulseNote(midi);
    playMidi(midi);
    const ms = typeof delayMs === 'function' ? delayMs() : delayMs;
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Demonstrate this fretboard's major scale, always starting degree 1 on
   * the 6th string (low E) -- the standard starting position for a movable
   * pattern -- even if that's the open string.
   *
   * `notesPerString` (fixed number, or a function returning the current
   * value -- same live-getter pattern as `delayMs`, so dragging the
   * Notes-per-string select mid-playthrough changes the very next string's
   * count, not just the next full run), when set (the default is 3), walks
   * string by string, low E to high E, playing exactly that many ascending
   * scale tones per string before moving on -- the standard "3 notes per
   * string" practice pattern, spanning a couple octaves across the neck.
   * Pass null/0 (or a getter that currently returns that) for the older
   * one-octave "next scale degree, wherever it falls" walk instead (used by
   * e.g. a plain flashcard demo where you just want each of the 7 degrees
   * once, not a playable fingering pattern).
   */
  async playScaleDemo(delayMs = 650, notesPerString = 3) {
    this.clearChord();
    const rootPc = noteNameToPitchClass(this.rootNote);
    const frets = this.fretCount;
    const rootMidi = STANDARD_TUNING_MIDI[0] + this.rootFretOnSixthString();
    const resolveNps = () => (typeof notesPerString === 'function' ? notesPerString() : notesPerString);

    if (!resolveNps()) {
      let previousMidi = rootMidi;
      await this._playAndWait(previousMidi, delayMs);

      for (const degree of MAJOR_SCALE_INTERVALS.slice(1)) {
        let best = null;
        for (let s = 0; s < 6; s++) {
          const openPc = STANDARD_TUNING[s];
          // Fret 1+ only, matching _renderDots() -- scale view never marks
          // open strings, so an open-string match here would play a note
          // with no dot on screen to flash.
          for (let f = 1; f <= frets; f++) {
            const iv = intervalAt(rootPc, openPc, f);
            if (!iv || iv.semitones !== degree.semitones) continue;
            const midi = STANDARD_TUNING_MIDI[s] + f;
            if (midi < previousMidi) continue;
            if (!best || midi < best.midi) best = { midi };
          }
        }
        if (!best) continue;
        previousMidi = best.midi;
        await this._playAndWait(previousMidi, delayMs);
      }
      return;
    }

    let pitchFloor = rootMidi;
    for (let s = 0; s < 6; s++) {
      const openPc = STANDARD_TUNING[s];
      const openMidi = STANDARD_TUNING_MIDI[s];
      const notesOnThisString = [];
      const npsForThisString = resolveNps();
      for (let f = 0; f <= frets && notesOnThisString.length < npsForThisString; f++) {
        const midi = openMidi + f;
        if (midi < pitchFloor) continue;
        if (!intervalAt(rootPc, openPc, f)) continue;
        notesOnThisString.push(midi);
      }
      for (const midi of notesOnThisString) {
        await this._playAndWait(midi, delayMs);
      }
      // The next string picks up strictly above the last note just played,
      // so the pattern keeps climbing instead of doubling back down.
      if (notesOnThisString.length) pitchFloor = notesOnThisString[notesOnThisString.length - 1] + 1;
    }
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
    const fullWidth = FRETBOARD_PAD_LEFT + frets * FRET_WIDTH + 20;
    const height = this._fretNumberY() + FRET_NUMBER_FONT_SIZE + FRETBOARD_PAD_BOTTOM;

    // A focused viewBox crops to just the lesson's fret range rather than
    // re-laying-out the neck -- every dot, string, and label keeps its
    // normal absolute position, just some of it falls outside the visible
    // box. A dot for fret f is centered a half-fret-width left of that
    // fret's line (see _renderDots/_renderShapeDots), so the margin has to
    // clear a half fret width PLUS the dot's own radius -- half a fret
    // alone (the old value) put the crop edge exactly on the start fret's
    // dot center, clipping it in half. Left edge only pulls in when the
    // range doesn't start at the open strings, so fret-0 lessons keep the
    // nut, open-string dots, and string-name labels in view.
    const margin = FRET_WIDTH * 0.5 + DOT_RADIUS + 5;
    const viewBoxX = this._focusRange && this._focusRange.start > 0
      ? FRETBOARD_PAD_LEFT + this._focusRange.start * FRET_WIDTH - margin
      : 0;
    const viewBoxWidth = this._focusRange
      ? Math.min(fullWidth, FRETBOARD_PAD_LEFT + this._focusRange.end * FRET_WIDTH + margin) - viewBoxX
      : fullWidth;

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

    // Every diatonic chord in the CURRENT key, for the "Showing X" picker --
    // lets the learner switch straight to ii/iii/IV/V/vi/vii° on this same
    // root without backing all the way out to the full scale first.
    const diatonicOptions = this._chord ? harmonizeMajorScale(rootPc) : [];

    const controls = this._chord ? `
      <div class="gt-fretboard__chord-banner">
        Showing
        <select class="gt-chord-picker">
          ${diatonicOptions.map((c) => `
            <option value="${c.degree}" ${c.chordName === this._chord.name ? 'selected' : ''}>${c.nashville} ${c.chordName}</option>
          `).join('')}
        </select>
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
      <svg class="gt-fretboard__svg" viewBox="${viewBoxX} 0 ${viewBoxWidth} ${height}" width="${viewBoxWidth}" height="${height}" role="img"
           aria-label="${this._chord ? `Guitar fretboard showing ${this._chord.name}'s ${this._inversion === 'root' ? 'root position' : this._inversion === 'first' ? '1st inversion' : '2nd inversion'} shape` : `Guitar fretboard showing ${this.rootNote} major scale intervals`}">
        ${this._renderFrets(frets, fullWidth, height)}
        ${this._renderStrings(frets, fullWidth)}
        ${this._chord ? this._renderShapeDots() : this._renderDots(rootPc, frets)}
        ${this._renderStringLabels()}
      </svg>
    `;

    this.querySelectorAll('.gt-mode-btn[data-inversion]').forEach((btn) => {
      btn.addEventListener('click', () => this.setInversion(btn.dataset.inversion));
    });
    const backBtn = this.querySelector('.gt-fretboard__chord-banner .gt-mode-btn--back');
    if (backBtn) backBtn.addEventListener('click', () => this.clearChord());
    const chordPicker = this.querySelector('.gt-chord-picker');
    if (chordPicker) {
      chordPicker.addEventListener('change', () => {
        const degree = Number(chordPicker.value);
        const c = diatonicOptions.find((ch) => ch.degree === degree);
        if (!c) return;
        const detail = buildChordShapeEventDetail(c, this._chord.showNoteNames);
        this.showChordShape(detail.name, detail.positionsByInversion, detail.inversionSummary, detail.showNoteNames, detail.degree);
        setAudioEnabled(true);
        playChordAudio(c, this._inversion, (midi) => this.pulseNote(midi));
      });
    }

    this.querySelectorAll('.gt-dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        setAudioEnabled(true); // this click is the user gesture the browser needs to unlock audio -- no separate toggle button anymore
        playMidi(Number(dot.dataset.midi));
        // In scale view (not a chord shape), clicking any note re-roots the
        // whole scale to it -- click a position, that's your new starting
        // note. dataset.pc only exists on scale-view dots (see _renderDots).
        if (!this._chord && dot.dataset.pc !== undefined) {
          this.dispatchEvent(new CustomEvent('gt:root-picked', { bubbles: true, detail: { pc: Number(dot.dataset.pc) } }));
        }
      });
    });
  }

  // Top edge of the fret-number row: exactly NOTE_TO_FRET_NUMBER_GAP (0.5rem)
  // below the bottom of the lowest note dot (low E's row, plus its radius).
  _fretNumberY() {
    return FRETBOARD_PAD_TOP + 5 * STRING_GAP + DOT_RADIUS + NOTE_TO_FRET_NUMBER_GAP;
  }

  _renderFrets(frets, width, height) {
    let out = '';
    const fretNumberY = this._fretNumberY();
    for (let f = 0; f <= frets; f++) {
      const x = FRETBOARD_PAD_LEFT + f * FRET_WIDTH;
      const isNut = f === 0;
      out += `<line x1="${x}" y1="${FRETBOARD_PAD_TOP}" x2="${x}" y2="${FRETBOARD_PAD_TOP + 5 * STRING_GAP}"
                     stroke="${isNut ? '#e5e7eb' : '#6b7280'}" stroke-width="${isNut ? 6 : 2}" />`;
      if (f > 0) {
        // dominant-baseline="hanging" anchors the text's TOP edge to y, so
        // the gap above it is exactly NOTE_TO_FRET_NUMBER_GAP, not an
        // eyeballed baseline offset that shifts with font metrics.
        out += `<text x="${x - FRET_WIDTH / 2}" y="${fretNumberY}" dominant-baseline="hanging"
                       text-anchor="middle" font-size="${FRET_NUMBER_FONT_SIZE}" fill="#9ca3af">${f}</text>`;
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
  _dotSvg({ x, y, label, color, midi, bare, pc }) {
    // data-pc is only set for scale-view dots (see _renderDots) -- it's what
    // lets a click re-root the scale to that exact pitch, not just play it.
    // Chord-shape dots omit it: re-rooting off a chord tone isn't meaningful.
    const pcAttr = pc === undefined ? '' : ` data-pc="${pc}"`;
    if (bare) {
      return `
        <g class="gt-dot gt-dot--bare" data-tone="${label}" data-midi="${midi}"${pcAttr}>
          <text x="${x}" y="${y + 5}" text-anchor="middle" font-size="16" font-weight="700" fill="#ffffff">${label}</text>
        </g>`;
    }
    return `
      <g class="gt-dot" data-tone="${label}" data-midi="${midi}"${pcAttr}>
        <circle cx="${x}" cy="${y}" r="${DOT_RADIUS}" fill="${color}" stroke="#111827" stroke-width="1.5" />
        <text x="${x}" y="${y + 5}" text-anchor="middle" font-size="12" font-weight="700" fill="#111827">${label}</text>
      </g>`;
  }

  // Scale view never marks open strings at all -- the string-name row on
  // the left already identifies them, and a dot on every single string
  // there added nothing but clutter. Only fret 1+ gets a dot here; open
  // strings still appear in chord mode below, where they're an actual part
  // of the shape you have to play.
  // Whatever's currently chosen in the lesson modal's Notes-per-string
  // select -- read live off the DOM (same source of truth lesson-player.js
  // reads), not a cached copy, and not plumbed in from outside: the neck's
  // own scale view and the scale-demo playback both need this, so both read
  // it from the same place rather than one trusting a value passed down
  // from the other. Falls back to 3 before any lesson has ever run (the
  // select doesn't exist yet).
  _currentNotesPerString() {
    const select = document.querySelector('.gt-lesson-modal__nps-select');
    return select ? Number(select.value) : 3;
  }

  // Which slice of the neck the scale view currently shows -- read live off
  // the header's Note view select, same pattern as _currentNotesPerString().
  // 'shown' (default) is the notesPerString-capped walk everything else on
  // the page assumes; 'all' is every occurrence of every degree (the old,
  // uncapped reference-chart view); 'below'/'above' are what's just outside
  // that walk in each direction, for seeing what comes next without
  // widening notesPerString itself.
  _currentNoteView() {
    const select = document.querySelector('.gt-note-view-select');
    return select ? select.value : 'shown';
  }

  // Computes all four (string, fret) position sets in one pass over the
  // neck, given notesPerString -- the low-E-to-high-E, strictly-ascending-
  // pitch walk used by both _renderDots (so the neck never shows/allows
  // more than N per string in 'shown' mode) and playScaleDemo (so the audio
  // matches whatever's on screen). Keyed as "s-f" strings for cheap Set
  // membership checks.
  //   shown -- exactly what notesPerString picks per string (today's view)
  //   all   -- every occurrence of every degree, uncapped
  //   below -- on each string, occurrences below (lower-fretted than) what's shown there
  //   above -- every occurrence, any string, pitched above the last note 'shown' reaches
  _scaleWalkPositions(rootPc, frets, notesPerString) {
    const shown = new Set();
    const all = new Set();
    const below = new Set();
    const above = new Set();
    const rootMidi = STANDARD_TUNING_MIDI[0] + this.rootFretOnSixthString();
    let pitchFloor = rootMidi;
    let globalMaxShownMidi = -Infinity;

    for (let s = 0; s < 6; s++) {
      const openPc = STANDARD_TUNING[s];
      const openMidi = STANDARD_TUNING_MIDI[s];
      const notesOnThisString = [];
      for (let f = 0; f <= frets; f++) {
        if (!intervalAt(rootPc, openPc, f)) continue;
        all.add(`${s}-${f}`);
        const midi = openMidi + f;
        if (midi >= pitchFloor && notesOnThisString.length < notesPerString) {
          notesOnThisString.push({ f, midi });
        }
      }
      for (const { f } of notesOnThisString) shown.add(`${s}-${f}`);
      if (notesOnThisString.length) {
        pitchFloor = notesOnThisString[notesOnThisString.length - 1].midi + 1;
        globalMaxShownMidi = Math.max(globalMaxShownMidi, notesOnThisString[notesOnThisString.length - 1].midi);
        const minShownFret = notesOnThisString[0].f;
        for (let f = 0; f < minShownFret; f++) {
          if (intervalAt(rootPc, openPc, f)) below.add(`${s}-${f}`);
        }
      }
    }
    for (let s = 0; s < 6; s++) {
      const openPc = STANDARD_TUNING[s];
      const openMidi = STANDARD_TUNING_MIDI[s];
      for (let f = 0; f <= frets; f++) {
        if (openMidi + f > globalMaxShownMidi && intervalAt(rootPc, openPc, f)) above.add(`${s}-${f}`);
      }
    }
    return { shown, all, below, above };
  }

  // Never shows (or allows clicking/playing) more than notesPerString dots
  // per string in the default 'shown' view -- capped to exactly the
  // positions the scale demo would play, not every occurrence of every
  // degree across all 22 frets, unless the Note view select says otherwise.
  _renderDots(rootPc, frets) {
    let out = '';
    const notesPerString = this._currentNotesPerString();
    const positions = this._scaleWalkPositions(rootPc, frets, notesPerString);
    const allowed = positions[this._currentNoteView()] || positions.shown;
    for (let s = 0; s < 6; s++) {
      const y = this._rowY(s);
      const openPc = STANDARD_TUNING[s];
      for (let f = 1; f <= frets; f++) {
        if (!allowed.has(`${s}-${f}`)) continue;
        const iv = intervalAt(rootPc, openPc, f);
        if (!iv) continue;
        const x = FRETBOARD_PAD_LEFT + f * FRET_WIDTH - FRET_WIDTH / 2;
        const color = INTERVAL_COLORS[iv.short];
        const midi = STANDARD_TUNING_MIDI[s] + f;
        const pc = (openPc + f) % 12;
        const label = this._labelMode === 'note' ? pitchClassName(pc) : iv.degree;
        out += this._dotSvg({ x, y, label, color, midi, bare: false, pc });
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
