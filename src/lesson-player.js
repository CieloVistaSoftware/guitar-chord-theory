/**
 * Wires the Lessons card: picking an option from the dropdown only arms
 * the modal's Play button (see createLessonPlayer's selectEl listener) --
 * the user has to explicitly click Play to start it. Playing a lesson
 * enables audio, hides the page h1/subtitle (the Lessons card is the only
 * header that matters once you're mid-lesson), zooms the fretboard to
 * that lesson's fret range (or back to the whole neck if it doesn't
 * specify one), then runs the lesson's own demo. A lesson narrates either
 * via showModal() (a floating panel cloned over the fretboard -- see
 * .gt-lesson-modal) or highlightSection() (reveals real inline content
 * like the chords grid, in place -- see .gt-lesson-copy /
 * .gt-lesson-highlight in index.html). The modal also carries Play (which
 * doubles as Replay once a lesson has run), Stop, Loop, Mute, Mute
 * Narration, and a note-speed slider for ear training (getNoteDelayMs() in
 * the run() context) -- all modal-level state, not per-lesson, so
 * "slowed down" stays slowed down across Play/Loop and switching lessons.
 * The h1/subtitle come back once the lesson finishes.
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
  if (isMuted() || narrationMuted) return;

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

// Separate from the main Mute button (audio.js's isMuted(), which silences
// note/chord playback) -- someone may want to hear the notes without the
// spoken narration, or vice versa, so these are two independent toggles
// rather than one mute controlling both.
let narrationMuted = false;

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

// Populates a lesson's narration into the permanent #fretboardcontroller
// panel's content area, cloned from that lesson's (hidden) source section
// -- so what you're reading and what the fretboard is doing are never in
// two different places on the screen. The panel itself is always visible
// (it also carries Key/Notes-per-string/Play/Fullscreen/etc, which have to
// stay reachable even when no lesson is running); only the narration text
// comes and goes, via the collapse/expand toggle -- see wireModal()'s
// Dismiss handler and the collapsed-by-default reset below.
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
  // Narration text starts collapsed (hidden) every time a lesson shows --
  // the user clicks the toggle to reveal it, rather than it appearing by
  // default and needing to be dismissed.
  const collapseBtn = modal.querySelector('.gt-lesson-modal__collapse-btn');
  modal.classList.add('is-collapsed');
  if (collapseBtn) {
    collapseBtn.setAttribute('aria-pressed', 'true');
    collapseBtn.textContent = '▼ Expand';
  }
  speakNarration(content);
}

function wireModal({ onPlay, onStop, onToggleLoop, onDismiss } = {}) {
  const modal = document.querySelector('.gt-lesson-modal');
  modal?.querySelector('.gt-lesson-modal__dismiss')?.addEventListener('click', () => {
    // The panel itself is always visible (it carries the header controls),
    // so Dismiss can no longer hide it -- just collapse the narration back
    // down to the same collapsed-by-default state showModal() starts in.
    const collapseBtn = modal.querySelector('.gt-lesson-modal__collapse-btn');
    modal.classList.add('is-collapsed');
    if (collapseBtn) {
      collapseBtn.setAttribute('aria-pressed', 'true');
      collapseBtn.textContent = '▼ Expand';
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    onDismiss?.();
  });
  // One button does double duty -- starts the dropdown-picked lesson if
  // none has run yet, replays the current one otherwise -- instead of a
  // separate header Play button and modal Replay button for what's really
  // the same action.
  modal?.querySelector('.gt-lesson-modal__play')?.addEventListener('click', () => onPlay?.());
  modal?.querySelector('.gt-lesson-modal__stop')?.addEventListener('click', () => onStop?.());
  modal?.querySelector('.gt-lesson-modal__loop')?.addEventListener('click', () => onToggleLoop?.());
  wireCollapseButton();
}

// Collapses the modal down to just its controls (Note speed, Notes/string,
// Play/Stop/Loop/Mute/Dismiss), hiding the narration text -- clicking the same
// button again reveals it. showModal() always resets to collapsed when a
// lesson starts (narration hidden by default, reveal on request); this
// toggle just flips that state for as long as the modal stays up.
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
// across Play/Loop/switching lessons until explicitly un-muted, and
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

// Independent of wireMuteButton() above -- silences only the spoken
// narration, leaving note/chord audio untouched.
function wireNarrationMuteButton() {
  const btn = document.querySelector('.gt-lesson-modal__mute-narration');
  if (!btn) return;
  const sync = () => {
    btn.setAttribute('aria-pressed', String(narrationMuted));
    btn.textContent = narrationMuted ? '🗣️ Narration Muted' : '🗣️ Mute Narration';
  };
  btn.addEventListener('click', () => {
    narrationMuted = !narrationMuted;
    sync();
    if (narrationMuted && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  });
  sync();
}

// The tempo slider lives in the modal permanently (not per-lesson) -- slow
// it down once and it stays slow across Play/Loop and switching lessons,
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
// be confusing/inert clutter otherwise. Purely a playback-order control
// (see getDirection/playScaleDemo) -- separate from Add Notes, which
// controls what's rendered/audible regardless of notesPerString.
function wireDirectionToggle() {
  const npsSelect = document.querySelector('.gt-lesson-modal__nps-select');
  const directionCard = document.querySelector('.gt-direction-card');
  if (!npsSelect || !directionCard) return;
  const sync = () => { directionCard.hidden = npsSelect.value !== '2'; };
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

// Play works whenever there are notes on the fretboard to hear -- not
// only once a lesson has been explicitly picked from the dropdown. The
// default scale view is on screen from the moment the page loads, before
// any lesson has ever run, so Play needs something to do in that case
// too: this synthetic "lesson" just plays whatever the neck is currently
// showing, with no narration of its own. Shares the exact same run/Stop/
// Loop machinery as a real lesson (see runLesson) rather than a separate
// code path.
const CURRENT_VIEW_LESSON = {
  id: '__current-view__',
  modalControls: ['tempo', 'timeSignature'],
  async run({ fretboard, getNoteDelayMs, getNotesPerString, getDirection, getTimeSignature }) {
    await fretboard.playScaleDemo(getNoteDelayMs, getNotesPerString, getDirection, getTimeSignature);
  },
};

export function createLessonPlayer({ fretboard, diatonicChords, lessons, links = [], selectEl, pageTitleEl, pageSubtitleEl }) {
  let playing = false;
  let looping = false;
  let noteDelayMs = 650; // slowed down via the modal's tempo slider, for ear training
  let chordDelayMs = 1100; // matches the modal's chord-delay slider's HTML default
  let currentLessonId = null; // so the modal's Play/Loop buttons know what to run again
  let pendingLessonId = null; // picked in the dropdown but not yet Play-clicked
  let currentRunPromise = Promise.resolve(); // the in-flight runLesson() call, if any -- awaited by a force-priority caller (see runLesson's force option)
  let runGeneration = 0; // bumped by stopLesson() -- lets an orphaned run's own eventual cleanup recognize it's stale and skip re-doing (or undoing) work stopLesson() already handled

  function setLoopButtonState() {
    const btn = document.querySelector('.gt-lesson-modal__loop');
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(looping));
    btn.textContent = looping ? '🔁 Looping…' : '🔁 Loop';
  }

  // One Play button does double duty (start the pending lesson, replay
  // the current one, or -- if neither -- just play whatever the fretboard
  // is already showing, see CURRENT_VIEW_LESSON) instead of a separate
  // header Play + modal Replay. Enabled whenever there are actually notes
  // on the neck to hear and nothing is already playing -- not gated on a
  // lesson having been picked, since the default scale view is there from
  // the moment the page loads. Stop is the mirror image -- only
  // meaningful mid-play.
  function syncTransportButtons() {
    const playModalBtn = document.querySelector('.gt-lesson-modal__play');
    const stopBtn = document.querySelector('.gt-lesson-modal__stop');
    const hasNotesOnScreen = document.querySelectorAll('.gt-dot').length > 0;
    if (playModalBtn) playModalBtn.disabled = playing || !hasNotesOnScreen;
    if (stopBtn) stopBtn.disabled = !playing;
  }

  // Halts playback entirely -- fretboard goes idle, UI re-enables --
  // without starting anything new. Forces the UI back to idle RIGHT AWAY
  // instead of waiting for the in-flight run to notice and unwind on its
  // own: that run might currently be anywhere in its own lesson.run() (its
  // pre-demo narration/scroll wait, mid-playScaleDemo, or in between) --
  // fretboard.stopPlayback() aborts an already-started playScaleDemo (and
  // refuses to let a not-yet-started one begin at all), but the run's
  // OWN cleanup code below only fires after its await chain finally
  // resolves, which could be much later. Bumping runGeneration lets that
  // eventual, now-orphaned cleanup recognize it's stale and skip re-doing
  // (or undoing) what's already been forced here -- notably the
  // "if (looping) runLesson(id);" tail check, which would otherwise
  // immediately restart it once the abort actually takes effect.
  function stopLesson() {
    if (!playing) return;
    looping = false;
    setLoopButtonState();
    runGeneration++;
    fretboard.stopPlayback();
    playing = false;
    syncTransportButtons();
    selectEl.disabled = false;
    pageTitleEl.style.display = '';
    pageSubtitleEl.style.display = '';
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
    syncTransportButtons();
  });

  // `force: true` -- for something that must take over playback right
  // away (e.g. changing Mode mid-demo) instead of being silently ignored
  // while a previous run is still going (the plain `if (playing) return;`
  // below). Signals the in-flight fretboard playback to abandon its
  // remaining notes (see gt-fretboard.js#stopPlayback) and waits for that
  // run's own cleanup (re-enabling the select/Play button, etc.) to
  // actually finish before starting the new one.
  async function runLesson(id, { force = false } = {}) {
    if (playing) {
      if (!force) return;
      fretboard.stopPlayback();
      await currentRunPromise;
    }
    const lesson = id === CURRENT_VIEW_LESSON.id ? CURRENT_VIEW_LESSON : lessons.find((l) => l.id === id);
    if (!lesson) return;

    const myGeneration = ++runGeneration;
    currentRunPromise = (async () => {
      currentLessonId = id;
      syncModalControls(lesson.modalControls);
      playing = true;
      syncTransportButtons();
      selectEl.disabled = true;
      pageTitleEl.style.display = 'none';
      pageSubtitleEl.style.display = 'none';

      setAudioEnabled(true);
      // Clears any stale Stop from a previous run -- this one is starting
      // fresh and is allowed to actually play (see gt-fretboard.js#stopPlayback).
      fretboard.armPlayback();

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

      // stopLesson() already forced everything back to idle (and bumped
      // runGeneration) if it fired while the above was still in flight --
      // skip re-doing (or undoing) that work, and critically skip the
      // Loop restart below, which stopLesson() already turned off.
      if (myGeneration !== runGeneration) return;

      playing = false;
      syncTransportButtons();
      selectEl.disabled = false;
      pageTitleEl.style.display = '';
      pageSubtitleEl.style.display = '';
      // Deliberately left showing the lesson that just played (not reset to
      // the placeholder) -- the dropdown should read as "this is the current
      // lesson," not blank out the moment playback ends.

      // Loop mode: immediately start the same lesson again. The select stays
      // disabled the whole time (set above), so there's no way to switch
      // lessons mid-loop -- Loop has to be turned off first.
      if (looping) runLesson(id);
    })();
    await currentRunPromise;
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

  // Same live-DOM-read pattern as Notes/string (gt-fretboard.js's own
  // _currentStartingStringIndex() reads this select directly) -- just
  // re-render on change so picking a different starting string is visible
  // immediately.
  const startingStringSelect = document.querySelector('.gt-starting-string-select');
  if (startingStringSelect) startingStringSelect.addEventListener('change', () => fretboard.render());

  wireDirectionToggle();

  renderOptions();
  wireDismissButtons();
  wireTempoSlider((ms) => { noteDelayMs = ms; });
  wireChordDelaySlider((ms) => { chordDelayMs = ms; });
  wireMuteButton();
  wireNarrationMuteButton();
  wireModal({
    onPlay: () => {
      // A freshly-picked-but-not-yet-played dropdown selection always
      // wins over replaying whatever happened to run before it (picking a
      // NEW lesson has to actually start that one, not keep replaying the
      // old one just because it ran more recently). Falls back to just
      // playing the current view if neither is set (see CURRENT_VIEW_LESSON).
      runLesson(pendingLessonId || currentLessonId || CURRENT_VIEW_LESSON.id);
    },
    onStop: () => stopLesson(),
    onToggleLoop: () => {
      looping = !looping;
      setLoopButtonState();
      if (looping && !playing) runLesson(currentLessonId || CURRENT_VIEW_LESSON.id);
    },
    onDismiss: () => {
      looping = false;
      setLoopButtonState();
      lastSection?.classList.remove(HIGHLIGHT_CLASS);
    },
  });
  syncTransportButtons(); // Play starts disabled -- nothing picked yet, nothing playing
  return { runLesson };
}
