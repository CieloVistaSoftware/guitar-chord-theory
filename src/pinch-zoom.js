/**
 * Pinch/scroll zoom-in-place for an element -- scales the target visually
 * without touching the container's box size (that's what the corner-drag
 * resize handle is for). Content beyond the container's edges is clipped,
 * like zooming into a photo, not panned.
 */
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

export function wirePinchZoom(container, target) {
  let scale = 1;

  const applyScale = () => {
    target.style.transform = `scale(${scale})`;
  };

  // Trackpad pinch and Ctrl+scroll both arrive as wheel events with
  // ctrlKey true -- plain scroll is left alone so the page still scrolls.
  container.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale - e.deltaY * 0.01));
    applyScale();
  }, { passive: false });

  // Two-finger touch pinch.
  let pinchStartDistance = null;
  let pinchStartScale = 1;

  const distance = (touches) => {
    const [a, b] = touches;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  container.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      pinchStartDistance = distance(e.touches);
      pinchStartScale = scale;
    }
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchStartDistance) {
      e.preventDefault();
      const ratio = distance(e.touches) / pinchStartDistance;
      scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchStartScale * ratio));
      applyScale();
    }
  }, { passive: false });

  container.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) pinchStartDistance = null;
  });
}
