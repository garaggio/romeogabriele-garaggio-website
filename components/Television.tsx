'use client'

import * as React from 'react'

import type { TelevisionVideo } from '@/lib/television'
import { lockPageScroll } from '@/lib/scroll-lock'
import {
  loadYouTubeApi,
  PlayerState,
  type YouTubePlayer
} from '@/lib/youtube-player'

import styles from './Television.module.css'

// Televisore 📺: i video di YouTube con la grafica della copertina di
// "youtuyoutuyou 2.5": televideo su un vecchio schermo catodico.
// - in alto: le tre lucine, i canali 01…10 (uno per link), "▪ GARAGGIO"
//   (al suo posto, per un attimo, volume e canale quando cambiano)
// - al centro il video. Fermo: la copertina con il titolo e il riquadro blu
// - in basso: la barra sottile per andare avanti e indietro e la fascia
//   colorata della copertina:  VOL −  VOL +  ▶ play/pausa  ⛶ schermo intero
// - scorrendo di lato (trackpad o dito) si passa al video precedente o
//   successivo, un video per gesto, come nel Raccoglitore delle foto. Vale
//   sulla copertina e sulle fasce del televisore: sopra il video che va,
//   clic e gesti sono del player di YouTube (i suoi comandi restano attivi)
// - schermo intero: solo il video, senza l'effetto del televisore
// Tastiera (televisore selezionato): spazio play/pausa, ← → 5 secondi,
// ↑ ↓ volume, F schermo intero, Esc per uscire.
// Fino al primo clic si vede solo la copertina catodica: il player di YouTube
// si prepara fermo sotto la copertina quando il televisore sta per comparire,
// e il clic lo fa partire subito (un clic solo, anche su Safari).

type Phase = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

export interface TelevisionProps {
  videos: TelevisionVideo[]
  /** testo del riquadro blu (es. "2.5"); senza, il numero del canale */
  label?: string
}

const channelSlots = 10
const volumeStep = 10
const pad = (n: number) => String(n).padStart(2, '0')
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

// su iPhone e iPad il volume si regola solo con i tasti del telefono:
// lì  VOL −  e  VOL +  tolgono e rimettono l'audio
const volumeLocked = () =>
  /iP(hone|od|ad)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

// copertina: quella scelta dal server (lib/notion.ts), altrimenti la media,
// che esiste sempre
const coverOf = (video: TelevisionVideo) =>
  video.thumbnail ?? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`

// il video sulla pagina di YouTube (dal punto di partenza, se c'è)
const watchUrl = (video: TelevisionVideo) => {
  const url = new URL('https://www.youtube.com/watch')
  url.searchParams.set('v', video.id)
  if (video.start) url.searchParams.set('t', `${video.start}s`)
  return url.toString()
}

// perché YouTube non fa vedere un video (codici di errore del player)
const errorReasons: Record<number, string> = {
  2: 'LINK DEL VIDEO NON VALIDO',
  5: 'IL BROWSER NON RIESCE A RIPRODURLO',
  100: 'VIDEO PRIVATO O RIMOSSO',
  101: 'INCORPORAMENTO DISATTIVATO SU YOUTUBE',
  150: 'INCORPORAMENTO DISATTIVATO SU YOUTUBE',
  153: 'YOUTUBE NON RICONOSCE IL SITO (ERRORE 153)'
}

// schermo intero vero (Mac, Android, iPad); su iPhone non esiste per gli
// elementi della pagina: lì il video riempie la finestra
const fullscreenElement = () =>
  document.fullscreenElement ?? (document as any).webkitFullscreenElement

export function Television({ videos, label }: TelevisionProps) {
  const [channel, setChannel] = React.useState(0)
  const [phase, setPhase] = React.useState<Phase>('idle')
  // scritta temporanea al posto di "GARAGGIO" (volume, canale, audio)
  const [osd, setOsd] = React.useState<React.ReactNode>(null)
  // schermo intero: "native" del browser, "window" che riempie la finestra
  const [fullscreen, setFullscreen] = React.useState<
    'native' | 'window' | null
  >(null)
  // codice dell'ultimo errore di YouTube (per scrivere il motivo)
  const [errorCode, setErrorCode] = React.useState<number | null>(null)
  // Safari (e ogni browser su iPhone/iPad) fa partire un video di YouTube solo
  // se il PRIMO tocco è sul player di YouTube, non su un pulsante del sito.
  // Se il play chiesto dal sito non parte, la copertina lascia passare i clic
  // al player che sta sotto e si chiede di toccare il video. Dopo il primo
  // play tutto torna ai comandi del sito.
  const [needsTap, setNeedsTap] = React.useState(false)
  // cambia a ogni accensione: fa ripartire l'animazione del tubo catodico
  const [powerKey, setPowerKey] = React.useState(0)

  const rootRef = React.useRef<HTMLElement>(null)
  const pictureRef = React.useRef<HTMLDivElement>(null)
  const stageRef = React.useRef<HTMLDivElement>(null)
  const seekRef = React.useRef<HTMLDivElement>(null)
  const playerRef = React.useRef<YouTubePlayer | null>(null)
  const readyRef = React.useRef(false)
  const volumeRef = React.useRef(100)
  const mutedRef = React.useRef(false)
  const draggingRef = React.useRef(false)
  const channelRef = React.useRef(0)
  const phaseRef = React.useRef<Phase>('idle')
  const swipedRef = React.useRef(false)
  const preparingRef = React.useRef(false)
  // si è chiesto di vedere il video (non solo di preparare il player)
  const wantPlayRef = React.useRef(false)
  const startedRef = React.useRef(false)
  // video che YouTube ha rifiutato (si ricaricano al prossimo play)
  const failedRef = React.useRef(new Set<string>())
  // il video è partito almeno una volta (il browser ora accetta i comandi)
  const activatedRef = React.useRef(false)
  // video caricato nel player in questo momento
  const cuedIdRef = React.useRef<string | null>(null)
  // a schermo intero lo scorrimento laterale non cambia video
  const fullscreenRef = React.useRef(false)
  const osdTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  const audioTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  const unlockWindowRef = React.useRef<(() => void) | null>(null)

  phaseRef.current = phase
  fullscreenRef.current = fullscreen !== null
  const video = videos[channel] ?? videos[0]!
  const count = Math.min(videos.length, channelSlots)

  const flash = React.useCallback((content: React.ReactNode) => {
    setOsd(content)
    clearTimeout(osdTimer.current)
    osdTimer.current = setTimeout(() => setOsd(null), 1800)
  }, [])

  const showVolume = React.useCallback(() => {
    const muted = mutedRef.current
    const level = muted ? 0 : Math.round(volumeRef.current / volumeStep)
    flash(
      <span className={styles.osdVolume}>
        {muted ? 'AUDIO OFF' : 'VOL'}
        <span className={styles.osdBlocks} aria-hidden='true'>
          {Array.from({ length: 10 }, (_, i) => (
            <i key={i} data-on={i < level || undefined} />
          ))}
        </span>
      </span>
    )
  }, [flash])

  // Controllo dopo un play chiesto dal sito: se il video non è partito,
  // - prima del primo play: il browser (Safari) vuole il primo tocco sul
  //   player di YouTube. La copertina diventa trasparente ai clic e si chiede
  //   di toccare il video
  // - dopo: si riprova senza audio, il tasto VOL + lo riaccende
  const armAudioFallback = React.useCallback(() => {
    clearTimeout(audioTimer.current)
    audioTimer.current = setTimeout(
      () => {
        const player = playerRef.current
        if (!player || !readyRef.current) return
        const state = player.getPlayerState()
        if (state === PlayerState.playing || state === PlayerState.buffering) {
          return
        }
        if (!activatedRef.current) {
          setNeedsTap(true)
          setPhase('idle')
          flash('TOCCA IL VIDEO ▶')
          return
        }
        player.mute()
        mutedRef.current = true
        player.playVideo()
        flash('AUDIO OFF · PREMI VOL +')
      },
      activatedRef.current ? 3500 : 1500
    )
  }, [flash])

  // Il player di YouTube si prepara FERMO quando il televisore sta per
  // comparire, nascosto sotto la copertina catodica: così al clic il "play"
  // parte subito, dentro il clic. Se il player si creasse al clic, il play
  // arriverebbe un attimo dopo e i browser (Safari soprattutto) lo
  // bloccherebbero: servirebbe un secondo clic. Se il browser lo blocca lo
  // stesso, il controllo qui sopra chiede di toccare il video.
  const preparePlayer = React.useCallback(async () => {
    if (playerRef.current || preparingRef.current) return
    preparingRef.current = true

    let YT
    try {
      YT = await loadYouTubeApi()
    } catch {
      preparingRef.current = false
      if (wantPlayRef.current) {
        setErrorCode(-1)
        setPhase('error')
      }
      return
    }
    const stage = stageRef.current
    const target = videos[channelRef.current]
    if (!stage || !target || playerRef.current) {
      preparingRef.current = false
      return
    }

    // L'iframe lo creiamo noi, con referrerpolicy: YouTube (dal 2025) vuole
    // sapere da quale sito arriva il video e senza risponde "errore 153".
    // Safari, che protegge di più la privacy, altrimenti può non dirglielo.
    // Comandi di YouTube nascosti: li disegna il televisore.
    const params = new URLSearchParams({
      enablejsapi: '1',
      // creato dal clic: parte da solo appena pronto
      autoplay: wantPlayRef.current ? '1' : '0',
      controls: '0',
      disablekb: '1',
      fs: '0',
      iv_load_policy: '3',
      rel: '0',
      playsinline: '1',
      modestbranding: '1',
      origin: window.location.origin,
      widget_referrer: window.location.href
    })
    if (target.start) params.set('start', String(target.start))
    const iframe = document.createElement('iframe')
    iframe.src = `https://www.youtube-nocookie.com/embed/${target.id}?${params}`
    iframe.title = target.title ?? 'Video di YouTube'
    // gli stessi permessi del codice di YouTube per incorporare i video:
    // clipboard-write fa funzionare il pulsante "copia link" del player,
    // web-share la condivisione del telefono
    iframe.allow =
      'autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share'
    iframe.referrerPolicy = 'strict-origin-when-cross-origin'
    iframe.setAttribute('frameborder', '0')
    stage.replaceChildren(iframe)
    cuedIdRef.current = target.id

    // il comando di YouTube si collega al player quando l'iframe ha finito di
    // caricarsi: prima i suoi messaggi andrebbero a una pagina ancora vuota
    // (avviso "postMessage … does not match the recipient window's origin")
    await new Promise((resolve) =>
      iframe.addEventListener('load', resolve, { once: true })
    )
    // nel frattempo il televisore può essere sparito (cambio di pagina)
    if (!iframe.isConnected || playerRef.current) {
      preparingRef.current = false
      return
    }

    playerRef.current = new YT.Player(iframe, {
      events: {
        onReady: ({ target: player }) => {
          readyRef.current = true
          player.setVolume(volumeRef.current)
          if (mutedRef.current) player.mute()
          if (!wantPlayRef.current) return
          // si è cliccato play mentre il player si preparava
          const wanted = videos[channelRef.current]
          if (wanted && wanted.id !== cuedIdRef.current) {
            cuedIdRef.current = wanted.id
            player.loadVideoById({
              videoId: wanted.id,
              startSeconds: wanted.start
            })
          } else {
            player.playVideo()
          }
          armAudioFallback()
        },
        onStateChange: ({ data }) => {
          if (data === PlayerState.playing) {
            clearTimeout(audioTimer.current)
            // partito (anche con il tocco diretto sul player di YouTube):
            // da qui in poi i comandi del sito funzionano anche su Safari
            activatedRef.current = true
            setNeedsTap(false)
            if (!startedRef.current) {
              startedRef.current = true
              setPowerKey((k) => k + 1)
            }
            setPhase('playing')
          } else if (data === PlayerState.paused) {
            // in copertina (cambio di canale) resta la copertina; al primo
            // avvio bloccato dal browser niente "PAUSA" di passaggio: ci pensa
            // il controllo dopo il play (si torna alla copertina)
            const blockedStart =
              phaseRef.current === 'loading' && !activatedRef.current
            if (
              !draggingRef.current &&
              phaseRef.current !== 'idle' &&
              !blockedStart
            ) {
              setPhase('paused')
            }
          } else if (data === PlayerState.ended) {
            // finito: si torna alla schermata iniziale del canale
            wantPlayRef.current = false
            phaseRef.current = 'idle'
            rootRef.current?.style.setProperty('--p', '0')
            setPhase('idle')
          }
        },
        onError: ({ data }) => {
          // in console il codice, per capire cosa non va
          // (info, non avviso: con un blocco pubblicità succede spesso)
          console.info(
            `Televisore: YouTube ha rifiutato il video (errore ${data})`
          )
          // il video caricato andrà ricaricato da capo al prossimo play
          if (cuedIdRef.current) failedRef.current.add(cuedIdRef.current)
          // errore arrivato prima del clic (video solo preparato): resta la
          // copertina normale, "NO SEGNALE" compare solo dopo un play
          if (!wantPlayRef.current) return
          clearTimeout(audioTimer.current)
          setErrorCode(data)
          setPhase('error')
        }
      }
    })
  }, [videos, armAudioFallback])

  // play di un canale: chiamata direttamente dal clic (niente attese prima
  // di playVideo, vedi sopra)
  const start = React.useCallback(
    (index: number) => {
      const target = videos[index]
      if (!target) return
      channelRef.current = index
      wantPlayRef.current = true
      setErrorCode(null)
      setPhase('loading')
      // la prima volta il televisore "si accende"; poi cambia solo canale
      if (!startedRef.current) {
        startedRef.current = true
        setPowerKey((k) => k + 1)
      }

      const player = playerRef.current
      if (player && readyRef.current) {
        // già pronto nel player: parte. Se l'ultima volta YouTube l'aveva
        // rifiutato si ricarica da capo, così si sa se adesso va
        if (
          cuedIdRef.current === target.id &&
          !failedRef.current.has(target.id)
        ) {
          player.playVideo()
        } else {
          failedRef.current.delete(target.id)
          cuedIdRef.current = target.id
          player.loadVideoById({
            videoId: target.id,
            startSeconds: target.start
          })
        }
        armAudioFallback()
        return
      }
      // player non ancora pronto: partirà appena lo è (onReady)
      void preparePlayer()
    },
    [videos, armAudioFallback, preparePlayer]
  )

  const togglePlay = React.useCallback(() => {
    const player = playerRef.current
    const current = phaseRef.current
    if (
      current === 'idle' ||
      current === 'error' ||
      !player ||
      !readyRef.current
    ) {
      start(channelRef.current)
      return
    }
    if (current === 'playing') {
      player.pauseVideo()
      setPhase('paused')
    } else {
      player.playVideo()
    }
  }, [start])

  const changeVolume = React.useCallback(
    (dir: 1 | -1) => {
      const player = playerRef.current
      if (volumeLocked()) {
        mutedRef.current = dir < 0
      } else if (mutedRef.current) {
        mutedRef.current = false
        if (dir < 0) {
          volumeRef.current = clamp(volumeRef.current - volumeStep, 0, 100)
        }
      } else {
        volumeRef.current = clamp(volumeRef.current + dir * volumeStep, 0, 100)
        mutedRef.current = volumeRef.current === 0
      }
      if (player && readyRef.current) {
        player.setVolume(volumeRef.current)
        if (mutedRef.current) player.mute()
        else player.unMute()
      }
      showVolume()
    },
    [showVolume]
  )

  // Cambio di canale (numeri in alto o scorrimento laterale): si torna sempre
  // alla copertina con il numero del canale e il titolo del video, e si
  // aspetta il clic (o il tocco) per partire. Il video nuovo si carica nel
  // player fermo: al clic parte subito, anche su Safari.
  const selectChannel = React.useCallback(
    (index: number) => {
      const target = videos[index]
      if (!target || index >= channelSlots) return
      setChannel(index)
      channelRef.current = index
      wantPlayRef.current = false
      clearTimeout(audioTimer.current)
      flash(`CANALE ${pad(index + 1)}`)

      const player = playerRef.current
      if (player && readyRef.current && cuedIdRef.current !== target.id) {
        cuedIdRef.current = target.id
        player.cueVideoById({
          videoId: target.id,
          startSeconds: target.start
        })
      } else if (player && readyRef.current) {
        player.pauseVideo()
      }
      // la barra di avanzamento riparte da zero
      rootRef.current?.style.setProperty('--p', '0')
      // subito, prima che arrivi l'evento "pausa" del player
      phaseRef.current = 'idle'
      setErrorCode(null)
      setPhase('idle')
    },
    [videos, flash]
  )

  // ---------- scorrimento laterale tra i video ----------
  // Stesse regole del Raccoglitore (components/Scrapbook.tsx):
  // - trackpad: un video per gesto; la coda d'inerzia non conta, un gesto
  //   nuovo si riconosce da una pausa, da una spinta che risale o da un
  //   cambio di direzione. Lo scorrimento laterale resta sempre al
  //   televisore (niente "pagina indietro" del browser)
  // - dito: uno scorrimento laterale di almeno 40 px
  // Lo scorrimento verticale resta alla pagina.

  const stepRef = React.useRef<(dir: number) => void>(() => {})
  stepRef.current = (dir: number) => {
    const next = channelRef.current + dir
    if (next < 0 || next >= count) return
    selectChannel(next)
  }

  React.useEffect(() => {
    const tv = rootRef.current
    const picture = pictureRef.current
    if (!tv || !picture) return

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
      // lo scorrimento laterale resta sempre al televisore: niente "pagina
      // indietro" del browser, anche a schermo intero e con un solo video
      event.preventDefault()
      if (fullscreenRef.current || count < 2) return
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
        stepRef.current(d)
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
      if (fullscreenRef.current) return
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        stepRef.current(dx < 0 ? 1 : -1)
        // il "tocco" alla fine dello scorrimento non mette in pausa
        swipedRef.current = true
        setTimeout(() => (swipedRef.current = false), 400)
      }
    }

    // Sopra il video che va il gesto lo riceve il player di YouTube e il sito
    // non può fermarlo da lì: finché il puntatore è dentro il televisore il
    // gesto "pagina indietro/avanti" è spento per tutta la pagina
    // (overscroll-behavior-x sulla pagina), poi torna com'era
    const root = document.documentElement
    let previousOverscroll: string | null = null
    const blockHistorySwipe = () => {
      if (previousOverscroll !== null) return
      previousOverscroll = root.style.overscrollBehaviorX
      root.style.overscrollBehaviorX = 'none'
    }
    const allowHistorySwipe = () => {
      if (previousOverscroll === null) return
      root.style.overscrollBehaviorX = previousOverscroll
      previousOverscroll = null
    }
    // Entrando nel player di YouTube la pagina riceve un'"uscita" anche se il
    // puntatore è ancora nel televisore: il gesto si riaccende solo quando il
    // puntatore arriva su un punto della pagina fuori dal televisore
    const onPageOver = (event: PointerEvent) => {
      if (event.target instanceof Node && tv.contains(event.target)) return
      allowHistorySwipe()
    }

    tv.addEventListener('wheel', onWheel, { passive: false })
    tv.addEventListener('pointerenter', blockHistorySwipe)
    document.addEventListener('pointerover', onPageOver)
    picture.addEventListener('touchstart', onTouchStart, { passive: true })
    picture.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      allowHistorySwipe()
      tv.removeEventListener('pointerenter', blockHistorySwipe)
      document.removeEventListener('pointerover', onPageOver)
      tv.removeEventListener('wheel', onWheel)
      picture.removeEventListener('touchstart', onTouchStart)
      picture.removeEventListener('touchend', onTouchEnd)
    }
  }, [count])

  // ---------- barra di avanzamento ----------

  // a ogni fotogramma, mentre il video è caricato: la barra scorre fluida
  React.useEffect(() => {
    if (phase !== 'playing' && phase !== 'paused' && phase !== 'loading') return
    let frame = 0
    const paint = () => {
      const player = playerRef.current
      const bar = seekRef.current
      const tv = rootRef.current
      if (player && bar && tv && readyRef.current && !draggingRef.current) {
        const duration = player.getDuration()
        const time = player.getCurrentTime()
        if (duration > 0) {
          // sul televisore: lo leggono la barra sotto e quella a schermo intero
          tv.style.setProperty('--p', String(clamp(time / duration, 0, 1)))
          bar.setAttribute('aria-valuemax', String(Math.round(duration)))
          bar.setAttribute('aria-valuenow', String(Math.round(time)))
        }
      }
      frame = requestAnimationFrame(paint)
    }
    frame = requestAnimationFrame(paint)
    return () => cancelAnimationFrame(frame)
  }, [phase])

  const seekFromPointer = (
    bar: HTMLElement,
    clientX: number,
    final: boolean
  ) => {
    const player = playerRef.current
    const tv = rootRef.current
    if (!player || !tv || !readyRef.current) return
    const box = bar.getBoundingClientRect()
    const ratio = clamp((clientX - box.left) / box.width, 0, 1)
    tv.style.setProperty('--p', String(ratio))
    const duration = player.getDuration()
    if (duration > 0) player.seekTo(ratio * duration, final)
  }

  // trascinamento sulla barra (quella sotto e quella a schermo intero)
  const seekHandlers = {
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (!playerRef.current || !readyRef.current) return
      event.preventDefault()
      event.stopPropagation()
      draggingRef.current = true
      event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.dataset.dragging = ''
      seekFromPointer(event.currentTarget, event.clientX, false)
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      if (draggingRef.current) {
        seekFromPointer(event.currentTarget, event.clientX, false)
      }
    },
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      draggingRef.current = false
      delete event.currentTarget.dataset.dragging
      seekFromPointer(event.currentTarget, event.clientX, true)
    },
    onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => {
      draggingRef.current = false
      delete event.currentTarget.dataset.dragging
    },
    // il clic sulla barra non mette in pausa il video sotto
    onClick: (event: React.MouseEvent) => event.stopPropagation()
  }

  const seekBy = (seconds: number) => {
    const player = playerRef.current
    if (!player || !readyRef.current) return
    player.seekTo(Math.max(0, player.getCurrentTime() + seconds), true)
  }

  // ---------- schermo intero: solo il video ----------

  const exitFullscreen = React.useCallback(() => {
    if (fullscreenElement()) {
      const doc = document as any
      const result = document.exitFullscreen
        ? document.exitFullscreen()
        : doc.webkitExitFullscreen?.()
      void Promise.resolve(result).catch(() => {})
    }
    if (unlockWindowRef.current) {
      unlockWindowRef.current()
      unlockWindowRef.current = null
      setFullscreen(null)
    }
  }, [])

  const enterFullscreen = React.useCallback(() => {
    const picture = pictureRef.current
    if (!picture || fullscreen) return

    // il video intero e niente televisore: se era spento, parte
    const useWindow = () => {
      unlockWindowRef.current = lockPageScroll(() => exitFullscreen())
      setFullscreen('window')
    }
    const element = picture as any
    const enabled =
      document.fullscreenEnabled ?? (document as any).webkitFullscreenEnabled
    if (
      enabled &&
      (picture.requestFullscreen || element.webkitRequestFullscreen)
    ) {
      // va chiesto subito, dentro il clic: dopo il browser lo rifiuta
      const result = picture.requestFullscreen
        ? picture.requestFullscreen()
        : element.webkitRequestFullscreen()
      if (result && typeof result.catch === 'function') {
        result.catch(useWindow)
      }
    } else {
      useWindow()
    }
    if (phaseRef.current !== 'playing' && phaseRef.current !== 'loading') {
      togglePlay()
    }
  }, [fullscreen, exitFullscreen, togglePlay])

  const toggleFullscreen = () => {
    if (fullscreen) exitFullscreen()
    else enterFullscreen()
  }

  // entrata e uscita dallo schermo intero del browser (anche con Esc)
  React.useEffect(() => {
    const onChange = () => {
      const active = fullscreenElement() === pictureRef.current
      setFullscreen((current) =>
        active ? 'native' : current === 'native' ? null : current
      )
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [])

  // ---------- tastiera ----------

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    // i tasti sopra i pulsanti (Invio, spazio) restano ai pulsanti
    const onButton = (event.target as HTMLElement).closest('button, a')
    if (onButton && (event.key === ' ' || event.key === 'Enter')) return
    const actions: Record<string, () => void> = {
      ' ': togglePlay,
      k: togglePlay,
      ArrowLeft: () => seekBy(-5),
      ArrowRight: () => seekBy(5),
      ArrowUp: () => changeVolume(1),
      ArrowDown: () => changeVolume(-1),
      f: toggleFullscreen
    }
    const action = actions[event.key]
    if (!action) return
    event.preventDefault()
    action()
  }

  // ---------- pulizia ----------

  // quando il televisore sta per comparire si prepara il player, fermo
  React.useEffect(() => {
    const tv = rootRef.current
    if (!tv) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void preparePlayer()
          observer.disconnect()
        }
      },
      { rootMargin: '600px' }
    )
    observer.observe(tv)
    return () => observer.disconnect()
  }, [preparePlayer])

  React.useEffect(
    () => () => {
      clearTimeout(osdTimer.current)
      clearTimeout(audioTimer.current)
      unlockWindowRef.current?.()
      // il player si distrugge e tutto torna come all'inizio: se il
      // televisore ricompare (cambio di pagina, ricaricamento durante lo
      // sviluppo) il player si ricrea pulito, senza comandi a quello vecchio
      // ("The YouTube player is not attached to the DOM")
      readyRef.current = false
      playerRef.current?.destroy()
      playerRef.current = null
      preparingRef.current = false
      cuedIdRef.current = null
      stageRef.current?.replaceChildren()
    },
    []
  )

  // ---------- disegno ----------

  const showCover = phase === 'idle' || phase === 'error'
  const playing = phase === 'playing'
  const boxText =
    phase === 'error'
      ? 'NO SEGNALE'
      : phase === 'paused'
        ? 'PAUSA'
        : // più canali: il numero del canale; uno solo: il testo dopo 📺
          count > 1
          ? pad(channel + 1)
          : label || pad(channel + 1)
  const title = (video.title || 'YouTube').toUpperCase()

  const onPictureClick = () => {
    if (swipedRef.current) return
    // dopo un errore ("NO SEGNALE") il clic in qualsiasi punto del video lo
    // apre su YouTube, in una scheda nuova
    if (phaseRef.current === 'error') {
      window.open(watchUrl(video), '_blank', 'noopener,noreferrer')
      return
    }
    togglePlay()
  }

  return (
    <div className={styles.mount}>
      <section
        ref={rootRef}
        className={styles.tv}
        data-phase={phase}
        data-tap={(needsTap && phase === 'idle') || undefined}
        data-fullscreen={fullscreen ?? undefined}
        tabIndex={0}
        aria-roledescription='televisore'
        aria-label={`Video: ${video.title ?? 'YouTube'}`}
        onKeyDown={onKeyDown}
      >
        {/* alone colorato dietro il televisore: le copertine di tutti i
            canali, caricate una volta, una sopra l'altra; cambiando canale si
            passa dall'una all'altra in dissolvenza, senza ricaricare niente */}
        <span className={styles.halo} aria-hidden='true'>
          {videos.slice(0, channelSlots).map((v, i) => (
            <span
              key={v.id}
              className={styles.haloImage}
              data-on={i === channel || undefined}
              style={{ backgroundImage: `url("${coverOf(v)}")` }}
            />
          ))}
        </span>

        {/* lo schermo */}
        <div className={styles.tube}>
          <div className={styles.screen}>
            {/* ---------- in alto: lucine, canali, GARAGGIO ---------- */}
            <div className={styles.hudTop}>
              <span className={styles.dots} aria-hidden='true'>
                <i />
                <i />
                <i />
              </span>
              <div className={styles.channels} role='group' aria-label='Canali'>
                {Array.from({ length: channelSlots }, (_, i) => (
                  <button
                    key={i}
                    type='button'
                    className={styles.channel}
                    data-current={i === channel || undefined}
                    disabled={i >= count}
                    onClick={() => selectChannel(i)}
                    aria-label={
                      i < count
                        ? `Canale ${i + 1}: ${videos[i]?.title ?? 'video'}`
                        : `Canale ${i + 1}: vuoto`
                    }
                    tabIndex={i < count ? 0 : -1}
                  >
                    {pad(i + 1)}
                  </button>
                ))}
              </div>
              <p className={styles.brand} aria-live='polite'>
                {osd ?? (
                  <>
                    <span className={styles.brandSquare} aria-hidden='true' />
                    GARAGGIO
                  </>
                )}
              </p>
            </div>

            {/* ---------- il video (a schermo intero va da solo) ---------- */}
            <div ref={pictureRef} className={styles.picture}>
              <div ref={stageRef} className={styles.player} />

              {/* mentre il video va, sopra non c'è niente del sito: i clic
                arrivano al player di YouTube e i suoi comandi a schermo
                restano attivi (titolo, Guarda su YouTube, Altri video,
                condividi, clic per la pausa). Il televisore segue play e
                pausa dagli eventi del player */}
              {showCover && (
                <button
                  type='button'
                  className={styles.cover}
                  onClick={onPictureClick}
                  aria-label={
                    phase === 'error'
                      ? `Guarda su YouTube: ${video.title ?? 'il video'}`
                      : `Riproduci ${video.title ?? 'il video'}`
                  }
                  tabIndex={-1}
                >
                  <img
                    key={video.id}
                    className={styles.thumb}
                    src={coverOf(video)}
                    alt=''
                    decoding='async'
                  />
                  <span className={styles.tint} aria-hidden='true' />
                  <span className={styles.bandTitle}>
                    <span>
                      {phase === 'error'
                        ? errorCode === -1
                          ? 'YOUTUBE NON RAGGIUNGIBILE'
                          : (errorReasons[errorCode ?? 0] ??
                            `VIDEO NON DISPONIBILE (ERRORE ${errorCode})`)
                        : title}
                    </span>
                  </span>
                </button>
              )}

              {(showCover || phase === 'paused') && (
                <span
                  className={styles.box}
                  data-long={boxText.length > 5 || undefined}
                >
                  {boxText}
                </span>
              )}

              {phase === 'error' && (
                <a
                  className={styles.external}
                  href={watchUrl(video)}
                  target='_blank'
                  rel='noreferrer'
                >
                  GUARDA SU YOUTUBE ↗
                </a>
              )}

              <span className={styles.snow} aria-hidden='true' />
              {/* accensione: la riga bianca che si apre su tutto lo schermo */}
              {powerKey > 0 && (
                <span
                  key={powerKey}
                  className={styles.power}
                  aria-hidden='true'
                />
              )}
              <span className={styles.scan} aria-hidden='true' />

              {/* a schermo intero: la barra per scorrere il video e la crocetta
                per uscire, nient'altro */}
              {fullscreen && (
                <div
                  className={styles.fsSeek}
                  role='slider'
                  tabIndex={-1}
                  aria-label='Avanzamento del video'
                  aria-valuemin={0}
                  {...seekHandlers}
                >
                  <span className={styles.rail}>
                    <span className={styles.fill} />
                    <span className={styles.knob} />
                  </span>
                </div>
              )}
              {fullscreen && (
                <button
                  type='button'
                  className={styles.exit}
                  onClick={exitFullscreen}
                  aria-label='Esci dallo schermo intero'
                >
                  <svg viewBox='0 0 16 16' aria-hidden='true'>
                    <path d='M4 4l8 8M12 4l-8 8' />
                  </svg>
                </button>
              )}
            </div>

            {/* ---------- in basso: avanzamento e telecomando ---------- */}
            <div className={styles.hudBottom}>
              <div
                ref={seekRef}
                className={styles.seek}
                role='slider'
                tabIndex={-1}
                aria-label='Avanzamento del video'
                aria-valuemin={0}
                {...seekHandlers}
              >
                <span className={styles.rail}>
                  <span className={styles.fill} />
                  <span className={styles.knob} />
                </span>
              </div>

              {/* la fascia colorata della copertina */}
              <div className={styles.keys}>
                <button
                  type='button'
                  className={styles.key}
                  data-color='red'
                  onClick={() => changeVolume(-1)}
                  aria-label='Volume giù'
                >
                  VOL −
                </button>
                <button
                  type='button'
                  className={styles.key}
                  data-color='green'
                  onClick={() => changeVolume(1)}
                  aria-label='Volume su'
                >
                  VOL +
                </button>
                <button
                  type='button'
                  className={styles.key}
                  data-color='orange'
                  onClick={togglePlay}
                  aria-label={playing ? 'Pausa' : 'Riproduci'}
                >
                  <svg viewBox='0 0 16 16' aria-hidden='true'>
                    {playing ? (
                      <path d='M4.5 3h2.4v10H4.5zM9.1 3h2.4v10H9.1z' />
                    ) : (
                      <path d='M5 3.2v9.6L13 8z' />
                    )}
                  </svg>
                </button>
                <button
                  type='button'
                  className={styles.key}
                  data-color='blue'
                  onClick={toggleFullscreen}
                  aria-label='Schermo intero'
                >
                  <svg viewBox='0 0 16 16' aria-hidden='true'>
                    <path d='M2.5 6.5v-4h4M13.5 6.5v-4h-4M2.5 9.5v4h4M13.5 9.5v4h-4' />
                  </svg>
                </button>
              </div>
            </div>

            {/* vetro del tubo: bordi scuri e riflesso (non si clicca) */}
            <span className={styles.glass} aria-hidden='true' />
          </div>
        </div>
      </section>
    </div>
  )
}
