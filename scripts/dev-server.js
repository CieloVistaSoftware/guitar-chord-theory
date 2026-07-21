/**
 * `npm start`: if something is already serving on PORT (e.g. a server left
 * running from a previous session), don't crash with EADDRINUSE -- and
 * don't open a new browser tab either (see the note below); just tell the
 * developer it's already up. Otherwise start http-server (which opens the
 * browser itself once it's actually listening).
 */
import { spawn } from 'child_process';
import http from 'http';

const PORT = 4000;
const URL = `http://127.0.0.1:${PORT}`;

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
  // Do NOT open a browser here. There's no portable, reliable way for a
  // plain Node script to find or refresh a tab a developer already has
  // open (no CDP wired up, and this has to work cross-platform) -- so
  // rather than guessing, `start ""`/`open`/`xdg-open` would always pop a
  // brand-new tab/window at the bare origin, hijacking whatever page
  // (spellings.html, songs.html, mid-lesson index.html, ...) the developer
  // actually had open. Just say so and let them switch to/refresh it
  // themselves.
  console.log(`Port ${PORT} is already serving something -- NOT opening a new tab; switch to or refresh your existing browser tab (or open ${URL} yourself if you don't have one).`);
} else {
  // -c-1 disables http-server's default Cache-Control: max-age=3600 -- with
  // it on, the browser silently keeps serving yesterday's JS/CSS on a normal
  // reload, which looks exactly like "my fix didn't work" during dev.
  spawn('npx', ['http-server', '.', '-p', String(PORT), '-o', '-c-1'], { stdio: 'inherit', shell: true });
}
