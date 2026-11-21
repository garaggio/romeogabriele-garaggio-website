'use client'

import * as React from 'react'

import type { LockNotification, LockScreenData } from '@/lib/lockscreen'

import styles from './LockScreen.module.css'

// Schermata di blocco di iPhone per la sezione "Next event": in alto la
// scritta piccola (al posto della data) e il testo grande (al posto dell'ora),
// in basso le notifiche in vetro smerigliato, poi torcia, fotocamera e la
// barretta. Lo sfondo è la foto messa nel callout 🔒 in Notion.

const isInternal = (href: string) => href.startsWith('/')

function Notification({
  icon,
  iconImage,
  title,
  when,
  body,
  href
}: LockNotification) {
  const inner = (
    <>
      <span className={styles.appIcon} aria-hidden='true'>
        {iconImage ? (
          <img
            className={styles.appIconImage}
            src={iconImage}
            alt=''
            draggable={false}
          />
        ) : (
          (icon ?? title.trim().charAt(0).toUpperCase())
        )}
      </span>
      <span className={styles.notifText}>
        <span className={styles.notifHead}>
          <span className={styles.notifTitle}>{title}</span>
          {when && <span className={styles.notifWhen}>{when}</span>}
        </span>
        {body && <span className={styles.notifBody}>{body}</span>}
      </span>
    </>
  )

  if (!href) return <div className={styles.notif}>{inner}</div>

  // pagina del sito: caricamento completo (come un link esterno), senza
  // il passaggio istantaneo di Next che fa scorrere la vista verso il titolo
  return isInternal(href) ? (
    <a href={href} className={styles.notif}>
      {inner}
    </a>
  ) : (
    <a
      href={href}
      className={styles.notif}
      target='_blank'
      rel='noopener noreferrer'
    >
      {inner}
    </a>
  )
}

// Elenco delle notifiche: segna se ce ne sono altre sopra o sotto la parte
// visibile, così il CSS sfuma solo il bordo da cui continuano.
function NotificationStack({
  className,
  notifications
}: {
  className: string
  notifications: LockNotification[]
}) {
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const stack = ref.current
    if (!stack) return
    const update = () => {
      const above = stack.scrollTop > 2
      const below =
        stack.scrollTop + stack.clientHeight < stack.scrollHeight - 2
      stack.toggleAttribute('data-more-above', above)
      stack.toggleAttribute('data-more-below', below)
    }
    update()
    stack.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(stack)
    return () => {
      stack.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [notifications])

  return (
    <div ref={ref} className={className}>
      {notifications.map((n) =>
        n.divider ? (
          // divisorio stile "Centro notifiche": es. "Tour passati"
          <p key={n.id} className={styles.divider}>
            {n.title}
          </p>
        ) : (
          <Notification key={n.id} {...n} />
        )
      )}
    </div>
  )
}

export function LockScreen({
  variant = 'phone',
  label,
  big,
  wallpaper,
  notifications
}: Omit<LockScreenData, 'blockId' | 'variant'> & {
  variant?: LockScreenData['variant']
}) {
  // Scorrimento su tutta l'area delle notifiche, come nella galleria: anche
  // sopra l'intestazione e nei margini il trackpad e il dito fanno scorrere
  // l'elenco. Arrivati in cima o in fondo all'elenco si prosegue con la pagina.
  // Trackpad/rotellina: sopra l'elenco ci pensa il browser, altrove onWheel.
  const rootRef = React.useRef<HTMLElement>(null)

  React.useEffect(() => {
    const root = rootRef.current
    const stack = root?.querySelector<HTMLElement>(`.${styles.stack}`)
    if (!root || !stack) return

    const canScroll = (dy: number) =>
      dy > 0
        ? stack.scrollTop + stack.clientHeight < stack.scrollHeight - 1
        : dy < 0 && stack.scrollTop > 0
    // durante il gesto l'aggancio alle notifiche è sospeso (altrimenti ogni
    // piccolo spostamento tornerebbe indietro); a gesto finito si riattiva e
    // l'elenco si ferma sulla notifica più vicina
    let resume: ReturnType<typeof setTimeout> | undefined
    const scrollBy = (dy: number) => {
      stack.style.scrollSnapType = 'none'
      stack.scrollTop += dy
      clearTimeout(resume)
      resume = setTimeout(() => {
        stack.style.scrollSnapType = ''
      }, 160)
    }

    // Trackpad e rotellina, su tutta l'area (elenco compreso): finché
    // l'elenco può scorrere in quella direzione lo muoviamo noi; al bordo
    // l'evento resta al browser e scorre la pagina (anche in Safari, che da
    // solo non passerebbe lo scorrimento alla pagina nello stesso gesto).
    const onWheel = (event: WheelEvent) => {
      const dy = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      if (Math.abs(event.deltaX) > Math.abs(dy) || !canScroll(dy)) return
      event.preventDefault()
      scrollBy(dy)
    }

    // Tocco (telefoni e tablet). All'inizio di ogni gesto si decide chi
    // scorre: se l'elenco può ancora scorrere in quella direzione, il gesto
    // muove l'elenco e, arrivato al bordo, prosegue con la pagina; se
    // l'elenco è già al bordo, il gesto resta tutto al browser, che scorre la
    // pagina in modo nativo (con la sua inerzia). L'elenco non scorre mai da
    // solo (overflow nascosto nel CSS): niente rimbalzi né gesti trattenuti.
    const overflowing = () => stack.scrollHeight > stack.clientHeight + 1
    const consume = (dy: number) => {
      let rest = dy
      if (canScroll(rest)) {
        const before = stack.scrollTop
        scrollBy(rest)
        rest -= stack.scrollTop - before
      }
      if (Math.abs(rest) > 0.5) window.scrollBy(0, rest)
    }

    let lastY = 0
    let lastT = 0
    let velocity = 0
    let tracking = false
    let mode: 'list' | 'page' | undefined
    let inertia = 0
    const stopInertia = () => cancelAnimationFrame(inertia)

    const onTouchStart = (event: TouchEvent) => {
      stopInertia()
      const touch = event.touches[0]
      tracking = event.touches.length === 1 && !!touch && overflowing()
      mode = undefined
      lastY = touch?.clientY ?? 0
      lastT = event.timeStamp
      velocity = 0
    }
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!tracking || !touch) return
      const dy = lastY - touch.clientY
      // primo movimento del gesto: elenco o pagina?
      if (mode === undefined) {
        if (Math.abs(dy) < 1) return
        mode = canScroll(dy) ? 'list' : 'page'
      }
      // pagina: lo scorrimento resta al browser
      if (mode === 'page') return
      event.preventDefault()
      const dt = Math.max(1, event.timeStamp - lastT)
      lastY = touch.clientY
      lastT = event.timeStamp
      // velocità smussata (px/ms) per l'inerzia
      velocity = velocity * 0.6 + (dy / dt) * 0.4
      consume(dy)
    }
    const onTouchEnd = () => {
      if (!tracking) return
      tracking = false
      if (mode !== 'list') return
      let v = velocity
      let prev = performance.now()
      const step = (now: number) => {
        const dt = Math.min(32, now - prev)
        prev = now
        consume(v * dt)
        v *= Math.pow(0.95, dt / 16)
        if (Math.abs(v) > 0.02) inertia = requestAnimationFrame(step)
      }
      if (Math.abs(v) > 0.05) inertia = requestAnimationFrame(step)
    }

    root.addEventListener('wheel', onWheel, { passive: false })
    root.addEventListener('touchstart', onTouchStart, { passive: true })
    root.addEventListener('touchmove', onTouchMove, { passive: false })
    root.addEventListener('touchend', onTouchEnd)
    root.addEventListener('touchcancel', onTouchEnd)
    return () => {
      stopInertia()
      clearTimeout(resume)
      root.removeEventListener('wheel', onWheel)
      root.removeEventListener('touchstart', onTouchStart)
      root.removeEventListener('touchmove', onTouchMove)
      root.removeEventListener('touchend', onTouchEnd)
      root.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [notifications])

  const style = wallpaper
    ? ({
        '--lock-wallpaper': `url("${wallpaper.replaceAll('"', '%22')}")`
      } as React.CSSProperties)
    : undefined

  // 🔔: riquadro generico, notifiche in stile macOS
  if (variant === 'mac') {
    return (
      <section
        ref={rootRef}
        className={styles.mac}
        style={style}
        data-wallpaper={wallpaper ? '' : undefined}
        aria-label={[label, big].filter(Boolean).join(': ')}
      >
        {/* il riquadro esterno porta alone e filo di vetro (come le foto
            singole); quello interno taglia il contenuto agli angoli */}
        <div className={styles.macInner}>
          <header className={styles.macHead}>
            <p className={styles.macLabel}>{label}</p>
            {big && <p className={styles.macBig}>{big}</p>}
          </header>
          {notifications.length > 0 && (
            <NotificationStack
              className={`${styles.stack} ${styles.macStack}`}
              notifications={notifications}
            />
          )}
        </div>
      </section>
    )
  }

  return (
    <section
      ref={rootRef}
      className={styles.phone}
      style={style}
      data-wallpaper={wallpaper ? '' : undefined}
      aria-label={[label, big].filter(Boolean).join(': ')}
    >
      <span className={styles.island} aria-hidden='true' />

      <header className={styles.top}>
        <span className={styles.lock} aria-hidden='true' />
        <p className={styles.label}>{label}</p>
        {big && <p className={styles.big}>{big}</p>}
      </header>

      {notifications.length > 0 && (
        <NotificationStack
          className={styles.stack!}
          notifications={notifications}
        />
      )}

      <footer className={styles.bottom} aria-hidden='true'>
        <span className={`${styles.roundButton} ${styles.torch}`} />
        <span className={`${styles.roundButton} ${styles.camera}`} />
        <span className={styles.homeBar} />
      </footer>
    </section>
  )
}
