import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/spellings.html');
});

// Issue #14 -- the same actual chord (root+quality, e.g. "C major") shows up
// under a different Roman-numeral/Nashville degree in every key that
// harmonizes to it (I in C, IV in G, V in F, ...). Clicking a chip should
// highlight every OTHER chip in the table sharing that same chord, so the
// reader can visually trace where a chord reappears across all the
// harmonized keys.
test('clicking a chord chip highlights every other occurrence of the same chord', async ({ page }) => {
  const chip = page.locator('.cs-diatonic-chip[data-chord-key="C-major"]').first();
  await chip.click();

  const highlighted = page.locator('.cs-diatonic-chip.is-cross-highlighted');
  await expect(highlighted).not.toHaveCount(0);

  // Every highlighted chip must actually be the same chord-key, and at
  // least one of them must live in a different row (key) than the one clicked.
  const count = await highlighted.count();
  expect(count).toBeGreaterThan(1);

  const keys = await highlighted.evaluateAll((chips) => chips.map((c) => c.dataset.chordKey));
  expect(keys.every((k) => k === 'C-major')).toBe(true);

  // Assert at least two distinct rows (keys) are represented among the
  // highlighted chips, by comparing each chip's row key label text.
  const rowKeyLabels = await highlighted.evaluateAll((chips) =>
    chips.map((c) => c.closest('.cs-diatonic-row').querySelector('.cs-diatonic-row__key').textContent)
  );
  expect(new Set(rowKeyLabels).size).toBeGreaterThan(1);
});

test('clicking a different chord chip changes which chips are highlighted', async ({ page }) => {
  const cMajor = page.locator('.cs-diatonic-chip[data-chord-key="C-major"]').first();
  await cMajor.click();

  const afterFirstClick = await page.locator('.cs-diatonic-chip.is-cross-highlighted').evaluateAll(
    (chips) => chips.map((c) => c.dataset.chordKey)
  );
  expect(new Set(afterFirstClick)).toEqual(new Set(['C-major']));

  const gMajor = page.locator('.cs-diatonic-chip[data-chord-key="G-major"]').first();
  await gMajor.click();

  const afterSecondClick = await page.locator('.cs-diatonic-chip.is-cross-highlighted').evaluateAll(
    (chips) => chips.map((c) => c.dataset.chordKey)
  );
  expect(new Set(afterSecondClick)).toEqual(new Set(['G-major']));
});
