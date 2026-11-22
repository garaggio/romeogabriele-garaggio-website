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
import { youtubeIdFrom, youtubeStartFrom } from './television'

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

  markLockScreens(recordMap)

  hideSecretCallouts(recordMap)

  await markYouTubeLinks(recordMap)

  applyBookmarkCaptions(recordMap)

  markPhotoGalleries(recordMap)

  markScrapbooks(recordMap)

  await markTelevisions(recordMap)

  markContextMenus(recordMap)

  embedCustomCallouts(recordMap)

  return recordMap
}

// letture comuni dei blocchi, usate da tutte le funzioni qui sotto
const blockValue = (recordMap: ExtendedRecordMap, id: string): any =>
  getBlockValue(recordMap.block[id])

// testo di un blocco di testo semplice (undefined per gli altri tipi)
const textOfBlock = (recordMap: ExtendedRecordMap, id: string) => {
  const child = blockValue(recordMap, id)
  return child?.type === 'text'
    ? getTextContent(child.properties?.title)
    : undefined
}

// Raccoglitore 🗂️, notifiche 🔔/🔒 e righe App Store 🛍️: il contenuto del
// callout diventa un solo blocco "codice" segnaposto (lingua "garaggio").
// NotionPage.tsx lo sostituisce con il componente (Scrapbook, LockScreen,
// AppRow), che così arriva già disegnato nell'HTML del server invece di
// comparire dopo l'avvio del JavaScript. Il contenuto originale resta in
// format.g_content (il Raccoglitore ci legge le foto).
const customCallouts = new Set([
  'scrapbook',
  'lockscreen',
  'appstore',
  'television'
])

function embedCustomCallouts(recordMap: ExtendedRecordMap) {
  for (const entry of Object.values(recordMap.block)) {
    const block: any = getBlockValue(entry)
    if (
      block?.type !== 'callout' ||
      !customCallouts.has(block.format?.block_color) ||
      block.format.g_content
    ) {
      continue
    }
    const id = `${block.id}-g`
    storeBlock(recordMap, entry, {
      id,
      type: 'code',
      version: 1,
      alive: true,
      parent_id: block.id,
      parent_table: 'block',
      space_id: block.space_id,
      properties: { title: [['']], language: [['garaggio']] },
      format: { g_kind: block.format.block_color, g_for: block.id }
    })
    block.format.g_content = block.content ?? []
    block.content = [id]
  }
}

// salva un blocco creato da noi con la stessa forma di quelli di Notion
// (che può avere un livello "value" in più, a seconda della versione)
function storeBlock(recordMap: ExtendedRecordMap, like: any, value: any) {
  recordMap.block[value.id] = (
    like?.value?.value
      ? { ...like, value: { ...like.value, value } }
      : { ...like, value }
  ) as any
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

    // icone personalizzate dentro il testo. Notion le scrive come
    // ["ce", "<id>"] oppure, oggi, ["ce", "<id>", "<spazio>"]: accettiamo
    // entrambe le forme, così funziona qualsiasi emoji del workspace
    for (const m of JSON.stringify(block.properties ?? {}).matchAll(
      /\["ce","([\w-]+)"(?:,"([\w-]+)")?\]/g
    )) {
      const spaceId = m[2] ?? block.space_id
      if (spaceId) emojis.set(m[1]!, spaceId)
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

// ⬇️ (o 📥) accanto al segno di una galleria (🖼️ striscia o 🗂️/🗃️
// raccoglitore) aggiunge il pulsante "Scarica" per le foto: "🗃️ Press kit ⬇️",
// "🖼️ ⬇️". Il segno non compare.
const downloadMarkers = ['⬇️', '⬇', '📥']
const hasDownloadMarker = (text?: string) =>
  !!text && downloadMarkers.some((m) => text.includes(m))
const stripDownloadMarkers = (text: string) =>
  downloadMarkers
    .reduce((t, m) => t.replaceAll(m, ''), text)
    .replaceAll(/\s{2,}/g, ' ')
    .trim()

// Galleria a scorrimento: in Notion è un callout con icona 🖼️ / 📷 / 📸
// (oppure con scritto solo "Galleria") e le foto messe DENTRO il callout.
// Con ⬇️ ("🖼️ ⬇️" come prima riga, o una riga "⬇️" con l'icona 🖼️) ogni foto
// ha il pulsante per scaricarla.
// Gli diamo il colore finto "gallery": react-notion-x lo scrive come classe
// "notion-gallery_co" e il CSS lo trasforma in una striscia orizzontale.
// Icona e testo del callout non servono più: li togliamo, restano solo le foto.
const galleryIcons = new Set(['🖼️', '🖼', '📷', '📸'])

const isGalleryMarker = (text: string) => {
  const t = stripDownloadMarkers(text).toLowerCase()
  return galleryIcons.has(t) || t === 'galleria'
}

function markPhotoGalleries(recordMap: ExtendedRecordMap) {
  const textOf = (id: string) => textOfBlock(recordMap, id)

  for (const entry of Object.values(recordMap.block)) {
    const block: any = getBlockValue(entry)
    if (block?.type !== 'callout') continue

    const content: string[] = block.content ?? []
    // i callout nuovi di Notion ("versione 2") non hanno testo proprio: la
    // prima riga scritta dentro è un blocco di testo figlio
    const firstLine = content[0] ? textOf(content[0]) : undefined

    const ownTitle = getTextContent(block.properties?.title)
    const isGallery =
      galleryIcons.has(block.format?.page_icon) ||
      isGalleryMarker(ownTitle) ||
      (firstLine !== undefined && isGalleryMarker(firstLine))
    if (!isGallery) continue

    // ⬇️ nella riga del segno (o da solo, come prima riga): pulsante Scarica
    const downloadable = [ownTitle, firstLine].some(
      (t) =>
        hasDownloadMarker(t) &&
        (!stripDownloadMarkers(t!) || isGalleryMarker(t!))
    )

    block.format = {
      ...block.format,
      block_color: 'gallery',
      gallery_download: downloadable || undefined
    }
    delete block.format.page_icon
    if (block.properties) delete block.properties.title

    // via la riga "🖼️"/"Galleria"/"⬇️" e le righe vuote: restano solo le foto
    block.content = content.filter((id) => {
      const text = textOf(id)
      return (
        text === undefined ||
        !(stripDownloadMarkers(text) === '' || isGalleryMarker(text))
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
  const textOf = (id: string) => textOfBlock(recordMap, id)

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
    const rawName =
      fromTitle ?? fromFirstLine ?? (ownTitle.trim() || firstLine?.trim())
    const downloadable = [rawName, ownTitle, firstLine].some(hasDownloadMarker)
    const name = rawName ? stripDownloadMarkers(rawName) : rawName
    // 🗃️ (icona o inizio del testo) sceglie la versione "Platinum ritoccato"
    const modern = [block.format?.page_icon, ownTitle.trim(), firstLine?.trim()]
      .filter(Boolean)
      .some((t) => modernScrapbookIcons.some((i) => t.startsWith(i)))
    block.format = {
      ...block.format,
      block_color: 'scrapbook',
      scrapbook_title: name ? `Galleria — ${name}` : undefined,
      scrapbook_variant: modern ? 'modern' : 'classic',
      scrapbook_download: downloadable || undefined
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

// Televisore 📺 (components/Television.tsx): callout con icona 📺, o "📺" a
// inizio prima riga, e dentro i link di YouTube (video, segnalibri o link nel
// testo). Ogni link è un canale, al massimo dieci. "📺 2.5": il testo dopo il
// segno va nel riquadro blu. I titoli dei video li chiediamo a YouTube.
const tvIcons = ['📺']
const maxChannels = 10

// link di YouTube in un testo di Notion: link veri e indirizzi scritti
const linksInRichText = (rich: any[] | undefined): string[] => {
  const links: string[] = []
  for (const [text, decorations] of rich ?? []) {
    for (const d of decorations ?? []) {
      if (d?.[0] === 'a' && typeof d[1] === 'string') links.push(d[1])
    }
    if (typeof text === 'string') {
      links.push(...(text.match(/https?:\/\/\S+/g) ?? []))
    }
  }
  return links
}

// titoli dei video (oEmbed di YouTube), tenuti in memoria tra le richieste
const youtubeTitles = new Map<string, Promise<string | undefined>>()
const youtubeTitle = (id: string) => {
  let title = youtubeTitles.get(id)
  if (!title) {
    title = fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${id}`
      )}`,
      { signal: AbortSignal.timeout(4000) }
    )
      .then(async (res) =>
        res.ok ? ((await res.json()) as { title?: string }).title : undefined
      )
      .catch(() => undefined)
      .then((value) => {
        // se YouTube non risponde si riprova alla richiesta successiva
        if (!value) youtubeTitles.delete(id)
        return value
      })
    youtubeTitles.set(id, title)
  }
  return title
}

// Un singolo link di YouTube: l'aspetto lo sceglie il segno all'inizio della
// didascalia (come 🛍️ per il merch).
//   Segnalibro:            niente o 👁️ → finestra "Anteprima" del Mac
//                          📺          → televisore
//   Video incorporato:     niente      → player di YouTube normale
//                          👁️          → finestra "Anteprima" del Mac
//                          📺          → televisore
// "📺 2.5": il testo dopo il segno va nel riquadro blu del televisore.
// "👁️ testo": il testo va accanto alla copertina (vedi applyBookmarkCaptions).
// Copertina del video: quella grande (1280 px) non esiste per tutti i video
// e al suo posto YouTube risponde 404 (errore rosso nella console). Il server
// controlla una volta quale c'è e la pagina chiede solo quella giusta.
const youtubeThumbnails = new Map<string, Promise<string>>()
const youtubeThumbnail = (id: string) => {
  let thumbnail = youtubeThumbnails.get(id)
  if (!thumbnail) {
    const large = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`
    const medium = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
    thumbnail = fetch(large, {
      method: 'HEAD',
      signal: AbortSignal.timeout(4000)
    })
      .then((res) => (res.ok ? large : medium))
      .catch(() => {
        youtubeThumbnails.delete(id) // si riprova alla richiesta successiva
        return medium
      })
    youtubeThumbnails.set(id, thumbnail)
  }
  return thumbnail
}

type TvVideo = {
  id: string
  title?: string
  start?: number
  thumbnail?: string
}

// titolo (se manca) e copertina giusta di un video del televisore
const completeVideo = async (video: TvVideo) => {
  const [title, thumbnail] = await Promise.all([
    video.title ? video.title : youtubeTitle(video.id),
    youtubeThumbnail(video.id)
  ])
  if (title) video.title = title
  video.thumbnail = thumbnail
}

async function markYouTubeLinks(recordMap: ExtendedRecordMap) {
  const pending: Array<Promise<void>> = []

  for (const entry of Object.values(recordMap.block)) {
    const block: any = getBlockValue(entry)
    if (block?.type !== 'bookmark' && block?.type !== 'video') continue

    const link: string | undefined =
      block.type === 'bookmark'
        ? block.properties?.link?.[0]?.[0]
        : (block.format?.display_source ?? block.properties?.source?.[0]?.[0])
    const id = link ? youtubeIdFrom(link) : undefined
    if (!link || !id) continue

    const caption = getTextContent(block.properties?.caption).trim()
    const start = youtubeStartFrom(link)

    // 📺 → televisore con un solo canale
    const tvIcon = tvIcons.find((i) => caption.startsWith(i))
    if (tvIcon) {
      const video: TvVideo = {
        id,
        start,
        title:
          block.type === 'bookmark'
            ? getTextContent(block.properties?.title).trim() || undefined
            : undefined
      }
      block.type = 'callout'
      block.format = {
        ...block.format,
        block_color: 'television',
        television: {
          label: caption.slice(tvIcon.length).trim() || undefined,
          videos: [video]
        }
      }
      block.properties = {}
      block.content = []
      pending.push(completeVideo(video))
      continue
    }

    // 👁️ su un video incorporato → diventa un segnalibro: finestra Anteprima
    // con la copertina del video, il titolo e il testo della didascalia
    if (
      block.type === 'video' &&
      previewIcons.some((i) => caption.startsWith(i))
    ) {
      const watch = new URL('https://www.youtube.com/watch')
      watch.searchParams.set('v', id)
      if (start) watch.searchParams.set('t', `${start}s`)
      block.type = 'bookmark'
      block.properties = {
        link: [[watch.toString()]],
        title: [['YouTube']],
        description: [['YouTube']],
        caption: block.properties?.caption ?? []
      }
      block.format = {
        bookmark_cover: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        bookmark_icon: 'https://www.youtube.com/favicon.ico'
      }
      const properties = block.properties
      pending.push(
        youtubeTitle(id).then((title) => {
          if (title) properties.title = [[title]]
        })
      )
    }
  }

  await Promise.all(pending)
}

async function markTelevisions(recordMap: ExtendedRecordMap) {
  const valueOf = (id: string) => blockValue(recordMap, id)
  const pending: Array<Promise<void>> = []

  for (const entry of Object.values(recordMap.block)) {
    const block: any = getBlockValue(entry)
    if (block?.type !== 'callout') continue

    const content: string[] = block.content ?? []
    const first = content[0] ? valueOf(content[0]) : undefined
    const ownTitle = getTextContent(block.properties?.title).trim()
    const firstLine =
      first?.type === 'text'
        ? getTextContent(first.properties?.title).trim()
        : ''
    const fromIcon = tvIcons.includes(block.format?.page_icon)
    const header = [ownTitle, firstLine].find((t) =>
      tvIcons.some((i) => t.startsWith(i))
    )
    if (!fromIcon && header === undefined) continue

    // tutti i link del callout, nell'ordine in cui compaiono
    const links: Array<{ url: string; title?: string }> = []
    for (const url of linksInRichText(block.properties?.title)) {
      links.push({ url })
    }
    for (const id of content) {
      const child = valueOf(id)
      if (!child) continue
      const source =
        child.format?.display_source ?? child.properties?.source?.[0]?.[0]
      if (['video', 'embed'].includes(child.type) && source) {
        links.push({ url: source })
      } else if (child.type === 'bookmark') {
        const url = child.properties?.link?.[0]?.[0]
        if (url) {
          links.push({
            url,
            title: getTextContent(child.properties?.title).trim() || undefined
          })
        }
      } else {
        for (const url of linksInRichText(child.properties?.title)) {
          links.push({ url })
        }
      }
    }

    const videos: TvVideo[] = []
    for (const { url, title } of links) {
      const id = youtubeIdFrom(url)
      if (!id || videos.some((v) => v.id === id)) continue
      if (videos.length >= maxChannels) break
      videos.push({ id, title, start: youtubeStartFrom(url) })
    }
    // senza video resta un callout qualsiasi
    if (!videos.length) continue

    const icon = tvIcons.find((i) => header?.startsWith(i)) ?? ''
    const label = header
      ?.slice(icon.length)
      .replaceAll(/https?:\/\/\S+/g, '')
      .trim()

    block.format = {
      ...block.format,
      block_color: 'television',
      television: { label: label || undefined, videos }
    }
    delete block.format.page_icon
    if (block.properties) delete block.properties.title

    for (const video of videos) pending.push(completeVideo(video))
  }

  await Promise.all(pending)
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
// da sinistra e dall'alto: "🖱️ 60 25" (senza numeri: al centro della foto).
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
  const valueOf = (id: string) => blockValue(recordMap, id)
  const textOf = (id: string) => textOfBlock(recordMap, id)
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
  // mette i blocchi indicati (a partire da "first") dentro un callout menu
  const wrap = (first: any, ids: string[], position?: string) => {
    const parent = valueOf(first.parent_id)
    const siblings: string[] = parent?.content ?? []
    const at = siblings.indexOf(first.id)
    if (at < 0) return
    const wrapperId = `${first.id.slice(0, -4)}menu`
    storeBlock(recordMap, recordMap.block[first.id], {
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
  const valueOf = (id: string) => blockValue(recordMap, id)

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

// Schermata di blocco di iPhone (components/LockScreen.tsx), per esempio per
// la sezione "Next event" della home. In Notion: un callout con icona 🔒
// (o prima riga che inizia con 🔒). Dentro:
//   - prima riga:  🔒 Scritta piccola | Testo grande   (es. "🔒 Next event | 12 dic")
//     (al posto della data e dell'ora dell'iPhone)
//   - una foto: lo sfondo della schermata di blocco (facoltativa)
//   - una riga che inizia con "//" (o un titolo di Notion) è un divisorio
//     con una scritta grande stile "Centro notifiche", es. "// Tour passati"
//   - ogni altra riga di testo è una notifica:
//       🎸 Titolo | quando | testo
//     l'emoji iniziale è l'icona dell'app; un link o una pagina menzionata
//     nella riga rende la notifica cliccabile.
// Con 🔔 al posto di 🔒 le stesse notifiche stanno in un riquadro generico in
// stile macOS (niente iPhone): stessa scrittura, aspetto diverso.
// Il callout prende il colore finto "lockscreen" e i dati in format.lock_screen.
const macIcons = ['🔔']
const lockIcons = ['🔒', '🔐', ...macIcons]
const leadingEmoji =
  /^(\p{Extended_Pictographic}️?(‍\p{Extended_Pictographic}️?)*)\s*/u

// primo link della riga: indirizzo esterno ("a") o pagina menzionata ("p")
const firstLink = (title: any[] | undefined) => {
  for (const segment of title ?? []) {
    for (const decoration of segment?.[1] ?? []) {
      if (decoration?.[0] === 'a' && decoration[1]) {
        return { url: String(decoration[1]) }
      }
      if (decoration?.[0] === 'p' && decoration[1]) {
        return { pageId: String(decoration[1]) }
      }
    }
  }
  return undefined
}

function markLockScreens(recordMap: ExtendedRecordMap) {
  const valueOf = (id: string) => blockValue(recordMap, id)
  // emoji personalizzate del workspace (già risolte da resolveCustomEmojis)
  const customEmojis: Record<string, string> =
    (recordMap as any).custom_emojis ?? {}
  // emoji personalizzata all'inizio della riga: ["‣", [["ce", id, spazio]]]
  const leadingCustomEmoji = (rich?: any[]) => {
    const first = rich?.[0]
    const ce = (first?.[1] ?? []).find((d: any) => d?.[0] === 'ce')
    return ce ? customEmojis[ce[1]] : undefined
  }

  for (const entry of Object.values(recordMap.block)) {
    const block: any = getBlockValue(entry)
    if (block?.type !== 'callout') continue

    const content: string[] = block.content ?? []
    const first = content[0] ? valueOf(content[0]) : undefined
    const ownTitle = getTextContent(block.properties?.title).trim()
    const firstLine =
      first?.type === 'text'
        ? getTextContent(first.properties?.title).trim()
        : ''
    const fromIcon = lockIcons.includes(block.format?.page_icon)
    const headerSource = [ownTitle, firstLine].find((t) =>
      lockIcons.some((i) => t.startsWith(i))
    )
    if (!fromIcon && headerSource === undefined) continue

    const icon = lockIcons.find((i) => headerSource?.startsWith(i)) ?? ''
    const [label, big] = (headerSource ?? '')
      .slice(icon.length)
      .split('|')
      .map((part) => part.trim())

    let wallpaperBlockId: string | undefined
    const notifications: any[] = []
    content.forEach((id, i) => {
      const child = valueOf(id)
      if (!child) return
      if (child.type === 'image') {
        wallpaperBlockId ??= child.id
        return
      }
      // una notifica per riga: righe di testo, oppure blocchi di codice
      // (capita incollando gli esempi: ogni riga del blocco è una notifica)
      const addNotification = (id: string, raw: string, rich?: any[]) => {
        const text = raw.replaceAll('‣', '').trim()
        if (!text) return
        // divisorio: "// Tour passati"
        if (text.startsWith('//')) {
          const title = text.slice(2).trim()
          if (title) notifications.push({ id, divider: true, title })
          return
        }
        const iconImage = leadingCustomEmoji(rich)
        const emoji = iconImage ? null : text.match(leadingEmoji)
        const [title, when, body] = text
          .slice(emoji ? emoji[0].length : 0)
          .split('|')
          .map((part) => part.trim())
        notifications.push({
          id,
          icon: emoji?.[1],
          iconImage,
          title: title || '',
          when: when || undefined,
          body: body || undefined,
          link: rich ? firstLink(rich) : undefined
        })
      }

      if (child.type === 'code') {
        getTextContent(child.properties?.title)
          .split('\n')
          .forEach((line, n) => addNotification(`${child.id}-${n}`, line))
        return
      }
      // un titolo di Notion dentro il callout fa da divisorio
      if (['header', 'sub_header', 'sub_sub_header'].includes(child.type)) {
        const title = getTextContent(child.properties?.title).trim()
        if (title) notifications.push({ id: child.id, divider: true, title })
        return
      }
      if (child.type !== 'text') return
      // la riga del segno 🔒 è l'intestazione, non una notifica
      if (i === 0 && headerSource === firstLine && firstLine) return
      addNotification(
        child.id,
        getTextContent(child.properties?.title),
        child.properties?.title
      )
    })

    const usedIcon = fromIcon ? block.format?.page_icon : icon
    block.format = {
      ...block.format,
      block_color: 'lockscreen',
      lock_screen: {
        variant: macIcons.includes(usedIcon) ? 'mac' : 'phone',
        label: label || 'Next event',
        big: big || undefined,
        wallpaperBlockId,
        notifications
      }
    }
    delete block.format.page_icon
    if (block.properties) delete block.properties.title
  }
}

// Contenitore nascosto: un callout con icona 🙈 (o prima riga che inizia con
// 🙈) non si vede sul sito, con tutto il suo contenuto. Serve per tenere in
// Notion sottopagine che non devono comparire tra le cartelle: si aprono solo
// da un elemento grafico che ci porta (menu 🖱️, riga 🛍️, notifica, link).
// Togliamo il callout dall'elenco dei blocchi della pagina, ma i suoi blocchi
// restano nei dati: titoli e indirizzi delle pagine menzionate funzionano.
const secretIcons = ['🙈']

function hideSecretCallouts(recordMap: ExtendedRecordMap) {
  const valueOf = (id: string) => blockValue(recordMap, id)

  for (const entry of Object.values(recordMap.block)) {
    const block: any = getBlockValue(entry)
    if (block?.type !== 'callout') continue

    const first = block.content?.[0] ? valueOf(block.content[0]) : undefined
    const lines = [
      getTextContent(block.properties?.title).trim(),
      first?.type === 'text'
        ? getTextContent(first.properties?.title).trim()
        : ''
    ]
    const secret =
      secretIcons.includes(block.format?.page_icon) ||
      lines.some((line) => secretIcons.some((i) => line.startsWith(i)))
    if (!secret) continue

    const parent = valueOf(block.parent_id)
    if (parent?.content) {
      parent.content = parent.content.filter((id: string) => id !== block.id)
    }
  }
}

export async function search(params: SearchParams): Promise<SearchResults> {
  return notion.search(params)
}
