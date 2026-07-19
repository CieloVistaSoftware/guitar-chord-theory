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
      document.exitFullscreen();
    } else {
      targetEl.requestFullscreen();
    }
  };

  btn.addEventListener('click', toggle);

  // The button is a small target -- clicking anywhere else on the card
  // (the fretboard itself) should also work. Only note dots, the mode/
  // inversion buttons, and the fullscreen button keep their own click
  // behavior; everything else on the card falls through to toggle().
  targetEl.addEventListener('click', (e) => {
    if (e.target.closest('button, a, select, input, .gt-dot')) return;
    toggle();
  });

  targetEl.addEventListener('fullscreenchange', updateLabel);
  updateLabel();
}
