/**
 * Web Audio note player using Karplus-Strong plucked-string synthesis --
 * the classic physical-modeling technique for guitar/harp/banjo tones (a
 * short burst of noise fed through a decaying delay line), instead of a
 * bare oscillator tone. No sample files needed, still a no-build static
 * site. Browsers block audio until a user gesture starts the AudioContext
 * -- the "turn on audio" button in index.html is that gesture.
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

/** Keeps a page's visible audio-toggle button in sync with the actual enabled state. */
export function syncAudioToggleButton(btn, onLabel = '🔊 Audio on') {
  btn.setAttribute('aria-pressed', String(enabled));
  btn.textContent = enabled ? onLabel : '🔇 Turn on audio';
}

function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Karplus-Strong: seed a ring buffer the length of one waveform period with
 * white noise (the "pluck"), then repeatedly play it back while averaging
 * each sample with the one before it and decaying slightly -- that simple
 * feedback loop is what turns a burst of noise into a naturally decaying,
 * string-like tone. Precomputed into a plain buffer (rather than a live
 * feedback loop) so it plays through an ordinary AudioBufferSourceNode, no
 * AudioWorklet needed.
 */
function buildPluckBuffer(frequency, duration, decay) {
  const sampleRate = ctx.sampleRate;
  const periodSamples = Math.max(2, Math.round(sampleRate / frequency));
  const totalSamples = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
  const data = buffer.getChannelData(0);

  const ring = new Float32Array(periodSamples);
  for (let i = 0; i < periodSamples; i++) ring[i] = Math.random() * 2 - 1;

  let prev = 0;
  for (let i = 0; i < totalSamples; i++) {
    const idx = i % periodSamples;
    const sample = ring[idx];
    data[i] = sample;
    ring[idx] = decay * 0.5 * (sample + prev);
    prev = sample;
  }
  return buffer;
}

/**
 * @param brightness lowpass cutoff (Hz) -- lower = warmer/rounder (bass
 * strings), higher = brighter/more pick attack (treble strings).
 * @param decay Karplus-Strong per-cycle decay (closer to 1 = slower internal
 * decay, i.e. more audible sustain) -- must be paired with a long enough
 * `duration` or the tone dies out before the buffer/envelope ends anyway.
 */
export function playMidi(midi, duration = 1.4, peakGain = 0.3, brightness = 3200, decay = 0.997) {
  if (!enabled || !ctx) return;
  const frequency = midiToFrequency(midi);
  const buffer = buildPluckBuffer(frequency, duration, decay);

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = brightness;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(peakGain, ctx.currentTime + 0.005); // fast pick attack
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration); // fades out cleanly, no click at stop()

  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start();
  source.stop(ctx.currentTime + duration);
}

/**
 * Play a set of MIDI notes as a soft strum (staggered starts) rather than
 * all at once. The first note is treated as the bass (root-position and
 * inversion shapes are always built low string to high, so midiNotes[0] is
 * always the lowest-pitched note) and gets extra volume, length, and a
 * warmer (lower-brightness) tone -- otherwise a single low bass note is
 * easy to lose under five other simultaneous plucks, and different
 * inversions (which only really differ in that one bass note) end up
 * sounding identical. A chord rings out long after the strum, like a real
 * acoustic guitar left to sustain -- both a long duration AND a slower
 * decay rate (0.9985), since a long duration alone just pads the tail with
 * silence once the tone has already died out.
 */
export function playChordMidi(midiNotes, strumSeconds = 0.06) {
  midiNotes.forEach((midi, i) => {
    const isBass = i === 0;
    setTimeout(
      () => playMidi(midi, isBass ? 4.5 : 3.5, isBass ? 0.35 : 0.22, isBass ? 2200 : 3400, 0.9985),
      i * strumSeconds * 1000
    );
  });
}
