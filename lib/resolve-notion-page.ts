import { type ExtendedRecordMap } from 'notion-types'
import { parsePageId } from 'notion-utils'

import type { PageProps } from './types'
import * as acl from './acl'
import { environment, pageUrlAdditions, pageUrlOverrides, site } from './config'
import { db } from './db'
import { getSiteMap } from './get-site-map'
import { getPage } from './notion'

export async function resolveNotionPage(
  domain: string,
  rawPageId?: string
): Promise<PageProps> {
  let pageId: string | undefined
  let recordMap: ExtendedRecordMap

  if (rawPageId && rawPageId !== 'index') {
    pageId = parsePageId(rawPageId)!

    if (!pageId) {
      // check if the site configuration provides an override or a fallback for
      // the page's URI
      const override =
        pageUrlOverrides[rawPageId] || pageUrlAdditions[rawPageId]

      if (override) {
        pageId = parsePageId(override)!
      }
    }

    const useUriToPageIdCache = true
    const cacheKey = `uri-to-page-id:${domain}:${environment}:${rawPageId}`
    // TODO: should we use a TTL for these mappings or make them permanent?
    // const cacheTTL = 8.64e7 // one day in milliseconds
    const cacheTTL = undefined // disable cache TTL

    if (!pageId && useUriToPageIdCache) {
      try {
        // check if the database has a cached mapping of this URI to page ID
        pageId = await db.get(cacheKey)

        // console.log(`redis get "${cacheKey}"`, pageId)
      } catch (err: any) {
        // ignore redis errors
        console.warn(`redis error get "${cacheKey}"`, err.message)
      }
    }

    if (pageId) {
      recordMap = await getPage(pageId)
    } else {
      // indirizzo leggibile (es. /press-kit) → pagina, con la mappa delle
      // pagine. Se non c'è, la mappa si rifà subito: il titolo può essere
      // appena cambiato in Notion (vedi lib/get-site-map.ts).
      let siteMap = await getSiteMap()
      pageId = siteMap?.canonicalPageMap[rawPageId]
      if (!pageId) {
        siteMap = await getSiteMap({ fresh: true })
        pageId = siteMap?.canonicalPageMap[rawPageId]
      }

      // Indirizzo vecchio di una pagina rinominata (un link condiviso, una
      // pagina ancora in cache): se somiglia chiaramente a un solo indirizzo
      // attuale, si va lì invece di dare 404.
      if (!pageId) {
        const target = closestPagePath(
          rawPageId,
          Object.keys(siteMap?.canonicalPageMap ?? {})
        )
        if (target) return { redirect: `/${target}` }
      }

      if (pageId) {
        // TODO: we're not re-using the page recordMap from siteMaps because it is
        // cached aggressively
        // recordMap = siteMap.pageMap[pageId]

        recordMap = await getPage(pageId)

        if (useUriToPageIdCache) {
          try {
            // update the database mapping of URI to pageId
            await db.set(cacheKey, pageId, cacheTTL)

            // console.log(`redis set "${cacheKey}"`, pageId, { cacheTTL })
          } catch (err: any) {
            // ignore redis errors
            console.warn(`redis error set "${cacheKey}"`, err.message)
          }
        }
      } else {
        // note: we're purposefully not caching URI to pageId mappings for 404s
        return {
          error: {
            message: `Not found "${rawPageId}"`,
            statusCode: 404
          }
        }
      }
    }
  } else {
    pageId = site.rootNotionPageId

    console.log(site)
    recordMap = await getPage(pageId)
  }

  // titoli usati da più pagine: i link a quelle pagine avranno l'id in coda
  // (lib/map-page-url.ts). La mappa è già in memoria quasi sempre.
  const ambiguousPaths = (await getSiteMap().catch(() => undefined))
    ?.ambiguousPaths
  if (ambiguousPaths?.length) {
    ;(recordMap as any).ambiguous_paths = ambiguousPaths
  }

  const props: PageProps = { site, recordMap, pageId }
  return { ...props, ...(await acl.pageAcl(props)) }
}

// Indirizzo attuale più simile a uno vecchio, confrontando le parole del
// titolo: "composizioni-produzioni" → "composizioni-live-produzioni". Solo
// se la somiglianza è netta (almeno metà delle parole in comune) e non c'è
// un altro indirizzo ugualmente simile; altrimenti nessuno (pagina 404).
function closestPagePath(path: string, candidates: string[]) {
  const words = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .split('-')
        .filter((w) => w && !/^[\da-f]{32}$/.test(w))
    )
  const wanted = words(path)
  if (!wanted.size) return undefined

  let best: string | undefined
  let bestScore = 0
  let tie = false
  for (const candidate of candidates) {
    const have = words(candidate)
    const common = [...wanted].filter((w) => have.has(w)).length
    const score = common / new Set([...wanted, ...have]).size
    if (score > bestScore) {
      best = candidate
      bestScore = score
      tie = false
    } else if (score === bestScore) {
      tie = true
    }
  }
  return bestScore >= 0.5 && !tie ? best : undefined
}
