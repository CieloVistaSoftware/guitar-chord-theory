/**
 * Wires a button to the browser's native Fullscreen API for a target element.
 * Shared by every page that puts a <gt-fretboard> inside a <wb-card> --
 * fullscreen just needs the element in the document, not any particular tag.
 */
export function wireFullscreenToggle(btn, targetEl) {
  const isFullscreen = () => document.fullscreenElement === targetEl;

  const updateLabel = () => {
    btn.textContent = isFullscreen() ? '⛶ Exit fullscreen' : '⛶ Fullscreen';
    btn.setAttribute('aria-pressed', String(isFullscreen()));
  };

  const toggle = () => {
    if (isFullscreen()) {
      document.exitFullscreen().catch((err) => console.error('[fullscreen] exitFullscreen failed:', err));
    } else {
      // requestFullscreen() rejects (silently, with no visible UI change) if
      // the browser denies it -- e.g. no Permissions-Policy: fullscreen in an
      // embedding context, or the click handler lost user-activation. Log it
      // so "nothing happened" is diagnosable instead of a dead end.
      targetEl.requestFullscreen().catch((err) => console.error('[fullscreen] requestFullscreen failed:', err.name, err.message));
    }
  };

  btn.addEventListener('click', toggle);

  // The button is a small target -- clicking anywhere else on the card
  // (the fretboard itself) should also work. Only note dots, the mode/
  // inversion buttons, the fullscreen button, the card's own resize handle
  // (x-behavior="resizable"), and the lesson narration modal (readable
  // text floats over the fretboard -- see lesson-player.js#showModal) keep
  // their own click behavior; everything else on the card falls through to
  // toggle().
  targetEl.addEventListener('click', (e) => {
    if (e.target.closest('button, a, select, input, .gt-dot, .wb-resizable__handle, .gt-lesson-modal')) return;
    toggle();
  });

  targetEl.addEventListener('fullscreenchange', updateLabel);
  updateLabel();
}
