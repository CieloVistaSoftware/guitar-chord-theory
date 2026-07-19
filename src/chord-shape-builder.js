/**
 * Shared logic for turning a chord ({ chordName, quality, notes }) into
 * fretboard positions, inversion summaries, and playable audio -- used by
 * both <gt-diatonic-chords> (the lesson page) and the Songs page, so the
 * two never duplicate this math.
 */
import { STANDARD_TUNING, STANDARD_TUNING_MIDI, noteNameToPitchClass, pitchClassName } from './theory.js';
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
  return generateChordShape(rootPc, thirdPc, fifthPc, bassPc);
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

/** Package the { positionsByInversion, inversionSummary, showNoteNames } payload a gt:chord-shape-selected event needs. */
export function buildChordShapeEventDetail(c, showNoteNames) {
  const positionsByInversion = {
    root: buildShapePositions(c, showNoteNames, 'root'),
    first: buildShapePositions(c, showNoteNames, 'first'),
    second: buildShapePositions(c, showNoteNames, 'second'),
  };
  return { name: c.chordName, positionsByInversion, inversionSummary: buildInversionSummary(c), showNoteNames };
}

/** Strum c's shape in the given inversion (default root position). */
export function playChordAudio(c, inversion = 'root') {
  const shape = getChordShape(c, inversion);
  if (!shape) return;
  const midiNotes = shape
    .map((fret, s) => (fret === null ? null : STANDARD_TUNING_MIDI[s] + fret))
    .filter((m) => m !== null);
  playChordMidi(midiNotes);
}
