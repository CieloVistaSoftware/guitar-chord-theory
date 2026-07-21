/**
 * .gt-info-btn tooltips, portaled to <body> and positioned via JS --
 * position:absolute relative to the button doesn't work here because
 * ancestor wb-cards set overflow:hidden (their own rounded-corner clipping,
 * and gt-fretboard-card's pinch-zoom/drag-pan clipping), silently cutting
 * the tooltip off whenever it's taller than the remaining space in the
 * card. Escaping to <body> with position:fixed, then clamping to the
 * viewport (flipping above the button if it wouldn't fit below, capping
 * height with internal scroll as a last resort), guarantees the content is
 * never cut off regardless of where the button sits or how long the text is.
 */
import { registerBehavior } from './gt-behaviors.js';

const MARGIN = 8; // minimum gap kept from any viewport edge

let openBtn = null;
let portal = null;

function closePortal() {
  if (portal) { portal.remove(); portal = null; }
  if (openBtn) { openBtn.classList.remove('is-open'); openBtn = null; }
}

function positionPortal(btn) {
  const btnRect = btn.getBoundingClientRect();

  const maxHeight = window.innerHeight - MARGIN * 2;
  portal.style.maxHeight = `${maxHeight}px`;

  const portalRect = portal.getBoundingClientRect();

  let left = btnRect.left;
  left = Math.min(left, window.innerWidth - portalRect.width - MARGIN);
  left = Math.max(left, MARGIN);

  // Prefer opening below the button; flip above if it wouldn't fit there.
  let top = btnRect.bottom + 6;
  if (top + portalRect.height > window.innerHeight - MARGIN) {
    const above = btnRect.top - portalRect.height - 6;
    top = above >= MARGIN ? above : MARGIN;
  }

  portal.style.left = `${left}px`;
  portal.style.top = `${top}px`;
}

function openPortal(btn) {
  if (openBtn === btn) return;
  closePortal();

  const source = btn.querySelector('.gt-info-tooltip');
  if (!source) return;

  portal = document.createElement('div');
  portal.className = 'gt-info-tooltip gt-info-tooltip--portal';
  portal.innerHTML = source.innerHTML;
  document.body.appendChild(portal);

  openBtn = btn;
  btn.classList.add('is-open');
  positionPortal(btn);
}

export function wireInfoTooltip(btn) {
  btn.addEventListener('mouseenter', () => openPortal(btn));
  btn.addEventListener('mouseleave', () => { if (openBtn === btn) closePortal(); });
  btn.addEventListener('focus', () => openPortal(btn));
  btn.addEventListener('blur', () => { if (openBtn === btn) closePortal(); });

  // Touch devices have no hover/focus -- tap toggles it explicitly.
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (openBtn === btn) closePortal();
    else openPortal(btn);
  });

  document.addEventListener('click', (e) => {
    if (openBtn !== btn) return;
    if (!btn.contains(e.target) && !(portal && portal.contains(e.target))) closePortal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openBtn === btn) closePortal();
  });

  window.addEventListener('resize', () => { if (openBtn === btn) positionPortal(btn); });
  window.addEventListener('scroll', () => { if (openBtn === btn) positionPortal(btn); }, true);
}

// data-gt-behavior="info-tooltip" -- every .gt-info-btn wires the same way, no extra context needed.
registerBehavior('info-tooltip', (btn) => wireInfoTooltip(btn));
