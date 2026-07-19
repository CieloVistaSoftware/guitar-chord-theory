/**
 * Minimal Web Audio note player. Browsers block audio until a user gesture
 * starts the AudioContext -- the "turn on audio" button in index.html is
 * that gesture.
 */
let ctx = null;
let enabled = false;

export function isAudioEnabled() {
  return enabled;
}

export function setAudioEnabled(next) {
  enabled = next;
  if (enabled) {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  }
  return enabled;
}

export function toggleAudio() {
  return setAudioEnabled(!enabled);
}

function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function playMidi(midi, duration = 0.6, peakGain = 0.25, waveform = 'sine') {
  if (!enabled || !ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = waveform;
  osc.frequency.value = midiToFrequency(midi);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(peakGain, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

/**
 * Play a set of MIDI notes as a soft strum (staggered starts) rather than
 * all at once. The first note is treated as the bass (root-position and
 * inversion shapes are always built low string to high, so midiNotes[0] is
 * always the lowest-pitched note) and gets extra volume, length, and a
 * fuller waveform -- otherwise a single low bass note is easy to lose
 * under five other simultaneous sine tones, and different inversions (which
 * only really differ in that one bass note) end up sounding identical.
 */
export function playChordMidi(midiNotes, strumSeconds = 0.06) {
  midiNotes.forEach((midi, i) => {
    const isBass = i === 0;
    setTimeout(
      () => playMidi(midi, isBass ? 1.3 : 0.9, isBass ? 0.4 : 0.22, isBass ? 'triangle' : 'sine'),
      i * strumSeconds * 1000
    );
  });
}
