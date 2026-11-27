import {
  getAllPagesInSpace,
  getBlockValue,
  getPageProperty,
  uuidToId
} from 'notion-utils'

import type * as types from './types'
import * as config from './config'
import { includeNotionIdInUrls } from './config'
import { getCanonicalPageId } from './get-canonical-page-id'
import { notion } from './notion-api'
import { splitPageTitles } from './title-lines'

const uuid = !!includeNotionIdInUrls

// Mappa di tutte le pagine del sito: indirizzo leggibile → pagina Notion
// (in produzione gli indirizzi sono il titolo, es. /press-kit). I titoli si
// cambiano in Notion quando si vuole, quindi la mappa non resta in memoria
// per sempre:
// - indirizzo sconosciuto (es. titolo appena cambiato): la mappa si rifà
//   subito e la richiesta la aspetta (fresh), al massimo una volta ogni 15
//   secondi, così un indirizzo sbagliato non la fa rifare di continuo;
// - mappa più vecchia di un'ora: si usa quella che c'è e la nuova si
//   prepara in sottofondo, nessuno aspetta (serve a tenere aggiornata la
//   mappa per Google, sitemap.xml);
// - se rifarla non riesce (Notion lento o irraggiungibile) resta la vecchia.
// Non è un timer: senza visite non succede nulla.
const maxAge = 60 * 60 * 1000
const minRefresh = 15 * 1000
// profondità delle sottopagine incluse (home = 0): abbondante, così anche
// una pagina messa dentro una sottopagina ha il suo indirizzo
const maxDepth = 4

let cached: { at: number; value: Promise<types.SiteMap> } | undefined
let building: Promise<types.SiteMap> | undefined

// prepara una mappa nuova (una sola alla volta); quando è pronta prende il
// posto della vecchia, se non riesce la vecchia resta
function rebuild() {
  building ??= buildSiteMap()
    .then((map) => {
      cached = { at: Date.now(), value: Promise.resolve(map) }
      return map
    })
    .catch((err: any) => {
      console.warn('site map refresh failed', err?.message)
      if (!cached) throw err
      cached.at = Date.now() // riprova tra un'ora, non a ogni visita
      return cached.value
    })
    .finally(() => {
      building = undefined
    })
  return building
}

export async function getSiteMap({
  fresh = false
}: { fresh?: boolean } = {}): Promise<types.SiteMap> {
  const age = cached ? Date.now() - cached.at : Infinity

  // prima volta, o indirizzo sconosciuto: si aspetta la mappa nuova
  if (!cached || (fresh && age > minRefresh)) return rebuild()
  // scaduta: si risponde con quella che c'è, la nuova arriva in sottofondo
  if (age > maxAge) void rebuild()
  return cached.value
}

async function buildSiteMap(): Promise<types.SiteMap> {
  const partialSiteMap = await getAllPages(
    config.rootNotionPageId,
    config.rootNotionSpaceId ?? undefined
  )

  return {
    site: config.site,
    ...partialSiteMap
  } as types.SiteMap
}

const getPage = async (pageId: string, opts?: any) => {
  console.log('\nnotion getPage', uuidToId(pageId))
  // titoli con ➡️: stesso indirizzo della pagina (vedi lib/title-lines.ts)
  return splitPageTitles(
    await notion.getPage(pageId, {
      kyOptions: {
        timeout: 30_000
      },
      ...opts
    })
  )
}

async function getAllPages(
  rootNotionPageId: string,
  rootNotionSpaceId?: string
): Promise<Partial<types.SiteMap>> {
  const pageMap = await getAllPagesInSpace(
    rootNotionPageId,
    rootNotionSpaceId,
    getPage,
    {
      maxDepth
    }
  )

  const ambiguousPaths = new Set<string>()
  const canonicalPageMap = Object.keys(pageMap).reduce(
    (map: Record<string, string>, pageId: string) => {
      const recordMap = pageMap[pageId]
      if (!recordMap) {
        throw new Error(`Error loading page "${pageId}"`)
      }

      const block = getBlockValue(recordMap.block[pageId])
      if (
        !(getPageProperty<boolean | null>('Public', block!, recordMap) ?? true)
      ) {
        return map
      }

      const canonicalPageId = getCanonicalPageId(pageId, recordMap, {
        uuid
      })!

      if (map[canonicalPageId]) {
        // due pagine con lo stesso titolo: i link a entrambe avranno l'id in
        // coda (vedi lib/map-page-url.ts), che le distingue sempre
        ambiguousPaths.add(canonicalPageId)
        return map
      } else {
        return {
          ...map,
          [canonicalPageId]: pageId
        }
      }
    },
    {}
  )

  return {
    pageMap,
    canonicalPageMap,
    ambiguousPaths: [...ambiguousPaths]
  }
}
