/**
 * 1st and 2nd inversion voicings for the 7 diatonic chords in C, to pair
 * with the root-position shapes in chord-shapes.js.
 *
 * Root position = the root is the lowest note. 1st inversion = the 3rd is
 * the lowest note. 2nd inversion = the 5th is the lowest note. Each shape
 * here was derived by searching every open-position fingering (frets 0-4)
 * for the one with the correct bass note that still sounds all three
 * triad tones -- verified by pitch-class math, not copied from a chart.
 * C's are the well-known C/E and C/G shapes; the rest are less "famous"
 * but equally valid, playable voicings.
 */
export const CHORD_INVERSIONS = {
  first: {
    C: [0, 3, 2, 0, 1, 0],
    Dm: [1, 0, 0, 2, 3, 1],
    Em: [3, 2, 2, 0, 0, 0],
    F: [null, 0, 3, 2, 1, 1],
    G: [null, 2, 0, 0, 0, 3],
    Am: [null, 3, 2, 2, 1, 0],
    Bdim: [null, null, 0, 4, 0, 1],
  },
  second: {
    C: [3, 3, 2, 0, 1, 0],
    Dm: [null, 0, 0, 2, 3, 1],
    Em: [null, 2, 2, 0, 0, 0],
    F: [null, 3, 3, 2, 1, 1],
    G: [null, null, 0, 0, 0, 3],
    Am: [0, 0, 2, 2, 1, 0],
    Bdim: [1, 2, 0, 4, 0, 1],
  },
};
