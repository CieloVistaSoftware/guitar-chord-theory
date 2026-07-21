/**
 * `npm start`: if something is already serving on PORT (e.g. a server left
 * running from a previous session), just open the browser to it instead of
 * crashing with EADDRINUSE. Otherwise start http-server (which opens the
 * browser itself once it's actually listening).
 */
import { spawn, exec } from 'child_process';
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

function openBrowser(url) {
  const command = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(command);
}

const inUse = await isPortInUse(PORT);
if (inUse) {
  console.log(`Port ${PORT} is already serving something -- opening ${URL} instead of starting a second server.`);
  openBrowser(URL);
} else {
  // -c-1 disables http-server's default Cache-Control: max-age=3600 -- with
  // it on, the browser silently keeps serving yesterday's JS/CSS on a normal
  // reload, which looks exactly like "my fix didn't work" during dev.
  spawn('npx', ['http-server', '.', '-p', String(PORT), '-o', '-c-1'], { stdio: 'inherit', shell: true });
}
