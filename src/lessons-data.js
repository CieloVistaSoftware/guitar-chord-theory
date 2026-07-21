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
import { buildChordShapeEventDetail, playChordAudio } from './chord-shape-builder.js';
import { noteNameToPitchClass, modeInfo, harmonizeMajorScale } from './theory.js';

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
      modalControls: ['tempo'],
      async run({ fretboard, showModal, getNoteDelayMs }) {
        await showModal(document.getElementById('what-is-a-chord'));

        const chord = diatonicChords.getChord(1); // the I chord -- C major in the key of C
        if (!chord) return;
        const detail = buildChordShapeEventDetail(chord, false);
        fretboard.showChordShape(detail.name, detail.positionsByInversion, detail.inversionSummary, detail.showNoteNames);
        // The Note Speed slider controls this strum too -- otherwise it's a
        // control visibly on screen that does nothing for this lesson.
        const strumSeconds = getNoteDelayMs() / 1000;
        playChordAudio(chord, 'root', (midi) => fretboard.pulseNote(midi), strumSeconds);
        await wait(Math.max(3200, strumSeconds * 1000 * 5 + 1000));
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
      modalControls: ['tempo', 'timeSignature'],
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
      modalControls: ['chordDelay'],
      async run({ fretboard, diatonicChords, highlightSection, showModal, getChordDelayMs }) {
        const section = document.getElementById('chords-lesson');
        await highlightSection(section); // reveals the actual chords grid, inline and scrolls to it
        // narration + gives Loop access to Replay/Loop/tempo -- skip the
        // modal's own scroll-to-fretboard-card: this lesson stays inside the
        // grid highlightSection just scrolled to, and never touches the
        // fretboard itself (see diatonicChords.playAll below).
        await showModal(section, { scrollToFretboard: false });

        // The getter itself, not a snapshot -- so dragging the chord-delay
        // slider mid-playthrough changes the very next chord, not just the
        // next full run (same live pattern as the scale lesson's tempo).
        await diatonicChords.playAll(getChordDelayMs);

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
      modalControls: ['tempo', 'mode'],
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
        // Locrian=vii diminished, etc). Strummed alongside every melody
        // note so the ear hears each scale tone against that mode's own
        // harmonic "home," not just in isolation.
        const modeChord = harmonizeMajorScale(parentRootPc)[modeIndex];
        await fretboard.playScaleDemo(getNoteDelayMs, getNotesPerString, getDirection, getTimeSignature, () => {
          playChordAudio(modeChord, 'root', (midi) => {
            document.dispatchEvent(new CustomEvent('gt:mode-chord-strummed', { bubbles: true, detail: { midi, chordName: modeChord.chordName } }));
          });
        });
      },
    },
  ];
}
