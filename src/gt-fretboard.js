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

// STANDARD_TUNING's own index order (E,A,D,G,B,E -- low string to high) --
// index 4 is the B string, the "2nd string" in standard guitar numbering
// (1st = high E). It always gets one extra note beyond the base
// notesPerString in the scale walk (see _scaleWalkPositions/playScaleDemo)
// -- an explicit, always-on exception, not conditioned on key/mode/degree.
const SECOND_STRING_INDEX = 4;

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
    // Whenever nothing has explicitly focused the neck (_focusRange is
    // null), auto-crop the viewBox to wherever the current scale view's
    // dots actually fall instead of always showing all 22 frets -- a key
    // like D's default 3-notes-per-string pattern starts around fret 10,
    // so the un-cropped full neck left roughly the first 9 frets empty on
    // one side. "Show full neck" (clearFocus()) is the explicit opt-out:
    // once a user asks for the whole neck, this stays off until a lesson
    // explicitly focuses it again.
    this._autoCenterEnabled = true;
    // "Add Notes" (+/-), the header control next to Notes/string -- a
    // single signed level, not two independent directions: + increments
    // it (extends the scale view upward by one more notesPerString-sized
    // batch per string per level); - decrements it, going negative once
    // it's already at 0 (extends downward, toward the nut, the same way
    // but in the opposite direction). Resets to 0 whenever the key/root
    // changes (see attributeChangedCallback).
    this._addNotesLevel = 0;
    // Re-anchors the scale-walk pattern (_scaleWalkPositions/playScaleDemo)
    // at a DIFFERENT pitch class's position on the 6th string, without
    // changing which notes qualify as scale members -- null (the default)
    // means "use this.rootNote's own position," today's normal behavior.
    // Set by the Modes lesson (setWalkAnchor()) so each mode's own tonic
    // becomes where the box starts, since a mode shares the parent key's
    // exact 7 notes and only ever moves where the walk begins. Cleared by
    // focusFrets()/clearFocus() (every lesson-start path goes through one
    // of those) and by a root/key change, so it never leaks into an
    // unrelated lesson's view.
    this._walkAnchorPc = null;
    // Traditional fret-position inlay dots (frets 3,5,7,9,12,15,17,19,21...)
    // -- purely decorative/orientation, on by default like a real neck.
    this._showFretMarkers = true;
    // Bumped by stopPlayback() and by playScaleDemo() itself every time it
    // starts -- an in-flight playScaleDemo loop checks this before each
    // note and abandons the rest of its run the instant it no longer
    // matches, instead of always finishing the whole sequence once
    // started. Lets something with higher priority (e.g. changing Mode
    // mid-demo) take over right away rather than being silently ignored
    // while the old run is still going.
    this._playbackGen = 0;
    // Set by stopPlayback(), cleared by armPlayback() -- see their own
    // comments. Blocks a NOT-yet-started playScaleDemo() call from
    // beginning at all, not just an already-in-flight one.
    this._playbackStopped = false;
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name) {
    // A new key re-bases the whole scale pattern -- an Add Notes extension
    // (or a mode's walk anchor) carried over from the old key wouldn't
    // line up with anything.
    if (name === 'root') {
      this._resetAddNotes();
      this._walkAnchorPc = null;
    }
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
    this._walkAnchorPc = null; // a fixed crop replaces whatever pattern was showing -- any mode anchor from a prior lesson no longer applies
    this._focusRange = { start, end };
    this.render();
    this.dispatchEvent(new CustomEvent('gt:focus-changed', { bubbles: true, detail: { range: this._focusRange } }));
  }

  clearFocus() {
    // Reset unconditionally, BEFORE the early-return below -- the Modes
    // lesson calls clearFocus() on every run (see its own comment above),
    // but _focusRange is already null on every run after the first, so an
    // anchor reset placed after the guard would never fire when it matters
    // most: right before that same lesson calls setWalkAnchor() again.
    this._walkAnchorPc = null;
    if (!this._focusRange) return;
    this._focusRange = null;
    this.render();
    this.dispatchEvent(new CustomEvent('gt:focus-changed', { bubbles: true, detail: { range: null } }));
  }

  /**
   * Temporarily re-anchors the scale-walk pattern (_scaleWalkPositions,
   * playScaleDemo) at a different pitch class's position on the 6th string
   * -- used by the Modes lesson so each mode's own tonic becomes where the
   * box starts, while note membership/degree-coloring still test against
   * THIS fretboard's own root (a mode is the parent key's exact 7 notes,
   * just re-rooted -- see theory.js#modeInfo). Cleared by focusFrets()/
   * clearFocus() and by a root change, so it never leaks into an unrelated
   * lesson's view.
   */
  setWalkAnchor(pc) {
    this._walkAnchorPc = pc;
    this.render();
  }

  // Whatever's currently chosen in the header's Starting string select --
  // read live off the DOM, same pattern as _currentNotesPerString() (the
  // neck's own rendering and the scale-demo playback both need this, so
  // both read it from the same place). 0 = 6th string (low E, today's
  // fixed default) through 5 = 1st string (high E) -- matches
  // STANDARD_TUNING's own index order directly, no conversion needed.
  _currentStartingStringIndex() {
    const select = document.querySelector('.gt-starting-string-select');
    return select ? Number(select.value) : 0;
  }

  /** The fret on the currently-chosen starting string (see _currentStartingStringIndex, default the 6th/low E) where the scale walk begins -- this fretboard's own root, unless setWalkAnchor() has re-anchored it elsewhere. */
  _walkAnchorFret() {
    const anchorPc = this._walkAnchorPc ?? noteNameToPitchClass(this.rootNote);
    return fretForPitchClass(STANDARD_TUNING[this._currentStartingStringIndex()], anchorPc);
  }

  /**
   * The explicit "Show full neck" opt-out (index.html's button) -- turns
   * off auto-centering permanently (until a lesson explicitly focuses the
   * neck again), separate from clearFocus() itself: lessons with no fixed
   * crop of their own (e.g. the Modes lesson) also call clearFocus() every
   * time they run, which must NOT be read as "the user asked to see
   * everything" or picking that lesson once would silently disable
   * auto-centering forever afterward.
   */
  disableAutoCenter() {
    this._autoCenterEnabled = false;
    this.render();
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

  /** Whether the traditional inlay-dot fret markers are currently shown. */
  getFretMarkers() {
    return this._showFretMarkers;
  }

  /** Turns the fret-position inlay markers on/off (index.html's toggle button). */
  setFretMarkers(show) {
    this._showFretMarkers = show;
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

  /**
   * The range actually cropped to right now: an explicit lesson-set
   * _focusRange if there is one; otherwise, unless auto-centering has been
   * turned off (disableAutoCenter(), the "Show full neck" opt-out) or a
   * chord shape is showing (chord shapes aren't part of this pattern),
   * a range computed to fit snugly around wherever the current scale
   * view's dots actually fall -- padded by 2 frets on each side. Without
   * this, a key whose scale pattern starts well into the neck (e.g. D's
   * default 3-notes-per-string walk starts around fret 10) left the whole
   * unused low end of the neck sitting empty on one side.
   */
  _effectiveFocusRange() {
    if (this._focusRange) return this._focusRange;
    if (this._chord || !this._autoCenterEnabled) return null;
    const rootPc = noteNameToPitchClass(this.rootNote);
    const frets = this.fretCount;
    const notesPerString = this._currentNotesPerString();
    const positions = this._scaleWalkPositions(rootPc, frets, notesPerString);
    const allowed = positions.extended;
    let minFret = Infinity;
    let maxFret = -Infinity;
    for (const key of allowed) {
      const f = Number(key.split('-')[1]);
      if (f < minFret) minFret = f;
      if (f > maxFret) maxFret = f;
    }
    if (minFret === Infinity) return null; // nothing rendered -- nothing sensible to crop to
    const pad = 2;
    return { start: Math.max(0, minFret - pad), end: Math.min(frets, maxFret + pad) };
  }

  /**
   * Abandons whatever playScaleDemo() run is currently in flight -- it
   * bails out (without finishing its remaining notes) the instant it next
   * checks, instead of always running its whole sequence once started.
   * ALSO refuses to let a NOT-yet-started playScaleDemo() call begin at
   * all (see the _playbackStopped check at its top) until armPlayback()
   * explicitly re-arms it -- a lesson can be mid-narration (still inside
   * its own pre-demo await, e.g. showModal's scroll-settle wait) when Stop
   * is clicked, before playScaleDemo has even captured a generation token
   * for stopPlayback()'s bump to invalidate; without this flag, that
   * lesson would go on to start playing its ENTIRE demo moments later,
   * ignoring Stop entirely.
   */
  stopPlayback() {
    this._playbackGen++;
    this._playbackStopped = true;
  }

  /** Re-arms playback after stopPlayback() -- called once by a new run right before it actually intends to play something, so a stale Stop doesn't silently swallow it too. */
  armPlayback() {
    this._playbackStopped = false;
  }

  /** Whether fret f is within the currently focused/zoomed crop (see _effectiveFocusRange) -- true when there's no active focus (the whole neck is showing). */
  _isFretInView(fret) {
    const range = this._effectiveFocusRange();
    if (!range) return true;
    return fret >= range.start && fret <= range.end;
  }

  /**
   * Briefly flash the dot for this exact pitch -- fired in sync with a note
   * as it's actually plucked (see gt:chord-note-plucked). No-op if that
   * pitch isn't currently on screen, either because no dot exists for it at
   * all (e.g. an open string during a scale run) or because it exists but
   * falls outside the current focused/zoomed fret range. Returns whether it
   * actually flashed something, so a caller can also skip playing audio for
   * a note nothing on screen corresponds to (see _playAndWait).
   *
   * `accented` marks it as beat 1 of a measure (see playScaleDemo's time
   * signature) -- an extra CSS class for a visibly bigger/brighter flash,
   * so the downbeat reads visually as well as audibly.
   */
  pulseNote(midi, accented = false) {
    const dot = this.querySelector(`.gt-dot[data-midi="${midi}"]`);
    if (!dot) return false;
    if (dot.dataset.fret !== undefined && !this._isFretInView(Number(dot.dataset.fret))) return false;
    dot.classList.remove('is-plucked', 'is-accented');
    // Force a reflow so re-adding the class restarts the CSS animation even
    // if the same note is plucked twice in a row (e.g. root position doubles
    // back on itself in some inversions).
    void dot.getBoundingClientRect();
    dot.classList.add('is-plucked');
    if (accented) dot.classList.add('is-accented');
    setTimeout(() => dot.classList.remove('is-plucked', 'is-accented'), PLUCK_FLASH_MS);
    return true;
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
   * Silent (no audio) if the note's dot isn't actually visible right now --
   * hearing a note with nothing on screen to correlate it to is confusing.
   * The rhythm still holds its place either way; only the sound is skipped.
   *
   * `accented` marks "beat 1" of a measure under the current time signature
   * (see playScaleDemo) -- louder and brighter, the way a metronome/count-
   * in accents beat 1, plus a brief CSS accent ring on the dot itself so
   * the downbeat is visible as well as audible.
   */
  async _playAndWait(midi, delayMs, accented = false) {
    const visible = this.pulseNote(midi, accented);
    if (visible && accented) playMidi(midi, 1.4, 0.5, 4200);
    else if (visible) playMidi(midi);
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
   *
   * `direction` -- 'up' (default), 'down', or 'both' -- only meaningfully
   * offered in the UI when notesPerString is 2 (see index.html's 3-way
   * toggle), but works for any notesPerString: 'up' is today's low-E-to-
   * high-E ascent; 'down' plays that exact same set of notes in reverse
   * (high to low); 'both' plays the ascent then immediately back down
   * (skipping an immediate repeat of the turnaround note).
   *
   * `beatsPerMeasure` (fixed number or a live-getter, default 4 -- i.e. felt
   * in 4/4) accents every Nth note as "beat 1" of a measure (louder/
   * brighter audio + a visual accent ring, see _playAndWait/pulseNote) --
   * the header's Time signature select drives this (index.html), so 3/4
   * accents every 3rd note, 6/8 every 3rd (felt as two dotted-quarter
   * pulses), etc. Purely a metronome-style accent overlaid on the same
   * note sequence -- it never changes which notes play, only how beat 1
   * of each group sounds/looks. Every note dispatches gt:beat-changed
   * (detail: { beat, beatsPerMeasure }, beat cycling 1..beatsPerMeasure)
   * so the header's Beat counter (index.html) can follow along for ANY
   * lesson using this, not just the ones that also care about beat 1
   * specifically.
   *
   * `onBeatOne`, if given, fires only on beat 1 of every measure, with
   * that measure's actual duration in seconds (beatsPerMeasure x the
   * resolved delayMs) -- e.g. the Modes lesson re-strikes that mode's own
   * chord there and holds it for the measure's length, so it's struck
   * once per measure (4/4: on 1, held through 2-3-4) rather than once for
   * the whole demo or on every individual note.
   */
  async playScaleDemo(delayMs = 650, notesPerString = 3, direction = 'up', beatsPerMeasure = 4, onBeatOne) {
    // A Stop is still in effect -- refuse to start at all until
    // armPlayback() explicitly re-arms it (see stopPlayback's own comment).
    if (this._playbackStopped) return;
    this.clearChord();
    // Claims this playback slot -- superseded (by another playScaleDemo
    // call, or by an explicit stopPlayback()) the instant this no longer
    // matches this._playbackGen, checked before every note below.
    const myGen = ++this._playbackGen;
    const rootPc = noteNameToPitchClass(this.rootNote);
    const frets = this.fretCount;
    // This legacy one-octave branch below always starts on the 6th string
    // specifically (it's a fixed flashcard demo, not the notesPerString box
    // pattern) -- unaffected by the Starting-string selector on purpose.
    const rootMidi = STANDARD_TUNING_MIDI[0] + fretForPitchClass(STANDARD_TUNING[0], this._walkAnchorPc ?? rootPc);
    const resolveNps = () => (typeof notesPerString === 'function' ? notesPerString() : notesPerString);

    if (!resolveNps()) {
      let previousMidi = rootMidi;
      await this._playAndWait(previousMidi, delayMs);

      for (const degree of MAJOR_SCALE_INTERVALS.slice(1)) {
        if (this._playbackGen !== myGen) return; // superseded -- abandon the rest of this run
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

    // Same per-string algorithm as _scaleWalkPositions -- every string's
    // search is constrained to the SAME fret (established by the chosen
    // Starting string's own anchor position, see _walkAnchorFret) and
    // higher. Nothing below it is allowed, even if that string's own
    // nearest root occurrence would otherwise fall earlier on the neck.
    // Matches what's actually rendered/clickable.
    const startFret = Math.max(1, this._walkAnchorFret());
    const sequence = [];
    for (let s = 0; s < 6; s++) {
      const openPc = STANDARD_TUNING[s];
      const openMidi = STANDARD_TUNING_MIDI[s];
      // Same always-on exception as _scaleWalkPositions -- the 2nd string
      // (B) gets one extra note beyond the base notesPerString.
      const npsForThisString = resolveNps() + (s === SECOND_STRING_INDEX ? 1 : 0);
      const notesOnThisString = [];
      for (let f = startFret; f <= frets && notesOnThisString.length < npsForThisString; f++) {
        if (!intervalAt(rootPc, openPc, f)) continue;
        notesOnThisString.push(openMidi + f);
      }
      sequence.push(...notesOnThisString);
    }

    // Every string plays its own full notesPerString batch before moving to
    // the next, in order -- but guitar strings overlap in range, so a later
    // string's walk can land on the exact same pitch an earlier string
    // already played. Never sound (or flash) that same pitch twice in one
    // pass -- keep only each MIDI value's first occurrence, in walk order.
    const seenMidi = new Set();
    const dedupedSequence = sequence.filter((midi) => {
      if (seenMidi.has(midi)) return false;
      seenMidi.add(midi);
      return true;
    });

    const resolveDirection = () => (typeof direction === 'function' ? direction() : direction);
    let toPlay = resolveDirection() === 'down' ? [...dedupedSequence].reverse()
      : resolveDirection() === 'both' ? [...dedupedSequence, ...[...dedupedSequence].reverse().slice(1)]
      : dedupedSequence;

    const resolveBeats = () => {
      const n = typeof beatsPerMeasure === 'function' ? beatsPerMeasure() : beatsPerMeasure;
      return n > 0 ? n : 4;
    };
    const resolveDelay = () => (typeof delayMs === 'function' ? delayMs() : delayMs);

    // Always finish the measure it's in -- a lone note or two left
    // dangling at the end (not a full beatsPerMeasure group) would mean
    // the last chord strike (onBeatOne) never gets its full measure's
    // worth of melody notes to ring under. Pad by cycling back through
    // the same sequence from the top rather than just stopping short.
    const beatsForPadding = resolveBeats();
    if (toPlay.length % beatsForPadding !== 0) {
      const original = toPlay;
      toPlay = original.slice();
      let cursor = 0;
      while (toPlay.length % beatsForPadding !== 0) {
        toPlay.push(original[cursor % original.length]);
        cursor++;
      }
    }
    for (let i = 0; i < toPlay.length; i++) {
      if (this._playbackGen !== myGen) return; // superseded -- abandon the rest of this run
      const beats = resolveBeats();
      const beatNumber = (i % beats) + 1; // 1-indexed, cycling 1..beats
      this.dispatchEvent(new CustomEvent('gt:beat-changed', { bubbles: true, detail: { beat: beatNumber, beatsPerMeasure: beats } }));
      if (beatNumber === 1) onBeatOne?.((beats * resolveDelay()) / 1000);
      await this._playAndWait(toPlay[i], delayMs, beatNumber === 1);
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
    const effectiveRange = this._effectiveFocusRange();
    const viewBoxX = effectiveRange && effectiveRange.start > 0
      ? FRETBOARD_PAD_LEFT + effectiveRange.start * FRET_WIDTH - margin
      : 0;
    const viewBoxWidth = effectiveRange
      ? Math.min(fullWidth, FRETBOARD_PAD_LEFT + effectiveRange.end * FRET_WIDTH + margin) - viewBoxX
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
        ${this._showFretMarkers ? this._renderFretMarkers(frets) : ''}
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

  // Traditional inlay position markers -- single dots at 3,5,7,9,15,17,19,21
  // (one per fret, centered between the D and G strings, the same spot a
  // real neck's dots sit relative to all six strings), double dots at 12
  // and 24 (one string-gap above and below that same center line). Purely
  // decorative -- no data-midi/data-tone, so they're never clickable and
  // never targeted by _renderDots' own click wiring. Rendered into the SVG
  // BEFORE the actual note dots (see render()), so in paint order a real
  // note dot always ends up on top of a marker that happens to share its
  // fret -- "any note wins over a fret marker" is just SVG draw order, not
  // a runtime check.
  _renderFretMarkers(frets) {
    const centerY = (this._rowY(2) + this._rowY(3)) / 2;
    const upperY = (this._rowY(3) + this._rowY(4)) / 2; // one string-gap toward the high E side
    const lowerY = (this._rowY(1) + this._rowY(2)) / 2; // one string-gap toward the low E side
    const r = DOT_RADIUS * 0.55;

    const pearl = (x, y) => `
      <circle cx="${x}" cy="${y}" r="${r}" fill="url(#gt-pearl-fill)" stroke="#e8e8f0" stroke-width="0.75" opacity="0.85" />
      <circle cx="${x - r * 0.3}" cy="${y - r * 0.35}" r="${r * 0.32}" fill="#ffffff" opacity="0.55" />`;

    let out = `
      <defs>
        <radialGradient id="gt-pearl-fill" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stop-color="#fdfdfb" />
          <stop offset="45%" stop-color="#e6e2f0" />
          <stop offset="75%" stop-color="#c9c4de" />
          <stop offset="100%" stop-color="#a89fc4" />
        </radialGradient>
      </defs>`;

    for (let f = 1; f <= frets; f++) {
      const x = FRETBOARD_PAD_LEFT + f * FRET_WIDTH - FRET_WIDTH / 2;
      const mod = f % 12;
      if (mod === 0) {
        out += `<g class="gt-fret-marker" style="pointer-events:none">${pearl(x, upperY)}${pearl(x, lowerY)}</g>`;
      } else if ([3, 5, 7, 9].includes(mod)) {
        out += `<g class="gt-fret-marker" style="pointer-events:none">${pearl(x, centerY)}</g>`;
      }
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
  _dotSvg({ x, y, label, color, midi, bare, pc, fret }) {
    // data-pc is only set for scale-view dots (see _renderDots) -- it's what
    // lets a click re-root the scale to that exact pitch, not just play it.
    // Chord-shape dots omit it: re-rooting off a chord tone isn't meaningful.
    const pcAttr = pc === undefined ? '' : ` data-pc="${pc}"`;
    // data-fret lets pulseNote() (and anything checking "is this dot
    // actually in the current cropped viewBox") look up this exact dot's
    // fret without the caller having to track/pass it separately -- see
    // _isFretInView().
    const fretAttr = fret === undefined ? '' : ` data-fret="${fret}"`;
    if (bare) {
      return `
        <g class="gt-dot gt-dot--bare" data-tone="${label}" data-midi="${midi}"${pcAttr}${fretAttr}>
          <text x="${x}" y="${y + 5}" text-anchor="middle" font-size="16" font-weight="700" fill="#ffffff">${label}</text>
        </g>`;
    }
    return `
      <g class="gt-dot" data-tone="${label}" data-midi="${midi}"${pcAttr}${fretAttr}>
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

  /**
   * The base per-string walk: each string independently finds its OWN
   * lowest fretted (1+) occurrence of the root note (scale degree 1) --
   * not a floor shared or inherited from any other string -- then takes
   * that plus the next `notesPerString - 1` ascending scale-tone
   * occurrences from there (degree 1, 2, 3, ... for notesPerString=3).
   * Plus the "Add Notes" +/- extensions above/below that base (see
   * addNotesAbove/addNotesBelow) -- each string independently continues
   * its own walk further in that direction. Keyed as "s-f" strings for
   * cheap Set membership checks.
   *
   * Every string genuinely starting on its own root (not wherever an
   * absolute-pitch floor first happens to land) is what was actually
   * asked for -- an earlier shared-floor version put whatever scale
   * degree happened to be lowest-fretted on a higher string first (e.g.
   * degree 4 on the high E string, skipping right past its own root),
   * which is wrong regardless of how tidy the resulting shape looked.
   *
   *   shown    -- exactly what notesPerString picks per string
   *   extended -- shown, plus whatever Add Notes has added above/below
   */
  _scaleWalkPositions(rootPc, frets, notesPerString) {
    const shown = new Set();
    const extended = new Set();
    const perString = new Array(6).fill(null); // { minFret, maxMidi } once a string has any shown notes
    // Established once, by the chosen Starting string's own anchor
    // position (default the 6th/low E) -- every other string's search is
    // constrained to this SAME fret and higher. Nothing below it is
    // allowed, even if that string's own nearest root occurrence would
    // otherwise fall earlier on the neck. The anchor pitch is normally this
    // fretboard's own root; the Modes lesson re-anchors it at a mode's own
    // tonic instead (setWalkAnchor()) while `rootPc` below -- which decides
    // which notes actually qualify -- always stays the parent key's root,
    // since a mode shares the exact same 7 notes.
    const startFret = this._walkAnchorFret();

    for (let s = 0; s < 6; s++) {
      const openPc = STANDARD_TUNING[s];
      const openMidi = STANDARD_TUNING_MIDI[s];
      const notesOnThisString = [];
      // The 2nd string (B, index 4) always gets one extra note beyond the
      // base notesPerString -- explicitly requested, always on regardless
      // of key/mode/Notes-per-string.
      const capForThisString = s === SECOND_STRING_INDEX ? notesPerString + 1 : notesPerString;
      for (let f = Math.max(1, startFret); f <= frets && notesOnThisString.length < capForThisString; f++) {
        if (!intervalAt(rootPc, openPc, f)) continue;
        notesOnThisString.push({ f, midi: openMidi + f });
      }
      for (const { f } of notesOnThisString) {
        shown.add(`${s}-${f}`);
        extended.add(`${s}-${f}`);
      }
      if (notesOnThisString.length) {
        perString[s] = {
          minFret: notesOnThisString[0].f,
          maxMidi: notesOnThisString[notesOnThisString.length - 1].midi,
        };
      }
    }

    // A positive level extends above the base pattern; negative extends
    // below (toward the nut) the same way, in the opposite direction.
    // Only one direction is ever active at once -- the level is signed,
    // not two independent counters. Extends outward from THIS pattern's
    // own base (whatever it's anchored to -- the key's root, or a mode's
    // tonic), so Add Notes during the Modes lesson grows from the mode's
    // own root, not the parent key's.
    const extraAbove = Math.max(this._addNotesLevel, 0) * notesPerString;
    const extraBelow = Math.max(-this._addNotesLevel, 0) * notesPerString;
    for (let s = 0; s < 6; s++) {
      const info = perString[s];
      if (!info) continue;
      const openPc = STANDARD_TUNING[s];
      const openMidi = STANDARD_TUNING_MIDI[s];
      if (extraAbove > 0) {
        let count = 0;
        for (let f = 1; f <= frets && count < extraAbove; f++) {
          const midi = openMidi + f;
          if (midi <= info.maxMidi) continue;
          if (!intervalAt(rootPc, openPc, f)) continue;
          extended.add(`${s}-${f}`);
          count++;
        }
      }
      if (extraBelow > 0) {
        let count = 0;
        for (let f = info.minFret - 1; f >= 1 && count < extraBelow; f--) {
          if (!intervalAt(rootPc, openPc, f)) continue;
          extended.add(`${s}-${f}`);
          count++;
        }
      }
    }
    return { shown, extended };
  }

  /** How many more notes-per-string worth "Add Notes +" has extended the view above the base pattern (0 if the level is currently <= 0). */
  getExtraNotesAbove() {
    return Math.max(this._addNotesLevel, 0) * this._currentNotesPerString();
  }

  /** How many more notes-per-string worth "Add Notes -" has extended the view below the base pattern (0 if the level is currently >= 0). */
  getExtraNotesBelow() {
    return Math.max(-this._addNotesLevel, 0) * this._currentNotesPerString();
  }

  /** The raw signed Add Notes level (positive = extended above, negative = extended below, 0 = base pattern only). */
  getAddNotesLevel() {
    return this._addNotesLevel;
  }

  // Symmetric cap on the level so repeated clicking can't run the
  // displayed count up past the point where any more dots could actually
  // appear (every occurrence up to fret 22 in that direction is already
  // showing well before this).
  _maxAddNotesLevel() {
    return Math.max(1, Math.ceil(this.fretCount / this._currentNotesPerString()));
  }

  /**
   * "Add Notes +" -- increments the signed level by one, extending the
   * scale view upward by one more notesPerString-sized batch per string
   * (across all six strings) per level above 0. If the level is currently
   * negative (extended below), this undoes one of those below-batches
   * first, same as - undoes an above-batch.
   */
  addNotesAbove() {
    this._addNotesLevel = Math.min(this._addNotesLevel + 1, this._maxAddNotesLevel());
    this.render();
  }

  /**
   * "Add Notes -" -- decrements the signed level by one. While the level
   * is still positive (something above the base pattern to undo), this
   * undoes one above-batch; once it reaches 0, further clicks go negative
   * and extend the view downward (toward the nut) instead, the same way
   * + extends it upward.
   */
  removeNotesAbove() {
    this._addNotesLevel = Math.max(this._addNotesLevel - 1, -this._maxAddNotesLevel());
    this.render();
  }

  /** Resets "Add Notes" back to the base notesPerString pattern (level 0) -- the explicit reset a user can trigger directly (index.html's clickable Add Notes value label), same effect as the automatic reset a Key change already triggers. */
  resetAddNotes() {
    this._resetAddNotes();
    this.render();
  }

  /** Resets the Add Notes level back to 0 -- called whenever the root/key changes, since the whole pattern re-bases and a carried-over extension from the old key wouldn't mean anything. */
  _resetAddNotes() {
    this._addNotesLevel = 0;
  }

  // Never shows (or allows clicking/playing) more than notesPerString dots
  // per string, plus whatever "Add Notes" has extended above/below that --
  // not every occurrence of every degree across all 22 frets.
  _renderDots(rootPc, frets) {
    let out = '';
    const notesPerString = this._currentNotesPerString();
    const positions = this._scaleWalkPositions(rootPc, frets, notesPerString);
    const allowed = positions.extended;
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
        out += this._dotSvg({ x, y, label, color, midi, bare: false, pc, fret: f });
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
      out += this._dotSvg({ x, y, label: displayLabel, color, midi, bare: f === 0, fret: f });
    });
    return out;
  }
}

if (!customElements.get('gt-fretboard')) {
  customElements.define('gt-fretboard', GTFretboard);
}
