/**
 * Demonstrates one mode of the current major scale -- Dorian, Phrygian,
 * etc. A mode is the exact same pitch collection as the parent major scale,
 * just re-rooted to a different scale degree (see theory.js#modeInfo), so
 * this walks one octave starting on the MODE's own tonic, not the parent
 * key's. Reuses the fretboard's existing rendered dots/audio (pulseNote +
 * playMidi) rather than adding a parallel rendering path -- see
 * playModeDemo's own note about forcing the Notes-shown view to 'all'
 * first, since the dots needed here are usually a different subset than
 * whatever the notesPerString-capped scale view happens to be showing.
 */
import { STANDARD_TUNING, STANDARD_TUNING_MIDI, fretForPitchClass, modeInfo } from './theory.js';
import { playMidi } from './audio.js';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param fretboard the <gt-fretboard> element (for pulseNote + fretCount)
 * @param parentRootPc pitch class (0-11) of the CURRENT key, e.g. the Key selector's value
 * @param modeIndex 0 (Ionian) through 6 (Locrian)
 * @param delayMs fixed number or a live-getter function, same pattern as playScaleDemo
 */
export async function playModeDemo(fretboard, parentRootPc, modeIndex, delayMs) {
  const { rootPc: modeRootPc, degreeSemitones } = modeInfo(parentRootPc, modeIndex);
  const frets = fretboard.fretCount;
  const rootFret = fretForPitchClass(STANDARD_TUNING[0], modeRootPc);
  const rootMidi = STANDARD_TUNING_MIDI[0] + rootFret;

  let previousMidi = rootMidi;
  for (const semitones of degreeSemitones) {
    const targetPc = (modeRootPc + semitones) % 12;
    let best = null;
    for (let s = 0; s < 6; s++) {
      const openPc = STANDARD_TUNING[s];
      const openMidi = STANDARD_TUNING_MIDI[s];
      for (let f = 0; f <= frets; f++) {
        if ((openPc + f) % 12 !== targetPc) continue;
        const midi = openMidi + f;
        if (midi < previousMidi) continue;
        if (!best || midi < best) best = midi;
      }
    }
    if (best === null) continue;
    previousMidi = best;
    // Same "silent if not visible" rule as the main scale demo (#19) --
    // only play audio for a note that actually has a dot on screen right
    // now to flash. The caller is responsible for making sure the relevant
    // dots exist (see the modes lesson's run(), which forces the
    // Notes-shown view to 'all' first).
    if (fretboard.pulseNote(previousMidi)) playMidi(previousMidi);
    const ms = typeof delayMs === 'function' ? delayMs() : delayMs;
    await wait(ms);
  }
}
