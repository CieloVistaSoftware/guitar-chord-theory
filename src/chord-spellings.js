/**
 * Renders the two reference tables on spellings.html:
 *  - a glossary of chord formulas (1-3-5, 1-♭3-5, etc.) and their names,
 *    each with a real spelled-out example in the key of C
 *  - every key's seven diatonic chords, via the same harmonizeMajorScale()
 *    math the interactive lesson page uses
 * Pure reference data -- no fretboard, no fingerings, works for all 12 keys
 * since it's built from pitch-class math, not the hand-curated shape charts.
 */
import { NOTE_NAMES, pitchClassName, harmonizeMajorScale, CHORD_FORMULAS } from './theory.js';
import { playChordMidi, setAudioEnabled } from './audio.js';

const QUALITY_COLOR = { major: '#22c55e', minor: '#6366f1', diminished: '#ef4444' };
const REFERENCE_OCTAVE = 60; // C4, just for the reference-table preview sound

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
      setAudioEnabled(true); // this click is the user gesture the browser needs to unlock audio -- no separate toggle button anymore
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
      setAudioEnabled(true); // this click is the user gesture the browser needs to unlock audio -- no separate toggle button anymore
      const pcs = chip.dataset.pcs.split(',').map(Number);
      playTriadPreview(pcs);
    });
  });
}
