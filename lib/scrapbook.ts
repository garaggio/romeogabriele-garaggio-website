import type { ExtendedRecordMap } from 'notion-types'
import { getBlockValue, getTextContent, normalizeUrl } from 'notion-utils'

import type { ScrapbookItem } from '@/components/Scrapbook'

import { mapImageUrl } from './map-image-url'

// Raccoglitore alimentato da Notion.
// In Notion: un callout con icona 🗂️ (classico) o 🗃️ (Platinum ritoccato),
// oppure con quel segno a inizio prima riga, e le foto DENTRO il callout. lib/notion.ts lo riconosce e
// lo marca con il colore finto "scrapbook"; qui ne ricaviamo gli elementi.
//
// Didascalia di ogni foto, due modi:
//  - testo semplice (senza "|"): compare così com'è sotto il nome del file
//  - campi separati da "|" (tutti facoltativi):
//      Titolo | Categoria | Anno | Descrizione
//    es. "Prove al Garaggio | Concerti | 2024 | Sala prove, prima del tour"
//
// Con ⬇️ nel titolo ("🗃️ Press kit ⬇️") la finestra ha il pulsante "Scarica".
// Oltre alle foto si possono mettere video (file caricati in Notion): fermi
// con l'icona ▶, partono ingranditi al clic (lib/video-zoom.ts).

export interface ScrapbookBlock {
  /** id del callout, senza trattini (come nella classe notion-block-…) */
  blockId: string
  title: string
  variant: 'classic' | 'modern'
  /** pulsante "Scarica" (segno ⬇️ nel titolo in Notion) */
  downloadable: boolean
  items: ScrapbookItem[]
}

const fileNameFrom = (source: string) => {
  // "attachment:<id>:foto.jpg" oppure un indirizzo con il nome in fondo
  const last = source.split('?')[0]!.split(/[/:]/).pop() ?? ''
  try {
    return decodeURIComponent(last) || 'immagine'
  } catch {
    return last || 'immagine'
  }
}

// Anteprima dei video: Notion genera un fotogramma ("video_thumbnail") e lo
// firma insieme al video. Si vede subito, con le proporzioni giuste, prima
// ancora che il video cominci a caricarsi.
const videoPoster = (recordMap: ExtendedRecordMap, block: any) => {
  const thumbnail: string | undefined = block.format?.video_thumbnail
  if (!thumbnail) return undefined
  return (
    recordMap.signed_urls?.[thumbnail] ??
    (thumbnail.startsWith('https://') ? thumbnail : undefined)
  )
}

/** anteprime dei video, per id del blocco senza trattini */
export function getVideoPosters(recordMap: ExtendedRecordMap) {
  const posters = new Map<string, string>()
  for (const entry of Object.values(recordMap.block)) {
    const block: any = getBlockValue(entry)
    if (block?.type !== 'video') continue
    const poster = videoPoster(recordMap, block)
    if (poster) posters.set(String(block.id).replaceAll('-', ''), poster)
  }
  return posters
}

export function getScrapbooks(recordMap: ExtendedRecordMap): ScrapbookBlock[] {
  const previews = (recordMap as any).preview_images ?? {}
  const scrapbooks: ScrapbookBlock[] = []

  for (const entry of Object.values(recordMap.block)) {
    const block: any = getBlockValue(entry)
    if (
      block?.type !== 'callout' ||
      block.format?.block_color !== 'scrapbook'
    ) {
      continue
    }

    const items: ScrapbookItem[] = []

    // le foto: il contenuto originale del callout (vedi embedCustomCallouts)
    for (const childId of block.format?.g_content ?? block.content ?? []) {
      const child: any = getBlockValue(recordMap.block[childId])
      if (child?.type !== 'image' && child?.type !== 'video') continue

      const source: string | undefined = child.properties?.source?.[0]?.[0]
      // video: solo quelli caricati in Notion (hanno un indirizzo firmato)
      const isVideo = child.type === 'video'
      const url = isVideo
        ? recordMap.signed_urls?.[child.id]
        : source
          ? mapImageUrl(source, child)
          : undefined
      if (!source || !url) continue

      const filename = fileNameFrom(source)
      const caption = getTextContent(child.properties?.caption).trim()
      // didascalia semplice: tutta sotto il nome del file
      const [title, category, year, ...rest] = caption.includes('|')
        ? caption.split('|').map((part) => part.trim())
        : ['', '', '', caption]

      // le anteprime sono salvate con l'indirizzo normalizzato (lib/preview-images.ts)
      const preview = previews[url] ?? previews[normalizeUrl(url)]
      const dimensions =
        preview?.originalWidth && preview?.originalHeight
          ? `${preview.originalWidth} × ${preview.originalHeight} px`
          : undefined

      items.push({
        id: child.id,
        kind: isVideo ? 'video' : 'image',
        poster: isVideo ? videoPoster(recordMap, child) : undefined,
        title: title || filename.replace(/\.[^.]+$/, ''),
        filename,
        url,
        category: category || undefined,
        year: year || undefined,
        description: rest.join(' | ') || undefined,
        dimensions
      })
    }

    if (items.length) {
      scrapbooks.push({
        blockId: String(block.id).replaceAll('-', ''),
        title: block.format?.scrapbook_title || 'Galleria — Archivio',
        variant:
          block.format?.scrapbook_variant === 'modern' ? 'modern' : 'classic',
        downloadable: !!block.format?.scrapbook_download,
        items
      })
    }
  }

  return scrapbooks
}

// Galleria a scorrimento 🖼️ con ⬇️ (vedi lib/notion.ts): per ogni foto o video, il
// file da scaricare e il suo nome. NotionPage.tsx ci aggiunge i pulsanti.
export interface GalleryDownload {
  /** id della foto, senza trattini (come nella classe notion-block-…) */
  blockId: string
  url: string
  filename: string
}

export function getGalleryDownloads(
  recordMap: ExtendedRecordMap
): GalleryDownload[] {
  const downloads: GalleryDownload[] = []

  for (const entry of Object.values(recordMap.block)) {
    const block: any = getBlockValue(entry)
    if (
      block?.type !== 'callout' ||
      block.format?.block_color !== 'gallery' ||
      !block.format?.gallery_download
    ) {
      continue
    }

    for (const childId of block.content ?? []) {
      const child: any = getBlockValue(recordMap.block[childId])
      if (child?.type !== 'image' && child?.type !== 'video') continue
      const source: string | undefined = child.properties?.source?.[0]?.[0]
      // i video caricati in Notion hanno un indirizzo firmato a parte
      // (YouTube e simili non si scaricano)
      const url =
        child.type === 'video'
          ? recordMap.signed_urls?.[child.id]
          : source
            ? mapImageUrl(source, child)
            : undefined
      if (!source || !url) continue
      downloads.push({
        blockId: String(child.id).replaceAll('-', ''),
        url,
        filename: fileNameFrom(source)
      })
    }
  }

  return downloads
}
