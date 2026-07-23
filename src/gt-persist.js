/**
 * Tiny sessionStorage-backed persistence for a control's value/state
 * across a page reload -- Key, Notes/string, Starting string, Mode, Time
 * signature, Loop, and Narration Muted must all stay exactly as they were
 * left, the same way CURRENT_LESSON_STORAGE_KEY (lesson-player.js) already
 * keeps the running lesson from resetting on reload. Session-scoped (not
 * localStorage) so it doesn't leak forever into an unrelated later
 * session -- survives same-tab reloads, not a brand new tab/session.
 */
function readStored(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function writeStored(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* private browsing, quota, etc. -- persistence is a nicety, not essential */ }
}

/**
 * Restores a <select>'s value from sessionStorage (if a matching option
 * exists) and persists every future change. Call BEFORE anything else
 * reads the select's initial value (e.g. a stepper widget building its
 * own displayed label from it), or that reader would still see the old
 * default.
 */
export function persistSelect(key, selectEl) {
  if (!selectEl) return;
  const saved = readStored(key);
  if (saved !== null && Array.from(selectEl.options).some((o) => o.value === saved)) {
    selectEl.value = saved;
  }
  selectEl.addEventListener('change', () => writeStored(key, selectEl.value));
}

/** Reads a persisted boolean, or `defaultValue` if this key has never been set. */
export function readPersistedBoolean(key, defaultValue) {
  const saved = readStored(key);
  return saved === null ? defaultValue : saved === 'true';
}

export function writePersistedBoolean(key, value) {
  writeStored(key, String(value));
}
