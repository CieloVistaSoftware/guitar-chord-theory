/**
 * Wires the Lessons card: picking an option from the dropdown plays that
 * lesson immediately (no separate Play button). Playing a lesson enables
 * audio, hides the page h1/subtitle (the Lessons card is the only header
 * that matters once you're mid-lesson), zooms the fretboard to that
 * lesson's fret range (or back to the whole neck if it doesn't specify
 * one), then runs the lesson's own demo. A lesson narrates either via
 * showModal() (a floating panel cloned over the fretboard -- see
 * .gt-lesson-modal) or highlightSection() (reveals real inline content
 * like the chords grid, in place -- see .gt-lesson-copy /
 * .gt-lesson-highlight in index.html). The modal also carries Replay,
 * Loop, and a note-speed slider for ear training (getNoteDelayMs() in the
 * run() context) -- all three are modal-level state, not per-lesson, so
 * "slowed down" stays slowed down across Replay/Loop and switching
 * lessons. The h1/subtitle come back once the lesson finishes.
 */
import { setAudioEnabled, toggleMuted, isMuted } from './audio.js';

const HIGHLIGHT_CLASS = 'gt-lesson-highlight';

// AI voice narration (Web Speech API -- no backend/API key needed, works
// offline, fits the no-build static-site model). The lesson's OWN written
// copy (the same text shown in the modal) IS the script -- speaking
// whatever's actually on screen instead of a separate, easy-to-drift-out-
// of-sync narration text maintained in two places. Respects the existing
// Mute toggle (one mute silences both audio and voice, matching what a
// user expects "mute" to mean); cancel() first so replaying/switching
// lessons doesn't queue overlapping utterances.
function speakNarration(contentEl) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  if (isMuted()) return;

  const clone = contentEl.cloneNode(true);
  // The chords-lesson heading nests an (i) info button whose tooltip text
  // is only meant to be read on demand, not narrated as part of the intro.
  clone.querySelectorAll('.gt-info-tooltip, .gt-info-btn').forEach((el) => el.remove());
  const text = clone.textContent.replace(/\s+/g, ' ').trim();
  if (!text) return;

  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

// Whichever section a lesson most recently revealed via highlightSection()
// and/or showModal() -- the modal's Dismiss button un-reveals it too, so
// closing the narration also closes any inline content (like the chords
// grid) it opened alongside.
let lastSection = null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Reveals the section and scrolls to it, then returns as soon as the scroll
// has had a moment to settle -- it does NOT hide the section again. The
// section stays glowing/visible until the modal's Dismiss button (or, for
// lessons with no modal, the section's own .gt-lesson-dismiss) removes the
// highlight, independent of whatever the lesson's own demo is doing on its
// own timing.
async function highlightSection(section) {
  if (!section) return;
  lastSection = section;
  section.scrollIntoView({ behavior: 'smooth', block: 'center' });
  section.classList.add(HIGHLIGHT_CLASS);
  await wait(400);
}

function wireDismissButtons() {
  document.querySelectorAll('.gt-lesson-dismiss').forEach((btn) => {
    // The modal's own dismiss button isn't inside a <section> to un-highlight
    // -- it just hides the modal. Wired separately in wireModal() instead.
    if (btn.closest('.gt-lesson-modal')) return;
    btn.addEventListener('click', () => {
      btn.closest('section')?.classList.remove(HIGHLIGHT_CLASS);
    });
  });
}

// Shows a lesson's narration as a floating panel over the fretboard, cloned
// from that lesson's (hidden) source section, instead of appearing inline
// in the page -- so what you're reading and what the fretboard is doing
// are never in two different places on the screen. Stays up until the
// modal's own dismiss button is clicked (wired once, in wireModal()).
async function showModal(section, { scrollToFretboard = true } = {}) {
  const modal = document.querySelector('.gt-lesson-modal');
  const content = modal?.querySelector('.gt-lesson-modal__content');
  const copy = section?.querySelector('.gt-lesson-copy');
  if (!modal || !content || !copy) return;
  lastSection = section;

  // Skippable: a lesson that already scrolled to its own relevant section
  // (highlightSection -- e.g. the Chords lesson, which stays inside the
  // diatonic-chords grid and never touches the fretboard) shouldn't have
  // this immediately re-scroll to the fretboard-card instead.
  if (scrollToFretboard) {
    document.querySelector('.gt-fretboard-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await wait(400);
  }

  const clone = copy.cloneNode(true);
  clone.querySelector('.gt-lesson-dismiss')?.remove(); // the modal has its own
  content.replaceChildren(...clone.childNodes);
  modal.hidden = false;
  speakNarration(content);
}

function wireModal({ onReplay, onToggleLoop, onDismiss } = {}) {
  const modal = document.querySelector('.gt-lesson-modal');
  modal?.querySelector('.gt-lesson-modal__dismiss')?.addEventListener('click', () => {
    modal.hidden = true;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    onDismiss?.();
  });
  modal?.querySelector('.gt-lesson-modal__replay')?.addEventListener('click', () => onReplay?.());
  modal?.querySelector('.gt-lesson-modal__loop')?.addEventListener('click', () => onToggleLoop?.());
  wireCollapseButton();
}

// Collapses the modal down to just its controls (Note speed, Notes/string,
// Replay/Loop/Mute/Dismiss), hiding the narration text -- clicking the same
// button again is the "reset" back to showing it. Manual, not automatic: it
// stays however the user last left it across Replay/Loop/switching lessons.
function wireCollapseButton() {
  const modal = document.querySelector('.gt-lesson-modal');
  const btn = modal?.querySelector('.gt-lesson-modal__collapse-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const collapsed = modal.classList.toggle('is-collapsed');
    btn.setAttribute('aria-pressed', String(collapsed));
    btn.textContent = collapsed ? '▼ Expand' : '▲ Collapse';
  });
}

// Muting is global audio state (audio.js), not per-lesson -- stays muted
// across Replay/Loop/switching lessons until explicitly un-muted, and
// silences ANY sound on the page (not just whatever the modal is
// narrating), since other clicks (a note dot, a chord card) can't
// accidentally un-mute the way they'd re-enable audio if this were folded
// into the enabled flag instead.
function wireMuteButton() {
  const btn = document.querySelector('.gt-lesson-modal__mute');
  if (!btn) return;
  const sync = () => {
    const muted = isMuted();
    btn.setAttribute('aria-pressed', String(muted));
    btn.textContent = muted ? '🔇 Muted' : '🔊 Mute';
  };
  btn.addEventListener('click', () => {
    toggleMuted();
    sync();
    // Silence an in-progress narration immediately -- otherwise muting only
    // takes effect for the *next* utterance, and the one already speaking
    // keeps going until it finishes on its own.
    if (isMuted() && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  });
  sync();
}

// The tempo slider lives in the modal permanently (not per-lesson) -- slow
// it down once and it stays slow across Replay/Loop and switching lessons,
// which is the point for ear training (repetition at a fixed slow speed).
function wireTempoSlider(onChange) {
  const slider = document.querySelector('.gt-lesson-modal__tempo-slider');
  const valueEl = document.querySelector('.gt-lesson-modal__tempo-value');
  if (!slider) return;
  slider.addEventListener('input', () => {
    const ms = Number(slider.value);
    if (valueEl) valueEl.textContent = `${(ms / 1000).toFixed(2)}s/note`;
    onChange(ms);
  });
}

// Also modal-level, not per-lesson. Reads the select's value fresh every
// time it's asked for -- no cached copy kept in a closure variable that a
// missed/mis-ordered 'change' event could leave stale -- so whatever's
// actually selected right now is what the next note/string uses. Falls
// back to 3 (the select's own HTML default) if the element isn't there.
function getNotesPerString() {
  const select = document.querySelector('.gt-lesson-modal__nps-select');
  return select ? Number(select.value) : 3;
}

// Same live-read pattern -- how many notes make up a measure (accent every
// Nth note as "beat 1"). Falls back to 4 (4/4) if the control isn't there.
function getTimeSignature() {
  const select = document.querySelector('.gt-time-signature-select');
  return select ? Number(select.value) : 4;
}

// The Direction toggle (up/down/both) only makes sense -- and is only shown
// -- when notesPerString is 2 (see wireDirectionToggle). Reads live off the
// DOM, same pattern as getNotesPerString, falling back to 'up' (today's
// only behavior) whenever the toggle isn't present/visible.
function getDirection() {
  const select = document.querySelector('.gt-direction-select');
  return select && !select.closest('.gt-direction-card')?.hidden ? select.value : 'up';
}

// Shows the Direction toggle only when Notes-per-string is exactly 2 --
// every other value keeps today's up-only walk, so the control would just
// be confusing/inert clutter otherwise. At nps=2, Direction's up/down
// takes over exactly the job Notes-shown's above/below already does
// (extend the shown pattern in that direction -- see
// gt-fretboard.js#_currentNoteView), so Notes-shown swaps out to avoid
// showing two controls that ask the same question.
function wireDirectionToggle() {
  const npsSelect = document.querySelector('.gt-lesson-modal__nps-select');
  const directionCard = document.querySelector('.gt-direction-card');
  const noteViewCard = document.querySelector('.gt-note-view-card');
  if (!npsSelect || !directionCard) return;
  const sync = () => {
    const isTwo = npsSelect.value === '2';
    directionCard.hidden = !isTwo;
    if (noteViewCard) noteViewCard.hidden = isTwo;
  };
  npsSelect.addEventListener('change', sync);
  sync();
}

// How long each chord plays/stays highlighted -- the Chords lesson's own
// equivalent of the note-speed slider above. Same live-getter pattern.
function wireChordDelaySlider(onChange) {
  const slider = document.querySelector('.gt-lesson-modal__chord-delay-slider');
  const valueEl = document.querySelector('.gt-lesson-modal__chord-delay-value');
  if (!slider) return;
  slider.addEventListener('input', () => {
    const ms = Number(slider.value);
    if (valueEl) valueEl.textContent = `${(ms / 1000).toFixed(2)}s/chord`;
    onChange(ms);
  });
}

// Shows only the modal controls a lesson actually uses (e.g. Chord delay is
// meaningless on the scale lesson) -- keeps the modal short enough to never
// need to scroll, instead of always rendering all three sliders/selects.
function syncModalControls(modalControls = []) {
  document.querySelectorAll('.gt-lesson-modal__control').forEach((el) => {
    el.hidden = !modalControls.includes(el.dataset.control);
  });
}

// A dropdown option's value for a nav link (as opposed to a lesson id) --
// picking one of these navigates instead of playing anything in place.
const NAV_PREFIX = 'nav:';

export function createLessonPlayer({ fretboard, diatonicChords, lessons, links = [], selectEl, playBtn, pageTitleEl, pageSubtitleEl }) {
  let playing = false;
  let looping = false;
  let noteDelayMs = 650; // slowed down via the modal's tempo slider, for ear training
  let chordDelayMs = 1100; // matches the modal's chord-delay slider's HTML default
  let currentLessonId = null; // so the modal's Replay/Loop buttons know what to run again
  let pendingLessonId = null; // picked in the dropdown but not yet Play-clicked

  function setLoopButtonState() {
    const btn = document.querySelector('.gt-lesson-modal__loop');
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(looping));
    btn.textContent = looping ? '🔁 Looping…' : '🔁 Loop';
  }

  function renderOptions() {
    const placeholder = `<option value="" selected>▶ Choose a lesson to play</option>`;
    const lessonOptions = lessons.map((lesson) => `<option value="${lesson.id}">${lesson.title}</option>`).join('');
    const linkOptions = links.map((link) => `<option value="${NAV_PREFIX}${link.href}">${link.title}</option>`).join('');
    selectEl.innerHTML = placeholder
      + `<optgroup label="Lessons">${lessonOptions}</optgroup>`
      + `<optgroup label="More pages">${linkOptions}</optgroup>`;
  }

  selectEl.addEventListener('change', () => {
    const value = selectEl.value;
    if (!value) return;
    if (value.startsWith(NAV_PREFIX)) {
      window.location.href = value.slice(NAV_PREFIX.length);
      return;
    }
    // Picking a lesson no longer plays it immediately -- it just arms the
    // Play button. The user has to explicitly click Play to start it.
    pendingLessonId = value;
    if (playBtn) playBtn.disabled = false;
  });

  playBtn?.addEventListener('click', () => {
    if (pendingLessonId) runLesson(pendingLessonId);
  });

  async function runLesson(id) {
    if (playing) return;
    const lesson = lessons.find((l) => l.id === id);
    if (!lesson) return;

    currentLessonId = id;
    if (playBtn) playBtn.disabled = true;
    syncModalControls(lesson.modalControls);
    playing = true;
    selectEl.disabled = true;
    pageTitleEl.style.display = 'none';
    pageSubtitleEl.style.display = 'none';

    setAudioEnabled(true);

    // focusFrets can be a fixed [start, end], or a function(fretboard) that
    // computes it fresh for whatever key is currently active -- e.g. the
    // scale lesson always zooms to the 6th-string root, which lands on a
    // different fret in every key.
    const range = typeof lesson.focusFrets === 'function' ? lesson.focusFrets(fretboard) : lesson.focusFrets;
    if (range) fretboard.focusFrets(range[0], range[1]);
    else fretboard.clearFocus();

    await lesson.run({
      fretboard,
      diatonicChords,
      highlightSection,
      showModal,
      getNoteDelayMs: () => noteDelayMs,
      getNotesPerString,
      getDirection,
      getTimeSignature,
      getChordDelayMs: () => chordDelayMs,
    });

    playing = false;
    selectEl.disabled = false;
    if (playBtn) playBtn.disabled = false;
    pageTitleEl.style.display = '';
    pageSubtitleEl.style.display = '';
    // Deliberately left showing the lesson that just played (not reset to
    // the placeholder) -- the dropdown should read as "this is the current
    // lesson," not blank out the moment playback ends.

    // Loop mode: immediately start the same lesson again. The select stays
    // disabled the whole time (set above), so there's no way to switch
    // lessons mid-loop -- Loop has to be turned off first.
    if (looping) runLesson(id);
  }

  // Some browsers restore a <select>'s last-chosen value across a reload
  // (form/bfcache restore), independent of which <option> has `selected` in
  // the HTML -- force it back to the declared default (3) on every load so
  // a leftover value from a previous session/test never wins.
  const npsSelect = document.querySelector('.gt-lesson-modal__nps-select');
  if (npsSelect) {
    npsSelect.value = '3';
    // The neck's own scale view is also capped to notesPerString per string
    // (gt-fretboard.js#_renderDots) -- re-render immediately on change so
    // that's visible the instant you touch the select, not just the next
    // time something else happens to redraw (starting a lesson, changing
    // Key, etc).
    npsSelect.addEventListener('change', () => fretboard.render());
  }

  // Same live-render pattern as Notes-per-string above -- picking a
  // different Notes-shown view (all/shown/below/above) redraws immediately.
  const noteViewSelect = document.querySelector('.gt-note-view-select');
  noteViewSelect?.addEventListener('change', () => fretboard.render());

  // Direction (up/down/both), at nps=2, drives the same rendering as
  // Notes-shown (see gt-fretboard.js#_currentNoteView) -- same live-render
  // rule applies.
  const directionSelect = document.querySelector('.gt-direction-select');
  directionSelect?.addEventListener('change', () => fretboard.render());

  wireDirectionToggle();

  renderOptions();
  wireDismissButtons();
  wireTempoSlider((ms) => { noteDelayMs = ms; });
  wireChordDelaySlider((ms) => { chordDelayMs = ms; });
  wireMuteButton();
  wireModal({
    onReplay: () => { if (currentLessonId) runLesson(currentLessonId); },
    onToggleLoop: () => {
      looping = !looping;
      setLoopButtonState();
      if (looping && currentLessonId && !playing) runLesson(currentLessonId);
    },
    onDismiss: () => {
      looping = false;
      setLoopButtonState();
      lastSection?.classList.remove(HIGHLIGHT_CLASS);
    },
  });
  return { runLesson };
}
