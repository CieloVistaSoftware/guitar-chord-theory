/**
 * Tap-to-open support for .gt-info-btn tooltips. The CSS already reveals
 * the tooltip on :hover/:focus-visible for a mouse -- touch devices have no
 * hover state at all, so without this the tooltip content is unreachable
 * on mobile. Tapping toggles .is-open; tapping elsewhere or Escape closes it.
 */
export function wireInfoTooltip(btn) {
  const close = () => btn.classList.remove('is-open');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    btn.classList.toggle('is-open');
  });

  document.addEventListener('click', (e) => {
    if (!btn.classList.contains('is-open')) return;
    if (!btn.contains(e.target)) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}
