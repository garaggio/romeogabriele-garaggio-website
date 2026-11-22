import type { ExtendedRecordMap } from 'notion-types'
import { getBlockValue } from 'notion-utils'

// Televisore 📺: player dei video di YouTube con la grafica della copertina
// di "youtuyoutuyou 2.5" (televideo su un vecchio schermo catodico).
// In Notion: un callout con icona 📺 (o "📺" a inizio prima riga) e dentro i
// link di YouTube: incollati come video, segnalibro o semplice link nel testo.
// Ogni link è un canale (01…10, al massimo dieci). Il testo dopo 📺 va nel
// riquadro blu al centro ("📺 2.5"); senza testo ci va il numero del canale.
// lib/notion.ts (markTelevisions) lo riconosce; components/Television.tsx lo
// disegna.

export interface TelevisionVideo {
  /** id del video su YouTube (11 caratteri) */
  id: string
  title?: string
  /** secondo di partenza (?t=90 nel link) */
  start?: number
  /** copertina del video (la più grande che esiste) */
  thumbnail?: string
}

export interface TelevisionData {
  /** id del callout, senza trattini (come nella classe notion-block-…) */
  blockId: string
  /** testo del riquadro blu */
  label?: string
  videos: TelevisionVideo[]
}

const youtubeIdPattern = /^[\w-]{11}$/

/** id del video da un link di YouTube (watch, youtu.be, shorts, embed, live) */
export function youtubeIdFrom(link: string): string | undefined {
  let url: URL
  try {
    url = new URL(link.trim())
  } catch {
    return undefined
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '')
  let id: string | undefined
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1]
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, kind, value] = url.pathname.split('/')
    id =
      kind === 'watch'
        ? (url.searchParams.get('v') ?? undefined)
        : ['embed', 'shorts', 'live', 'v'].includes(kind ?? '')
          ? value
          : undefined
  }
  return id && youtubeIdPattern.test(id) ? id : undefined
}

/** secondo di partenza: "?t=90", "?t=1m30s", "?start=90" */
export function youtubeStartFrom(link: string): number | undefined {
  let url: URL
  try {
    url = new URL(link.trim())
  } catch {
    return undefined
  }
  const raw = url.searchParams.get('t') ?? url.searchParams.get('start')
  if (!raw) return undefined
  if (/^\d+$/.test(raw)) return Number(raw) || undefined
  const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!match) return undefined
  const [, h = '0', m = '0', s = '0'] = match
  return Number(h) * 3600 + Number(m) * 60 + Number(s) || undefined
}

export function getTelevisions(recordMap: ExtendedRecordMap): TelevisionData[] {
  const televisions: TelevisionData[] = []
  for (const entry of Object.values(recordMap.block)) {
    const block: any = getBlockValue(entry)
    const tv = block?.format?.television
    if (block?.format?.block_color !== 'television' || !tv?.videos?.length) {
      continue
    }
    televisions.push({
      blockId: String(block.id).replaceAll('-', ''),
      label: tv.label || undefined,
      videos: tv.videos.map((video: any) => ({
        id: video.id,
        title: video.title || undefined,
        start: video.start || undefined,
        thumbnail: video.thumbnail || undefined
      }))
    })
  }
  return televisions
}
