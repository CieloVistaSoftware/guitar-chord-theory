/**
 * `npm start`: if something is already serving on PORT (e.g. a server left
 * running from a previous session), don't crash with EADDRINUSE -- open a
 * browser tab at it anyway (see the note below) instead of leaving the
 * developer with nothing but a console message. Otherwise start
 * http-server (which opens the browser itself once it's actually
 * listening).
 */
import { spawn } from 'child_process';
import http from 'http';

const PORT = 4000;
const URL = `http://127.0.0.1:${PORT}`;

// No portable, reliable way for a plain Node script to find or refresh a
// tab a developer already has open (no CDP wired up, and this has to work
// cross-platform) -- so this always opens a NEW tab/window at the bare
// origin rather than refreshing whatever page (spellings.html, songs.html,
// mid-lesson index.html, ...) they actually had open. That's an accepted
// tradeoff (issue #20/reopened): seeing an extra tab beats seeing nothing.
function openBrowser(url) {
  if (process.platform === 'win32') {
    // The empty "" is a required (and often forgotten) placeholder for
    // `start`'s own window-title argument -- without it, `start` treats
    // the URL itself as the title and fails to open anything.
    spawn('cmd', ['/c', 'start', '""', url], { stdio: 'ignore', shell: true });
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { stdio: 'ignore' });
  } else {
    spawn('xdg-open', [url], { stdio: 'ignore' });
  }
}

// A raw TCP listen-probe (net.createServer().listen(port, '127.0.0.1')) is
// unreliable on Windows: binding a new listener to the loopback address can
// succeed even while another process already holds the port on its
// wildcard/dual-stack binding, so it reports "free" when a server is
// actually right there serving requests. An HTTP request is what we
// actually care about anyway ("is something answering on this port"), and
// it's what Playwright's own webServer reuseExistingServer check does too.
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

const inUse = await isPortInUse(PORT);
if (inUse) {
  console.log(`Port ${PORT} is already serving something -- opening a browser tab at ${URL} anyway (this opens a NEW tab rather than refreshing one you may already have, since a plain script can't reliably do that).`);
  openBrowser(URL);
} else {
  // -c-1 disables http-server's default Cache-Control: max-age=3600 -- with
  // it on, the browser silently keeps serving yesterday's JS/CSS on a normal
  // reload, which looks exactly like "my fix didn't work" during dev.
  spawn('npx', ['http-server', '.', '-p', String(PORT), '-o', '-c-1'], { stdio: 'inherit', shell: true });
}
