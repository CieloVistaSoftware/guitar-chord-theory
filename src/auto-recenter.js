/**
 * As an element is dragged bigger via wb-starter's resizable behavior
 * (resizable.js dispatches wb:resize:move on every step, wb:resize:end
 * once released), keep it centered in the viewport instead of letting it
 * grow off the bottom/side and leaving the user to scroll and readjust.
 * `behavior:'auto'` (instant, not smooth) during the live drag -- a smooth
 * scroll animation restarting on every resize tick would fight itself and
 * lag behind the actual resize.
 */
import { registerBehavior } from './gt-behaviors.js';

export function wireAutoRecenterOnResize(element) {
  const recenter = () => element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
  element.addEventListener('wb:resize:move', recenter);
  element.addEventListener('wb:resize:end', recenter);
}

// data-gt-behavior="auto-recenter" -- no extra context needed, it only acts on the element itself.
registerBehavior('auto-recenter', (element) => wireAutoRecenterOnResize(element));
