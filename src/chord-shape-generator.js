import { STANDARD_TUNING } from './theory.js';

const MAX_FRET = 4; // open-position window, matching the hand-verified C shapes

/**
 * Derive a playable chord shape purely from its spelling (root/3rd/5th
 * pitch classes) -- no per-chord hardcoded data, so this covers every key.
 * Same method the hand-verified C-major shapes in chord-inversions.js were
 * built with: find the lowest string/fret that sounds `bassPc` (root for
 * root position, 3rd for 1st inversion, 5th for 2nd), mute everything
 * lower-pitched than that string (otherwise the bass tone wouldn't really
 * be the lowest note), then fill every string above it with the lowest
 * fret (0-4) that sounds any of the three chord tones -- muted if none do.
 *
 * Every pitch class appears somewhere in frets 0-4 across these six
 * strings, so a bass string/fret always exists; returns null only if that
 * invariant is ever violated.
 */
export function generateChordShape(rootPc, thirdPc, fifthPc, bassPc) {
  const toneSet = new Set([rootPc, thirdPc, fifthPc]);

  let bassString = null;
  let bassFret = null;
  outer:
  for (let s = 0; s < 6; s++) {
    for (let f = 0; f <= MAX_FRET; f++) {
      if ((STANDARD_TUNING[s] + f) % 12 === bassPc) {
        bassString = s;
        bassFret = f;
        break outer;
      }
    }
  }
  if (bassString === null) return null;

  const shape = new Array(6).fill(null);
  shape[bassString] = bassFret;

  for (let s = bassString + 1; s < 6; s++) {
    for (let f = 0; f <= MAX_FRET; f++) {
      if (toneSet.has((STANDARD_TUNING[s] + f) % 12)) {
        shape[s] = f;
        break;
      }
    }
  }

  return shape;
}
