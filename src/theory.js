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

// Letter-stepping data for spellFormulaNotes() -- the natural (no-accidental)
// pitch class of each of the 7 letter names, used to figure out which LETTER
// a formula's scale degree implies before working out what accidental (if
// any) is needed to actually reach the formula's semitone target.
const NATURAL_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACCIDENTAL_SYMBOL = { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' };

/**
 * Spells a chord formula's notes with real letter names + accidentals (e.g.
 * a minor formula's "♭3" on root C as "E♭") instead of pitchClassName()'s
 * always-sharp enharmonic ("D#") -- follows the formula's own numeral
 * (compound 9ths/13ths collapse to the same letter as 2/6) and accidental
 * prefix to pick the correct LETTER first, then derives whatever accidental
 * lands on the formula's actual semitone offset from rootPc/rootName.
 * rootName's first character must be the natural letter (e.g. "C" from
 * both "C" and "C#") -- true for every name in NOTE_NAMES.
 */
export function spellFormulaNotes(rootPc, rootName, formulaEntry) {
  const rootLetterIndex = NATURAL_LETTERS.indexOf(rootName[0]);
  return formulaEntry.formula.map((symbol, i) => {
    const match = symbol.match(/^(♭|♯|𝄫|𝄪)?(\d+)$/);
    const numeral = Number(match[2]);
    const baseDegree = ((numeral - 1) % 7) + 1; // 9 -> same letter as 2, 13 -> same letter as 6, ...
    const letter = NATURAL_LETTERS[(rootLetterIndex + baseDegree - 1) % 7];
    const naturalPc = NATURAL_LETTER_PC[letter];
    const targetPc = (rootPc + formulaEntry.semitones[i]) % 12;
    let diff = ((targetPc - naturalPc) % 12 + 12) % 12;
    if (diff > 6) diff -= 12;
    return `${letter}${ACCIDENTAL_SYMBOL[diff] ?? ''}`;
  });
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

// How many extra thirds get stacked on top of each degree's root, in scale
// STEPS (not semitones) -- 0=root, 2=3rd, 4=5th, 6=7th, 8=9th, 12=13th.
// '13th' skips step 10 (the 11th) -- it clashes with the 3rd, the same
// convention CHORD_FORMULAS' own 13th entries already use.
const EXTENSION_STEPS = {
  triad: [0, 2, 4],
  '7th': [0, 2, 4, 6],
  '9th': [0, 2, 4, 6, 8],
  '13th': [0, 2, 4, 6, 8, 12],
};

/**
 * Harmonize a major scale: build a chord on every scale degree by stacking
 * diatonic thirds, using only notes that belong to the scale -- not a fixed
 * major-3rd/perfect-5th every time. This is what actually produces the
 * mixed major/minor/diminished quality of the diatonic I-vii triads, not a
 * lookup table of pre-known answers.
 *
 * `extension` ('triad' | '7th' | '9th' | '13th', default 'triad') stacks
 * that many more diatonic thirds on top -- e.g. harmonizing the C major
 * scale in 7ths gives Cmaj7, Dm7, Em7, Fmaj7, G7, Am7, Bm7♭5, the standard
 * textbook "harmonize the scale in 7ths" result, entirely from scale-step
 * math, not a hand-written answer per degree. `quality` (major/minor/
 * diminished, used for card coloring etc.) always reflects the underlying
 * TRIAD regardless of extension -- a degree's color doesn't change just
 * because it's being shown as a 7th/9th/13th chord.
 */
export function harmonizeMajorScale(rootPc, extension = 'triad') {
  const steps = EXTENSION_STEPS[extension] ?? EXTENSION_STEPS.triad;

  return SCALE_STEP_SEMITONES.map((offset, i) => {
    const degreePc = (rootPc + offset) % 12;

    const tonePcs = steps.map((n) => {
      const idx = (i + n) % 7;
      const octaveBump = Math.floor((i + n) / 7) * 12;
      return (rootPc + SCALE_STEP_SEMITONES[idx] + octaveBump) % 12;
    });
    const semitonesFromDegree = tonePcs.map((pc) => ((pc - degreePc) % 12 + 12) % 12);
    const [, thirdSemitones, fifthSemitones] = semitonesFromDegree;

    let quality;
    if (thirdSemitones === 4 && fifthSemitones === 7) quality = 'major';
    else if (thirdSemitones === 3 && fifthSemitones === 7) quality = 'minor';
    else if (thirdSemitones === 3 && fifthSemitones === 6) quality = 'diminished';
    else quality = 'other';

    const numeral = String(i + 1);
    const nashville = quality === 'major' ? numeral
      : quality === 'minor' ? `${numeral}−`
      : `${numeral}°`;

    const rootName = pitchClassName(degreePc);

    // The 4-note (7th-chord) quality always matches exactly one of
    // CHORD_FORMULAS' 4 shapes a major scale's own diatonic harmony can
    // produce (Δ7 / 7 / m7 / ø7) -- used as the suffix base for 7th/9th/
    // 13th chordNames, since a 9th/13th built on some degrees (e.g. the
    // vii, half-diminished) has no single named CHORD_FORMULAS entry of
    // its own to look up directly.
    let chordName = `${rootName}${quality === 'minor' ? 'm' : quality === 'diminished' ? 'dim' : ''}`;
    if (extension !== 'triad') {
      const seventhSemitones = semitonesFromDegree[3] % 12;
      const seventhMatch = CHORD_FORMULAS.find((f) => f.semitones.length === 4
        && f.semitones[1] % 12 === thirdSemitones && f.semitones[2] % 12 === fifthSemitones
        && f.semitones[3] % 12 === seventhSemitones);
      // Every CHORD_FORMULAS 7th-chord suffix ends in the character '7'
      // (Δ7 / 7 / m7 / ø7) -- a 9th/13th chord REPLACES that trailing 7
      // with 9/13 (jazz notation: "maj7 + a 9th" is written maj9, not
      // "maj79"), it doesn't append after it.
      const seventhSuffix = seventhMatch?.suffix ?? '7';
      const suffix = extension === '7th' ? seventhSuffix : seventhSuffix.replace(/7$/, extension === '9th' ? '9' : '13');
      chordName = `${rootName}${suffix}`;
    }

    return {
      degree: i + 1,
      quality,
      nashville,
      rootName,
      chordName,
      notes: tonePcs.map(pitchClassName),
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
