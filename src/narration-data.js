/**
 * Loads narration.json (repo root -- NOT data/, which is entirely
 * gitignored in this project for the unrelated bg-health.json runtime
 * file) -- the editable source of truth for spoken
 * lesson narration (see narration-editor.html). Each entry's `text` may
 * contain a `{key}` placeholder, filled in with whatever the Key selector
 * is currently set to at speak-time -- so editing narration.json changes
 * what's actually said without needing to touch index.html's own visible
 * lesson copy at all.
 *
 * Fetched once and cached; if the file is missing/unreachable (e.g. a
 * stale deploy), lookups just return null and the caller falls back to
 * whatever it would have said before this existed.
 */

let cache = null; // Map<id, {title, usedIn, text}> once loaded; null until loadNarrationData() resolves

export async function loadNarrationData() {
  if (cache) return cache;
  try {
    const res = await fetch('narration.json', { cache: 'no-store' });
    const { narrations } = await res.json();
    cache = new Map(narrations.map((n) => [n.id, n]));
  } catch {
    cache = new Map(); // missing/invalid file -- treat as "no entries," not a crash
  }
  return cache;
}

/** Raw entries, in file order -- used by the narration editor to render its list. */
export async function loadNarrationEntries() {
  const map = await loadNarrationData();
  return [...map.values()];
}

/**
 * The current spoken text for `id`, with `{key}` substituted -- or null if
 * narration.json hasn't loaded yet or has no entry for this id (the caller
 * should fall back to its own DOM-derived text in that case).
 */
export function getNarrationText(id, key) {
  if (!cache) return null;
  const entry = cache.get(id);
  if (!entry) return null;
  return entry.text.replace(/\{key\}/g, key ?? '');
}
