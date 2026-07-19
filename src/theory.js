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

const TRIAD_INTERVALS = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
};

/** Build a triad's three pitch classes on any root, independent of any key/scale context. */
export function buildTriad(rootPc, quality) {
  const intervals = TRIAD_INTERVALS[quality];
  if (!intervals) throw new Error(`Unknown triad quality: ${quality}`);
  return intervals.map((semitones) => (rootPc + semitones) % 12);
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
