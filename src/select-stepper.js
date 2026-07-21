/**
 * Turns a native <select> into a < value > prev/next stepper, without
 * changing anything about how the rest of the app reads/listens to it --
 * the original <select> stays in the DOM (with its id/class untouched) as
 * the actual source of truth, just visually hidden; the stepper's buttons
 * change its selectedIndex and dispatch a real 'change' event on it, same
 * as a user picking an option would.
 *
 * Why: every native <select> inside the fretboard card lives inside the
 * element that goes fullscreen (x-behavior/wireFullscreenToggle target).
 * Opening a native select's dropdown is an OS-level popup, and Chromium
 * auto-exits fullscreen the moment one opens, regardless of where the
 * <select> sits in the DOM -- a security measure against fullscreen pages
 * spoofing browser/OS UI, not something any click-handler code here can
 * override. Buttons don't have that problem at all, hence the stepper
 * instead of trying to keep the native dropdown.
 */
import { registerBehavior } from './gt-behaviors.js';

export function wireStepper(selectEl) {
  if (!selectEl || selectEl.dataset.stepperWired) return;
  selectEl.dataset.stepperWired = 'true';

  // Keep it in the DOM and still a real, focusable, change-dispatching
  // <select> (so existing querySelector('...').value and 'change'
  // listeners elsewhere need zero changes) -- just not visible or
  // interactive on its own; the stepper buttons drive it instead.
  selectEl.style.position = 'absolute';
  selectEl.style.width = '1px';
  selectEl.style.height = '1px';
  selectEl.style.opacity = '0';
  selectEl.style.pointerEvents = 'none';
  selectEl.tabIndex = -1;

  const stepper = document.createElement('span');
  stepper.className = 'gt-stepper';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'gt-stepper__btn gt-stepper__prev';
  prevBtn.textContent = '‹';
  prevBtn.setAttribute('aria-label', 'Previous');

  const valueLabel = document.createElement('span');
  valueLabel.className = 'gt-stepper__value';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'gt-stepper__btn gt-stepper__next';
  nextBtn.textContent = '›';
  nextBtn.setAttribute('aria-label', 'Next');

  stepper.append(prevBtn, valueLabel, nextBtn);
  selectEl.insertAdjacentElement('afterend', stepper);

  function sync() {
    valueLabel.textContent = selectEl.options[selectEl.selectedIndex]?.textContent ?? '';
  }

  function step(delta) {
    const count = selectEl.options.length;
    if (!count) return;
    const idx = ((selectEl.selectedIndex + delta) % count + count) % count; // wraps both directions
    if (idx === selectEl.selectedIndex) return;
    selectEl.selectedIndex = idx;
    selectEl.dispatchEvent(new Event('change'));
    sync();
  }

  prevBtn.addEventListener('click', () => step(-1));
  nextBtn.addEventListener('click', () => step(1));
  // The select's own value can still change from elsewhere (e.g. a lesson
  // resetting Notes-per-string to 3, or the bfcache-restore guard) --
  // keep the visible label in sync with whatever it currently holds.
  selectEl.addEventListener('change', sync);
  sync();
}

// data-gt-behavior="stepper" -- no extra context needed, it only acts on the select itself.
registerBehavior('stepper', (selectEl) => wireStepper(selectEl));
