/**
 * Runs after every `npm install`. wb-starter is a `file:` dependency (a
 * sibling local repo, not on any registry) -- if it's ever missing from
 * node_modules, the whole site silently fails to load (WB.scan() never
 * runs, no fretboard, no lessons) with nothing but a wall of 404s in the
 * console to explain why. Fail loud and immediately instead.
 */
import { existsSync } from 'fs';

const REQUIRED = ['node_modules/wb-starter/src/core/wb.js'];

const missing = REQUIRED.filter((p) => !existsSync(p));
if (missing.length) {
  console.error('\n[check-deps] Missing required file(s) after npm install:');
  missing.forEach((p) => console.error(`  - ${p}`));
  console.error('wb-starter is a file: dependency (see package.json) pointing at ../wb-starter -- check that sibling folder exists.\n');
  process.exit(1);
}
