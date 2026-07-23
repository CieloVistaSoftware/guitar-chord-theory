/**
 * The lesson curriculum. Each entry is one concept plus a `run()` that
 * demonstrates it live on the shared fretboard/chords elements -- adding a
 * new lesson later is just adding an entry here; lesson-player.js reads
 * this list to build the UI and doesn't know about any lesson's specifics.
 *
 * `focusFrets` is the fret range the fretboard zooms to before the lesson
 * runs (see gt-fretboard.js#focusFrets) -- either a fixed [start, end], or
 * a function(fretboard) => [start, end] for lessons whose relevant frets
 * depend on the currently selected key.
 */
import { buildChordShapeEventDetail, buildFormulaChordPositions, playChordAudio, playFormulaChordAudio } from './chord-shape-builder.js';
import { noteNameToPitchClass, modeInfo, harmonizeMajorScale, CHORD_FORMULAS } from './theory.js';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildLessons({ diatonicChords }) {
  return [
    {
      id: 'what-is-a-chord',
      title: 'What is a chord?',
      blurb: 'A chord needs at least 3 notes. A major chord is spelled 1 – 3 – 5.',
      sectionId: 'what-is-a-chord',
      focusFrets: [0, 4],
      // No notesPerString here on purpose -- this lesson shows one chord
      // shape, not a scale walk, so that control would do nothing. chordType
      // (the Chord type select, see index.html) drives which CHORD_FORMULAS
      // entry gets built below -- major/minor/diminished/augmented/sus, or
      // any 7th/9th/13th "color", not just the fixed major triad this
      // lesson used to always show.
      modalControls: ['tempo', 'chordType'],
      async run({ fretboard, showModal, getNoteDelayMs }) {
        await showModal(document.getElementById('what-is-a-chord'));

        const rootName = fretboard.rootNote;
        const rootPc = noteNameToPitchClass(rootName);
        // Honors the Starting string control -- the chord's root lands on
        // that string (or the next one up that actually sounds it), the
        // same "search from here, never below" convention the scale-walk's
        // Starting string uses (see gt-fretboard.js#_currentStartingStringIndex).
        const startString = Number(document.querySelector('.gt-starting-string-select')?.value ?? 0);
        const chordTypeSelect = document.querySelector('.gt-chord-type-select');
        const formulaEntry = CHORD_FORMULAS.find((f) => f.name === chordTypeSelect?.value) || CHORD_FORMULAS[0];

        const positions = buildFormulaChordPositions(rootPc, rootName, formulaEntry, false, startString);
        if (!positions.length) return;
        const chordName = `${rootName}${formulaEntry.suffix}`;
        // rootOnly:true -- this isn't a harmonizeMajorScale() diatonic
        // triad, so there's no 1st/2nd inversion or scale-degree picker for
        // it, just the one root-position voicing (see showChordShape).
        fretboard.showChordShape(chordName, { root: positions, first: positions, second: positions }, null, false, undefined, true);

        // The Note Speed slider controls this strum too -- otherwise it's a
        // control visibly on screen that does nothing for this lesson.
        const strumSeconds = getNoteDelayMs() / 1000;
        playFormulaChordAudio(positions, (midi) => fretboard.pulseNote(midi), strumSeconds);
        await wait(Math.max(3200, strumSeconds * 1000 * positions.length + 1000));
      },
    },
    {
      id: 'major-scale',
      title: 'The major scale, string by string',
      blurb: 'The whole scale laid out across all six strings, one degree at a time.',
      sectionId: 'scale-lesson',
      // The scale run always starts on the 6th string's root (gt-fretboard.js
      // rootFretOnSixthString/playScaleDemo) -- that fret is different in
      // every key, so the zoom has to be computed fresh, not hard-coded.
      // +12 frets of width comfortably fits the default 3-notes-per-string
      // pattern (spans a couple octaves across the neck), not just the
      // shorter one-octave walk.
      focusFrets: (fretboard) => {
        const rootFret = fretboard.rootFretOnSixthString();
        return [rootFret, rootFret + 12];
      },
      modalControls: ['tempo', 'timeSignature', 'notesPerString'],
      async run({ fretboard, showModal, getNoteDelayMs, getNotesPerString, getDirection, getTimeSignature }) {
        await showModal(document.getElementById('scale-lesson'));
        // Pass every getter itself, not a snapshot -- so dragging the tempo
        // slider, changing Notes-per-string, switching direction, or
        // picking a different time signature mid-playthrough affects the
        // very next note/string, not just the next full run.
        await fretboard.playScaleDemo(getNoteDelayMs, getNotesPerString, getDirection, getTimeSignature);
      },
    },
    {
      id: 'chords',
      title: 'Chords',
      blurb: 'All seven diatonic chords in the key, strummed and highlighted in order.',
      sectionId: 'chords-lesson',
      focusFrets: [0, 4],
      modalControls: ['chordDelay', 'notesPerString'],
      async run({ fretboard, diatonicChords, highlightSection, showModal, getChordDelayMs }) {
        const section = document.getElementById('chords-lesson');
        await highlightSection(section); // reveals the actual chords grid, inline and scrolls to it
        // narration + gives Loop access to Replay/Loop/tempo -- skip the
        // modal's own scroll-to-fretboard-card: this lesson stays inside the
        // grid highlightSection just scrolled to (updateFretboard:true
        // below still keeps the big fretboard's own shape in sync as each
        // chord plays, just without re-scrolling the page to it).
        await showModal(section, { scrollToFretboard: false });

        // The getter itself, not a snapshot -- so dragging the chord-delay
        // slider mid-playthrough changes the very next chord, not just the
        // next full run (same live pattern as the scale lesson's tempo).
        // updateFretboard:true -- the big fretboard shows each chord's own
        // playable shape as it plays, not just the small cards in the grid.
        await diatonicChords.playAll(getChordDelayMs, { updateFretboard: true });

        // Looping this lesson should honor all three inversions, not just
        // repeat Root Position forever -- advance to the next one so the
        // NEXT pass (Replay, or the next Loop iteration) plays it.
        const nextInversion = { root: 'first', first: 'second', second: 'root' }[fretboard.getInversion()];
        fretboard.setInversion(nextInversion);
      },
    },
    {
      id: 'modes',
      title: 'The 7 modes of the major scale',
      blurb: 'Same notes, different starting point -- hear how each mode sounds.',
      sectionId: 'modes-lesson',
      // No fixed crop -- auto-centering (gt-fretboard.js#_effectiveFocusRange)
      // zooms to wherever this mode's own pattern actually falls, same as
      // the main scale lesson, once setWalkAnchor() re-anchors it below.
      // timeSignature is included so the Time signature select AND the
      // Beat counter next to it (both data-control="timeSignature") are
      // visible here -- the mode's chord below re-strikes on beat 1 of
      // every measure, so seeing/changing the time signature matters.
      modalControls: ['tempo', 'mode', 'timeSignature', 'notesPerString'],
      async run({ fretboard, showModal, getNoteDelayMs, getNotesPerString, getDirection, getTimeSignature }) {
        await showModal(document.getElementById('modes-lesson'));
        fretboard.clearFocus();

        const modeSelect = document.querySelector('.gt-mode-select');
        const modeIndex = modeSelect ? Number(modeSelect.value) : 0;
        const parentRootPc = noteNameToPitchClass(fretboard.rootNote);
        const { rootPc: modeRootPc } = modeInfo(parentRootPc, modeIndex);
        // Re-anchors the SAME scale-walk pattern the main scale lesson uses
        // (shared starting fret on the 6th string, walking up to the 1st)
        // at this mode's own tonic instead of the parent key's -- a mode is
        // the parent key's exact 7 notes, just re-rooted, so this shows
        // (and Add Notes extends) only that mode's own box, not the whole
        // neck. See gt-fretboard.js#setWalkAnchor.
        fretboard.setWalkAnchor(modeRootPc);

        // The mode's own tonic triad -- degree modeIndex+1's diatonic chord
        // in the CURRENT key (harmonizeMajorScale's array is already
        // indexed exactly this way: Ionian=I major, Dorian=ii minor,
        // Locrian=vii diminished, etc). Struck once per MEASURE -- on beat
        // 1, held through the rest of that measure (4/4: struck on 1, held
        // through 2-3-4; 3/4: struck on 1, held through 2-3) -- a quiet
        // harmonic "home" (gainScale keeps it well under the melody
        // notes' own volume) the ear can measure every melody note
        // against.
        const modeChord = harmonizeMajorScale(parentRootPc)[modeIndex];
        await fretboard.playScaleDemo(getNoteDelayMs, getNotesPerString, getDirection, getTimeSignature, (measureSeconds) => {
          playChordAudio(modeChord, 'root', (midi) => {
            document.dispatchEvent(new CustomEvent('gt:mode-chord-strummed', { bubbles: true, detail: { midi, chordName: modeChord.chordName } }));
          }, 0.05, measureSeconds, 0.4);
        });
      },
    },
  ];
}
