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

  btn.addEventListener('click', () => {
    if (isFullscreen()) {
      document.exitFullscreen();
    } else {
      targetEl.requestFullscreen();
    }
  });

  targetEl.addEventListener('fullscreenchange', updateLabel);
  updateLabel();
}
