import { lockPageScroll } from './scroll-lock'

// Video nelle gallerie 🖼️: nella striscia il video è fermo (si vede il primo
// fotogramma, con l'icona ▶ in basso). Al clic vola al centro dello schermo
// come le foto e parte; un altro clic (o Esc) lo ferma e lo rimette al suo
// posto. Sotto il video una sola barra sottile, come su TikTok: si clicca o
// si trascina per andare avanti e indietro. Nient'altro: play e pausa
// coincidono con apertura e chiusura. Tasti ← → : 5 secondi indietro/avanti.

// spazio sotto il video per la barra
const barRoom = 34

// stessi margini dello zoom delle foto (react-notion-x e Raccoglitore)
const zoomMargin = () => {
  const width = window.innerWidth
  if (width < 500) return 8
  if (width < 800) return 20
  if (width < 1280) return 30
  if (width < 1600) return 40
  if (width < 1920) return 48
  return 72
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

// c'è un video ingrandito? (le gallerie non sfogliano con ← → intanto)
export const isVideoZoomOpen = () => !!document.querySelector('.g-vzoom-video')

export function openVideoZoom(source: HTMLVideoElement) {
  if (isVideoZoomOpen()) return () => {}

  const rect = source.getBoundingClientRect()

  // misura finale: il video intero, con la barra subito sotto. Le proporzioni
  // vengono dal video (o dall'anteprima di Notion, che ha le stesse); se il
  // video non le ha ancora, si correggono appena arrivano.
  const margin = zoomMargin()
  const targetBox = (naturalWidth: number, naturalHeight: number) => {
    const scale = Math.min(
      (window.innerWidth - 2 * margin) / naturalWidth,
      (window.innerHeight - 2 * margin - barRoom) / naturalHeight
    )
    const width = naturalWidth * scale
    const height = naturalHeight * scale
    return {
      width,
      height,
      left: (window.innerWidth - width) / 2,
      top: (window.innerHeight - height - barRoom) / 2
    }
  }
  let box = targetBox(
    source.videoWidth || rect.width,
    source.videoHeight || rect.height
  )

  const place = (
    el: HTMLElement,
    box: Pick<DOMRect, 'top' | 'left' | 'width' | 'height'>
  ) =>
    Object.assign(el.style, {
      top: `${box.top}px`,
      left: `${box.left}px`,
      width: `${box.width}px`,
      height: `${box.height}px`
    })

  const overlay = document.createElement('div')
  overlay.className = 'g-vzoom-overlay'

  const video = document.createElement('video')
  video.className = 'g-vzoom-video'
  // senza il "#t=0.1" della striscia: si parte dall'inizio
  video.src = (source.currentSrc || source.src).split('#')[0]!
  // l'anteprima resta visibile finché non arriva il primo fotogramma
  if (source.poster) video.poster = source.poster
  video.playsInline = true
  video.loop = true
  video.preload = 'auto'
  video.disablePictureInPicture = true
  video.setAttribute('playsinline', '')
  video.setAttribute(
    'controlslist',
    'nodownload noplaybackrate noremoteplayback'
  )
  video.setAttribute('aria-label', source.getAttribute('aria-label') || 'Video')
  place(video, rect)

  // la barra: binario sottile, parte già vista, pallino che compare al passaggio
  const bar = document.createElement('div')
  bar.className = 'g-vzoom-bar'
  bar.tabIndex = 0
  bar.setAttribute('role', 'slider')
  bar.setAttribute('aria-label', 'Avanzamento del video')
  bar.setAttribute('aria-valuemin', '0')
  bar.innerHTML =
    '<div class="g-vzoom-rail"><div class="g-vzoom-fill"></div><div class="g-vzoom-knob"></div></div>'
  // rotellina di attesa: finché il video non sta davvero andando (i file
  // grandi, come i .mov del telefono, impiegano qualche istante)
  const spinner = document.createElement('div')
  spinner.className = 'g-vzoom-spinner g-vzoom-waiting'
  spinner.setAttribute('aria-hidden', 'true')

  const placeExtras = () => {
    Object.assign(bar.style, {
      top: `${box.top + box.height}px`,
      left: `${box.left}px`,
      width: `${box.width}px`,
      height: `${barRoom}px`
    })
    Object.assign(spinner.style, {
      top: `${box.top + box.height / 2}px`,
      left: `${box.left + box.width / 2}px`
    })
  }
  placeExtras()

  document.body.append(overlay, video, spinner, bar)
  source.style.visibility = 'hidden'

  // riproduzione: con l'audio; se il browser non lo permette, senza. Se il
  // video non è ancora pronto si riprova appena può partire.
  let closing = false
  let dragging = false
  const play = () => {
    if (closing || dragging) return
    void video.play().catch((err: DOMException) => {
      if (err?.name !== 'NotAllowedError' || video.muted) return
      video.muted = true
      video.play().catch(() => {})
    })
  }
  play()
  const onCanPlay = () => {
    if (video.paused) play()
  }
  const onPlaying = () => spinner.classList.remove('g-vzoom-waiting')
  const onWaiting = () => spinner.classList.add('g-vzoom-waiting')
  // proporzioni vere appena note (se prima non lo erano)
  const onMetadata = () => {
    if (closing || !video.videoWidth || !video.videoHeight) return
    const next = targetBox(video.videoWidth, video.videoHeight)
    if (
      Math.abs(next.width - box.width) < 1 &&
      Math.abs(next.height - box.height) < 1
    )
      return
    box = next
    place(video, box)
    placeExtras()
  }
  video.addEventListener('canplay', onCanPlay)
  video.addEventListener('playing', onPlaying)
  video.addEventListener('waiting', onWaiting)
  video.addEventListener('loadedmetadata', onMetadata)

  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      overlay.classList.add('g-vzoom-open')
      bar.classList.add('g-vzoom-open')
      spinner.classList.add('g-vzoom-open')
      place(video, box)
    })
  )

  // avanzamento: aggiornato a ogni fotogramma, così la barra scorre fluida
  let frame = 0
  const paint = () => {
    const duration = video.duration
    const ratio =
      Number.isFinite(duration) && duration > 0
        ? clamp(video.currentTime / duration, 0, 1)
        : 0
    bar.style.setProperty('--p', String(ratio))
    frame = requestAnimationFrame(paint)
  }
  frame = requestAnimationFrame(paint)

  const onTime = () => {
    bar.setAttribute('aria-valuemax', String(Math.round(video.duration || 0)))
    bar.setAttribute('aria-valuenow', String(Math.round(video.currentTime)))
  }
  video.addEventListener('timeupdate', onTime)

  const seekTo = (time: number) => {
    const duration = video.duration
    if (!Number.isFinite(duration) || duration <= 0) return
    video.currentTime = clamp(time, 0, duration)
  }

  // trascinamento sulla barra: il video si ferma mentre si cerca il punto
  // e riparte al rilascio
  const seekFromPointer = (clientX: number) => {
    const box = bar.getBoundingClientRect()
    seekTo(((clientX - box.left) / box.width) * video.duration)
  }
  bar.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    event.stopPropagation()
    dragging = true
    bar.classList.add('g-vzoom-dragging')
    bar.setPointerCapture(event.pointerId)
    video.pause()
    seekFromPointer(event.clientX)
  })
  bar.addEventListener('pointermove', (event) => {
    if (dragging) seekFromPointer(event.clientX)
  })
  const endDrag = (event: PointerEvent) => {
    if (!dragging) return
    dragging = false
    bar.classList.remove('g-vzoom-dragging')
    if (bar.hasPointerCapture(event.pointerId)) {
      bar.releasePointerCapture(event.pointerId)
    }
    play()
  }
  bar.addEventListener('pointerup', endDrag)
  bar.addEventListener('pointercancel', endDrag)
  // il clic sulla barra non chiude il video
  bar.addEventListener('click', (event) => event.stopPropagation())

  const onKey = (event: KeyboardEvent) => {
    const d =
      event.key === 'ArrowRight' ? 5 : event.key === 'ArrowLeft' ? -5 : 0
    if (!d) return
    event.preventDefault()
    seekTo(video.currentTime + d)
  }
  window.addEventListener('keydown', onKey)

  // la pagina resta ferma finché il video non è tornato al suo posto
  // (Esc chiude)
  const unlock = lockPageScroll(() => close())

  let finished = false
  const close = () => {
    if (closing) return
    closing = true
    video.pause()
    window.removeEventListener('keydown', onKey)
    overlay.classList.remove('g-vzoom-open')
    bar.classList.remove('g-vzoom-open')
    spinner.classList.remove('g-vzoom-open')
    place(video, source.getBoundingClientRect())
    const done = () => {
      if (finished) return
      finished = true
      cancelAnimationFrame(frame)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('loadedmetadata', onMetadata)
      spinner.remove()
      video.removeAttribute('src')
      video.load()
      overlay.remove()
      video.remove()
      bar.remove()
      source.style.visibility = ''
      unlock()
    }
    video.addEventListener('transitionend', done, { once: true })
    setTimeout(done, 400) // se l'animazione è disattivata
  }

  overlay.addEventListener('click', close)
  video.addEventListener('click', close)

  return close
}
