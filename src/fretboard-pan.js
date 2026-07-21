/**
 * Click-and-drag panning for the fretboard's cropped view (see
 * gt-fretboard.js panBy/panByScreenPixels/focusFrets) -- lets the learner
 * slide which frets are visible instead of only jumping between a lesson's
 * zoom and the full neck. Distinct from pinch-zoom.js's CSS-transform
 * scaling: this shifts WHICH frets are in the viewBox, not how big the
 * rendered image is; the two work together fine.
 *
 * A plain click still has to work too (note dots, the fullscreen-toggle
 * click-anywhere handler) -- a drag under DRAG_THRESHOLD_PX is treated as a
 * click and left alone; anything past that suppresses the click that would
 * otherwise fire on release.
 */
import { registerBehavior } from './gt-behaviors.js';

const DRAG_THRESHOLD_PX = 6;

export function wireFretboardPan(container, fretboardEl) {
  let dragging = false;
  let didDrag = false;
  let startX = 0;
  let lastX = 0;

  const onPointerDown = (e) => {
    if (e.button !== 0 && e.button !== undefined) return; // left mouse button / primary touch only
    if (e.target.closest('button, a, select, input, .gt-dot, .wb-resizable__handle, .gt-lesson-modal')) return;
    dragging = true;
    didDrag = false;
    startX = lastX = e.clientX;
  };

  const onPointerMove = (e) => {
    if (!dragging) return;
    if (!didDrag && Math.abs(e.clientX - startX) < DRAG_THRESHOLD_PX) return;
    didDrag = true;
    e.preventDefault();
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    fretboardEl.panByScreenPixels(dx);
  };

  const onPointerUp = () => {
    dragging = false;
  };

  // Capture phase, same element: fires before the fullscreen-toggle click
  // handler (bound to the ancestor .gt-fretboard-card) and before gt-
  // fretboard.js's own dot click handlers get their bubble-phase turn.
  const onClickCapture = (e) => {
    if (!didDrag) return;
    e.stopPropagation();
    e.preventDefault();
    didDrag = false;
  };

  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerup', onPointerUp);
  container.addEventListener('pointercancel', onPointerUp);
  container.addEventListener('click', onClickCapture, true);
}

// data-gt-behavior="fretboard-pan" on the container; context.fretboard is the element panned.
registerBehavior('fretboard-pan', (container, { fretboard }) => wireFretboardPan(container, fretboard));
