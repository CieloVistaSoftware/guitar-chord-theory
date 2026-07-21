import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

// Lessons dropdown is populated; picking an option arms the Play button
// (disabled until a lesson is selected) but does NOT start playback on its
// own -- the user must explicitly click Play.
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
  await expect(playBtn).toBeDisabled();

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
  // default 3) should be on screen -- not every occurrence across the
  // whole neck, just this mode's own re-anchored walk (see
  // gt-fretboard.js#setWalkAnchor).
  await expect.poll(() => page.locator('.gt-dot').count()).toBe(18);

  // Changing Mode (the underlying <select> the stepper drives) must
  // re-arm playback exactly like clicking Replay does.
  await page.locator('.gt-mode-select').selectOption('3'); // Lydian
  await expect(page.locator('.gt-lesson-select')).toBeDisabled();

  await expect(page.locator('.gt-lesson-select')).toBeEnabled({ timeout: 15000 });
  await expect.poll(() => page.locator('.gt-dot').count()).toBe(18);
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
// Mute button (which only covers note/chord audio).
test('the narration-mute toggle is independent of the main Mute button', async ({ page }) => {
  const mute = page.locator('.gt-lesson-modal__mute');
  const muteNarration = page.locator('.gt-lesson-modal__mute-narration');

  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await expect(muteNarration).toHaveAttribute('aria-pressed', 'false');

  await muteNarration.click();
  await expect(muteNarration).toHaveAttribute('aria-pressed', 'true');
  // Toggling narration must not touch the separate audio mute.
  await expect(mute).toHaveAttribute('aria-pressed', 'false');

  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  // Toggling audio must not un-mute narration.
  await expect(muteNarration).toHaveAttribute('aria-pressed', 'true');
});
