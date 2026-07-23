/**
 * Renders one editable card per data/narration.json entry into `container`.
 * Purely in-memory -- this is a static site with no backend to write the
 * file back to, so "saving" means downloading the edited JSON and
 * committing it over data/narration.json yourself (see the Download button
 * in narration-editor.html). getEntries()/onChange let the page wire up
 * Download/Copy without this module knowing anything about the DOM outside
 * its own container.
 */
export function renderNarrationEditor(container, entries) {
  // Cloned so edits here never mutate the cache narration-data.js itself
  // reads from -- this page is a standalone editor, not a live control
  // panel wired back into the running lesson player.
  const state = entries.map((e) => ({ ...e }));

  container.innerHTML = state.map((entry, i) => `
    <div class="ne-card" data-index="${i}">
      <div class="ne-card__header">
        <input type="text" class="ne-title" value="${escapeAttr(entry.title)}" aria-label="Title">
        <button type="button" class="ne-preview-btn" title="Speak this text aloud (using a sample key of C for {key})">▶ Preview</button>
      </div>
      <div class="ne-used-in">${escapeHtml(entry.usedIn)}</div>
      <textarea class="ne-text" rows="4" aria-label="Narration text">${escapeHtml(entry.text)}</textarea>
    </div>
  `).join('');

  container.querySelectorAll('.ne-card').forEach((card) => {
    const i = Number(card.dataset.index);
    card.querySelector('.ne-title').addEventListener('input', (e) => { state[i].title = e.target.value; });
    card.querySelector('.ne-text').addEventListener('input', (e) => { state[i].text = e.target.value; });
    card.querySelector('.ne-preview-btn').addEventListener('click', () => {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const sample = state[i].text.replace(/\{key\}/g, 'C');
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(sample));
    });
  });

  return {
    /** Current { id, title, usedIn, text } for every entry, in file order -- reflects live edits. */
    getEntries: () => state.map((e) => ({ ...e })),
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
