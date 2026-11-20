import type { ExtendedRecordMap } from 'notion-types'
import { getBlockValue } from 'notion-utils'

import { mapImageUrl } from './map-image-url'

// Righe "App Store" del merch: i segnalibri con didascalia 🛍️ (vedi
// markAppRows in lib/notion.ts). Qui ricaviamo i dati per components/AppRow.

export interface AppRowData {
  /** id del callout, senza trattini (come nella classe notion-block-…) */
  blockId: string
  title: string
  subtitle?: string
  button: string
  note?: string
  link: string
  icon?: string
}

export function getAppRows(recordMap: ExtendedRecordMap): AppRowData[] {
  const rows: AppRowData[] = []

  for (const entry of Object.values(recordMap.block)) {
    const block: any = getBlockValue(entry)
    const app = block?.format?.app_row
    if (block?.format?.block_color !== 'appstore' || !app) continue

    // icona: l'immagine messa sopra il segnalibro, altrimenti l'anteprima
    const iconBlock: any = app.iconBlockId
      ? getBlockValue(recordMap.block[app.iconBlockId])
      : undefined
    const iconSource: string | undefined =
      iconBlock?.properties?.source?.[0]?.[0]
    const icon = iconSource
      ? mapImageUrl(iconSource, iconBlock)
      : app.cover
        ? mapImageUrl(app.cover, block)
        : undefined

    rows.push({
      blockId: String(block.id).replaceAll('-', ''),
      title: app.title,
      subtitle: app.subtitle,
      button: app.button,
      note: app.note,
      link: app.link,
      icon: icon || undefined
    })
  }

  return rows
}
