import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

// Lessons dropdown is populated; picking an option arms Play to run THAT
// lesson but does NOT start playback on its own -- the user must
// explicitly click Play. Play itself is already enabled before that (the
// default scale view has notes on it from the moment the page loads --
// see CURRENT_VIEW_LESSON in lesson-player.js), it just plays the current
// view instead of a specific lesson until one is picked.
test('lessons dropdown is populated; picking a lesson arms Play but does not autoplay', async ({ page }) => {
  const select = page.locator('.gt-lesson-select');
  await expect(select).toBeVisible();
  // toBeVisible() only confirms the <select> element itself is rendered,
  // not that the page's async module script has finished calling
  // renderOptions() to populate it -- .count() is a one-shot read with no
  // retry, so poll instead of assuming it's already populated the instant
  // the element exists (this raced and produced a 0-count flake under load
  // from the rest of the suite running first -- same root cause as the
  // smoke.spec.js fix).
  await expect.poll(() => select.locator('option').count()).toBeGreaterThan(1);

  const playBtn = page.locator('.gt-lesson-modal__play');
  await expect(playBtn).toBeEnabled();

  await select.selectOption('what-is-a-chord');
  // Selecting alone must not start playback.
  await expect(playBtn).toBeEnabled();
  await expect(select).toBeEnabled();
  await expect(page.locator('#page-title')).toBeVisible();

  await playBtn.click();
  // Playing disables the select and hides the idle header -- both only
  // happen once a lesson is actually running.
  await expect(select).toBeDisabled();
  await expect(page.locator('#page-title')).toBeHidden();
});

// Switching from one lesson to another must actually replace the modal's
// narration content with the newly-picked lesson's own text -- not leave
// the previous lesson's copy sitting there, and not silently merge the two.
test('switching lessons replaces the modal narration with the new lesson\'s own text', async ({ page }) => {
  const select = page.locator('.gt-lesson-select');
  const playBtn = page.locator('.gt-lesson-modal__play');
  const stopBtn = page.locator('.gt-lesson-modal__stop');
  const content = page.locator('.gt-lesson-modal__content');

  await select.selectOption('what-is-a-chord');
  await playBtn.click();
  await expect(page.locator('.gt-lesson-modal')).toBeVisible();
  await expect(content).toContainText('needs at least 3 notes');

  // Stop before switching -- the select is disabled while a lesson plays
  // (see the test above), so a new one can't be picked until this one halts.
  await stopBtn.click();
  await expect(select).toBeEnabled();

  await select.selectOption('modes');
  await playBtn.click();
  await expect(content).toContainText('7 modes of the major scale');
  // The previous lesson's own copy must be gone, not just appended alongside.
  await expect(content).not.toContainText('needs at least 3 notes');
});

// Issue #4 -- Fold Chord spellings reference / Songs nav links into the
// Lessons dropdown instead of separate page links.
test('nav links are folded into the lessons dropdown as a second group', async ({ page }) => {
  await expect(page.locator('.gt-nav-links')).toHaveCount(0);
  const select = page.locator('.gt-lesson-select');
  await expect(select.locator('option[value="nav:spellings.html"]')).toHaveCount(1);
  await expect(select.locator('option[value="nav:songs.html"]')).toHaveCount(1);
});

// Issue #5 -- Remove manual "Turn on audio" toggle; enable audio
// automatically on interaction instead.
test('no manual audio-toggle button exists on the main page', async ({ page }) => {
  await expect(page.locator('#audio-toggle')).toHaveCount(0);
  await expect(page.locator('.gt-audio-toggle')).toHaveCount(0);
});

// Issue #6 -- Move the diatonic-chords grid into its own "Chords" lesson;
// it should be hidden until that lesson is picked.
test('diatonic chords grid is hidden until the Chords lesson is picked', async ({ page }) => {
  const grid = page.locator('gt-diatonic-chords');
  await expect(grid).toBeHidden();

  await page.locator('.gt-lesson-select').selectOption('chords');
  await page.locator('.gt-lesson-modal__play').click();
  await expect(grid).toBeVisible({ timeout: 5000 });
});

// Issue #8 -- Header (h1/subtitle) should reflect idle state vs. the
// currently-playing lesson.
test('header hides while a lesson plays and returns once it finishes', async ({ page }) => {
  const title = page.locator('#page-title');
  await expect(title).toBeVisible();
  const idleText = await title.textContent();
  expect(idleText).toContain('Guitar Trainer');

  await page.locator('.gt-lesson-select').selectOption('what-is-a-chord');
  await page.locator('.gt-lesson-modal__play').click();
  await expect(title).toBeHidden();

  // what-is-a-chord's demo runs for a few seconds -- wait for the header
  // to come back rather than assuming a fixed duration.
  await expect(title).toBeVisible({ timeout: 10000 });
  await expect(title).toHaveText(idleText);
});

// Issue #17 -- looping the Chords lesson advances the inversion (root ->
// first -> second -> root) between passes; the report was that the FIRST
// chord of the next pass didn't correctly reflect the new inversion.
test('the first chord of the next Chords-lesson pass already reflects the advanced inversion', async ({ page }) => {
  await page.evaluate(() => {
    window.__firstPluckInversion = null;
    document.addEventListener('gt:chord-note-plucked', () => {
      if (window.__firstPluckInversion === null) {
        window.__firstPluckInversion = document.querySelector('gt-diatonic-chords')._inversion;
      }
    });
  });

  await page.locator('.gt-lesson-select').selectOption('chords');
  await page.locator('.gt-lesson-modal__play').click();
  // Speed the pass along so the test doesn't wait on the default 1.1s/chord tempo.
  await page.locator('.gt-lesson-modal__chord-delay-slider').fill('500');

  // Wait for the first pass (root position) to finish -- the select
  // re-enables once playing stops.
  await expect(page.locator('.gt-lesson-select')).toBeEnabled({ timeout: 15000 });
  await expect(page.locator('gt-fretboard')).toHaveJSProperty('_inversion', 'first');

  await page.evaluate(() => { window.__firstPluckInversion = null; });
  await page.locator('.gt-lesson-modal__play').click();

  await expect.poll(() => page.evaluate(() => window.__firstPluckInversion), { timeout: 8000 }).toBe('first');
});

// Issue #24 -- changing Mode while the Modes lesson is playing left the
// fretboard showing whatever the PREVIOUS mode's playthrough left on
// screen; picking a new mode has to actually re-run the demo, the same as
// clicking Play again, not just silently update the dropdown's own label.
test('changing Mode while the Modes lesson is active re-triggers the demo', async ({ page }) => {
  await page.locator('.gt-lesson-select').selectOption('modes');
  await page.locator('.gt-lesson-modal__play').click();

  // Wait for the initial playthrough to finish -- the lesson select
  // re-enables once playing stops (same signal used by the inversion test
  // above).
  await expect(page.locator('.gt-lesson-select')).toBeEnabled({ timeout: 15000 });

  // The mode's own box pattern (6 strings x the current Notes/string,
  // default 3, +1 for the 2nd string's always-on bonus resolving-root
  // note -- see SECOND_STRING_INDEX) should be on screen -- not every
  // occurrence across the whole neck, just this mode's own re-anchored
  // walk (see gt-fretboard.js#setWalkAnchor). That base 19 then gets
  // padded further to a full measure boundary by _scaleWalkPositions' own
  // measure-completion padding (counts distinct PITCHES, not physical
  // positions, so the padded total varies with how many positions happen
  // to overlap in pitch across strings) -- read the true count live
  // rather than hardcoding a number only right before any mode ever ran.
  await expect.poll(() => page.locator('.gt-dot').count()).toBeGreaterThanOrEqual(19);
  const baseline = await page.locator('.gt-dot').count();

  // Changing Mode (the underlying <select> the stepper drives) must
  // re-arm playback exactly like clicking Replay does.
  await page.locator('.gt-mode-select').selectOption('3'); // Lydian
  await expect(page.locator('.gt-lesson-select')).toBeDisabled();

  await expect(page.locator('.gt-lesson-select')).toBeEnabled({ timeout: 15000 });
  // Re-anchored to Lydian's own tonic, but still the same shape -- same
  // total dot count as the baseline mode's own pattern produced.
  await expect.poll(() => page.locator('.gt-dot').count()).toBe(baseline);
});

// The Modes lesson strikes that mode's own diatonic triad (harmonizeMajorScale
// in the current key, at the mode's own scale degree -- Ionian=I major,
// Dorian=ii minor, Locrian=vii diminished, etc) once per MEASURE -- on
// beat 1, held through the rest of that measure -- not once for the whole
// demo, and not re-struck on every individual note. The Beat counter next
// to Time signature cycles 1..beatsPerMeasure in step with it.
test('the Modes lesson strikes that mode\'s own chord once per measure, in step with the Beat counter', async ({ page }) => {
  await page.evaluate(() => {
    window.__strums = [];
    window.__beats = [];
    document.addEventListener('gt:mode-chord-strummed', (e) => window.__strums.push(e.detail.chordName));
    document.querySelector('gt-fretboard').addEventListener('gt:beat-changed', (e) => window.__beats.push(e.detail.beat));
  });

  await page.locator('.gt-lesson-select').selectOption('modes');
  await page.locator('.gt-lesson-modal__play').click();

  // Default Notes/string (3) x 6 strings, deduped, padded out to finish
  // its last partial measure (see playScaleDemo's beatsForPadding) -> a
  // clean multiple of 4/4 measures over the whole demo, never a dangling
  // partial measure at the end. Wait for it to fully finish.
  await expect(page.locator('.gt-lesson-select')).toBeEnabled({ timeout: 20000 });

  const beats = await page.evaluate(() => window.__beats);
  expect(beats.length % 4).toBe(0); // no dangling partial measure
  expect(beats).toEqual([1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4]);

  // Ionian (the default mode) on key C is the I chord -- C major -- struck
  // once per measure (5 measures above -> 5 strikes), each a real guitar
  // strum (a handful of notes, not just one).
  const chordNames = await page.evaluate(() => window.__strums);
  expect(chordNames.length).toBeGreaterThan(5); // more than one note per strike
  expect(chordNames.length % 5).toBe(0); // an even multiple of 5 strikes
  expect(chordNames.every((name) => name === 'C')).toBe(true);

  // Beat counter shows the last beat played once the demo settles.
  await expect(page.locator('#beat-counter-value')).toHaveText('4 / 4');
});

// The note sequence always finishes its last measure -- by continuing
// further up the neck with genuinely new, higher notes (gt:note-played),
// never by wrapping around to repeat an earlier one. Those extra notes
// have no dot on screen (past the base per-string walk) so they'd
// otherwise be silently skipped by the visibility gate -- forcePlay in
// _playAndWait keeps them audible anyway.
test('the scale demo completes its last measure by continuing upward, never repeating a note', async ({ page }) => {
  await page.evaluate(() => {
    window.__notesPlayed = [];
    document.querySelector('gt-fretboard').addEventListener('gt:note-played', (e) => window.__notesPlayed.push(e.detail.midi));
  });

  await page.locator('.gt-lesson-select').selectOption('modes');
  await page.locator('.gt-lesson-modal__play').click();
  await expect(page.locator('.gt-lesson-select')).toBeEnabled({ timeout: 20000 });

  const midis = await page.evaluate(() => window.__notesPlayed);
  // 17 base notes (6 strings x 3 notes/string, deduped, +1 for the 2nd
  // string's bonus root) padded up to 20 -- a clean 5 measures of 4/4.
  expect(midis.length).toBe(20);
  expect(new Set(midis).size).toBe(midis.length); // every note is unique -- no wrap-around repeats

  // The 3 padding notes (indices 17-19) are each strictly higher than
  // everything before them -- continuing upward, not jumping around.
  const basePeak = Math.max(...midis.slice(0, 17));
  expect(midis[17]).toBeGreaterThan(basePeak);
  expect(midis[18]).toBeGreaterThan(midis[17]);
  expect(midis[19]).toBeGreaterThan(midis[18]);
});

// Play works whenever there are notes on the fretboard to hear, not only
// once a lesson has been explicitly picked -- the default scale view is
// on screen from the moment the page loads, before any lesson has ever
// run, so clicking Play with nothing picked plays that current view
// directly (CURRENT_VIEW_LESSON in lesson-player.js).
test('clicking Play with no lesson picked plays the current fretboard view', async ({ page }) => {
  const select = page.locator('.gt-lesson-select');
  const playBtn = page.locator('.gt-lesson-modal__play');

  await expect(select).toHaveValue('');
  await expect(playBtn).toBeEnabled();

  await playBtn.click();

  // Playing disables the select, same as running a real lesson would.
  await expect(select).toBeDisabled();
  await expect(playBtn).toBeDisabled();

  await expect(select).toBeEnabled({ timeout: 15000 });
  await expect(playBtn).toBeEnabled();
});

// Issue #25 -- Stop halts playback entirely (fretboard goes idle, UI
// re-enables) without starting anything new, distinct from changing Mode
// mid-demo (which stops AND immediately restarts).
test('Stop halts an in-progress lesson and re-enables the UI', async ({ page }) => {
  await page.locator('.gt-lesson-select').selectOption('major-scale');
  await page.locator('.gt-lesson-modal__play').click();

  const playBtn = page.locator('.gt-lesson-modal__play');
  const stopBtn = page.locator('.gt-lesson-modal__stop');
  const select = page.locator('.gt-lesson-select');

  await expect(playBtn).toBeDisabled();
  await expect(stopBtn).toBeEnabled();
  await expect(select).toBeDisabled();

  await stopBtn.click();

  await expect(select).toBeEnabled();
  await expect(playBtn).toBeEnabled();
  await expect(stopBtn).toBeDisabled();
});

// Issue #25 -- a separate mute-narration toggle, independent of the main
// Mute button (which only covers note/chord audio). Narration starts
// muted here specifically BECAUSE this is a Playwright (WebDriver) run --
// see lesson-player.js's navigator.webdriver check -- so real speech
// synthesis is never invoked by the test suite; a human visiting the page
// normally gets narration on by default instead.
test('the narration-mute toggle is independent of the main Mute button', async ({ page }) => {
  const mute = page.locator('.gt-lesson-modal__mute');
  const muteNarration = page.locator('.gt-lesson-modal__mute-narration');

  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await expect(muteNarration).toHaveAttribute('aria-pressed', 'true');

  await muteNarration.click();
  await expect(muteNarration).toHaveAttribute('aria-pressed', 'false');
  // Toggling narration must not touch the separate audio mute.
  await expect(mute).toHaveAttribute('aria-pressed', 'false');

  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  // Toggling audio must not re-mute narration.
  await expect(muteNarration).toHaveAttribute('aria-pressed', 'false');
});

// The whole point of the navigator.webdriver check above -- confirms it
// actually fires under this exact test runner, not just in theory.
test('narration starts muted automatically under Playwright', async ({ page }) => {
  expect(await page.evaluate(() => navigator.webdriver)).toBe(true);
  await expect(page.locator('.gt-lesson-modal__mute-narration')).toHaveAttribute('aria-pressed', 'true');
});

// A page reload (e.g. testing a code change) resumes whichever real
// lesson was running instead of dropping back to the blank "Choose a
// lesson" placeholder (sessionStorage, see CURRENT_LESSON_STORAGE_KEY).
test('reloading the page resumes the lesson that was running', async ({ page }) => {
  await page.locator('.gt-lesson-select').selectOption('major-scale');
  await page.locator('.gt-lesson-modal__play').click();
  await expect(page.locator('.gt-lesson-select')).toHaveValue('major-scale');

  await page.reload();

  await expect(page.locator('.gt-lesson-select')).toHaveValue('major-scale', { timeout: 10000 });
  // Resuming actually restarts it too, not just re-selects the dropdown.
  await expect(page.locator('.gt-lesson-select')).toBeDisabled();
});
