/**
 * Issue #2 -- npm start crashes with EADDRINUSE instead of reusing an
 * already-running server. Issue #20 -- when the port is already in use,
 * npm start must not open a new browser tab/window either: with no
 * portable way to detect or refresh a developer's already-open tab, doing
 * so just pops a confusing duplicate tab at the base URL instead of
 * whatever page (spellings.html, songs.html, mid-lesson index.html, ...)
 * they actually had open. It should only print a message telling them to
 * switch to/refresh their existing tab. Not a browser test (no page to
 * load) -- exercises scripts/dev-server.js directly via child_process.
 */
import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import http from 'http';

// Matches scripts/dev-server.js's own check -- a raw TCP listen-probe is
// unreliable on Windows (binding to 127.0.0.1 can succeed even while
// another process holds the port on its wildcard binding), so this asks
// the same question dev-server.js actually cares about: is something
// answering HTTP requests on this port right now.
function isPortInUse(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

test('npm start does not crash when the port is already in use', async () => {
  // Playwright's own webServer is already holding port 4000 for this whole
  // run (see playwright.config.js) -- that's exactly the "already in use"
  // condition this issue is about.
  expect(await isPortInUse(4000)).toBe(true);

  const child = spawn('node', ['scripts/dev-server.js'], {
    cwd: process.cwd(),
    stdio: 'pipe',
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d.toString(); });
  child.stderr.on('data', (d) => { stderr += d.toString(); });

  const exitCode = await new Promise((resolve) => {
    child.on('exit', (code) => resolve(code));
    // dev-server.js opens a browser and returns without keeping the process
    // alive for the "already in use" branch -- give it a moment, then kill
    // it if it's still running for some other reason.
    setTimeout(() => {
      if (child.exitCode === null) child.kill();
    }, 3000);
  });

  expect(stderr).not.toContain('EADDRINUSE');
  expect(stderr).not.toContain('Uncaught');
  expect(stdout).toContain('already serving');
});

test('npm start does not open a new browser tab when the port is already in use (#20)', async () => {
  // Same "already in use" condition as above (Playwright's own webServer
  // holds port 4000 for this whole run).
  expect(await isPortInUse(4000)).toBe(true);

  const child = spawn('node', ['scripts/dev-server.js'], {
    cwd: process.cwd(),
    stdio: 'pipe',
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d.toString(); });
  child.stderr.on('data', (d) => { stderr += d.toString(); });

  await new Promise((resolve) => {
    child.on('exit', () => resolve());
    setTimeout(() => {
      if (child.exitCode === null) child.kill();
      resolve();
    }, 3000);
  });

  // The script must say, in plain language, that it deliberately did not
  // open a tab -- this is the only thing a test can assert on to prove no
  // browser-open call happened, since `start`/`open`/`xdg-open` produce no
  // stdout/stderr artifact of their own either way.
  expect(stdout).toContain('NOT opening a new tab');
  expect(stdout).toContain('switch to or refresh your existing browser tab');

  // No trace of the old open-a-browser wording ("opening <url> instead of
  // starting a second server") should appear anywhere in the output.
  expect(stdout).not.toContain('opening http://127.0.0.1:4000 instead of starting a second server');
});
