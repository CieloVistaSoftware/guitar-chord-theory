import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

// Issue #7 -- Auto-scroll to center as each new chord plays in the
// Play-All/Chords-lesson sequence.
test('the currently-playing chord card scrolls to roughly the viewport center', async ({ page }) => {
  await page.locator('.gt-lesson-select').selectOption('chords');
  await page.locator('.gt-lesson-modal__play').click();

  const playingCard = page.locator('.gt-diatonic__chord.is-playing').first();
  await expect(playingCard).toBeVisible({ timeout: 8000 });
  // toBeVisible() only confirms the card is rendered, not that the
  // behavior:'smooth' scrollIntoView() call has finished animating --
  // boundingBox() is a one-shot read, so give the scroll a moment to settle.
  await page.waitForTimeout(500);

  const box = await playingCard.boundingBox();
  const viewportHeight = page.viewportSize().height;
  const cardCenterY = box.y + box.height / 2;
  // "Centered" allowing generous slack -- smooth-scroll animations and
  // varying card heights mean this is never pixel-exact.
  expect(Math.abs(cardCenterY - viewportHeight / 2)).toBeLessThan(viewportHeight * 0.4);
});

// Issue #10 -- Key selector element doesn't move/update based on note name
// selection. Verifies the Key dropdown actually re-roots the visible page
// state (subtitle, fretboard root attribute).
test('changing the Key selector updates the subtitle and fretboard root', async ({ page }) => {
  await expect(page.locator('#key-subtitle')).toHaveText('C');
  await expect(page.locator('gt-fretboard')).toHaveAttribute('root', 'C');

  await page.locator('#key-select').selectOption('G');

  await expect(page.locator('#key-subtitle')).toHaveText('G');
  await expect(page.locator('gt-fretboard')).toHaveAttribute('root', 'G');
  await expect(page.locator('#key-scale-heading')).toHaveText('G');
  await expect(page.locator('#key-chords-heading')).toHaveText('G');
});

// Issue #11 -- "What is a chord?" lesson copy claimed open strings show
// note names/colors they don't. Verifies the corrected copy is live and
// the old, inaccurate phrasing is gone.
test('what-is-a-chord copy matches what the fretboard actually renders', async ({ page }) => {
  await page.locator('.gt-lesson-select').selectOption('what-is-a-chord');
  await page.locator('.gt-lesson-modal__play').click();
  // showModal() populates .gt-lesson-modal__content and un-hides the modal
  // together, after a ~400ms scroll-settle delay -- innerText() is a read,
  // not an action, so it never waits for that; wait for the visible modal
  // (an assertion, which does retry) first.
  await expect(page.locator('.gt-lesson-modal')).toBeVisible();
  // Narration starts collapsed (hidden) by default -- expand it, both to
  // test that reveal mechanism and because innerText() (unlike
  // textContent) returns empty for a display:none element.
  await page.locator('.gt-lesson-modal__collapse-btn').click();
  const modalText = await page.locator('.gt-lesson-modal__content').innerText();

  expect(modalText).toContain('marked 1 in red');
  expect(modalText).toContain('shown as a plain O');
  expect(modalText).not.toMatch(/that's G, the perfect 5th, in cyan/);
});

// Issue #12 -- "Always remember the state": changing Key while viewing a
// chord shape should keep showing a chord shape (re-rooted to the new key),
// not silently drop back to the full-scale view.
test('changing Key while a chord shape is shown keeps showing a chord shape', async ({ page }) => {
  // The Chords lesson itself no longer touches the fretboard (it stays
  // inside the diatonic-chords grid -- see gt-diatonic-chords.js#playAll's
  // updateFretboard option) -- picking a lesson just reveals the grid;
  // clicking an individual chord card is what puts a shape on the neck.
  await page.locator('.gt-lesson-select').selectOption('chords');
  await page.locator('.gt-lesson-modal__play').click();
  await page.locator('.gt-diatonic__chord').first().click();
  await expect(page.locator('.gt-fretboard__chord-banner')).toBeVisible({ timeout: 8000 });

  await page.locator('#key-select').selectOption('D');

  await expect(page.locator('.gt-fretboard__chord-banner')).toBeVisible();
});

// Fret-position inlay markers (3,5,7,9,12...) are on by default and can be
// toggled off/back on from the header.
test('the fret-markers toggle shows and hides the inlay-dot markers', async ({ page }) => {
  const markerCount = () => page.locator('.gt-fret-marker').count();

  await expect.poll(markerCount).toBeGreaterThan(0);

  const toggle = page.locator('.gt-fret-marker-btn');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();

  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(markerCount).toBe(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(markerCount).toBeGreaterThan(0);
});

// New header control: pick which string the pattern's shared starting
// fret is anchored to (default the 6th/low E), instead of that always
// being fixed.
test('picking a different Starting string re-anchors the shared pattern', async ({ page }) => {
  // 6 strings x 3 notes/string, default Key C, +1 for the 2nd string's
  // always-on bonus resolving-root note (see SECOND_STRING_INDEX).
  await expect.poll(() => page.locator('.gt-dot').count()).toBe(19);

  await page.locator('.gt-starting-string-select').selectOption('3'); // 3rd string (G)

  // Still a full box pattern, just anchored elsewhere -- not more or fewer dots.
  await expect.poll(() => page.locator('.gt-dot').count()).toBe(19);
  // C (the root) falls on the G string (open pitch class G) at fret 5 --
  // every string's search starts at/after that SAME fret, so nothing
  // should render below it.
  const minFret = await page.evaluate(() =>
    Math.min(...Array.from(document.querySelectorAll('.gt-dot')).map((d) => Number(d.dataset.fret)))
  );
  expect(minFret).toBe(5);
});

// The 2nd string (B) always gets one extra note beyond the base
// notesPerString -- the resolving root right after its own last note --
// regardless of key/mode/Notes-per-string (SECOND_STRING_INDEX in
// gt-fretboard.js).
test('the 2nd string (B) always shows one extra resolving-root note', async ({ page }) => {
  // Default Key C, Notes/string 3, Starting string 6th (low E): the B
  // string's base 3 notes are degrees 5,6,7 at frets 8,10,12 -- fret 13
  // (root, degree 1) is the always-on bonus note.
  const bStringDots = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.gt-dot'))
      .map((d) => ({ fret: Number(d.dataset.fret), tone: d.dataset.tone, midi: Number(d.dataset.midi) }))
      .filter((d) => d.midi - d.fret === 59) // B string's own open MIDI (STANDARD_TUNING_MIDI[4])
      .sort((a, b) => a.fret - b.fret)
  );
  expect(bStringDots.map((d) => d.tone)).toEqual(['5', '6', '7', '1']);
  expect(bStringDots[3].fret).toBe(13);
});
