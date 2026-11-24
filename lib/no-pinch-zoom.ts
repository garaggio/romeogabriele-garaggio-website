// Niente zoom col pizzico sul trackpad (e con Ctrl + rotellina): la
// composizione della pagina resta quella pensata. Lo zoom del browser dai
// tasti (Cmd/Ctrl + e −) e dal menu resta, per chi ne ha bisogno.
// - Chrome, Edge, Firefox: il pizzico arriva come "wheel" con ctrlKey
// - Safari (Mac, e su iPhone/iPad dove lo rispetta): eventi "gesture…"
// Restituisce la funzione che rimette tutto com'era.

export function blockPinchZoom() {
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey) event.preventDefault()
  }
  const onGesture = (event: Event) => event.preventDefault()
  const gestures = ['gesturestart', 'gesturechange', 'gestureend']

  window.addEventListener('wheel', onWheel, { passive: false })
  for (const type of gestures) {
    document.addEventListener(type, onGesture, { passive: false })
  }

  return () => {
    window.removeEventListener('wheel', onWheel)
    for (const type of gestures) document.removeEventListener(type, onGesture)
  }
}
