/**
 * Issue #2 -- npm start crashes with EADDRINUSE instead of reusing an
 * already-running server. Issue #20 (reopened) -- when the port is
 * already in use, npm start must still open a browser tab at it, even
 * though there's no portable way to detect or refresh a developer's
 * already-open tab -- an earlier fix over-corrected to opening nothing at
 * all, which was worse. Not a browser test (no page to load) -- exercises
 * scripts/dev-server.js directly via child_process.
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

test('npm start still opens a browser tab when the port is already in use (#20, reopened)', async () => {
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

  // The actual OS-level `start`/`open`/`xdg-open` call produces no
  // stdout/stderr artifact of its own either way -- this is the only
  // thing a test can assert on to prove dev-server.js took the
  // "open anyway" branch instead of the old silent one.
  expect(stdout).toContain('opening a browser tab');
  expect(stdout).not.toContain('NOT opening a new tab');
});
