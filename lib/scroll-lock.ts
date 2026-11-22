// Blocca lo scorrimento della pagina mentre una foto è ingrandita (galleria
// retrò e galleria 🖼️): niente rotellina, trackpad, dito né tasti di
// scorrimento. La barra di scorrimento sparisce: compensiamo con un margine,
// così la pagina non salta di lato. Restituisce la funzione che sblocca.

const scrollKeys = new Set([
  ' ',
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End'
])

export function lockPageScroll(onEscape?: () => void) {
  const root = document.documentElement
  const previousOverflow = root.style.overflow
  const previousPadding = root.style.paddingRight
  const scrollbar = window.innerWidth - root.clientWidth

  const block = (event: Event) => event.preventDefault()
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') onEscape?.()
    else if (scrollKeys.has(event.key)) event.preventDefault()
  }

  root.style.overflow = 'hidden'
  if (scrollbar > 0) root.style.paddingRight = `${scrollbar}px`
  window.addEventListener('wheel', block, { passive: false })
  window.addEventListener('touchmove', block, { passive: false })
  window.addEventListener('keydown', onKey)

  let unlocked = false
  return () => {
    if (unlocked) return
    unlocked = true
    window.removeEventListener('wheel', block)
    window.removeEventListener('touchmove', block)
    window.removeEventListener('keydown', onKey)
    root.style.overflow = previousOverflow
    root.style.paddingRight = previousPadding
  }
}
