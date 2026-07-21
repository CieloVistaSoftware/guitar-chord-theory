# guitar-chord-theory — Specs & Requirements

Living document for requirements that aren't fully expressed by the code yet,
or that are easy to accidentally break in a future change. Add to this as new
requirements come up; move an item to "Implemented" once it's done and
verified, not just written.

## Lesson system

- The Lessons dropdown (`.gt-lesson-select`, `src/lesson-player.js`) is the
  single entry point. Picking a lesson plays it immediately — no separate
  Play button. It stays showing the lesson that just played (doesn't reset to
  the placeholder) so the dropdown reads as "this is the current lesson."
- Each lesson's narration is a **modal** (`.gt-lesson-modal`) floating over
  the fretboard, not inline page text — draggable and resizable
  (`x-behavior="draggable resizable"`), with Replay, Loop, and a note-speed
  slider for ear training.
- **Loop must honor inversions.** The Chords lesson strums all seven chords
  in the current inversion, then advances to the next one (Root → 1st → 2nd
  → Root …) for the *next* run. Looping the lesson therefore cycles through
  all three inversions over successive passes, not just repeating Root
  Position forever. Implemented in `src/lessons-data.js`'s `chords` lesson
  `run()`, via `fretboard.getInversion()` / `fretboard.setInversion()`.
- **Chord notes must strum in true inversion (pitch) order**, bass note
  first, regardless of which string it happens to land on. Implemented by
  sorting the computed MIDI notes ascending in
  `src/chord-shape-builder.js#playChordAudio` before strumming — not just
  trusting string-index order, since that was only correct by an unproven
  tuning-interval invariant.
- **Fullscreen: the modal must always render on top**, never squeezed beside
  or hidden behind the fretboard SVG. `.gt-fretboard-card:fullscreen main`
  becomes a flex-centered container for the SVG; without an override the
  modal (a normal-flow sibling) becomes a flex item instead of floating.
  Fixed with a fullscreen-scoped override in `src/gt-fretboard.css`
  (`.gt-fretboard-card:fullscreen .gt-lesson-modal`) that pins it
  `position: absolute; top; z-index: 30`.
- **Future direction: the modal becomes the narration surface.** Once AI
  voice narration ships (issue #9 — Web Speech API, scripted per lesson in
  `src/lessons-data.js`), the modal is the natural place to show the spoken
  script as text too, with a show/hide toggle independent of whether audio
  narration is playing. Not built yet — noted here so the modal's design
  keeps this in mind (e.g. don't couple modal visibility tightly to any one
  lesson's specific content shape).
- **3 notes per string is the default scale pattern.** The modal has a "3
  notes per string" checkbox, checked by default. `playScaleDemo(delayMs,
  notesPerString = 3)` walks string by string (low E to high), playing
  exactly `notesPerString` ascending scale tones per string before moving
  on -- the standard practice pattern, spanning a couple octaves. Unchecking
  it falls back to the older one-octave "each of the 7 degrees once,
  wherever it next falls" walk (`notesPerString = null`). The scale
  lesson's zoom window is sized (`rootFret` to `rootFret + 12`) to
  comfortably fit the (now-default) wider 3nps pattern.
- **Two tempo controls, one per demo type** (issue #13, closed): "Note
  speed" governs `playScaleDemo` (major-scale lesson); a separate "Chord
  delay" slider governs `gt-diatonic-chords.js`'s `playAll()`/`_playAll()`
  (Chords lesson) — both modal-level, both read live via a getter passed
  through instead of a snapshot, so dragging either mid-playthrough (or
  mid-Loop) changes the very next note/chord, not just the next full run.
  `_playAll(delayMs)` still falls back to the grid's own internal tempo
  slider (`_chordDelayMs`) when no override is passed, for callers outside
  the lesson system (e.g. clicking "Play all seven chords" directly).

## Fretboard interaction

- **Drag-to-pan**: click-and-drag on the fretboard slides which frets are
  visible (`src/fretboard-pan.js`, `gt-fretboard.js#panBy`/
  `panByScreenPixels`), independent of pinch-zoom.js's separate CSS-scale
  zoom. A drag under ~6px is still treated as a click (note dots, the
  fullscreen click-anywhere handler) — anything past that suppresses the
  click that would otherwise fire on release.
- **Range: the neck goes up to fret 22** (`<gt-fretboard frets="22">` in
  index.html) — dragging/panning can reach all the way up there, not just
  the historical 12–14 fret window.
- Clicking a note in scale view re-roots the key to that note
  (`gt:root-picked`), synced with the Key dropdown.
- The scale demo (`playScaleDemo`) always starts degree 1 on the 6th string
  (low E) — the standard starting position for a movable pattern — even if
  that's the open string.

## Audio

- No manual "Turn on audio" toggle anywhere. Every click handler that plays
  a sound calls `setAudioEnabled(true)` itself (the click is the browser's
  required user gesture). Applies on index.html, spellings.html; songs.html
  still has its own toggle (not yet converted).
- The tempo/note-speed slider is read *live* each note
  (`playScaleDemo(getNoteDelayMs)` takes the getter itself, not a snapshot)
  so dragging it mid-playthrough changes the very next note's delay, not
  just the next full run.

## Open / not yet implemented

- AI voice narration (issue #9).
- songs.html still has the old manual audio-toggle button/pattern.
- No `<gt-diatonic-chords>`-side check yet that the small per-chord
  fingering diagrams strum in true pitch order (only the big fretboard's
  `playChordAudio` was fixed) — worth auditing if the same
  string-index-order assumption exists there too.
