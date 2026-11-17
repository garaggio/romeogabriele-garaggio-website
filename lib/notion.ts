import {
  type ExtendedRecordMap,
  type SearchParams,
  type SearchResults
} from 'notion-types'
import { getBlockValue, getTextContent, mergeRecordMaps } from 'notion-utils'
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
      recordMap = navigationLinkRecordMaps.reduce(
        (map, navigationLinkRecordMap) =>
          mergeRecordMaps(map, navigationLinkRecordMap),
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

  applyBookmarkCaptions(recordMap)

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

// Didascalia dei segnalibri: react-notion-x non la disegna, quindi la mettiamo
// al posto della descrizione automatica del sito, accanto all'immagine.
// Testo semplice: un link nella caption finirebbe dentro l'<a> del segnalibro.
function applyBookmarkCaptions(recordMap: ExtendedRecordMap) {
  for (const entry of Object.values(recordMap.block)) {
    const block: any = getBlockValue(entry)
    if (block?.type !== 'bookmark') continue

    const caption = getTextContent(block.properties?.caption)
    if (caption) block.properties.description = [[caption]]
  }
}

export async function search(params: SearchParams): Promise<SearchResults> {
  return notion.search(params)
}
