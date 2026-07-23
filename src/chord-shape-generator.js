import { STANDARD_TUNING } from './theory.js';

const MAX_FRET = 4; // open-position window, matching the hand-verified C shapes

/**
 * Derive a playable chord shape purely from its spelling (a list of pitch
 * classes -- 3 for a triad, up to 6 for a 13th chord) -- no per-chord
 * hardcoded data, so this covers every key and every chord type. Same
 * method the hand-verified C-major shapes in chord-inversions.js were
 * built with: find the lowest string/fret (starting the search at
 * `startString`, default the 6th/low E -- see gt-fretboard.js's Starting
 * string control for why this needs to be searchable from elsewhere) that
 * sounds `bassPc` (root for root position, 3rd for 1st inversion, 5th for
 * 2nd, ...), mute everything lower-pitched than that string (otherwise the
 * bass tone wouldn't really be the lowest note), then fill every string
 * above it with the lowest fret (0-4) that sounds any of the chord tones --
 * muted if none do.
 *
 * Every pitch class appears somewhere in frets 0-4 across these six
 * strings, so a bass string/fret always exists (as long as startString
 * still leaves at least one string to search); returns null only if that
 * invariant is ever violated.
 *
 * Filling the strings above the bass uses maximum bipartite matching
 * (Kuhn's algorithm, augmenting paths) between remaining chord tones and
 * remaining strings, not just a left-to-right per-string scan -- a triad's
 * 3 tones always had more string "slots" than they needed, so a simple scan
 * never mattered, but a 9th/13th chord can have as many tones as there are
 * strings left to cover them. A simple greedy assignment (even scarcest-
 * tone-first) can still lose a tone to a tie it happens to resolve the
 * wrong way -- e.g. a Major 9th chord's 3rd and 5th each fitting exactly
 * two strings, and grabbing the "wrong" one first can leave no string left
 * for the 9th even though a valid full assignment exists. Augmenting-path
 * search tries every possible reassignment chain before giving up on a
 * tone, so it always finds the true maximum coverage this fret window
 * allows -- cheap enough here (at most 6 tones x 5 strings). Any string
 * still left over afterward just doubles an already-covered tone rather
 * than staying muted.
 */
export function generateChordShape(tonePcs, bassPc, startString = 0) {
  const toneSet = new Set(tonePcs);

  let bassString = null;
  let bassFret = null;
  outer:
  for (let s = startString; s < 6; s++) {
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

  const availableStrings = [];
  for (let s = bassString + 1; s < 6; s++) availableStrings.push(s);

  const remainingTones = tonePcs.filter((pc) => pc !== bassPc);
  const candidatesByTone = remainingTones.map((pc) => availableStrings
    .map((s) => {
      for (let f = 0; f <= MAX_FRET; f++) {
        if ((STANDARD_TUNING[s] + f) % 12 === pc) return { string: s, fret: f };
      }
      return null;
    })
    .filter(Boolean));

  // string -> { toneIndex, fret } currently holding it.
  const stringAssignment = new Map();
  function tryAssign(toneIndex, visited) {
    for (const candidate of candidatesByTone[toneIndex]) {
      if (visited.has(candidate.string)) continue;
      visited.add(candidate.string);
      const current = stringAssignment.get(candidate.string);
      if (!current || tryAssign(current.toneIndex, visited)) {
        stringAssignment.set(candidate.string, { toneIndex, fret: candidate.fret });
        return true;
      }
    }
    return false;
  }
  for (let i = 0; i < remainingTones.length; i++) tryAssign(i, new Set());
  for (const [s, { fret }] of stringAssignment) shape[s] = fret;

  // Any string still unassigned just gets whatever chord tone it can reach
  // lowest -- doubling an already-covered tone rather than staying muted.
  for (const s of availableStrings) {
    if (shape[s] !== null) continue;
    for (let f = 0; f <= MAX_FRET; f++) {
      if (toneSet.has((STANDARD_TUNING[s] + f) % 12)) {
        shape[s] = f;
        break;
      }
    }
  }

  return shape;
}
