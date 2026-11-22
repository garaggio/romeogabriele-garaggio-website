'use client'

import cs from 'classnames'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import {
  formatDate,
  getBlockTitle,
  getBlockValue,
  idToUuid
} from 'notion-utils'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import BodyClassName from 'react-body-classname'
import {
  type NotionComponents,
  NotionRenderer,
  useNotionContext
} from 'react-notion-x'
import { Collection } from 'react-notion-x/third-party/collection'
import { EmbeddedTweet, TweetNotFound, TweetSkeleton } from 'react-tweet'
import { useSearchParam } from 'react-use'

import type * as types from '@/lib/types'
import * as config from '@/lib/config'
import { getAppRows } from '@/lib/appstore'
import { getLockScreens } from '@/lib/lockscreen'
import { mapImageUrl } from '@/lib/map-image-url'
import { mapPageUrl } from '@/lib/map-page-url'
import {
  getGalleryDownloads,
  getScrapbooks,
  getVideoPosters
} from '@/lib/scrapbook'
import { lockPageScroll } from '@/lib/scroll-lock'
import { isVideoZoomOpen, openVideoZoom } from '@/lib/video-zoom'
import { searchNotion } from '@/lib/search-notion'
import { getTelevisions } from '@/lib/television'
import { useDarkMode } from '@/lib/use-dark-mode'
import { Footer } from './Footer'
import { NotionPageHeader } from './NotionPageHeader'
import { PageAside } from './PageAside'
import {
  byBlockId,
  CustomBlock,
  CustomBlocksContext,
  isCustomBlock
} from './CustomBlock'

// -----------------------------------------------------------------------------
// dynamic imports for optional components
// -----------------------------------------------------------------------------

const Code = dynamic(() =>
  import('react-notion-x/third-party/code').then(async (m) => {
    // add / remove any prism syntaxes here
    await Promise.allSettled([
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-markup-templating.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-markup.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-bash.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-c.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-cpp.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-csharp.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-docker.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-java.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-js-templates.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-coffeescript.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-diff.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-git.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-go.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-graphql.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-handlebars.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-less.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-makefile.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-markdown.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-objectivec.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-ocaml.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-python.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-reason.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-rust.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-sass.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-scss.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-solidity.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-sql.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-stylus.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-swift.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-wasm.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-yaml.js')
    ])
    return m.Code
  })
)

const Equation = dynamic(() =>
  import('react-notion-x/third-party/equation').then((m) => m.Equation)
)
const Pdf = dynamic(
  () => import('react-notion-x/third-party/pdf').then((m) => m.Pdf),
  {
    ssr: false
  }
)
const Modal = dynamic(
  () =>
    import('react-notion-x/third-party/modal').then((m) => {
      m.Modal.setAppElement('.notion-viewport')
      return m.Modal
    }),
  {
    ssr: false
  }
)

function Tweet({ id }: { id: string }) {
  const { recordMap } = useNotionContext()
  const tweet = (recordMap as types.ExtendedTweetRecordMap)?.tweets?.[id]

  return (
    <React.Suspense fallback={<TweetSkeleton />}>
      {tweet ? <EmbeddedTweet tweet={tweet} /> : <TweetNotFound />}
    </React.Suspense>
  )
}

const propertyLastEditedTimeValue = (
  { block, pageHeader }: any,
  defaultFn: () => React.ReactNode
) => {
  if (pageHeader && block?.last_edited_time) {
    return `Last updated ${formatDate(block?.last_edited_time, {
      month: 'long'
    })}`
  }

  return defaultFn()
}

const propertyDateValue = (
  { data, schema, pageHeader }: any,
  defaultFn: () => React.ReactNode
) => {
  if (pageHeader && schema?.name?.toLowerCase() === 'published') {
    const publishDate = data?.[0]?.[1]?.[0]?.[1]?.start_date

    if (publishDate) {
      return `${formatDate(publishDate, {
        month: 'long'
      })}`
    }
  }

  return defaultFn()
}

const propertyTextValue = (
  { schema, pageHeader }: any,
  defaultFn: () => React.ReactNode
) => {
  if (pageHeader && schema?.name?.toLowerCase() === 'author') {
    return <b>{defaultFn()}</b>
  }

  return defaultFn()
}

// blocchi "codice": i segnaposto del sito diventano i nostri componenti
// (components/CustomBlock.tsx), gli altri restano codice con i colori
const CodeOrCustom = (props: any) =>
  isCustomBlock(props.block) ? (
    <CustomBlock block={props.block} />
  ) : (
    <Code {...props} />
  )

const notionRendererComponents: Partial<NotionComponents> = {
  nextImage: Image,
  nextLink: Link,
  Code: CodeOrCustom,
  Collection,
  Equation,
  Pdf,
  Modal,
  Tweet,
  Header: NotionPageHeader,
  propertyLastEditedTimeValue,
  propertyTextValue,
  propertyDateValue
}

export function NotionPage({
  site,
  recordMap,
  pageId,
  generatedAt
}: Required<Pick<types.PageProps, 'site' | 'recordMap' | 'pageId'>> &
  Pick<types.PageProps, 'generatedAt'>) {
  const lite = useSearchParam('lite')

  // Primo accesso: Vercel serve subito l'ultima copia salvata della pagina e
  // intanto ne prepara una nuova con i dati aggiornati di Notion. Se quella
  // ricevuta è vecchia (più di un minuto), il browser chiede subito la nuova
  // e la sostituisce senza ricaricare: chi arriva vede le ultime modifiche
  // già alla prima visita. Al massimo 3 tentativi.
  const router = useRouter()
  const refreshes = React.useRef(0)
  React.useEffect(() => {
    if (!generatedAt || refreshes.current >= 3) return
    if (Date.now() - generatedAt < 60_000) return
    const timer = setTimeout(
      () => {
        refreshes.current += 1
        router.refresh()
      },
      refreshes.current === 0 ? 1500 : 4000
    )
    return () => clearTimeout(timer)
  }, [generatedAt, router])

  // Cartelle della home: quella premuta resta evidenziata (titolo giallo)
  // finché la sottopagina non si apre, anche su telefoni e tablet. Il
  // segno si toglie all'arrivo della nuova pagina o tornando indietro.
  React.useEffect(() => {
    const clear = () =>
      document
        .querySelectorAll('.g-card-loading')
        .forEach((el) => el.classList.remove('g-card-loading'))
    const onClick = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      const card = (event.target as Element | null)?.closest?.(
        '.index-page .notion-gallery .notion-collection-card'
      )
      if (!card) return
      clear()
      card.classList.add('g-card-loading')
    }
    // in cattura: prima che il link di Next gestisca (e blocchi) il clic
    document.addEventListener('click', onClick, true)
    window.addEventListener('pageshow', clear)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('pageshow', clear)
      clear()
    }
  }, [pageId])

  // Primo caricamento: la pagina (nascosta dallo script in app/layout.tsx)
  // compare quando le immagini visibili sono pronte, così chi arriva trova
  // tutto già al suo posto invece di vedere le foto caricarsi. Aspettiamo
  // le foto nella prima schermata, gli sfondi segnati con data-g-image
  // (notifiche) e i caratteri; al massimo fino a 1,4 s dall'apertura.
  React.useEffect(() => {
    const root = document.documentElement
    if (!root.classList.contains('g-wait')) return
    const inView = (el: Element) => {
      const r = el.getBoundingClientRect()
      return r.bottom > 0 && r.top < window.innerHeight && r.width > 0
    }
    const ready = (img: HTMLImageElement) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          })
    const images = [
      ...document.querySelectorAll<HTMLImageElement>('.notion-page img')
    ]
      .filter(inView)
      .map(ready)
    const backgrounds = [
      ...document.querySelectorAll<HTMLElement>('[data-g-image]')
    ]
      .filter(inView)
      .map((el) => {
        const img = new window.Image()
        img.src = el.dataset.gImage!
        return ready(img)
      })
    const limit = new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, 1400 - performance.now()))
    )
    let done = false
    const reveal = () => {
      if (done) return
      done = true
      root.classList.remove('g-wait')
    }
    void Promise.race([
      Promise.all([...images, ...backgrounds, document.fonts.ready]),
      limit
    ]).then(reveal)
    return reveal
  }, [])

  // lite mode is for oembed
  const isLiteMode = lite === 'true'

  const { isDarkMode } = useDarkMode()

  const siteMapPageUrl = React.useMemo(() => {
    const params: any = {}
    if (lite) params.lite = lite

    const searchParams = new URLSearchParams(params)
    return mapPageUrl(site, recordMap, searchParams)
  }, [site, recordMap, lite])

  const keys = Object.keys(recordMap?.block || {})
  const block = getBlockValue(recordMap?.block?.[keys[0]!])!

  // const isRootPage =
  //   parsePageId(block?.id) === parsePageId(site?.rootNotionPageId)
  const isBlogPost =
    block?.type === 'page' && block?.parent_table === 'collection'

  const minTableOfContentsItems = 3

  const pageAside = React.useMemo(
    () => (
      <PageAside block={block!} recordMap={recordMap} isBlogPost={isBlogPost} />
    ),
    [block, recordMap, isBlogPost]
  )

  const title = getBlockTitle(block, recordMap) || site.name

  React.useEffect(() => {
    console.log('notion page', {
      isDev: config.isDev,
      title,
      pageId,
      rootNotionPageId: site.rootNotionPageId,
      recordMap
    })

    // add important objects to the window global for easy debugging
    const g = window as any
    g.pageId = pageId
    g.recordMap = recordMap
    g.block = block
  }, [block, pageId, recordMap, site.rootNotionPageId, title])

  // dalla ricerca: "/pagina#<id del blocco>" apre la pagina nel punto trovato
  React.useEffect(() => {
    const scrollToBlock = () => {
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (!/^[\da-f]{32}$/i.test(id) || document.getElementById(id)) return

      const target = document.querySelector<HTMLElement>(`.notion-block-${id}`)
      if (!target) return

      // se il punto è dentro un blocco a scomparsa chiuso, lo apriamo
      for (let el = target.parentElement; el; el = el.parentElement) {
        if (el instanceof HTMLDetailsElement) el.open = true
      }

      target.scrollIntoView({ block: 'center' })
      target.classList.remove('g-search-target')
      void target.offsetWidth
      target.classList.add('g-search-target')

      // le immagini che si caricano spostano il testo: ricentriamo una volta
      setTimeout(() => target.scrollIntoView({ block: 'center' }), 500)
    }

    scrollToBlock()
    window.addEventListener('hashchange', scrollToBlock)
    return () => window.removeEventListener('hashchange', scrollToBlock)
  }, [pageId])

  // Gallerie foto (callout 🖼️, vedi lib/notion.ts), con i comandi del
  // Raccoglitore retrò (components/Scrapbook.tsx), tranne lo scorrimento:
  // - trackpad e dito: scorrimento continuo, libero, senza scatti tra le foto
  // - frecce disegnate ai lati: una foto per clic
  // - tasti ← →: con il mouse sopra la galleria o con la striscia selezionata
  // - ingrandimento: finché la foto è aperta la pagina non scorre
  React.useEffect(() => {
    const cleanups: Array<() => void> = []
    // video ingranditi: si chiudono se si cambia pagina
    const cleanupsZoom: Array<() => void> = []
    const posters = getVideoPosters(recordMap)

    for (const gallery of document.querySelectorAll<HTMLElement>(
      '.notion-gallery_co'
    )) {
      const track = gallery.querySelector<HTMLElement>('.notion-callout-text')
      if (!track) continue

      track.tabIndex = 0
      track.setAttribute('role', 'region')
      track.setAttribute('aria-label', 'Galleria foto')

      const figures = () => [
        ...track.querySelectorAll<HTMLElement>(':scope > figure')
      ]
      // posizione di scorrimento che porta la foto al margine del testo
      // (la striscia ha ai lati uno spazio per le ombre, vedi global.css)
      const offsetOf = (figure: HTMLElement) =>
        figure.getBoundingClientRect().left -
        track.getBoundingClientRect().left +
        track.scrollLeft -
        Number.parseFloat(getComputedStyle(track).paddingLeft)
      const maxScroll = () => track.scrollWidth - track.clientWidth
      // foto di partenza: quella allineata a sinistra (o la più vicina)
      let target: number | undefined
      let settle: ReturnType<typeof setTimeout> | undefined
      const currentIndex = () => {
        if (target !== undefined) return target
        const list = figures()
        let best = 0
        let bestDistance = Infinity
        list.forEach((figure, i) => {
          const distance = Math.abs(offsetOf(figure) - track.scrollLeft)
          if (distance < bestDistance) {
            best = i
            bestDistance = distance
          }
        })
        return best
      }
      const step = (dir: number) => {
        const list = figures()
        if (!list.length) return
        // in fondo alla striscia le ultime foto sono già tutte visibili:
        // un passo indietro parte dalla prima di quelle
        let from = currentIndex()
        if (dir < 0 && track.scrollLeft >= maxScroll() - 2) {
          from = list.findIndex((f) => offsetOf(f) >= track.scrollLeft - 2)
          if (from < 0) from = list.length - 1
        }
        if (dir > 0 && track.scrollLeft >= maxScroll() - 2) return
        const next = Math.min(list.length - 1, Math.max(0, from + dir))
        target = next
        track.scrollTo({
          left: Math.min(maxScroll(), offsetOf(list[next]!)),
          behavior: 'smooth'
        })
        // a scorrimento finito si torna a leggere la posizione reale
        clearTimeout(settle)
        settle = setTimeout(() => (target = undefined), 450)
      }

      const makeButton = (dir: -1 | 1) => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = `g-gallery-btn g-gallery-btn--${dir < 0 ? 'prev' : 'next'}`
        btn.setAttribute(
          'aria-label',
          dir < 0 ? 'Foto precedente' : 'Foto successiva'
        )
        // triangolo disegnato: i caratteri ‹ › cambiano aspetto tra i sistemi
        btn.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${
          dir < 0 ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'
        }"/></svg>`
        btn.addEventListener('click', () => step(dir))
        gallery.append(btn)
        return btn
      }

      const prev = makeButton(-1)
      const next = makeButton(1)

      const update = () => {
        prev.disabled = track.scrollLeft <= 2
        next.disabled = track.scrollLeft >= maxScroll() - 2
      }

      // tasti ← →: con il mouse sopra la galleria (senza cliccare, il clic
      // apre lo zoom) oppure con la striscia selezionata dalla tastiera
      let hovering = false
      const onEnter = (event: PointerEvent) => {
        if (event.pointerType === 'mouse') hovering = true
      }
      const onLeave = () => {
        hovering = false
      }
      const onKey = (event: KeyboardEvent) => {
        if (event.defaultPrevented) return
        if (event.metaKey || event.ctrlKey || event.altKey) return
        if (!hovering && document.activeElement !== track) return
        if (document.querySelector('.medium-zoom-image--opened')) return
        if (isVideoZoomOpen()) return
        const el = event.target as HTMLElement | null
        if (el?.closest('input, textarea, select, [contenteditable="true"]')) {
          return
        }
        const d =
          event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
        if (!d) return
        event.preventDefault()
        step(d)
      }

      update()
      track.addEventListener('scroll', update, { passive: true })
      gallery.addEventListener('pointerenter', onEnter)
      gallery.addEventListener('pointerleave', onLeave)
      window.addEventListener('keydown', onKey)
      const resize = new ResizeObserver(update)
      resize.observe(track)
      // le foto che si caricano allungano la striscia
      for (const img of track.querySelectorAll('img')) {
        img.addEventListener('load', update)
      }

      // Video (caricati in Notion dentro la galleria): fermi, senza comandi,
      // con l'icona ▶ in basso. Al clic si ingrandiscono e partono, al
      // secondo clic si fermano e tornano al loro posto (lib/video-zoom.ts).
      for (const video of track.querySelectorAll<HTMLVideoElement>(
        ':scope > figure video'
      )) {
        const frame = video.parentElement
        if (!frame) continue
        video.controls = false
        video.removeAttribute('controls')
        video.muted = true
        video.playsInline = true
        video.preload = 'metadata'
        // l'anteprima di Notion: subito visibile, con le misure giuste
        const blockId = video
          .closest('figure')
          ?.className.match(/notion-block-([\da-f]{32})/)?.[1]
        const poster = blockId && posters[blockId]
        if (poster) video.poster = poster
        video.disablePictureInPicture = true
        video.setAttribute('controlslist', 'nodownload noremoteplayback')
        // "#t=0.1": anche Safari su iPhone mostra il primo fotogramma
        if (video.src && !video.src.includes('#')) video.src += '#t=0.1'
        video.tabIndex = 0
        video.setAttribute('role', 'button')
        video.setAttribute('aria-label', 'Riproduci il video')

        const badge = document.createElement('span')
        badge.className = 'g-gallery-play'
        badge.setAttribute('aria-hidden', 'true')
        badge.innerHTML =
          '<svg viewBox="0 0 16 16"><path d="M5.5 3.6v8.8a.6.6 0 0 0 .9.5l7-4.4a.6.6 0 0 0 0-1L6.4 3.1a.6.6 0 0 0-.9.5z"/></svg>'
        frame.append(badge)

        const open = () => cleanupsZoom.push(openVideoZoom(video))
        const onKeyOpen = (event: KeyboardEvent) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          open()
        }
        video.addEventListener('click', open)
        video.addEventListener('keydown', onKeyOpen)
        // le misure arrivano con i metadati: la striscia si allunga
        video.addEventListener('loadedmetadata', update)

        cleanups.push(() => {
          video.removeEventListener('click', open)
          video.removeEventListener('keydown', onKeyOpen)
          video.removeEventListener('loadedmetadata', update)
          badge.remove()
        })
      }

      cleanups.push(() => {
        clearTimeout(settle)
        track.removeEventListener('scroll', update)
        gallery.removeEventListener('pointerenter', onEnter)
        gallery.removeEventListener('pointerleave', onLeave)
        window.removeEventListener('keydown', onKey)
        resize.disconnect()
        prev.remove()
        next.remove()
      })
    }

    // Ingrandimento di una foto della galleria (react-notion-x): come nel
    // Raccoglitore la pagina resta ferma finché la foto non torna al suo
    // posto. Senza blocco, il primo scorrimento chiuderebbe la foto.
    let unlockScroll: (() => void) | undefined
    const lock = (event: Event) => {
      const img = event.target as Element | null
      if (unlockScroll || !img?.closest?.('.notion-gallery_co')) return
      unlockScroll = lockPageScroll()
    }
    const unlock = () => {
      unlockScroll?.()
      unlockScroll = undefined
    }
    // gli eventi dello zoom non risalgono la pagina: li ascoltiamo in cattura
    document.addEventListener('medium-zoom:open', lock, true)
    document.addEventListener('medium-zoom:closed', unlock, true)

    return () => {
      for (const cleanup of cleanups) cleanup()
      for (const close of cleanupsZoom) close()
      document.removeEventListener('medium-zoom:open', lock, true)
      document.removeEventListener('medium-zoom:closed', unlock, true)
      unlock()
    }
  }, [pageId, recordMap])

  // gallerie 🖼️ con ⬇️ (vedi lib/notion.ts): su ogni foto un pulsante tondo
  // che scarica il file originale con il suo nome, passando da /api/download
  const galleryDownloads = React.useMemo(
    () => getGalleryDownloads(recordMap),
    [recordMap]
  )
  React.useEffect(() => {
    const buttons: HTMLElement[] = []
    for (const { blockId, url, filename } of galleryDownloads) {
      const figure = document.querySelector<HTMLElement>(
        `.notion-gallery_co figure.notion-block-${blockId}`
      )
      // il riquadro che contiene la foto (prima della didascalia)
      const frame = figure?.querySelector('img, video')?.parentElement
      if (!frame) continue
      const link = document.createElement('a')
      link.className = 'g-gallery-dl'
      link.href = `/api/download?${new URLSearchParams({ url, name: filename })}`
      link.download = filename
      link.setAttribute('aria-label', `Scarica ${filename}`)
      link.title = 'Scarica'
      link.innerHTML =
        '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10"/></svg>'
      // il clic scarica e basta: niente ingrandimento della foto o del video
      link.addEventListener('click', (event) => event.stopPropagation())
      frame.append(link)
      buttons.push(link)
    }
    return () => {
      for (const button of buttons) button.remove()
    }
  }, [galleryDownloads])

  // protezione dalla copia (deterrente: chi usa gli strumenti del browser o fa
  // uno screenshot può comunque copiare). Blocca copia/taglia, il menu del
  // tasto destro sulle immagini, il trascinamento delle foto e le scorciatoie
  // salva, stampa e codice sorgente. La casella di
  // ricerca e gli altri campi di testo restano utilizzabili.
  React.useEffect(() => {
    const isEditable = (target: EventTarget | null) =>
      target instanceof Element &&
      !!target.closest('input, textarea, [contenteditable="true"]')

    const blockCopy = (event: ClipboardEvent) => {
      if (!isEditable(event.target)) event.preventDefault()
    }

    const blockImageMenu = (event: MouseEvent) => {
      if (
        event.target instanceof HTMLImageElement ||
        event.target instanceof HTMLVideoElement
      ) {
        event.preventDefault()
      }
    }

    const blockImageDrag = (event: DragEvent) => {
      if (event.target instanceof HTMLImageElement) event.preventDefault()
    }

    document.addEventListener('copy', blockCopy)
    document.addEventListener('cut', blockCopy)
    document.addEventListener('contextmenu', blockImageMenu)
    document.addEventListener('dragstart', blockImageDrag)

    // scorciatoie del browser: salva (⌘S), stampa (⌘P), codice sorgente (⌘U),
    // anche con ⇧ o ⌥. Dal menu File si può ancora stampare: lì il CSS
    // (@media print in global.css) stampa solo un avviso.
    const blockedKeys = new Set(['s', 'p', 'u'])
    const blockShortcuts = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (!blockedKeys.has(event.key.toLowerCase())) return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', blockShortcuts, true)

    return () => {
      document.removeEventListener('copy', blockCopy)
      document.removeEventListener('cut', blockCopy)
      document.removeEventListener('contextmenu', blockImageMenu)
      document.removeEventListener('dragstart', blockImageDrag)
      window.removeEventListener('keydown', blockShortcuts, true)
    }
  }, [])

  // file caricati in Notion: tipo del file (PDF, ZIP…) nel riquadro a sinistra
  // e pulsante "Scarica" a destra, che passa da /api/download
  React.useEffect(() => {
    const buttons: HTMLElement[] = []

    for (const link of document.querySelectorAll<HTMLAnchorElement>(
      '.notion-file > a.notion-file-link'
    )) {
      const box = link.parentElement
      if (!box || box.querySelector('.g-file-download')) continue

      let url: URL
      try {
        url = new URL(link.href)
      } catch {
        continue
      }

      const fileName = decodeURIComponent(url.pathname.split('/').pop() ?? '')
      const ext = fileName.includes('.')
        ? fileName.split('.').pop()!.slice(0, 4).toUpperCase()
        : ''
      link.dataset.ext = ext || 'FILE'

      const title =
        link.querySelector('.notion-file-title')?.textContent?.trim() ?? ''
      const name =
        title && ext && !title.toLowerCase().endsWith(`.${ext.toLowerCase()}`)
          ? `${title}.${ext.toLowerCase()}`
          : title || fileName

      const button = document.createElement('a')
      button.className = 'g-file-download'
      button.href = `/api/download?${new URLSearchParams({ url: link.href, name })}`
      button.setAttribute('download', name)
      button.setAttribute('aria-label', `Scarica ${name}`)
      button.innerHTML =
        '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8m0 0 3.5-3.5M8 10 4.5 6.5M3 13.5h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Scarica</span>'
      box.append(button)
      buttons.push(button)
    }

    return () => {
      for (const button of buttons) button.remove()
    }
  }, [pageId, recordMap])

  // Home: ogni cartella usa l'icona caricata in Notion sulla sua pagina
  // (Icona → Carica). Il CSS la riceve in --g-folder-icon; senza un'immagine
  // (nessuna icona o un'emoji) resta la cartella predefinita cartella.png.
  // Usiamo il file originale, non la miniatura da 24 px del titolo.
  React.useEffect(() => {
    const cards = document.querySelectorAll<HTMLElement>(
      '.index-page .notion-gallery .notion-collection-card'
    )
    for (const card of cards) {
      const id = card.getAttribute('href')?.match(/[0-9a-f]{32}/)?.[0]
      const block: any = id
        ? getBlockValue(recordMap.block[idToUuid(id)])
        : undefined
      const icon: string | undefined = block?.format?.page_icon
      const isImage =
        typeof icon === 'string' && /^(https?:|\/|attachment:)/.test(icon)
      const url = isImage ? mapImageUrl(icon, block) : undefined
      if (url) {
        card.style.setProperty(
          '--g-folder-icon',
          `url("${url.replaceAll('"', '%22')}")`
        )
      } else {
        card.style.removeProperty('--g-folder-icon')
      }
    }
  }, [recordMap])

  // Foto singole: l'indirizzo della foto passa al CSS (--g-photo-src) per
  // disegnare dietro di lei l'alone di colore sfocato (vedi global.css)
  React.useEffect(() => {
    const cleanups: Array<() => void> = []
    for (const figure of document.querySelectorAll<HTMLElement>(
      '.notion-page figure.notion-asset-wrapper-image'
    )) {
      if (figure.closest('.notion-gallery_co, .notion-scrapbook_co')) continue
      const box = figure.firstElementChild as HTMLElement | null
      if (!box || !figure.querySelector('img')) continue
      // la foto si cerca ogni volta: React può sostituire l'elemento <img>
      const apply = () => {
        const img = figure.querySelector('img')
        const src = img && (img.currentSrc || img.getAttribute('src'))
        if (src) {
          box.style.setProperty(
            '--g-photo-src',
            `url("${src.replaceAll('"', '%22')}")`
          )
        }
      }
      // altezza della didascalia: alone e bordo di vetro si fermano alla foto
      const measureCaption = () => {
        const caption = figure.querySelector<HTMLElement>('figcaption')
        const height =
          caption && caption.offsetParent
            ? caption.offsetHeight +
              Number.parseFloat(getComputedStyle(caption).marginTop || '0')
            : 0
        box.style.setProperty('--g-caption-h', `${height}px`)
      }
      apply()
      measureCaption()
      const observer = new ResizeObserver(measureCaption)
      observer.observe(box)
      // "load" non risale, ma si sente in fase di cattura
      figure.addEventListener('load', apply, true)
      cleanups.push(() => {
        observer.disconnect()
        figure.removeEventListener('load', apply, true)
      })
    }
    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }, [recordMap])

  // Indice su telefono: se anche una sola voce non entra in una riga, tutte
  // le voci passano insieme a due righe (classe g-toc-two, vedi global.css).
  // Si ricalcola quando cambia la larghezza dello schermo (es. rotazione).
  React.useEffect(() => {
    const phone = window.matchMedia('(max-width: 640px)')
    const update = () => {
      for (const toc of document.querySelectorAll<HTMLElement>(
        '.notion-table-of-contents'
      )) {
        // si misura sempre in modalità una riga
        toc.classList.remove('g-toc-two')
        if (!phone.matches) continue
        const tooLong = [
          ...toc.querySelectorAll<HTMLElement>(
            '.notion-table-of-contents-item-body'
          )
        ].some((body) => body.scrollWidth > body.clientWidth + 1)
        toc.classList.toggle('g-toc-two', tooLong)
      }
    }
    update()
    void document.fonts?.ready.then(update)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [recordMap])

  // Menu tasto destro: una riga del database con titolo "---" (o "—") è la
  // linea di separazione del menu. Si sposta in Notion come le altre voci.
  React.useEffect(() => {
    const items = document.querySelectorAll<HTMLAnchorElement>(
      '.notion-contextmenu_co a.notion-list-item'
    )
    for (const item of items) {
      const title = (
        item.querySelector('.notion-list-item-title')?.textContent ?? ''
      ).trim()
      // "---" (tre o più trattini), oppure una o più lineette "—" / "–"
      if (!/^(-{3,}|[—–]+)$/.test(title)) continue
      item.dataset.gSeparator = ''
      item.tabIndex = -1
      item.setAttribute('aria-hidden', 'true')
    }
  }, [recordMap])

  // Menu contestuale sopra una foto (segno 🖱️, vedi lib/notion.ts).
  // Il menu (il database segnato) si apre al centro della foto, oppure nel
  // punto indicato in Notion;
  // un clic o il tasto destro sulla foto lo riapre lì, come sul Mac. Se si
  // apre troppo a destra o in basso va dall'altra parte del puntatore.
  // Se la foto è troppo piccola per contenerlo, il menu va sotto la foto.
  React.useEffect(() => {
    // posizione scritta in Notion ("🖱️ 60 25"); senza, il menu è centrato
    const positions = new Map<string, [number, number]>()
    for (const entry of Object.values(recordMap.block)) {
      const block: any = getBlockValue(entry)
      if (block?.format?.block_color !== 'contextmenu') continue
      const [x, y] = String(block.format.menu_position ?? '')
        .split(' ')
        .filter(Boolean)
        .map(Number)
      if (x === undefined || Number.isNaN(x)) continue
      positions.set(String(block.id).replaceAll('-', ''), [
        x / 100,
        (y ?? 20) / 100
      ])
    }

    const cleanups: Array<() => void> = []
    const gap = 8

    for (const host of document.querySelectorAll<HTMLElement>(
      '.notion-contextmenu_co'
    )) {
      const stage = host.querySelector<HTMLElement>('.notion-callout-text')
      const menu = host.querySelector<HTMLElement>('.notion-collection')
      // la foto si cerca ogni volta: React può sostituire l'elemento <img>
      const getImg = () => host.querySelector<HTMLImageElement>('figure img')
      if (!stage || !getImg() || !menu) {
        host.classList.add('is-stacked')
        continue
      }

      const id = [...host.classList]
        .find((c) => c.startsWith('notion-block-'))
        ?.slice('notion-block-'.length)
      // undefined = menu al centro della foto (posizione di base)
      let point = id ? positions.get(id) : undefined

      const place = () => {
        const img = getImg()
        if (!img) return
        const ir = img.getBoundingClientRect()
        // foto non ancora disegnata: si riprova quando cambia misura
        if (!ir.width || !ir.height) return
        const sr = stage.getBoundingClientRect()
        const mw = menu.offsetWidth
        const mh = menu.offsetHeight
        const fits = ir.width >= mw + 3 * gap && ir.height >= mh + 3 * gap
        host.classList.toggle('is-stacked', !fits)
        if (!fits) return

        const left = ir.left - sr.left
        const top = ir.top - sr.top
        const clamp = (v: number, min: number, max: number) =>
          Math.min(max, Math.max(min, v))

        let menuLeft = left + (ir.width - mw) / 2
        let menuTop = top + (ir.height - mh) / 2
        if (point) {
          const x = left + point[0] * ir.width
          const y = top + point[1] * ir.height
          // come sul Mac: se non c'è spazio il menu si apre dall'altra parte
          menuLeft = x + mw + gap > left + ir.width ? x - mw : x
          menuTop = y + mh + gap > top + ir.height ? y - mh : y
        }

        stage.style.setProperty(
          '--menu-left',
          `${clamp(menuLeft, left + gap, left + ir.width - mw - gap)}px`
        )
        stage.style.setProperty(
          '--menu-top',
          `${clamp(menuTop, top + gap, top + ir.height - mh - gap)}px`
        )
      }

      // clic o tasto destro sulla foto: il menu si riapre in quel punto
      const openAt = (event: MouseEvent) => {
        const img = getImg()
        if (
          !img ||
          !(event.target instanceof Element) ||
          !event.target.closest('figure')
        ) {
          return
        }
        const ir = img.getBoundingClientRect()
        // niente ingrandimento della foto né menu del browser
        event.preventDefault()
        event.stopPropagation()
        point = [
          Math.min(1, Math.max(0, (event.clientX - ir.left) / ir.width)),
          Math.min(1, Math.max(0, (event.clientY - ir.top) / ir.height))
        ]
        place()
        host.classList.remove('is-open')
        void host.offsetWidth
        host.classList.add('is-open')
      }

      const observer = new ResizeObserver(place)
      observer.observe(stage)
      observer.observe(menu)
      // "load" non risale, ma si sente in fase di cattura
      host.addEventListener('load', place, true)
      host.addEventListener('click', openAt, true)
      host.addEventListener('contextmenu', openAt, true)
      host.classList.add('is-ready', 'is-open')
      place()

      cleanups.push(() => {
        observer.disconnect()
        host.removeEventListener('load', place, true)
        host.removeEventListener('click', openAt, true)
        host.removeEventListener('contextmenu', openAt, true)
        host.classList.remove('is-ready', 'is-open', 'is-stacked')
      })
    }

    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }, [recordMap])

  // Raccoglitore 🗂️, notifiche 🔔/🔒 e righe App Store 🛍️: i dati di ogni
  // callout, che components/CustomBlock.tsx disegna al posto del segnaposto
  const customBlocks = React.useMemo(
    () => ({
      scrapbooks: byBlockId(getScrapbooks(recordMap)),
      lockScreens: byBlockId(getLockScreens(recordMap, siteMapPageUrl)),
      appRows: byBlockId(getAppRows(recordMap)),
      televisions: byBlockId(getTelevisions(recordMap))
    }),
    [recordMap, siteMapPageUrl]
  )

  return (
    <>
      {isLiteMode && <BodyClassName className='notion-lite' />}

      <CustomBlocksContext value={customBlocks}>
        <NotionRenderer
          bodyClassName={cs(pageId === site.rootNotionPageId && 'index-page')}
          darkMode={isDarkMode}
          components={notionRendererComponents}
          recordMap={recordMap}
          rootPageId={site.rootNotionPageId}
          rootDomain={site.domain}
          fullPage={!isLiteMode}
          previewImages={!!recordMap.preview_images}
          showCollectionViewDropdown={false}
          showTableOfContents={false}
          minTableOfContentsItems={minTableOfContentsItems}
          defaultPageIcon={config.defaultPageIcon}
          defaultPageCover={config.defaultPageCover}
          defaultPageCoverPosition={config.defaultPageCoverPosition}
          mapPageUrl={siteMapPageUrl}
          mapImageUrl={mapImageUrl}
          searchNotion={config.isSearchEnabled ? searchNotion : undefined}
          pageAside={pageAside}
          footer={<Footer />}
        />
      </CustomBlocksContext>
    </>
  )
}
