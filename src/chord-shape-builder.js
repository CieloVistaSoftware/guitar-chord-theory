/**
 * Shared logic for turning a chord ({ chordName, quality, notes }) into
 * fretboard positions, inversion summaries, and playable audio -- used by
 * both <gt-diatonic-chords> (the lesson page) and the Songs page, so the
 * two never duplicate this math.
 */
import { STANDARD_TUNING, STANDARD_TUNING_MIDI, noteNameToPitchClass, pitchClassName, spellFormulaNotes } from './theory.js';
import { CHORD_SHAPES } from './chord-shapes.js';
import { CHORD_INVERSIONS } from './chord-inversions.js';
import { generateChordShape } from './chord-shape-generator.js';
import { playChordMidi } from './audio.js';

export const SHAPES_BY_INVERSION = {
  root: CHORD_SHAPES,
  first: CHORD_INVERSIONS.first,
  second: CHORD_INVERSIONS.second,
};

/**
 * The shape (6-element fret array, low string to high) for chord c in the
 * given inversion. Uses the hand-verified C-major shapes above where they
 * exist; every other chord in every other key is derived purely from its
 * spelling via chord-shape-generator.js, so every chord is playable.
 */
export function getChordShape(c, inversion) {
  const hardcoded = SHAPES_BY_INVERSION[inversion]?.[c.chordName];
  if (hardcoded) return hardcoded;
  const [rootPc, thirdPc, fifthPc] = c.notes.map(noteNameToPitchClass);
  const bassPc = inversion === 'root' ? rootPc : inversion === 'first' ? thirdPc : fifthPc;
  return generateChordShape([rootPc, thirdPc, fifthPc], bassPc);
}

/**
 * The exact fretted/open positions of c's shape in the given inversion
 * ('root' / 'first' / 'second'). Labeled with intervals (1 / ♭3 / 5) or
 * real note names, depending on showNoteNames -- what the big fretboard
 * shows whenever a chord is selected, so the learner always sees the
 * actual shape, not just "where this tone lives". The fretboard always
 * renders open strings as a bare "O" regardless of this label -- numbers/
 * note names on open strings only ever show on the small fingering charts.
 */
export function buildShapePositions(c, showNoteNames, inversion) {
  const shape = getChordShape(c, inversion);
  if (!shape) return [];
  const [rootPc, thirdPc, fifthPc] = c.notes.map(noteNameToPitchClass);
  const intervalLabelFor = (pc) => {
    if (pc === rootPc) return '1';
    if (pc === thirdPc) return c.quality === 'major' ? '3' : '♭3';
    return c.quality === 'diminished' ? '♭5' : '5';
  };
  const labelFor = (pc) => (showNoteNames ? pitchClassName(pc) : intervalLabelFor(pc));
  const colorFor = (pc) => (pc === rootPc ? '#ef4444' : pc === thirdPc ? '#eab308' : '#06b6d4');

  return shape
    .map((fret, s) => {
      if (fret === null) return null;
      const pc = (STANDARD_TUNING[s] + fret) % 12;
      return { string: s, fret, label: labelFor(pc), color: colorFor(pc) };
    })
    .filter(Boolean);
}

// Bass-note-first tone list for each inversion, e.g. for Dm:
// root -> ['1','♭3','5'] / ['D','F','A'], first -> ['♭3','5','1'] / ['F','A','D']...
// Shown as each inversion button's subtitle so the name is self-explanatory.
export function buildInversionSummary(c) {
  const [rootNote, thirdNote, fifthNote] = c.notes;
  const third = c.quality === 'major' ? '3' : '♭3';
  const fifth = c.quality === 'diminished' ? '♭5' : '5';
  return {
    root: { intervals: ['1', third, fifth], notes: [rootNote, thirdNote, fifthNote] },
    first: { intervals: [third, fifth, '1'], notes: [thirdNote, fifthNote, rootNote] },
    second: { intervals: [fifth, '1', third], notes: [fifthNote, rootNote, thirdNote] },
  };
}

/** Package the { positionsByInversion, inversionSummary, showNoteNames, degree } payload a gt:chord-shape-selected event needs. `degree` (1-7, the scale degree c was harmonized from) lets a Key change re-show the equivalent chord in the new key instead of just dropping back to the scale view -- see index.html's applyKey(). */
export function buildChordShapeEventDetail(c, showNoteNames) {
  const positionsByInversion = {
    root: buildShapePositions(c, showNoteNames, 'root'),
    first: buildShapePositions(c, showNoteNames, 'first'),
    second: buildShapePositions(c, showNoteNames, 'second'),
  };
  return { name: c.chordName, positionsByInversion, inversionSummary: buildInversionSummary(c), showNoteNames, degree: c.degree };
}

// One color per chord-tone role in formula order (root first) -- reused
// through every CHORD_FORMULAS entry up to a 13th chord's 6 notes, roughly
// matching the reference palette the scale-degree dots already use.
const FORMULA_TONE_COLORS = ['#ef4444', '#eab308', '#06b6d4', '#a855f7', '#22c55e', '#6366f1'];

/**
 * Root-position-only fretboard positions for ANY CHORD_FORMULAS entry
 * (major/minor/diminished/augmented/sus, or any 7th/9th/13th chord) on any
 * root -- unlike buildShapePositions/getChordShape above (which only know
 * triads and their 3 hand-picked inversions, built from harmonizeMajorScale
 * diatonic chords), this covers every chord type this app knows, always as
 * root position, searching for the root starting at `startString` (see
 * gt-fretboard.js#_currentStartingStringIndex) -- the root lands there or
 * on whichever string above it first sounds it, the same "search from here,
 * never below" convention the scale-walk's Starting string control uses.
 * Used by the "What is a chord?" lesson's Chord type selector.
 */
export function buildFormulaChordPositions(rootPc, rootName, formulaEntry, showNoteNames, startString = 0) {
  const tonePcs = formulaEntry.semitones.map((s) => (rootPc + s) % 12);
  const pcToIndex = new Map(tonePcs.map((pc, i) => [pc, i]));
  const names = spellFormulaNotes(rootPc, rootName, formulaEntry);
  const shape = generateChordShape(tonePcs, tonePcs[0], startString);
  if (!shape) return [];
  return shape
    .map((fret, s) => {
      if (fret === null) return null;
      const pc = (STANDARD_TUNING[s] + fret) % 12;
      const i = pcToIndex.get(pc);
      if (i === undefined) return null;
      return {
        string: s,
        fret,
        label: showNoteNames ? names[i] : formulaEntry.formula[i],
        color: FORMULA_TONE_COLORS[i % FORMULA_TONE_COLORS.length],
      };
    })
    .filter(Boolean);
}

// Root/3rd/5th/7th/9th/13th, in the fixed order harmonizeMajorScale's own
// EXTENSION_STEPS stacks them -- used for degree labels on an extended
// diatonic chord (see buildExtendedChordPositions), since a diatonic 9th/
// 13th on some degrees (e.g. a half-diminished 9th on vii) has no single
// named CHORD_FORMULAS entry to pull interval symbols from.
const DIATONIC_DEGREE_LABELS = ['1', '3', '5', '7', '9', '13'];

/**
 * Root-position-only fretboard positions for an extended (7th/9th/13th)
 * DIATONIC chord -- i.e. one of harmonizeMajorScale(rootPc, extension)'s
 * own chords, which (unlike buildFormulaChordPositions above) isn't
 * necessarily a single named CHORD_FORMULAS entry (a diatonic 9th/13th on
 * the vii degree, for instance, is half-diminished plus extensions that
 * have no standard chord name). Works straight off `c.notes` -- whatever
 * harmonizeMajorScale already spelled out -- rather than a formula's own
 * semitones/labels. Used by the Chords lesson's Chord color selector.
 */
export function buildExtendedChordPositions(c, showNoteNames, startString = 0) {
  const tonePcs = c.notes.map(noteNameToPitchClass);
  const pcToIndex = new Map(tonePcs.map((pc, i) => [pc, i]));
  const shape = generateChordShape(tonePcs, tonePcs[0], startString);
  if (!shape) return [];
  return shape
    .map((fret, s) => {
      if (fret === null) return null;
      const pc = (STANDARD_TUNING[s] + fret) % 12;
      const i = pcToIndex.get(pc);
      if (i === undefined) return null;
      return {
        string: s,
        fret,
        label: showNoteNames ? c.notes[i] : (DIATONIC_DEGREE_LABELS[i] ?? '?'),
        color: FORMULA_TONE_COLORS[i % FORMULA_TONE_COLORS.length],
      };
    })
    .filter(Boolean);
}

/**
 * Strum c's shape in the given inversion (default root position). `onNote`,
 * if given, fires (midi) for each note at the exact moment it's plucked --
 * lets a caller flash that note on the fretboard in sync with the strum
 * instead of lighting the whole shape up all at once. Notes always strum in
 * ascending pitch order -- the inversion's own bass tone (root for root
 * position, 3rd for 1st, 5th for 2nd) has to sound first, which only holds
 * if it's genuinely the lowest note played, not just whatever string index
 * happens to come first in the shape array.
 *
 * `strumSeconds` defaults to a quick, realistic 0.06s strum (used by the
 * Chords lesson / clicking a chord card directly) -- pass a larger value
 * for ear training, so each note in the chord rings out distinctly instead
 * of blurring together in under a third of a second.
 *
 * `noteDuration`, if given, overrides how long each note rings for (see
 * playChordMidi) -- e.g. a single long drone strum meant to ring under an
 * entire demo instead of the usual short strum-and-decay.
 *
 * `gainScale` (see playChordMidi) scales the chord's own volume down
 * relative to its normal strum -- e.g. a drone meant to sit quietly under
 * melody notes played at their own default volume.
 */
export function playChordAudio(c, inversion = 'root', onNote, strumSeconds = 0.06, noteDuration, gainScale) {
  const shape = getChordShape(c, inversion);
  if (!shape) return;
  const midiNotes = shape
    .map((fret, s) => (fret === null ? null : STANDARD_TUNING_MIDI[s] + fret))
    .filter((m) => m !== null)
    .sort((a, b) => a - b);
  playChordMidi(midiNotes, strumSeconds, onNote, noteDuration, gainScale);
}

/**
 * Strums an already-built position list (see buildFormulaChordPositions
 * above) -- unlike playChordAudio, which re-derives a shape from
 * getChordShape's fixed triad inversions, this just plays exactly the
 * frets positions already settled on, since arbitrary CHORD_FORMULAS
 * chords have no such fixed-inversion shape to re-derive from.
 */
export function playFormulaChordAudio(positions, onNote, strumSeconds = 0.06) {
  const midiNotes = positions
    .map(({ string: s, fret: f }) => STANDARD_TUNING_MIDI[s] + f)
    .sort((a, b) => a - b);
  playChordMidi(midiNotes, strumSeconds, onNote);
}
