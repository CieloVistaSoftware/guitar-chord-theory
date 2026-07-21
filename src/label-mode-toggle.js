/**
 * Wires the Numbers/Note names button in the fretboard card header to
 * <gt-fretboard>'s scale-view label mode (setLabelMode()).
 */
import { registerBehavior } from './gt-behaviors.js';

export function wireLabelModeToggle(btn, fretboard) {
  let mode = 'number';

  const sync = () => {
    btn.textContent = mode === 'number' ? '🔢 Numbers' : '🎵 Note names';
    btn.setAttribute('aria-pressed', String(mode === 'note'));
  };

  btn.addEventListener('click', () => {
    mode = mode === 'number' ? 'note' : 'number';
    sync();
    fretboard.setLabelMode(mode);
  });

  sync();
}

// data-gt-behavior="label-mode-toggle" on the button; context.fretboard is what it switches.
registerBehavior('label-mode-toggle', (btn, { fretboard }) => wireLabelModeToggle(btn, fretboard));
