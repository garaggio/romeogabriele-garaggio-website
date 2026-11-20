'use client'

import * as React from 'react'

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
  /** clic sull'immagine centrale, oltre all'ingrandimento */
  onInspect?: (item: ScrapbookItem, index: number) => void
  className?: string
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

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

  // precarica la foto precedente e la successiva: lo sfoglio è immediato
  React.useEffect(() => {
    for (const i of [current - 1, current + 1]) {
      const near = items[i]
      if (near) {
        const img = new Image()
        img.decoding = 'async'
        img.src = near.url
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

    // la pagina resta ferma finché la foto non è tornata al suo posto:
    // niente rotellina, trackpad, dito né tasti di scorrimento
    const scrollKeys = new Set([
      ' ',
      'ArrowUp',
      'ArrowDown',
      'PageUp',
      'PageDown',
      'Home',
      'End'
    ])
    const blockScroll = (event: Event) => event.preventDefault()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
      } else if (scrollKeys.has(event.key)) {
        event.preventDefault()
      }
    }
    const root = document.documentElement
    const previousOverflow = root.style.overflow
    const previousPadding = root.style.paddingRight
    // la barra di scorrimento sparisce: compensiamo, così la pagina non salta
    const scrollbar = window.innerWidth - root.clientWidth
    root.style.overflow = 'hidden'
    if (scrollbar > 0) root.style.paddingRight = `${scrollbar}px`
    window.addEventListener('wheel', blockScroll, { passive: false })
    window.addEventListener('touchmove', blockScroll, { passive: false })
    window.addEventListener('keydown', onKey)

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
        window.removeEventListener('wheel', blockScroll)
        window.removeEventListener('touchmove', blockScroll)
        window.removeEventListener('keydown', onKey)
        root.style.overflow = previousOverflow
        root.style.paddingRight = previousPadding
      }
      clone.addEventListener('transitionend', done, { once: true })
      setTimeout(done, 400) // se l'animazione è disattivata
    }

    overlay.addEventListener('click', close)
    clone.addEventListener('click', close)
    closeZoom.current = close
  }

  // chiude l'ingrandimento se il componente sparisce (cambio pagina)
  React.useEffect(() => () => closeZoom.current?.(), [])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (closeZoom.current) return
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
      if (!hovering.current || closeZoom.current || event.defaultPrevented) {
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
            if (zoomable) openZoom()
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
              aria-label={`Ingrandisci ${item.title}`}
            >
              <img
                key={item.id}
                ref={photoRef}
                className={styles.photo}
                data-dir={nav.dir || undefined}
                src={item.url}
                alt={item.title}
                decoding='async'
              />
            </button>
          ) : (
            <img
              key={item.id}
              className={styles.photo}
              data-dir={nav.dir || undefined}
              src={item.url}
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
          <p className={styles.counter} aria-live='polite'>
            {current + 1} di {count}
          </p>
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
            ◀
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
            ▶
          </button>
        </div>
      </div>
    </section>
  )
}
