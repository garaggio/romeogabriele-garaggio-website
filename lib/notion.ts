import {
  type ExtendedRecordMap,
  type SearchParams,
  type SearchResults
} from 'notion-types'
import {
  getBlockCollectionId,
  getBlockValue,
  getTextContent,
  mergeRecordMaps
} from 'notion-utils'
import pMap from 'p-map'
import pMemoize from 'p-memoize'

import {
  isPreviewImageSupportEnabled,
  navigationLinks,
  navigationStyle
} from './config'
import { getTweetsMap } from './get-tweets'
import { notion } from './notion-api'
import { getPreviewImageMap } from './preview-images'

const getNavigationLinkPages = pMemoize(
  async (): Promise<ExtendedRecordMap[]> => {
    const navigationLinkPageIds = (navigationLinks || [])
      .map((link) => link?.pageId)
      .filter(Boolean)

    if (navigationStyle !== 'default' && navigationLinkPageIds.length) {
      return pMap(
        navigationLinkPageIds,
        async (navigationLinkPageId) =>
          notion.getPage(navigationLinkPageId, {
            chunkLimit: 1,
            fetchMissingBlocks: false,
            fetchCollections: false,
            signFileUrls: false
          }),
        {
          concurrency: 4
        }
      )
    }

    return []
  }
)

export async function getPage(pageId: string): Promise<ExtendedRecordMap> {
  let recordMap = await notion.getPage(pageId)

  if (navigationStyle !== 'default') {
    // ensure that any pages linked to in the custom navigation header have
    // their block info fully resolved in the page record map so we know
    // the page title, slug, etc.
    const navigationLinkRecordMaps = await getNavigationLinkPages()

    if (navigationLinkRecordMaps?.length) {
      // Le pagine della navigazione (es. il carrello → pagina Merch) servono
      // solo per titoli e indirizzi dei link. Regole dell'unione:
      // - le copiamo (structuredClone): sono in memoria, condivise tra le
      //   richieste, e più sotto i blocchi vengono modificati (gallerie,
      //   menu 🖱️…), quindi non devono sporcare la copia in memoria;
      // - la pagina richiesta resta PRIMA nell'elenco dei blocchi (react-notion-x
      //   disegna il primo blocco come pagina) e i suoi dati vincono sempre su
      //   quelli, più vecchi o incompleti, presi dalla navigazione;
      // - teniamo TUTTE le sezioni della pagina: mergeRecordMaps conosce solo
      //   blocchi, database e poco altro, e scarterebbe per esempio
      //   "automation", dove Notion tiene il testo dei pulsanti.
      recordMap = navigationLinkRecordMaps.reduce(
        (map, navigationLinkRecordMap): ExtendedRecordMap => {
          const merged: ExtendedRecordMap = {
            ...map,
            ...mergeRecordMaps(map, structuredClone(navigationLinkRecordMap))
          }
          for (const table of Object.keys(map) as Array<
            keyof ExtendedRecordMap
          >) {
            const records = map[table]
            const target = merged[table]
            if (
              records &&
              target &&
              typeof records === 'object' &&
              typeof target === 'object'
            ) {
              Object.assign(target, records)
            }
          }
          return merged
        },
        recordMap
      )
    }
  }

  await resolveCustomEmojis(recordMap)

  if (isPreviewImageSupportEnabled) {
    const previewImageMap = await getPreviewImageMap(recordMap)
    ;(recordMap as any).preview_images = previewImageMap
  }

  await getTweetsMap(recordMap)

  markAppRows(recordMap)

  applyBookmarkCaptions(recordMap)

  markPhotoGalleries(recordMap)

  markScrapbooks(recordMap)

  markContextMenus(recordMap)

  return recordMap
}

// Icone personalizzate di Notion (custom emoji): nella pagina arrivano come
// "notion://custom_emoji/<spazio>/<id>", un indirizzo che il proxy di Notion
// non sa servire (404). Leggiamo il vero file dell'icona e lo mettiamo al suo posto.
const customEmojiPrefix = 'notion://custom_emoji/'
const customEmojiUrls = new Map<string, string>()

async function resolveCustomEmojis(recordMap: ExtendedRecordMap) {
  // id dell'icona -> id dello spazio Notion (serve per leggerla)
  const emojis = new Map<string, string>()
  const iconBlocks: any[] = []

  for (const entry of Object.values(recordMap.block)) {
    const block: any = getBlockValue(entry)
    if (!block) continue

    const icon = block.format?.page_icon
    if (typeof icon === 'string' && icon.startsWith(customEmojiPrefix)) {
      const [spaceId, id] = icon.slice(customEmojiPrefix.length).split('/')
      if (spaceId && id) emojis.set(id, spaceId)
      iconBlocks.push(block)
    }

    // icone personalizzate dentro il testo: ["ce", "<id>"]
    for (const m of JSON.stringify(block.properties ?? {}).matchAll(
      /\["ce","([\w-]+)"\]/g
    )) {
      if (block.space_id) emojis.set(m[1]!, block.space_id)
    }
  }

  const missing = [...emojis].filter(([id]) => !customEmojiUrls.has(id))

  if (missing.length) {
    try {
      const res: any = await notion.fetch({
        endpoint: 'syncRecordValuesMain',
        body: {
          requests: missing.map(([id, spaceId]) => ({
            pointer: { table: 'custom_emoji', id, spaceId },
            version: -1
          }))
        }
      })

      for (const [id, entry] of Object.entries<any>(
        res?.recordMap?.custom_emoji ?? {}
      )) {
        const url = entry?.value?.value?.url ?? entry?.value?.url
        if (url) customEmojiUrls.set(id, url)
      }
    } catch (err: any) {
      console.warn('failed to resolve custom emojis', err.message)
    }
  }

  for (const block of iconBlocks) {
    const url = customEmojiUrls.get(block.format.page_icon.split('/').pop())
    if (url) block.format.page_icon = url
  }

  const urls = Object.fromEntries(
    [...emojis.keys()]
      .filter((id) => customEmojiUrls.has(id))
      .map((id) => [id, customEmojiUrls.get(id)!])
  )
  ;(recordMap as any).custom_emojis = {
    ...(recordMap as any).custom_emojis,
    ...urls
  }
}

// Segnalibri (link incorporati), due aspetti scelti dalla didascalia:
//   🛍️ … → riga "App Store" del merch (vedi markAppRows qui sotto)
//   👁️ … → finestra "Anteprima" del Mac (è anche l'aspetto senza segno)
// Didascalia: react-notion-x non la disegna, quindi la mettiamo al posto
// della descrizione automatica del sito, accanto all'immagine (senza il segno
// 👁️). Testo semplice: un link nella caption finirebbe dentro l'<a>.
const previewIcons = ['👁️', '👁']

function applyBookmarkCaptions(recordMap: ExtendedRecordMap) {
  for (const entry of Object.values(recordMap.block)) {
    const block: any = getBlockValue(entry)
    if (block?.type !== 'bookmark') continue

    let caption = getTextContent(block.properties?.caption).trim()
    const icon = previewIcons.find((i) => caption.startsWith(i))
    if (icon) caption = caption.slice(icon.length).trim()
    if (caption) block.properties.description = [[caption]]
  }
}

// Galleria a scorrimento: in Notion è un callout con icona 🖼️ / 📷 / 📸
// (oppure con scritto solo "Galleria") e le foto messe DENTRO il callout.
// Gli diamo il colore finto "gallery": react-notion-x lo scrive come classe
// "notion-gallery_co" e il CSS lo trasforma in una striscia orizzontale.
// Icona e testo del callout non servono più: li togliamo, restano solo le foto.
const galleryIcons = new Set(['🖼️', '🖼', '📷', '📸'])

const isGalleryMarker = (text: string) => {
  const t = text.trim().toLowerCase()
  return galleryIcons.has(t) || t === 'galleria'
}

function markPhotoGalleries(recordMap: ExtendedRecordMap) {
  const textOf = (id: string) => {
    const child: any = getBlockValue(recordMap.block[id])
    return child?.type === 'text'
      ? getTextContent(child.properties?.title)
      : undefined
  }

  for (const entry of Object.values(recordMap.block)) {
    const block: any = getBlockValue(entry)
    if (block?.type !== 'callout') continue

    const content: string[] = block.content ?? []
    // i callout nuovi di Notion ("versione 2") non hanno testo proprio: la
    // prima riga scritta dentro è un blocco di testo figlio
    const firstLine = content[0] ? textOf(content[0]) : undefined

    const isGallery =
      galleryIcons.has(block.format?.page_icon) ||
      isGalleryMarker(getTextContent(block.properties?.title)) ||
      (firstLine !== undefined && isGalleryMarker(firstLine))
    if (!isGallery) continue

    block.format = { ...block.format, block_color: 'gallery' }
    delete block.format.page_icon
    if (block.properties) delete block.properties.title

    // via la riga "🖼️"/"Galleria" e le righe vuote: restano solo le foto
    block.content = content.filter((id) => {
      const text = textOf(id)
      return (
        text === undefined || !(text.trim() === '' || isGalleryMarker(text))
      )
    })
  }
}

// Raccoglitore (components/Scrapbook.tsx): un callout con le foto DENTRO e
// come icona (o all'inizio della prima riga) uno di questi segni:
//   🗂️ / 📇 (o la parola "Raccoglitore") → versione classica, Mac OS Platinum
//   🗃️                                  → versione "Platinum ritoccato":
//                                         angoli morbidi, ombra diffusa, giallo
// Il testo dopo il segno diventa il titolo della finestra:
// "🗂️ Concerti 2024" → "Galleria — Concerti 2024".
// Lo marchiamo con il colore finto "scrapbook" (classe notion-scrapbook_co):
// NotionPage.tsx ci disegna dentro il componente con le foto del callout.
const modernScrapbookIcons = ['🗃️', '🗃']
const scrapbookIcons = ['🗂️', '🗂', '📇', ...modernScrapbookIcons]

const scrapbookMarker = (text: string) => {
  const t = text.trim()
  const icon = scrapbookIcons.find((i) => t.startsWith(i))
  if (icon) return t.slice(icon.length).trim()
  if (/^raccoglitore\b/i.test(t)) {
    return t
      .slice('raccoglitore'.length)
      .replace(/^[\s:—–-]+/, '')
      .trim()
  }
  return undefined
}

function markScrapbooks(recordMap: ExtendedRecordMap) {
  const textOf = (id: string) => {
    const child: any = getBlockValue(recordMap.block[id])
    return child?.type === 'text'
      ? getTextContent(child.properties?.title)
      : undefined
  }

  for (const entry of Object.values(recordMap.block)) {
    const block: any = getBlockValue(entry)
    if (block?.type !== 'callout') continue

    const content: string[] = block.content ?? []
    const firstLine = content[0] ? textOf(content[0]) : undefined
    const ownTitle = getTextContent(block.properties?.title)

    const fromIcon = scrapbookIcons.includes(block.format?.page_icon)
    const fromTitle = scrapbookMarker(ownTitle)
    const fromFirstLine =
      firstLine === undefined ? undefined : scrapbookMarker(firstLine)
    if (!fromIcon && fromTitle === undefined && fromFirstLine === undefined) {
      continue
    }

    // il nome della finestra: testo dopo il segno, o il testo del callout
    const name =
      fromTitle ?? fromFirstLine ?? (ownTitle.trim() || firstLine?.trim())
    // 🗃️ (icona o inizio del testo) sceglie la versione "Platinum ritoccato"
    const modern = [block.format?.page_icon, ownTitle.trim(), firstLine?.trim()]
      .filter(Boolean)
      .some((t) => modernScrapbookIcons.some((i) => t.startsWith(i)))
    block.format = {
      ...block.format,
      block_color: 'scrapbook',
      scrapbook_title: name ? `Galleria — ${name}` : undefined,
      scrapbook_variant: modern ? 'modern' : 'classic'
    }
    delete block.format.page_icon
    if (block.properties) delete block.properties.title

    // via la riga del segno e le righe vuote: restano le foto
    block.content = content.filter((id, i) => {
      const text = textOf(id)
      if (text === undefined) return true
      if (i === 0 && fromFirstLine !== undefined) return false
      return text.trim() !== ''
    })
  }
}

// Menu contestuale del Mac (tasto destro), a scelta: i database restano come
// sono in Notion (cartelle affiancate, lista…) finché non li segni con 🖱️.
// Tre modi di scriverlo in Notion:
//  1. foto con didascalia che inizia con "🖱️" e subito sotto un database:
//     il menu si apre sopra la foto;
//  2. un callout con icona 🖱️ (o prima riga "🖱️") con dentro una foto e un
//     database: come sopra; senza foto il menu sta da solo;
//  3. un database il cui nome (o il nome della vista) inizia con "🖱️":
//     menu da solo, nel punto della pagina in cui si trova.
// Qualsiasi vista va bene (galleria, lista, tabella): nel menu diventa lista.
// Dopo il segno si può indicare dove aprire il menu sulla foto, in percentuale
// da sinistra e dall'alto: "🖱️ 60 25" (di base 55 20).
// Il callout prende il colore finto "contextmenu" (classe notion-contextmenu_co)
// e la posizione in format.menu_position; il resto lo fanno CSS e NotionPage.tsx.
const menuIcons = ['🖱️', '🖱']

const menuMarker = (text: string) => {
  const t = text.trim()
  const icon = menuIcons.find((i) => t.startsWith(i))
  if (!icon) return undefined
  const rest = t.slice(icon.length)

  // "60 25", "60% 25%", "60, 25": le prime due cifre sono la posizione
  const match = rest.match(/^\s*(\d{1,3})\s*%?\s*[,;x×\s]\s*(\d{1,3})\s*%?/)
  return {
    position: match
      ? `${Math.min(100, +match[1]!)} ${Math.min(100, +match[2]!)}`
      : undefined,
    rest: (match ? rest.slice(match[0].length) : rest).trim()
  }
}

function markContextMenus(recordMap: ExtendedRecordMap) {
  const valueOf = (id: string): any => getBlockValue(recordMap.block[id])
  const textOf = (id: string) => {
    const child = valueOf(id)
    return child?.type === 'text'
      ? getTextContent(child.properties?.title)
      : undefined
  }
  const isDatabase = (block: any) => block?.type === 'collection_view'
  const handled = new Set<string>()

  // nel menu ogni vista del database si disegna come lista
  const asMenu = (block: any) => {
    handled.add(block.id)
    for (const viewId of block.view_ids ?? []) {
      const view: any = getBlockValue(recordMap.collection_view[viewId])
      if (view) view.type = 'list'
    }
  }

  // stessa forma di un blocco già presente (react-notion-x la legge così)
  const storeBlock = (like: any, value: any) => {
    recordMap.block[value.id] = (
      like?.value?.value
        ? { ...like, value: { ...like.value, value } }
        : { ...like, value }
    ) as any
  }

  // mette i blocchi indicati (a partire da "first") dentro un callout menu
  const wrap = (first: any, ids: string[], position?: string) => {
    const parent = valueOf(first.parent_id)
    const siblings: string[] = parent?.content ?? []
    const at = siblings.indexOf(first.id)
    if (at < 0) return
    const wrapperId = `${first.id.slice(0, -4)}menu`
    storeBlock(recordMap.block[first.id], {
      id: wrapperId,
      type: 'callout',
      version: 1,
      alive: true,
      parent_id: first.parent_id,
      parent_table: 'block',
      space_id: first.space_id,
      properties: {},
      content: ids,
      format: { block_color: 'contextmenu', menu_position: position }
    })
    parent.content = [
      ...siblings.slice(0, at),
      wrapperId,
      ...siblings.slice(at + ids.length)
    ]
  }

  const blocks = Object.values(recordMap.block).map((entry) =>
    getBlockValue(entry)
  ) as any[]

  for (const block of blocks) {
    // 1. foto con didascalia "🖱️ …" e subito sotto un database
    if (block?.type === 'image') {
      const marker = menuMarker(getTextContent(block.properties?.caption))
      if (!marker) continue
      const siblings: string[] = valueOf(block.parent_id)?.content ?? []
      const nextId = siblings[siblings.indexOf(block.id) + 1]
      const next = nextId ? valueOf(nextId) : undefined
      // la didascalia vera è quello che resta dopo il segno e la posizione
      block.properties.caption = marker.rest ? [[marker.rest]] : []
      if (!isDatabase(next)) continue
      asMenu(next)
      wrap(block, [block.id, nextId!], marker.position)
      continue
    }

    // 2. callout 🖱️ con dentro foto e/o database
    if (block?.type !== 'callout') continue
    const content: string[] = block.content ?? []
    const firstLine = content[0] ? textOf(content[0]) : undefined
    const fromIcon = menuIcons.includes(block.format?.page_icon)
    const lineMarker =
      firstLine === undefined ? undefined : menuMarker(firstLine)
    const marker =
      menuMarker(getTextContent(block.properties?.title)) ?? lineMarker
    if (!fromIcon && !marker) continue

    block.format = {
      ...block.format,
      block_color: 'contextmenu',
      menu_position: marker?.position
    }
    delete block.format.page_icon
    if (block.properties) delete block.properties.title
    block.content = content.filter((id, i) => {
      const text = textOf(id)
      if (text === undefined) return true
      if (i === 0 && lineMarker) return false
      return text.trim() !== ''
    })
    for (const id of block.content) {
      if (isDatabase(valueOf(id))) asMenu(valueOf(id))
    }
  }

  // 3. database con nome (o vista) che inizia con "🖱️": menu da solo
  for (const block of blocks) {
    if (!isDatabase(block) || handled.has(block.id)) continue
    const collection: any = getBlockValue(
      recordMap.collection[getBlockCollectionId(block, recordMap) ?? '']
    )
    const views = (block.view_ids ?? []).map((id: string) =>
      getBlockValue(recordMap.collection_view[id])
    ) as any[]
    const collectionName = getTextContent(collection?.name)
    const marked =
      menuMarker(collectionName) ||
      views.some((view) => view?.name && menuMarker(view.name))
    if (!marked) continue

    // il segno non deve comparire da nessuna parte
    if (menuMarker(collectionName)) {
      collection.name = [[menuMarker(collectionName)!.rest]]
    }
    for (const view of views) {
      if (view?.name && menuMarker(view.name)) {
        view.name = menuMarker(view.name)!.rest
      }
    }
    asMenu(block)
    wrap(block, [block.id])
  }
}

// Riga "App Store" per il merch (components/AppRow.tsx).
// In Notion: un segnalibro (link incorporato) con la didascalia che inizia con
// 🛍️ e i campi separati da "|", tutti facoltativi:
//   🛍️ Nome | Sottotitolo | Testo del pulsante | Nota sotto il pulsante
// L'icona dell'app è l'immagine messa SUBITO SOPRA il segnalibro (PNG o SVG):
// la togliamo dal flusso della pagina e la usiamo come icona. Senza immagine
// si usa l'anteprima del sito collegato.
// Il segnalibro diventa un callout col colore finto "appstore"
// (classe notion-appstore_co) e i dati in format.app_row: NotionPage.tsx ci
// disegna dentro la riga.
const appIcons = ['🛍️', '🛍']

function markAppRows(recordMap: ExtendedRecordMap) {
  const valueOf = (id: string): any => getBlockValue(recordMap.block[id])

  for (const entry of Object.values(recordMap.block)) {
    const block: any = getBlockValue(entry)
    if (block?.type !== 'bookmark') continue

    const caption = getTextContent(block.properties?.caption).trim()
    const icon = appIcons.find((i) => caption.startsWith(i))
    if (!icon) continue

    const [name, subtitle, button, note] = caption
      .slice(icon.length)
      .split('|')
      .map((part) => part.trim())
    const link: string | undefined = block.properties?.link?.[0]?.[0]
    if (!link) continue

    // l'immagine subito sopra il segnalibro è l'icona dell'app
    const parent = valueOf(block.parent_id)
    const siblings: string[] = parent?.content ?? []
    const at = siblings.indexOf(block.id)
    const prevId = at > 0 ? siblings[at - 1] : undefined
    const prev = prevId ? valueOf(prevId) : undefined
    const iconBlockId = prev?.type === 'image' ? prev.id : undefined
    if (iconBlockId && parent) {
      parent.content = siblings.filter((id) => id !== iconBlockId)
    }

    block.format = {
      ...block.format,
      block_color: 'appstore',
      app_row: {
        title: name || getTextContent(block.properties?.title).trim() || link,
        subtitle:
          subtitle ||
          getTextContent(block.properties?.description).trim() ||
          undefined,
        button: button || 'Ottieni',
        note: note || undefined,
        link,
        iconBlockId,
        cover: block.format?.bookmark_cover
      }
    }
    block.type = 'callout'
    block.properties = {}
    block.content = []
  }
}

export async function search(params: SearchParams): Promise<SearchResults> {
  return notion.search(params)
}
