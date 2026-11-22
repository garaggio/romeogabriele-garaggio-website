'use client'

import * as React from 'react'
import { preload } from 'react-dom'

import { optimizedImage, optimizedSrcSet } from '@/lib/optimized-image'
import { lockPageScroll } from '@/lib/scroll-lock'
import { isVideoZoomOpen, openVideoZoom } from '@/lib/video-zoom'

import styles from './Scrapbook.module.css'

// Raccoglitore: galleria ispirata all'accessorio "Scrapbook" del Mac OS
// classico (System 7 / Mac OS 8 Platinum), in chiave editoriale.
// Una fotografia alla volta, metadati sotto, barra di scorrimento classica.
// Si sfoglia con le frecce della barra, cliccando sul binario, trascinando il
// cursore (mouse o dito) oppure con i tasti ← → quando la finestra ha il focus.
// Due versioni: "classic" (Platinum puro) e "modern" (Platinum ritoccato:
// angoli morbidi, ombra diffusa, accenti gialli, testo più grande, dissolvenza).

export interface ScrapbookItem {
  id: string
  /** video: fermo con l'icona ▶, parte ingrandito al clic */
  kind?: 'image' | 'video'
  /** video: fotogramma di anteprima generato da Notion */
  poster?: string
  title: string
  filename: string
  url: string
  year?: string
  category?: string
  description?: string
  /** es. "3000 × 2000 px" */
  dimensions?: string
}

export interface ScrapbookProps {
  items: ScrapbookItem[]
  /** testo della barra del titolo */
  title?: string
  /** "classic" = Mac OS Platinum puro, "modern" = Platinum ritoccato */
  variant?: 'classic' | 'modern'
  /** posizione iniziale (0 = prima immagine) */
  initialIndex?: number
  /** clic sulla foto: ingrandimento animato come nella galleria a scorrimento */
  zoomable?: boolean
  /** pulsante "Scarica" per la foto mostrata (passa da /api/download) */
  downloadable?: boolean
  /** clic sull'immagine centrale, oltre all'ingrandimento */
  onInspect?: (item: ScrapbookItem, index: number) => void
  className?: string
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

// foto ottimizzata (vedi lib/optimized-image.ts): la finestra è larga al
// massimo circa 900 px, il browser sceglie la misura adatta allo schermo
const photoSource = (url: string) => ({
  src: optimizedImage(url, 1080),
  srcSet: optimizedSrcSet(url),
  sizes: '(max-width: 900px) 100vw, 900px'
})

// stessi margini dello zoom della galleria a scorrimento (react-notion-x)
const zoomMargin = () => {
  const width = window.innerWidth
  if (width < 500) return 8
  if (width < 800) return 20
  if (width < 1280) return 30
  if (width < 1600) return 40
  if (width < 1920) return 48
  return 72
}

export function Scrapbook({
  items,
  title = 'Galleria — Archivio',
  variant = 'classic',
  initialIndex = 0,
  zoomable = true,
  downloadable = false,
  onInspect,
  className
}: ScrapbookProps) {
  const count = items.length
  // posizione e direzione dell'ultimo spostamento (1 avanti, -1 indietro):
  // la direzione decide da che lato entra la foto nuova
  const [nav, setNav] = React.useState(() => ({
    index: clamp(initialIndex, 0, Math.max(0, count - 1)),
    dir: 0
  }))
  const index = nav.index
  const [dragging, setDragging] = React.useState(false)
  const trackRef = React.useRef<HTMLDivElement>(null)
  const thumbRef = React.useRef<HTMLDivElement>(null)
  const grabOffset = React.useRef(0)
  const photoRef = React.useRef<HTMLImageElement>(null)
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const closeVideo = React.useRef<(() => void) | null>(null)
  const stageRef = React.useRef<HTMLDivElement>(null)
  // dopo uno scorrimento col dito il "tocco" non deve aprire lo zoom
  const swiped = React.useRef(false)
  const closeZoom = React.useRef<(() => void) | null>(null)
  const id = React.useId()

  // se gli elementi cambiano (pagina aggiornata) l'indice resta valido
  const current = clamp(index, 0, Math.max(0, count - 1))
  const item = items[current]

  const go = React.useCallback(
    (next: number | ((from: number) => number)) =>
      setNav((prev) => {
        const target = typeof next === 'function' ? next(prev.index) : next
        const i = clamp(target, 0, Math.max(0, count - 1))
        return i === prev.index
          ? prev
          : { index: i, dir: i > prev.index ? 1 : -1 }
      }),
    [count]
  )

  // Scorrimento a gesti, una foto per gesto:
  // - trackpad: scorrimento orizzontale a due dita (quello che il browser
  //   riceve; i gesti a tre dita li usa macOS e non arrivano alle pagine)
  // - telefono: scorrimento col dito a destra o a sinistra
  // Lo scorrimento verticale resta alla pagina.
  React.useEffect(() => {
    const stage = stageRef.current
    if (!stage || count < 2) return

    // Trackpad: ogni gesto laterale = una sola foto, avanti o indietro.
    // Dopo il passo la galleria ignora la coda d'inerzia del gesto (su Mac
    // continua per quasi un secondo) e riconosce un gesto NUOVO quando:
    // - gli eventi si fermano per un attimo, oppure
    // - la spinta torna a crescere (l'inerzia può solo calare), oppure
    // - cambia la direzione.
    // Lo scorrimento laterale è sempre trattenuto dalla galleria: anche sulla
    // prima e sull'ultima foto Safari e Chrome non cambiano pagina.
    const threshold = 24 // px di spinta per far partire il passo
    const pause = 140 // ms senza eventi = gesto finito
    let acc = 0
    let locked = false
    let lockedDir = 0
    let lastAbs = 0
    let lastTime = 0
    let stepTime = 0
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return
      event.preventDefault()
      const dx = event.deltaMode === 1 ? event.deltaX * 16 : event.deltaX
      const abs = Math.abs(dx)
      const dir = Math.sign(dx)
      const now = event.timeStamp

      if (locked) {
        const newGesture =
          now - lastTime > pause ||
          dir !== lockedDir ||
          (now - stepTime > 180 && abs > 6 && abs > lastAbs * 1.5)
        if (newGesture) {
          locked = false
          acc = 0
        }
      }
      lastAbs = abs
      lastTime = now
      if (locked) return

      if (acc !== 0 && Math.sign(acc) !== dir) acc = 0
      acc += dx
      if (Math.abs(acc) >= threshold) {
        const d = acc > 0 ? 1 : -1
        go((from) => from + d)
        locked = true
        lockedDir = d
        stepTime = now
        acc = 0
      }
    }

    let startX = 0
    let startY = 0
    let tracking = false
    const onTouchStart = (event: TouchEvent) => {
      const t = event.touches[0]
      tracking = event.touches.length === 1 && !!t
      if (t) {
        startX = t.clientX
        startY = t.clientY
      }
    }
    const onTouchEnd = (event: TouchEvent) => {
      const t = event.changedTouches[0]
      if (!tracking || !t) return
      tracking = false
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        const d = dx < 0 ? 1 : -1
        go((from) => from + d)
        swiped.current = true
        setTimeout(() => (swiped.current = false), 400)
      }
    }

    // la rotellina/trackpad su tutta la finestra (foto, dati e barra)
    const win = stage.closest('section') ?? stage
    win.addEventListener('wheel', onWheel as EventListener, { passive: false })
    stage.addEventListener('touchstart', onTouchStart, { passive: true })
    stage.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      win.removeEventListener('wheel', onWheel as EventListener)
      stage.removeEventListener('touchstart', onTouchStart)
      stage.removeEventListener('touchend', onTouchEnd)
    }
  }, [count, go])

  // La prima foto si scarica insieme alla pagina (il server la annuncia nel
  // <head>), non quando il riquadro è già sullo schermo.
  const first = items[clamp(initialIndex, 0, Math.max(0, count - 1))]
  if (first && first.kind !== 'video') {
    const source = photoSource(first.url)
    preload(source.src, {
      as: 'image',
      imageSrcSet: source.srcSet,
      imageSizes: source.sizes,
      fetchPriority: 'high'
    })
  }

  // precarica la foto precedente e la successiva: lo sfoglio è immediato
  React.useEffect(() => {
    for (const i of [current - 1, current + 1]) {
      const near = items[i]
      if (near && near.kind !== 'video') {
        const img = new Image()
        const source = photoSource(near.url)
        img.decoding = 'async'
        if (source.srcSet) img.srcset = source.srcSet
        img.sizes = source.sizes
        img.src = source.src
      }
    }
  }, [current, items])

  // Ingrandimento: la foto vola dal suo posto al centro dello schermo su un
  // fondo scuro, come nella galleria a scorrimento (stessi tempi e curva).
  // Si chiude con un clic o con Esc; intanto la pagina non scorre.
  const openZoom = () => {
    const img = photoRef.current
    if (!img || closeZoom.current) return

    const rect = img.getBoundingClientRect()
    const margin = zoomMargin()
    const scale = Math.min(
      (window.innerWidth - 2 * margin) / rect.width,
      (window.innerHeight - 2 * margin) / rect.height
    )
    const dx = window.innerWidth / 2 - (rect.left + rect.width / 2)
    const dy = window.innerHeight / 2 - (rect.top + rect.height / 2)

    const overlay = document.createElement('div')
    overlay.className = styles.zoomOverlay!
    const clone = document.createElement('img')
    clone.className = styles.zoomImage!
    clone.src = img.currentSrc || img.src
    clone.alt = img.alt
    Object.assign(clone.style, {
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    })
    document.body.append(overlay, clone)
    img.style.visibility = 'hidden'

    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        overlay.classList.add(styles.zoomOpen!)
        clone.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`
      })
    )

    // la pagina resta ferma finché la foto non è tornata al suo posto
    // (Esc chiude l'ingrandimento)
    const unlock = lockPageScroll(() => close())

    let finished = false
    const close = () => {
      if (closeZoom.current !== close) return
      closeZoom.current = null
      overlay.classList.remove(styles.zoomOpen!)
      clone.style.transform = ''
      const done = () => {
        if (finished) return
        finished = true
        overlay.remove()
        clone.remove()
        img.style.visibility = ''
        // solo ora, con la foto al suo posto, si torna a scorrere
        unlock()
      }
      clone.addEventListener('transitionend', done, { once: true })
      setTimeout(done, 400) // se l'animazione è disattivata
    }

    overlay.addEventListener('click', close)
    clone.addEventListener('click', close)
    closeZoom.current = close
  }

  // chiude l'ingrandimento se il componente sparisce (cambio pagina)
  React.useEffect(
    () => () => {
      closeZoom.current?.()
      closeVideo.current?.()
    },
    []
  )

  // video: ingrandito parte, al clic (o Esc) si ferma e torna al suo posto
  const openVideo = () => {
    const video = videoRef.current
    if (video) closeVideo.current = openVideoZoom(video)
  }
  const zoomOpen = () => !!closeZoom.current || isVideoZoomOpen()

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (zoomOpen()) return
    const keys: Record<string, number> = {
      ArrowLeft: current - 1,
      ArrowRight: current + 1,
      Home: 0,
      End: count - 1
    }
    const next = keys[event.key]
    if (next !== undefined) {
      event.preventDefault()
      go(next)
    }
  }

  // Con il puntatore del mouse sopra la foto i tasti ← → sfogliano subito,
  // senza dover prima cliccare sulla finestra (il clic apre lo zoom).
  // Se la finestra ha già il focus ci pensa onKeyDown: niente doppio passo.
  const hovering = React.useRef(false)
  React.useEffect(() => {
    if (count < 2) return
    const onKey = (event: KeyboardEvent) => {
      if (!hovering.current || zoomOpen() || event.defaultPrevented) {
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (
        target?.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        return
      }
      const d =
        event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
      if (!d) return
      event.preventDefault()
      go((from) => from + d)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [count, go])

  // dalla posizione sul binario all'elemento corrispondente
  const indexFromPointer = (clientX: number, offset: number) => {
    const track = trackRef.current
    const thumb = thumbRef.current
    if (!track || !thumb || count < 2) return current
    const rect = track.getBoundingClientRect()
    const free = rect.width - thumb.offsetWidth
    if (free <= 0) return current
    const ratio = clamp((clientX - rect.left - offset) / free, 0, 1)
    return Math.round(ratio * (count - 1))
  }

  const onTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || count < 2) return
    // click sul binario: salta all'elemento che corrisponde a quel punto
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 0.9999)
    go(Math.floor(ratio * count))
  }

  const onThumbPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (count < 2) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    grabOffset.current = event.clientX - rect.left
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }

  const onThumbPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    go(indexFromPointer(event.clientX, grabOffset.current))
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  if (!count || !item) return null

  // video: fermo sul primo fotogramma ("#t=0.1", anche su iPhone), senza
  // comandi, con l'icona ▶ in basso come nella galleria a scorrimento
  const videoFrame = (
    <span
      key={item.id}
      className={styles.media}
      data-dir={nav.dir || undefined}
    >
      <video
        ref={videoRef}
        className={`${styles.photo} ${styles.video}`}
        src={`${item.url}#t=0.1`}
        poster={item.poster}
        muted
        playsInline
        preload='metadata'
        disablePictureInPicture
        controlsList='nodownload noremoteplayback'
        aria-label={item.title}
      />
      <span className={`g-gallery-play ${styles.play}`} aria-hidden='true'>
        <svg viewBox='0 0 16 16'>
          <path d='M5.5 3.6v8.8a.6.6 0 0 0 .9.5l7-4.4a.6.6 0 0 0 0-1L6.4 3.1a.6.6 0 0 0-.9.5z' />
        </svg>
      </span>
    </span>
  )

  const thumbStyle = {
    '--sb-size': `${100 / count}%`,
    '--sb-pos': count > 1 ? current / (count - 1) : 0
  } as React.CSSProperties

  return (
    <section
      className={[
        styles.window,
        variant === 'modern' && styles.modern,
        className
      ]
        .filter(Boolean)
        .join(' ')}
      aria-roledescription='galleria'
      aria-label={title}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      {/* barra del titolo a righe, con il quadratino di chiusura */}
      <div className={styles.titlebar} aria-hidden='true'>
        <span className={styles.closeBox} />
        <span className={styles.title}>{title}</span>
      </div>

      <div className={styles.body}>
        <div
          className={styles.stage}
          id={`${id}-stage`}
          ref={stageRef}
          data-zoomable={zoomable || onInspect ? '' : undefined}
          // clic in qualsiasi punto dell'area grigia (anche ai lati della
          // foto): ingrandimento. Il pulsante interno resta per la tastiera:
          // Invio sul pulsante arriva qui come clic.
          onClick={() => {
            if (swiped.current || !(zoomable || onInspect)) return
            if (zoomable) {
              if (item.kind === 'video') openVideo()
              else openZoom()
            }
            onInspect?.(item, current)
          }}
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') hovering.current = true
          }}
          onPointerLeave={() => {
            hovering.current = false
          }}
        >
          {zoomable || onInspect ? (
            <button
              type='button'
              className={styles.inspect}
              aria-label={
                item.kind === 'video'
                  ? `Riproduci ${item.title}`
                  : `Ingrandisci ${item.title}`
              }
            >
              {item.kind === 'video' ? (
                videoFrame
              ) : (
                <img
                  key={item.id}
                  ref={photoRef}
                  className={styles.photo}
                  data-dir={nav.dir || undefined}
                  {...photoSource(item.url)}
                  alt={item.title}
                  decoding='async'
                />
              )}
            </button>
          ) : item.kind === 'video' ? (
            videoFrame
          ) : (
            <img
              key={item.id}
              className={styles.photo}
              data-dir={nav.dir || undefined}
              {...photoSource(item.url)}
              alt={item.title}
              decoding='async'
            />
          )}
        </div>

        {/* fascia dei metadati. Altezza fissa: i testi di TUTTE le foto sono
            sovrapposti nella stessa cella (solo quello corrente è visibile),
            così la fascia è sempre alta quanto la foto con più testo e la
            finestra non cambia misura sfogliando. Senza didascalia la seconda
            riga resta vuota ma presente. */}
        <div className={styles.meta}>
          <div className={styles.metaStack}>
            {items.map((entry, i) => {
              const details = [entry.category, entry.year]
                .filter(Boolean)
                .join(' · ')
              return (
                <div
                  key={entry.id}
                  className={styles.metaText}
                  data-hidden={i === current ? undefined : ''}
                  aria-hidden={i === current ? undefined : true}
                >
                  <p className={styles.metaLine}>
                    <span className={styles.filename}>{entry.filename}</span>
                    {details && (
                      <span className={styles.metaDetail}>{details}</span>
                    )}
                    {entry.dimensions && (
                      <span className={styles.metaDetail}>
                        {entry.dimensions}
                      </span>
                    )}
                  </p>
                  <p className={styles.description}>
                    {entry.description || '\u00a0'}
                  </p>
                </div>
              )
            })}
          </div>
          <div className={styles.metaSide}>
            <p className={styles.counter} aria-live='polite'>
              {current + 1} di {count}
            </p>
            {downloadable && (
              // il file arriva come allegato (download vero, non una scheda
              // nuova) e con il suo nome; sopra i 4 MB si apre da Notion
              <a
                className={styles.download}
                href={`/api/download?${new URLSearchParams({
                  url: item.url,
                  name: item.filename
                })}`}
                download={item.filename}
                aria-label={`Scarica ${item.filename}`}
              >
                <svg viewBox='0 0 12 12' aria-hidden='true'>
                  <path d='M6 1.5v6M3.25 5 6 7.75 8.75 5M2 10.25h8' />
                </svg>
                Scarica
              </a>
            )}
          </div>
        </div>

        {/* barra di scorrimento classica (non quella del browser) */}
        <div className={styles.scrollbar}>
          <button
            type='button'
            className={styles.arrow}
            onClick={() => go(current - 1)}
            disabled={current === 0}
            aria-label='Immagine precedente'
            tabIndex={-1}
          >
            {/* triangoli disegnati: i caratteri ◀ ▶ diventano emoji su iPhone */}
            <svg
              className={styles.arrowGlyph}
              viewBox='0 0 8 8'
              aria-hidden='true'
            >
              <path d='M6 1v6L2 4z' />
            </svg>
          </button>

          <div
            ref={trackRef}
            className={styles.track}
            onPointerDown={onTrackPointerDown}
            role='scrollbar'
            aria-controls={`${id}-stage`}
            aria-orientation='horizontal'
            aria-valuemin={1}
            aria-valuemax={count}
            aria-valuenow={current + 1}
            aria-valuetext={`${current + 1} di ${count}: ${item.title}`}
          >
            <div
              ref={thumbRef}
              className={styles.thumb}
              data-dragging={dragging || undefined}
              style={thumbStyle}
              onPointerDown={onThumbPointerDown}
              onPointerMove={onThumbPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            />
          </div>

          <button
            type='button'
            className={styles.arrow}
            onClick={() => go(current + 1)}
            disabled={current === count - 1}
            aria-label='Immagine successiva'
            tabIndex={-1}
          >
            <svg
              className={styles.arrowGlyph}
              viewBox='0 0 8 8'
              aria-hidden='true'
            >
              <path d='M2 1v6l4-3z' />
            </svg>
          </button>
        </div>
      </div>
    </section>
  )
}
