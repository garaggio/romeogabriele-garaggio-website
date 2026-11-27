import type { ExtendedRecordMap } from 'notion-types'
import { getBlockValue, getTextContent } from 'notion-utils'

// Titolo della pagina scritto in Notion, con due segni facoltativi:
//
// ➡️  a capo, con una nuova freccia (in Notion il titolo non va a capo):
//   «Romeo Gabriele ➡️ Garaggio ➡️ Studio» → tre righe, ognuna con la freccia
//
// 🔠  in fondo al titolo: grandezza del titolo e sottotitolo, campi separati
//     da "|", tutti facoltativi (gli stessi del paragrafo 🔠, vedi
//     markTitleOptions in lib/notion.ts):
//   «PRESS KIT 🔠 150%»                       titolo una volta e mezza
//   «PRESS KIT 🔠 Materiali per la stampa»    sottotitolo
//   «PRESS KIT 🔠 80% | Materiali | 90%»      tutti e due
//
// Sul sito il titolo lo disegna NotionPage.tsx. Ovunque il titolo compare in
// una riga sola (scheda del browser, percorso in alto, cartelle, indirizzo
// della pagina) ➡️ diventa uno spazio e tutto ciò che segue 🔠 sparisce.

const titleBreak = /\s*➡️?\s*/
const optionsMark = '\u{1F520}' // 🔠
const percentField = /^(\d+(?:[.,]\d+)?)\s*%$/

/** i pezzi del titolo (uno solo se non c'è ➡️) */
export const titleLines = (title: string) =>
  title
    .split(titleBreak)
    .map((line) => line.trim())
    .filter(Boolean)

export interface TitleOptions {
  /** grandezza del titolo (1 = com'è oggi) */
  titleScale?: number
  subtitle?: string
  /** grandezza del sottotitolo (1 = normale) */
  subtitleScale?: number
}

// "150% | Sottotitolo | 90%": la prima percentuale è del titolo, quella dopo
// il testo del sottotitolo. Fra 30% e 300%; 100% = come oggi
export function parseTitleOptions(text: string): TitleOptions {
  const percent = (field: string) => {
    const value = Number(field.match(percentField)?.[1]?.replace(',', '.'))
    return value ? Math.min(300, Math.max(30, value)) / 100 : undefined
  }
  const options: TitleOptions = {}
  for (const field of text.split('|').map((f) => f.trim())) {
    if (!field) continue
    if (percentField.test(field)) {
      if (options.subtitle === undefined) options.titleScale ??= percent(field)
      else options.subtitleScale ??= percent(field)
    } else {
      options.subtitle ??= field
    }
  }
  if (options.titleScale === 1) delete options.titleScale
  return options
}

/** mette le opzioni nel format della pagina, senza toccare quelle già messe */
export function applyTitleOptions(block: any, options: TitleOptions) {
  const format = { ...block.format }
  if (options.titleScale) format.g_title_scale ??= options.titleScale
  if (options.subtitle && !format.g_subtitle) {
    format.g_subtitle = options.subtitle
    format.g_subtitle_scale = options.subtitleScale
  }
  block.format = format
}

// Per ogni pagina dei dati: i pezzi del titolo vanno in format.g_title_lines,
// le opzioni di 🔠 in format.g_title_scale, g_subtitle, g_subtitle_scale, e
// il titolo diventa la riga unica pulita.
// Va fatto sia per le pagine (lib/notion.ts) sia per la mappa del sito
// (lib/get-site-map.ts): l'indirizzo della pagina nasce dal titolo e deve
// essere lo stesso nei due posti.
export function splitPageTitles(recordMap: ExtendedRecordMap) {
  for (const entry of Object.values(recordMap.block ?? {})) {
    const block: any = getBlockValue(entry)
    if (block?.type !== 'page' && block?.type !== 'collection_view_page') {
      continue
    }
    const title = getTextContent(block.properties?.title)
    const at = title.indexOf(optionsMark)
    if (at < 0 && !titleBreak.test(title)) continue

    const lines = titleLines(at < 0 ? title : title.slice(0, at))
    if (!lines.length) continue // titolo fatto solo di segni: resta com'è
    if (at >= 0) {
      applyTitleOptions(
        block,
        parseTitleOptions(title.slice(at + optionsMark.length))
      )
    }
    if (lines.length > 1) {
      block.format = { ...block.format, g_title_lines: lines }
    }
    block.properties = { ...block.properties, title: [[lines.join(' ')]] }
  }
  return recordMap
}
