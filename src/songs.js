/**
 * Renders the Songs page: one song at a time, always directly under the
 * fretboard (matching the lesson page's "fretboard directly on top of the
 * chords" layout), picked via a dropdown -- not a long scrolling list.
 * The song itself is a real wb-starter <wb-card> (reused from the library,
 * not a hand-rolled lookalike), enhanced via WB.scan() after each render.
 *
 * Songs are stored as Nashville-number formulas (scale degrees, not fixed
 * chord names) so the song's own "Play in" key selector can transpose it
 * live via the same harmonizeMajorScale() math the rest of the app uses.
 * In the song's original key of C every resulting chord has a verified
 * fingering; transposing to another key may land on a chord we haven't
 * hand-verified a shape for yet -- that chip just says so, same honesty
 * the lesson and spellings pages use for out-of-C chords.
 *
 * Each song has one or more named sections (Verse/Chorus) -- only added
 * where there's a genuine, well-known harmonic difference between them;
 * songs that loop the same handful of chords throughout just get one
 * section, honestly labeled "Chords" rather than a fabricated "chorus".
 * Timing is bars-per-chord at a user-set tempo (a "Tempo" slider, same
 * pattern as the lesson page), not a claim about any specific recording's
 * exact tempo -- that's real musical time (bars/BPM), just adjustable
 * rather than one fixed guessed number.
 */
import { NOTE_NAMES, harmonizeMajorScale, noteNameToPitchClass } from './theory.js';
import { buildChordShapeEventDetail, playChordAudio, SHAPES_BY_INVERSION } from './chord-shape-builder.js';
import { setAudioEnabled } from './audio.js';

const BARS_PER_CHORD = 2; // 4/4 time -- a common, simple practice pattern for these progressions
const DEFAULT_BPM = 90;

// degrees are Nashville numbers (1-7) in section order. Chords intentionally
// repeat across songs -- that's the point: a handful of scale degrees
// covers a huge amount of real music.
export const SONGS = [
  {
    title: 'Let It Be', artist: 'The Beatles',
    sections: [
      { name: 'Verse', degrees: [1, 5, 6, 4] },
      { name: 'Chorus', degrees: [6, 5, 4, 1] },
    ],
  },
  { title: 'No Woman No Cry', artist: 'Bob Marley', sections: [{ name: 'Chords', degrees: [1, 5, 6, 4] }] },
  { title: "I'm Yours", artist: 'Jason Mraz', sections: [{ name: 'Chords', degrees: [1, 5, 6, 4] }] },
  { title: 'Stand By Me', artist: 'Ben E. King', sections: [{ name: 'Chords', degrees: [1, 6, 4, 5] }] },
  { title: 'Twist and Shout', artist: 'The Beatles', sections: [{ name: 'Chords', degrees: [1, 4, 5, 4] }] },
  { title: 'La Bamba', artist: 'Ritchie Valens', sections: [{ name: 'Chords', degrees: [1, 4, 5] }] },
  {
    title: 'Hallelujah', artist: 'Leonard Cohen',
    sections: [
      { name: 'Verse', degrees: [1, 6, 1, 6] },
      { name: 'Chorus', degrees: [4, 5, 6, 4, 5, 1] },
    ],
  },
];

function nashvilleFormula(degrees) {
  return degrees.join(' – ');
}

function msPerChord(bpm) {
  return BARS_PER_CHORD * 4 * (60000 / bpm); // bars * beats/bar * ms/beat
}

/**
 * @param container element to render into
 * @param onChordSelected (detail) => void -- forwards to fretboard.showChordShape(...)
 * @param scanFn (element) => void -- WB.scan(element), enhances the freshly-rendered <wb-card>
 */
export function renderSongs(container, onChordSelected, scanFn) {
  let currentSongIndex = 0;
  let currentSectionIndex = 0;
  let songKey = 'C';
  let bpm = DEFAULT_BPM;
  let isPlaying = false;
  const selectedByChip = new WeakMap(); // per-chip toggle state (interval vs note names)

  function currentSection() {
    return SONGS[currentSongIndex].sections[currentSectionIndex];
  }

  function currentChords() {
    return harmonizeMajorScale(noteNameToPitchClass(songKey));
  }

  function renderChips(chordsEl) {
    const section = currentSection();
    const song = SONGS[currentSongIndex];
    const scaleChords = currentChords();
    chordsEl.innerHTML = section.degrees.map((degree, i) => {
      const c = scaleChords[degree - 1];
      const hasShape = !!SHAPES_BY_INVERSION.root[c.chordName];
      return `
        <button type="button" class="cs-song-chip ${hasShape ? '' : 'cs-song-chip--no-shape'}"
                data-index="${i}" aria-label="Play ${c.chordName} from ${song.title}"
                title="${hasShape ? '' : 'No fingering chart yet for ' + c.chordName}">
          ${c.chordName}
        </button>`;
    }).join('');

    chordsEl.querySelectorAll('.cs-song-chip').forEach((chip, i) => {
      chip.addEventListener('click', () => {
        const c = scaleChords[section.degrees[i] - 1];
        if (!SHAPES_BY_INVERSION.root[c.chordName]) return; // no verified shape/audio for this transposed chord yet

        // First click on a chip always starts fresh on interval labels; only
        // a second (or fourth, sixth...) click on that same chip flips to
        // note names -- same rule as the diatonic chord cards.
        const previouslyShowingNotes = selectedByChip.has(chip) ? selectedByChip.get(chip) : null;
        const showNoteNames = previouslyShowingNotes === null ? false : !previouslyShowingNotes;
        selectedByChip.set(chip, showNoteNames);

        onChordSelected(buildChordShapeEventDetail(c, showNoteNames));
        playChordAudio(c.chordName);
      });
    });
  }

  /** Strum through the current section in order, at the current tempo, highlighting each chip in turn. */
  async function playSong(cardEl, playBtn) {
    if (isPlaying) return;
    isPlaying = true;
    setAudioEnabled(true);
    cardEl.dispatchEvent(new CustomEvent('gt:audio-enabled', { bubbles: true }));
    playBtn.disabled = true;
    playBtn.textContent = '▶ Playing…';

    const section = currentSection();
    const scaleChords = currentChords();
    const chips = cardEl.querySelectorAll('.cs-song-chip');
    const delayMs = msPerChord(bpm);

    for (let i = 0; i < section.degrees.length; i++) {
      chips.forEach((chip) => chip.classList.remove('is-playing'));
      chips[i].classList.add('is-playing');

      const c = scaleChords[section.degrees[i] - 1];
      if (SHAPES_BY_INVERSION.root[c.chordName]) {
        onChordSelected(buildChordShapeEventDetail(c, false));
        playChordAudio(c.chordName);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    chips.forEach((chip) => chip.classList.remove('is-playing'));
    isPlaying = false;
    playBtn.disabled = false;
    playBtn.textContent = '▶ Play song';
  }

  function render() {
    const song = SONGS[currentSongIndex];
    const section = currentSection();

    container.innerHTML = `
      <label class="gt-key-card cs-song-picker">
        Song
        <select class="cs-song-picker-select">
          ${SONGS.map((s, i) => `<option value="${i}" ${i === currentSongIndex ? 'selected' : ''}>${s.title} — ${s.artist}</option>`).join('')}
        </select>
      </label>
      <wb-card class="cs-song-card" data-clickable="false" data-hoverable="false">
        <header>
          <h3 class="cs-song__title">${song.title}</h3>
          <p class="cs-song__artist">${song.artist}</p>
          ${song.sections.length > 1 ? `
            <div class="cs-song__sections">
              ${song.sections.map((s, i) => `
                <button type="button" class="cs-song__section-btn ${i === currentSectionIndex ? 'is-active' : ''}" data-section="${i}">${s.name}</button>
              `).join('')}
            </div>
          ` : `<p class="cs-song__section-label">${section.name}</p>`}
          <p class="cs-song__formula">${nashvilleFormula(section.degrees)}</p>
        </header>
        <main>
          <div class="cs-song__chords"></div>
        </main>
        <footer>
          <button type="button" class="cs-song__play-btn">▶ Play song</button>
          <label class="cs-song__key">
            Play in
            <select class="cs-song-key-select"></select>
          </label>
          <label class="cs-song__tempo">
            Tempo
            <input type="range" class="cs-song-tempo-slider" min="50" max="160" step="5" value="${bpm}">
            <span class="cs-song-tempo-value">${bpm} BPM</span>
          </label>
        </footer>
      </wb-card>
    `;

    container.querySelector('.cs-song-picker-select').addEventListener('change', (e) => {
      currentSongIndex = Number(e.target.value);
      currentSectionIndex = 0;
      songKey = 'C'; // fresh key whenever you switch songs
      render();
    });

    container.querySelectorAll('.cs-song__section-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentSectionIndex = Number(btn.dataset.section);
        render();
      });
    });

    const keySelect = container.querySelector('.cs-song-key-select');
    NOTE_NAMES.forEach((note) => {
      const option = document.createElement('option');
      option.value = note;
      option.textContent = note;
      keySelect.appendChild(option);
    });
    keySelect.value = songKey;
    keySelect.addEventListener('change', () => {
      songKey = keySelect.value;
      renderChips(container.querySelector('.cs-song__chords'));
    });

    const tempoSlider = container.querySelector('.cs-song-tempo-slider');
    const tempoValue = container.querySelector('.cs-song-tempo-value');
    tempoSlider.addEventListener('input', () => {
      bpm = Number(tempoSlider.value);
      tempoValue.textContent = `${bpm} BPM`;
    });

    const cardEl = container.querySelector('.cs-song-card');
    const playBtn = container.querySelector('.cs-song__play-btn');
    playBtn.addEventListener('click', () => playSong(cardEl, playBtn));

    renderChips(container.querySelector('.cs-song__chords'));
    // scan() only enhances DESCENDANTS of the element it's given (it never
    // processes the root itself), so it must be called on the wb-card's
    // *parent* -- passing cardEl directly would silently never enhance it.
    scanFn(container);
  }

  render();
}
