/**
 * Music theory primitives: pitch classes, intervals, standard tuning.
 * Pitch classes are 0-11 with C = 0 (C, C#, D, D#, E, F, F#, G, G#, A, A#, B).
 */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Standard tuning, low string to high string, as pitch classes. */
export const STANDARD_TUNING = [4, 9, 2, 7, 11, 4]; // E A D G B E
export const STANDARD_TUNING_NAMES = ['E', 'A', 'D', 'G', 'B', 'E'];

/** Same strings, low to high, as real MIDI note numbers (E2 A2 D3 G3 B3 E4) -- for audio playback. */
export const STANDARD_TUNING_MIDI = [40, 45, 50, 55, 59, 64];

/**
 * Interval semitone distance from the root -> { short label, full name }.
 * Only the diatonic major-scale intervals for now (this is the C-major lesson).
 */
export const MAJOR_SCALE_INTERVALS = [
  { semitones: 0, short: 'R', degree: '1', name: 'Root / Unison' },
  { semitones: 2, short: 'M2', degree: '2', name: 'Major 2nd' },
  { semitones: 4, short: 'M3', degree: '3', name: 'Major 3rd' },
  { semitones: 5, short: 'P4', degree: '4', name: 'Perfect 4th' },
  { semitones: 7, short: 'P5', degree: '5', name: 'Perfect 5th' },
  { semitones: 9, short: 'M6', degree: '6', name: 'Major 6th' },
  { semitones: 11, short: 'M7', degree: '7', name: 'Major 7th' },
];

export function pitchClassName(pc) {
  return NOTE_NAMES[((pc % 12) + 12) % 12];
}

export function noteNameToPitchClass(name) {
  const i = NOTE_NAMES.indexOf(name);
  if (i === -1) throw new Error(`Unknown note name: ${name}`);
  return i;
}

// Semitone offsets from the root for each named chord formula, plus the
// chord-symbol suffix a guitarist would actually read on a published lead
// sheet (root name + suffix, e.g. root "C" + suffix "m7" -> "Cm7").
// Suffixes use the actual glyphs music publishers print, not spelled-out
// words: ° for diminished, + for augmented, Δ for major (the triangle),
// ø for half-diminished -- "dim"/"aug"/"maj" are informal text substitutes
// for these, not what actually gets engraved. Independent of any specific
// root -- "1-3-5" is Major everywhere, that's the whole point of a formula.
// The single source of truth for "what notes make up a chord type" --
// spellings.html's formula table and anything else that needs a chord's
// intervals (rather than a specific key's diatonic triads, which come from
// harmonizeMajorScale()'s scale-stacking instead) both read this list.
export const CHORD_FORMULAS = [
  { name: 'Major', suffix: '', formula: ['1', '3', '5'], semitones: [0, 4, 7], color: '#22c55e' },
  { name: 'Minor', suffix: 'm', formula: ['1', '♭3', '5'], semitones: [0, 3, 7], color: '#6366f1' },
  { name: 'Diminished', suffix: '°', formula: ['1', '♭3', '♭5'], semitones: [0, 3, 6], color: '#ef4444' },
  { name: 'Augmented', suffix: '+', formula: ['1', '3', '♯5'], semitones: [0, 4, 8], color: '#f59e0b' },
  { name: 'Sus2', suffix: 'sus2', formula: ['1', '2', '5'], semitones: [0, 2, 7], color: '#06b6d4' },
  { name: 'Sus4', suffix: 'sus4', formula: ['1', '4', '5'], semitones: [0, 5, 7], color: '#06b6d4' },
  { name: 'Major 7th', suffix: 'Δ7', formula: ['1', '3', '5', '7'], semitones: [0, 4, 7, 11], color: '#22c55e' },
  { name: 'Dominant 7th', suffix: '7', formula: ['1', '3', '5', '♭7'], semitones: [0, 4, 7, 10], color: '#a855f7' },
  { name: 'Minor 7th', suffix: 'm7', formula: ['1', '♭3', '5', '♭7'], semitones: [0, 3, 7, 10], color: '#6366f1' },
  { name: 'Half-Diminished 7th', suffix: 'ø7', formula: ['1', '♭3', '♭5', '♭7'], semitones: [0, 3, 6, 10], color: '#ef4444' },
  { name: 'Diminished 7th', suffix: '°7', formula: ['1', '♭3', '♭5', '𝄫7'], semitones: [0, 3, 6, 9], color: '#ef4444' },
  { name: 'Major 9th', suffix: 'Δ9', formula: ['1', '3', '5', '7', '9'], semitones: [0, 4, 7, 11, 14], color: '#22c55e' },
  { name: 'Dominant 9th', suffix: '9', formula: ['1', '3', '5', '♭7', '9'], semitones: [0, 4, 7, 10, 14], color: '#a855f7' },
  { name: 'Minor 9th', suffix: 'm9', formula: ['1', '♭3', '5', '♭7', '9'], semitones: [0, 3, 7, 10, 14], color: '#6366f1' },
  // 13th chords conventionally drop the 11th (it clashes with the 3rd) --
  // this is the standard practical spelling, not a simplification of it.
  { name: 'Major 13th', suffix: 'Δ13', formula: ['1', '3', '5', '7', '9', '13'], semitones: [0, 4, 7, 11, 14, 21], color: '#22c55e' },
  { name: 'Dominant 13th', suffix: '13', formula: ['1', '3', '5', '♭7', '9', '13'], semitones: [0, 4, 7, 10, 14, 21], color: '#a855f7' },
  { name: 'Minor 13th', suffix: 'm13', formula: ['1', '♭3', '5', '♭7', '9', '13'], semitones: [0, 3, 7, 10, 14, 21], color: '#6366f1' },
];

/** Build a chord's pitch classes on any root from its formula name (see CHORD_FORMULAS), independent of any key/scale context. */
export function buildChord(rootPc, formulaName) {
  const formula = CHORD_FORMULAS.find((f) => f.name === formulaName);
  if (!formula) throw new Error(`Unknown chord formula: ${formulaName}`);
  return formula.semitones.map((semitones) => (rootPc + semitones) % 12);
}

/**
 * For a given root pitch class, return the interval (or null) at a fret
 * position on a string with the given open pitch class.
 */
export function intervalAt(rootPc, openPc, fret) {
  const notePc = (openPc + fret) % 12;
  const semitones = ((notePc - rootPc) % 12 + 12) % 12;
  return MAJOR_SCALE_INTERVALS.find((iv) => iv.semitones === semitones) || null;
}

/** The lowest fret (0-11) on a string with the given open pitch class that plays targetPc. */
export function fretForPitchClass(openPc, targetPc) {
  return ((targetPc - openPc) % 12 + 12) % 12;
}

const SCALE_STEP_SEMITONES = MAJOR_SCALE_INTERVALS.map((iv) => iv.semitones); // [0,2,4,5,7,9,11]

/**
 * Harmonize a major scale: build a triad on every scale degree by stacking
 * diatonic thirds (the note two scale-steps up, and four scale-steps up),
 * using only notes that belong to the scale -- not a fixed major-3rd/
 * perfect-5th every time. This is what actually produces the mixed
 * major/minor/diminished quality of the diatonic I-vii chords, not a
 * lookup table of pre-known answers.
 */
export function harmonizeMajorScale(rootPc) {
  return SCALE_STEP_SEMITONES.map((offset, i) => {
    const degreePc = (rootPc + offset) % 12;

    const thirdIdx = (i + 2) % 7;
    const thirdOctaveBump = i + 2 >= 7 ? 12 : 0;
    const thirdPc = (rootPc + SCALE_STEP_SEMITONES[thirdIdx] + thirdOctaveBump) % 12;

    const fifthIdx = (i + 4) % 7;
    const fifthOctaveBump = i + 4 >= 7 ? 12 : 0;
    const fifthPc = (rootPc + SCALE_STEP_SEMITONES[fifthIdx] + fifthOctaveBump) % 12;

    const thirdSemitones = ((thirdPc - degreePc) % 12 + 12) % 12;
    const fifthSemitones = ((fifthPc - degreePc) % 12 + 12) % 12;

    let quality;
    if (thirdSemitones === 4 && fifthSemitones === 7) quality = 'major';
    else if (thirdSemitones === 3 && fifthSemitones === 7) quality = 'minor';
    else if (thirdSemitones === 3 && fifthSemitones === 6) quality = 'diminished';
    else quality = 'other';

    const numeral = String(i + 1);
    const nashville = quality === 'major' ? numeral
      : quality === 'minor' ? `${numeral}−`
      : `${numeral}°`;

    return {
      degree: i + 1,
      quality,
      nashville,
      rootName: pitchClassName(degreePc),
      chordName: `${pitchClassName(degreePc)}${quality === 'minor' ? 'm' : quality === 'diminished' ? 'dim' : ''}`,
      notes: [degreePc, thirdPc, fifthPc].map(pitchClassName),
    };
  });
}

/**
 * A "mode" is just the same major scale's pitch collection, re-rooted to a
 * different scale degree -- Dorian is C major's notes starting from D, not
 * a different set of notes. MODE_NAMES[0] (Ionian) is the major scale
 * itself; MODE_NAMES[i] is what you get treating scale degree i+1 as "the
 * new 1".
 */
export const MODE_NAMES = ['Ionian', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Aeolian', 'Locrian'];

const MODE_STEP_SEMITONES = MAJOR_SCALE_INTERVALS.map((iv) => iv.semitones); // [0,2,4,5,7,9,11]

/**
 * Everything a mode lesson needs for parentRootPc's major scale, re-rooted
 * to scale degree modeIndex+1 (0 = Ionian/the scale's own root, 1 = Dorian
 * on its 2nd degree, etc.):
 *   - rootPc: the mode's own tonic (e.g. D, for Dorian on C major's 2nd degree)
 *   - name: e.g. "D Dorian"
 *   - degreeSemitones: this mode's own 7 scale-step offsets from its tonic,
 *     in ascending order within one octave (e.g. Dorian: [0,2,3,5,7,9,10])
 *     -- this is what actually distinguishes one mode from another, since
 *     the underlying pitch collection never changes.
 */
export function modeInfo(parentRootPc, modeIndex) {
  const rootPc = (parentRootPc + MODE_STEP_SEMITONES[modeIndex]) % 12;
  const degreeSemitones = MODE_STEP_SEMITONES
    .map((s, i) => {
      const stepIdx = (modeIndex + i) % 7;
      const octaveBump = modeIndex + i >= 7 ? 12 : 0;
      return (MODE_STEP_SEMITONES[stepIdx] + octaveBump - MODE_STEP_SEMITONES[modeIndex] + 12) % 12;
    })
    .sort((a, b) => a - b);
  return { rootPc, name: `${pitchClassName(rootPc)} ${MODE_NAMES[modeIndex]}`, degreeSemitones };
}
