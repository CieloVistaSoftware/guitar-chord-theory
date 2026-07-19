/**
 * Standard open-position fingerings for the seven diatonic chords of C
 * major, low string to high string. fret: null = muted, 0 = open, N = fretted.
 *
 * F has no simple open shape (it's diatonic thirds land a barre chord in
 * open position) -- using the standard 1st-fret barre: 1-3-3-2-1-1.
 * Bdim has no common open-position shape at all; this is a compact,
 * genuinely-diatonic voicing (B-D-F, no doubled non-chord tones) using the
 * A/D/B/e strings.
 */
export const CHORD_SHAPES = {
  C: [null, 3, 2, 0, 1, 0],
  Dm: [null, null, 0, 2, 3, 1],
  Em: [0, 2, 2, 0, 0, 0],
  F: [1, 3, 3, 2, 1, 1],
  G: [3, 2, 0, 0, 0, 3],
  Am: [null, 0, 2, 2, 1, 0],
  Bdim: [null, 2, 0, null, 0, 1],
};
