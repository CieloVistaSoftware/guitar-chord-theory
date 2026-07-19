/**
 * Renders the two reference tables on spellings.html:
 *  - a glossary of chord formulas (1-3-5, 1-♭3-5, etc.) and their names,
 *    each with a real spelled-out example in the key of C
 *  - every key's seven diatonic chords, via the same harmonizeMajorScale()
 *    math the interactive lesson page uses
 * Pure reference data -- no fretboard, no fingerings, works for all 12 keys
 * since it's built from pitch-class math, not the hand-curated shape charts.
 */
import { NOTE_NAMES, pitchClassName, harmonizeMajorScale } from './theory.js';
import { playChordMidi } from './audio.js';

const QUALITY_COLOR = { major: '#22c55e', minor: '#6366f1', diminished: '#ef4444' };
const REFERENCE_OCTAVE = 60; // C4, just for the reference-table preview sound

// Semitone offsets from the root for each named chord formula, plus the
// chord-symbol suffix a guitarist would actually read on a published lead
// sheet (root name + suffix, e.g. root "C" + suffix "m7" -> "Cm7").
// Suffixes use the actual glyphs music publishers print, not spelled-out
// words: ° for diminished, + for augmented, Δ for major (the triangle),
// ø for half-diminished -- "dim"/"aug"/"maj" are informal text substitutes
// for these, not what actually gets engraved. Independent of any specific
// root -- "1-3-5" is Major everywhere, that's the whole point of a formula.
const CHORD_FORMULAS = [
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

function playTriadPreview(pitchClasses) {
  playChordMidi(pitchClasses.map((pc) => REFERENCE_OCTAVE + pc));
}

/** rootPc/rootName pick which key the "Example" column and the click-to-hear preview use. */
export function renderFormulaTable(container, rootPc = 0, rootName = 'C') {
  container.innerHTML = `
    <div class="cs-formula-table">
      <div class="cs-formula-row cs-formula-row--header">
        <div class="cs-formula-row__symbol">Chord Symbol</div>
        <div class="cs-formula-row__name">Name</div>
        <div class="cs-formula-row__formula">Formula</div>
        <div class="cs-formula-row__example">Example (in ${rootName})</div>
      </div>
      ${CHORD_FORMULAS.map((f) => {
        const names = f.semitones.map((s) => pitchClassName(rootPc + s));
        // Absolute semitone offsets (not wrapped to a pitch class) so the
        // example always plays in ascending pitch order, whatever the root.
        const midiNotes = f.semitones.map((s) => REFERENCE_OCTAVE + rootPc + s);
        const chordSymbol = `${rootName}${f.suffix}`;
        return `
          <button type="button" class="cs-formula-row" style="--quality-color:${f.color}" data-midi="${midiNotes.join(',')}" aria-label="Play ${chordSymbol} (${f.name})">
            <div class="cs-formula-row__symbol">${chordSymbol}</div>
            <div class="cs-formula-row__name">${f.name}</div>
            <div class="cs-formula-row__formula">${f.formula.join(' – ')}</div>
            <div class="cs-formula-row__example">${names.join(' – ')}</div>
          </button>`;
      }).join('')}
    </div>
  `;

  container.querySelectorAll('.cs-formula-row[data-midi]').forEach((row) => {
    row.addEventListener('click', () => {
      const midiNotes = row.dataset.midi.split(',').map(Number);
      playChordMidi(midiNotes);
    });
  });
}

export function renderDiatonicTable(container) {
  container.innerHTML = `
    <div class="cs-diatonic-table">
      ${NOTE_NAMES.map((keyName, keyPc) => {
        const chords = harmonizeMajorScale(keyPc);
        return `
          <div class="cs-diatonic-row">
            <div class="cs-diatonic-row__key">${keyName}</div>
            <div class="cs-diatonic-row__chords">
              ${chords.map((c) => `
                <button type="button" class="cs-diatonic-chip" style="--quality-color:${QUALITY_COLOR[c.quality]}"
                        data-pcs="${c.notes.map((n) => NOTE_NAMES.indexOf(n)).join(',')}"
                        aria-label="Play ${c.chordName} in the key of ${keyName}">
                  <span class="cs-diatonic-chip__nashville">${c.nashville}</span>
                  <span class="cs-diatonic-chip__name">${c.chordName}</span>
                  <span class="cs-diatonic-chip__notes">${c.notes.join('-')}</span>
                </button>
              `).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  container.querySelectorAll('.cs-diatonic-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const pcs = chip.dataset.pcs.split(',').map(Number);
      playTriadPreview(pcs);
    });
  });
}
