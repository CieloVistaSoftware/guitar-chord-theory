/**
 * Wires the fret-markers on/off button in the fretboard card header to
 * <gt-fretboard>'s inlay-dot toggle (setFretMarkers()).
 */
export function wireFretMarkerToggle(btn, fretboard) {
  const sync = () => {
    const on = fretboard.getFretMarkers();
    btn.textContent = on ? '◉ Fret markers' : '○ Fret markers';
    btn.setAttribute('aria-pressed', String(on));
  };

  btn.addEventListener('click', () => {
    fretboard.setFretMarkers(!fretboard.getFretMarkers());
    sync();
  });

  sync();
}
