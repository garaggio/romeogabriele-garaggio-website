import type { ExtendedRecordMap } from 'notion-types'
import { getBlockValue } from 'notion-utils'

import { mapImageUrl } from './map-image-url'

// Schermate di blocco iPhone: i callout 🔒 (vedi markLockScreens in
// lib/notion.ts). Qui ricaviamo i dati per components/LockScreen.

export interface LockNotification {
  id: string
  /** divisorio con scritta grande ("// Tour passati"), non una notifica */
  divider?: boolean
  /** emoji all'inizio della riga: l'icona dell'app */
  icon?: string
  /** emoji personalizzata del workspace all'inizio della riga (immagine) */
  iconImage?: string
  title: string
  /** es. "ora", "sab 21:00" */
  when?: string
  body?: string
  /** link esterno o pagina del sito (già trasformata in indirizzo) */
  href?: string
}

export interface LockScreenData {
  /** id del callout, senza trattini (come nella classe notion-block-…) */
  blockId: string
  /** "phone" = schermata di blocco iPhone (🔒), "mac" = riquadro macOS (🔔) */
  variant: 'phone' | 'mac'
  /** la scritta piccola in alto, al posto della data */
  label: string
  /** il testo grande, al posto dell'ora */
  big?: string
  wallpaper?: string
  notifications: LockNotification[]
}

export function getLockScreens(
  recordMap: ExtendedRecordMap,
  mapPageUrl: (pageId: string) => string
): LockScreenData[] {
  const screens: LockScreenData[] = []

  for (const entry of Object.values(recordMap.block)) {
    const block: any = getBlockValue(entry)
    const lock = block?.format?.lock_screen
    if (block?.format?.block_color !== 'lockscreen' || !lock) continue

    const image: any = lock.wallpaperBlockId
      ? getBlockValue(recordMap.block[lock.wallpaperBlockId])
      : undefined
    const source: string | undefined = image?.properties?.source?.[0]?.[0]

    screens.push({
      blockId: String(block.id).replaceAll('-', ''),
      variant: lock.variant === 'mac' ? 'mac' : 'phone',
      label: lock.label,
      big: lock.big,
      wallpaper: source ? mapImageUrl(source, image) : undefined,
      notifications: (lock.notifications ?? []).map((n: any) => ({
        id: n.id,
        divider: n.divider || undefined,
        icon: n.icon,
        iconImage: n.iconImage,
        title: n.title,
        when: n.when,
        body: n.body,
        href:
          n.link?.url ??
          (n.link?.pageId ? mapPageUrl(n.link.pageId) : undefined)
      }))
    })
  }

  return screens
}
