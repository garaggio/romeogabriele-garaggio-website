import { type ExtendedRecordMap } from 'notion-types'
import { parsePageId, uuidToId } from 'notion-utils'

import { includeNotionIdInUrls } from './config'
import { getCanonicalPageId } from './get-canonical-page-id'
import { type Site } from './types'

// include UUIDs in page URLs during local development but not in production
// (they're nice for debugging and speed up local dev)
const uuid = !!includeNotionIdInUrls

export const mapPageUrl =
  (site: Site, recordMap: ExtendedRecordMap, searchParams: URLSearchParams) =>
  (pageId = '') => {
    const pageUuid = parsePageId(pageId, { uuid: true })!

    if (uuidToId(pageUuid) === site.rootNotionPageId) {
      return createUrl('/', searchParams)
    } else {
      return createUrl(`/${pagePath(pageUuid, recordMap)}`, searchParams)
    }
  }

// Indirizzo della pagina: il titolo (es. /press-kit). Se più pagine hanno lo
// stesso titolo, l'id in coda le distingue (/foto-41b0…); l'id funziona
// sempre, qualunque titolo abbia la pagina (lib/resolve-notion-page.ts).
// L'elenco dei titoli doppi lo mette il server nei dati della pagina.
function pagePath(pageUuid: string, recordMap: ExtendedRecordMap) {
  const path = getCanonicalPageId(pageUuid, recordMap, { uuid })
  const ambiguous: string[] | undefined = (recordMap as any).ambiguous_paths
  if (!uuid && path && ambiguous?.includes(path)) {
    return getCanonicalPageId(pageUuid, recordMap, { uuid: true })
  }
  return path
}

export const getCanonicalPageUrl =
  (site: Site, recordMap: ExtendedRecordMap) =>
  (pageId = '') => {
    const pageUuid = parsePageId(pageId, { uuid: true })!

    if (uuidToId(pageId) === site.rootNotionPageId) {
      return `https://${site.domain}`
    } else {
      return `https://${site.domain}/${pagePath(pageUuid, recordMap)}`
    }
  }

function createUrl(path: string, searchParams: URLSearchParams) {
  return [path, searchParams.toString()].filter(Boolean).join('?')
}
