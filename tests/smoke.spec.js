/**
 * Whole-page smoke test -- catches the class of regression where a
 * dependency (wb-starter, a `file:` dependency pointing at a sibling repo,
 * not a real registry package) goes missing from node_modules and the
 * entire module graph silently fails to load: no fretboard, no lessons,
 * nothing but a wall of 404s in the console. Every other test in this
 * suite assumes the page loaded correctly -- this is the one that actually
 * checks that assumption instead of taking it on faith.
 */
import { test, expect } from '@playwright/test';

test('page loads with no failed requests and no console errors', async ({ page }) => {
  const failedRequests = [];
  const consoleErrors = [];
  page.on('requestfailed', (req) => failedRequests.push(`${req.url()} (${req.failure()?.errorText})`));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  await page.goto('/');
  await page.waitForTimeout(1000);

  expect(failedRequests, `Failed requests:\n${failedRequests.join('\n')}`).toEqual([]);
  expect(consoleErrors, `Console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
});

test('wb-starter actually loaded -- the fretboard renders a real SVG neck', async ({ page }) => {
  await page.goto('/');
  const svg = page.locator('gt-fretboard .gt-fretboard__svg');
  await expect(svg).toBeVisible();
  const dotCount = await page.locator('gt-fretboard .gt-dot').count();
  expect(dotCount).toBeGreaterThan(0);
});

test('the lessons dropdown is genuinely populated, not just present in the DOM', async ({ page }) => {
  await page.goto('/');
  // .count() is a one-shot read, not an auto-retrying assertion -- the
  // dropdown is populated by the page's own <script type="module"> after
  // an internal await chain (WB.scan(), etc.), which doesn't necessarily
  // finish by the moment goto() resolves. Poll instead of reading once
  // immediately (this exact gap intermittently produced a 0-count flake
  // under load from the rest of the suite running first).
  await expect.poll(() => page.locator('.gt-lesson-select option').count()).toBeGreaterThan(1);
});
