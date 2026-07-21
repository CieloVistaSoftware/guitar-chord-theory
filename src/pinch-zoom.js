/**
 * Pinch/scroll zoom-in-place for an element -- scales the target visually
 * AND grows/shrinks its resizable ancestor's box by the same ratio, so
 * zooming in reveals more of the fretboard instead of just clipping at the
 * edges. Needs a wb-starter resizable ancestor (x-behavior="resizable")
 * exposing element.wbResizable.getSize()/setSize() -- if there isn't one,
 * the box-growing step is simply skipped and only the image scales.
 */
import { registerBehavior } from './gt-behaviors.js';

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

export function wirePinchZoom(container, target) {
  let scale = 1;

  // Looked up fresh on every use, not captured once at wire-time -- WB.scan()
  // applies x-behavior="resizable" asynchronously, so the ancestor may not
  // have its wbResizable API attached yet at the moment this function runs.
  const resizableEl = () => container.closest('.wb-resizable');

  const applyScale = () => {
    target.style.transform = `scale(${scale})`;
  };

  // Grows/shrinks the resizable box by `ratio` (relative to its current
  // actual size, not a remembered baseline) so it composes correctly
  // whether the box just came from a wheel-zoom tick or a manual corner
  // drag -- resizable.js's own setSize() clamps to its min/max-width.
  const growBoxByRatio = (ratio) => {
    const el = resizableEl();
    if (!el?.wbResizable || ratio === 1 || !isFinite(ratio)) return;
    const { width, height } = el.wbResizable.getSize();
    el.wbResizable.setSize(width * ratio, height * ratio);
  };

  // Trackpad pinch and Ctrl+scroll both arrive as wheel events with
  // ctrlKey true -- plain scroll is left alone so the page still scrolls.
  container.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const oldScale = scale;
    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale - e.deltaY * 0.01));
    applyScale();
    growBoxByRatio(scale / oldScale);
  }, { passive: false });

  // Two-finger touch pinch -- same in-place zoom + box growth, gesture-scoped.
  let pinchStartDistance = null;
  let pinchStartScale = 1;
  let pinchStartBoxSize = null;

  const distance = (touches) => {
    const [a, b] = touches;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  container.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      pinchStartDistance = distance(e.touches);
      pinchStartScale = scale;
      pinchStartBoxSize = resizableEl()?.wbResizable?.getSize() || null;
    }
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchStartDistance) {
      e.preventDefault();
      const ratio = distance(e.touches) / pinchStartDistance;
      scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchStartScale * ratio));
      applyScale();
      const el = resizableEl();
      if (el?.wbResizable && pinchStartBoxSize) {
        el.wbResizable.setSize(pinchStartBoxSize.width * ratio, pinchStartBoxSize.height * ratio);
      }
    }
  }, { passive: false });

  container.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) pinchStartDistance = null;
  });
}

// data-gt-behavior="pinch-zoom" on the container; context.fretboard is the target that scales.
registerBehavior('pinch-zoom', (container, { fretboard }) => wirePinchZoom(container, fretboard));
