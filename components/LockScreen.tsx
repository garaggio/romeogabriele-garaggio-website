'use client'

import Link from 'next/link'
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

  return isInternal(href) ? (
    <Link href={href} className={styles.notif}>
      {inner}
    </Link>
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
  const rootRef = React.useRef<HTMLElement>(null)

  React.useEffect(() => {
    const root = rootRef.current
    const stack = root?.querySelector<HTMLElement>(`.${styles.stack}`)
    if (!root || !stack) return

    const canScroll = (dy: number) =>
      dy > 0
        ? stack.scrollTop + stack.clientHeight < stack.scrollHeight - 1
        : dy < 0 && stack.scrollTop > 0
    const outside = (target: EventTarget | null) =>
      !(target instanceof Node && stack.contains(target))

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

    const onWheel = (event: WheelEvent) => {
      // dentro l'elenco ci pensa il browser
      if (!outside(event.target)) return
      const dy = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      if (Math.abs(event.deltaX) > Math.abs(dy) || !canScroll(dy)) return
      event.preventDefault()
      scrollBy(dy)
    }

    let lastY = 0
    let tracking = false
    const onTouchStart = (event: TouchEvent) => {
      tracking = outside(event.target) && event.touches.length === 1
      lastY = event.touches[0]?.clientY ?? 0
    }
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!tracking || !touch) return
      const dy = lastY - touch.clientY
      lastY = touch.clientY
      if (!canScroll(dy)) return
      event.preventDefault()
      scrollBy(dy)
    }

    root.addEventListener('wheel', onWheel, { passive: false })
    root.addEventListener('touchstart', onTouchStart, { passive: true })
    root.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      clearTimeout(resume)
      root.removeEventListener('wheel', onWheel)
      root.removeEventListener('touchstart', onTouchStart)
      root.removeEventListener('touchmove', onTouchMove)
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
