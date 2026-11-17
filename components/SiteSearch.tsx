import { useRouter } from 'next/navigation'
import type * as types from 'notion-types'
import {
  getBlockParentPage,
  getBlockTitle,
  getBlockValue,
  uuidToId
} from 'notion-utils'
import * as React from 'react'
import { useNotionContext } from 'react-notion-x'

import { rootNotionPageId, site } from '@/lib/config'
import { mapPageUrl } from '@/lib/map-page-url'
import { searchNotion } from '@/lib/search-notion'

// Ricerca del sito. Sostituisce quella di react-notion-x per due motivi:
// - il risultato porta al punto della sottopagina dove compare la parola
//   (non all'inizio della pagina)
// - cerca sempre il testo appena scritto: quella originale leggeva il testo
//   prima che fosse aggiornato e, scrivendo piano o incollando, non partiva

interface Result {
  id: string
  title: string
  href: string
  highlight?: string
}

const searchIcon = 'url(/icons/search.svg)'

export function SiteSearch() {
  const { components } = useNotionContext()
  const [isOpen, setIsOpen] = React.useState(false)

  React.useEffect(() => {
    // cmd+k / ctrl+k apre la ricerca
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        setIsOpen(true)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <button
        type='button'
        className='breadcrumb button g-search-button'
        title='Cerca'
        onClick={() => setIsOpen(true)}
      >
        <span
          className='g-nav-icon'
          role='img'
          aria-label='Cerca'
          style={{ WebkitMaskImage: searchIcon, maskImage: searchIcon }}
        />
      </button>

      {isOpen && (
        <components.Modal
          isOpen
          contentLabel='Cerca'
          className='notion-search'
          overlayClassName='notion-search-overlay'
          onRequestClose={() => setIsOpen(false)}
        >
          <SearchPanel onClose={() => setIsOpen(false)} />
        </components.Modal>
      )}
    </>
  )
}

function SearchPanel({ onClose }: { onClose: () => void }) {
  const { components } = useNotionContext()
  const router = useRouter()
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<Result[] | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)
  const [hasError, setHasError] = React.useState(false)

  React.useEffect(() => {
    const text = query.trim()
    if (!text) {
      setResults(null)
      setIsLoading(false)
      return
    }

    // aspettiamo una breve pausa nella scrittura, poi cerchiamo il testo attuale
    let isCurrent = true
    setIsLoading(true)

    const timer = setTimeout(async () => {
      try {
        const res = await searchNotion({
          query: text,
          ancestorId: rootNotionPageId
        })
        if (!isCurrent) return
        setResults(toResults(res))
        setHasError(false)
      } catch {
        if (!isCurrent) return
        setHasError(true)
      } finally {
        if (isCurrent) setIsLoading(false)
      }
    }, 250)

    return () => {
      isCurrent = false
      clearTimeout(timer)
    }
  }, [query])

  return (
    <div className='quickFindMenu'>
      <div className='searchBar'>
        <span
          className='g-nav-icon g-search-bar-icon'
          aria-hidden='true'
          style={{ WebkitMaskImage: searchIcon, maskImage: searchIcon }}
        />
        <input
          className='searchInput'
          placeholder='Cerca nel sito'
          value={query}
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {query.trim() && results && results.length > 0 && (
        <>
          <div className='resultsPane'>
            {results.map((result) => (
              <components.Link
                key={result.id}
                href={result.href}
                className='result notion-page-link'
                onClick={(event: React.MouseEvent) => {
                  // con cmd/ctrl il link si apre in una nuova scheda come al solito
                  if (event.metaKey || event.ctrlKey || event.shiftKey) return

                  // chiudere la finestra toglie il link: navighiamo noi
                  event.preventDefault()
                  onClose()
                  router.push(result.href)
                }}
              >
                <span className='g-search-result-title'>{result.title}</span>
                {result.highlight && (
                  <span
                    className='notion-search-result-highlight'
                    dangerouslySetInnerHTML={{ __html: result.highlight }}
                  />
                )}
              </components.Link>
            ))}
          </div>

          <footer className='resultsFooter'>
            <span>
              <span className='resultsCount'>{results.length}</span>
              {results.length === 1 ? ' risultato' : ' risultati'}
            </span>
          </footer>
        </>
      )}

      {query.trim() && !isLoading && (hasError || results?.length === 0) && (
        <div className='noResultsPane'>
          <div className='noResults'>
            {hasError ? 'Errore nella ricerca' : 'Nessun risultato'}
          </div>
        </div>
      )}
    </div>
  )
}

function toResults(res: types.SearchResults): Result[] {
  const recordMap = res.recordMap as types.ExtendedRecordMap
  const pageUrl = mapPageUrl(site, recordMap, new URLSearchParams())
  const byPage = new Map<string, Result>()

  for (const item of res.results ?? []) {
    const block = getBlockValue(recordMap.block[item.id])
    if (!block) continue

    const page =
      getBlockParentPage(block, recordMap, { inclusive: true }) || block
    if (!page.id || byPage.has(page.id)) continue

    const title = getBlockTitle(page, recordMap)
    if (!title) continue

    // il blocco dove compare la parola: la pagina si apre scorrendo fin lì
    const target = (item as any).highlightBlockId as string | undefined
    const hash = target && target !== page.id ? `#${uuidToId(target)}` : ''

    byPage.set(page.id, {
      id: page.id,
      title,
      href: `${pageUrl(page.id)}${hash}`,
      highlight: toHighlightHtml(item.highlight?.text)
    })
  }

  return [...byPage.values()]
}

// il testo arriva da Notion con la parola cercata tra <gzknfouu>: lo rendiamo
// sicuro e trasformiamo solo quei segni in grassetto
function toHighlightHtml(text?: string) {
  if (!text) return

  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll(/&lt;gzknfouu&gt;/gi, '<b>')
    .replaceAll(/&lt;\/gzknfouu&gt;/gi, '</b>')
}
