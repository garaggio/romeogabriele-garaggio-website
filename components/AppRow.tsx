'use client'

import Link from 'next/link'
import * as React from 'react'

import type { AppRowData } from '@/lib/appstore'

import styles from './AppRow.module.css'

// Riga in stile App Store del Mac per il merch: icona arrotondata, nome e
// sottotitolo, pulsante a pillola ("Ottieni") con una nota piccola sotto.
// Tutta la riga porta al link: le pagine del sito si aprono nella stessa
// scheda, i siti esterni (Bandcamp, Stripe…) in una scheda nuova.

const isInternal = (link: string) => {
  if (link.startsWith('/')) return true
  try {
    const url = new URL(link)
    return (
      typeof window !== 'undefined' && url.origin === window.location.origin
    )
  } catch {
    return false
  }
}

function AppLink({
  href,
  internal,
  className,
  label,
  children
}: {
  href: string
  internal: boolean
  className: string
  label?: string
  children: React.ReactNode
}) {
  return internal ? (
    <Link href={href} className={className} aria-label={label}>
      {children}
    </Link>
  ) : (
    <a
      href={href}
      className={className}
      aria-label={label}
      target='_blank'
      rel='noopener noreferrer'
    >
      {children}
    </a>
  )
}

// Tutto il riquadro è un unico link: si clicca in qualsiasi punto (icona,
// testi, pulsante o spazi vuoti). Il pulsante è disegnato dentro il link.
export function AppRow({
  title,
  subtitle,
  button,
  note,
  link,
  icon
}: Omit<AppRowData, 'blockId'>) {
  const internal = isInternal(link)
  const href = internal ? link.replace(/^https?:\/\/[^/]+/, '') || '/' : link

  return (
    <AppLink
      href={href}
      internal={internal}
      className={styles.row!}
      label={`${title}${subtitle ? `, ${subtitle}` : ''}: ${button}`}
    >
      <span className={styles.iconTile}>
        {icon ? (
          <img className={styles.icon} src={icon} alt='' draggable={false} />
        ) : (
          <span className={styles.iconFallback} aria-hidden='true'>
            {title.trim().charAt(0).toUpperCase()}
          </span>
        )}
      </span>

      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </span>

      <span className={styles.action}>
        <span className={styles.get}>{button}</span>
        {note && <span className={styles.note}>{note}</span>}
      </span>
    </AppLink>
  )
}
