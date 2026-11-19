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

export interface ScrapbookBlock {
  /** id del callout, senza trattini (come nella classe notion-block-…) */
  blockId: string
  title: string
  variant: 'classic' | 'modern'
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

    for (const childId of block.content ?? []) {
      const child: any = getBlockValue(recordMap.block[childId])
      if (child?.type !== 'image') continue

      const source: string | undefined = child.properties?.source?.[0]?.[0]
      const url = source ? mapImageUrl(source, child) : undefined
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
        items
      })
    }
  }

  return scrapbooks
}
