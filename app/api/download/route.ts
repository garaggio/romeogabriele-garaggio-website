import { getBlockValue, idToUuid } from 'notion-utils'

import { rootNotionPageId, rootNotionSpaceId } from '@/lib/config'
import { notion } from '@/lib/notion-api'

// Pulsante "Scarica" dei file caricati in Notion (vedi components/NotionPage.tsx).
// I link di Notion aprono il file in una scheda e non accettano parametri per
// forzare il download: qui lo prendiamo da Notion e lo consegniamo al browser
// come "allegato", così parte il download con il nome giusto.
//
// Sicurezza: si scaricano SOLO i file delle pagine Notion di questo sito.
// Dal link arriva solo il blocco di Notion ("id="): controlliamo che sia
// dello spazio Notion del sito e chiediamo a Notion l'indirizzo del suo file.
// L'indirizzo scritto nel link non viene mai usato. Così nessuno può far
// scaricare da garaggio.art un file suo (anche dannoso, caricato sul proprio
// Notion): per Meta, Google e gli antivirus sarebbe un file del sito, e il
// dominio finirebbe tra quelli pericolosi.
//
// Così è anche sempre un indirizzo nuovo: quelli dei file di Notion scadono
// ogni giorno, e la pagina può averne uno vecchio (era pronta da ore, o è
// rimasta aperta a lungo). Se il file non arriva, mai una risposta che il
// browser salverebbe come file rovinato: una pagina che lo spiega.

const allowedHosts = new Set([
  'app.notion.com',
  'file.notion.com',
  'file.notion.so',
  'www.notion.so',
  'notion.so',
  'prod-files-secure.s3.us-west-2.amazonaws.com',
  's3.us-west-2.amazonaws.com'
])

// Il file passa dal sito in streaming (un pezzo alla volta): per Vercel le
// risposte in streaming non hanno il limite di 4,5 MB, quindi passano anche
// gli originali grandi delle foto (prima si apriva Notion in una scheda).

const isAllowed = (url: URL) =>
  url.protocol === 'https:' && allowedHosts.has(url.hostname)

const blockIdPattern = /^[0-9a-f]{8}-?([0-9a-f]{4}-?){3}[0-9a-f]{12}$/i
const fileBlocks = new Set(['file', 'image', 'video', 'pdf', 'audio'])

// lo spazio Notion del sito: quello della pagina principale (letto una volta)
let siteSpace: Promise<string | undefined> | undefined
const siteSpaceId = () =>
  (siteSpace ??= rootNotionSpaceId
    ? Promise.resolve(rootNotionSpaceId)
    : notion
        .getBlocks([idToUuid(rootNotionPageId)])
        .then((chunk) => {
          const entry = Object.values(chunk.recordMap?.block ?? {})[0]
          return (entry ? getBlockValue<any>(entry) : undefined)?.space_id
        })
        .catch(() => {
          siteSpace = undefined // riprova alla prossima richiesta
          return undefined
        }))

// l'indirizzo, appena chiesto a Notion, del file del blocco indicato nel
// link: solo se il blocco è un file di una pagina di questo sito
async function siteFileUrl(target: URL): Promise<URL | undefined> {
  const blockId = target.searchParams.get('id') ?? ''
  if (!blockIdPattern.test(blockId)) return
  try {
    const [space, chunk] = await Promise.all([
      siteSpaceId(),
      notion.getBlocks([blockId])
    ])
    const entry = Object.values(chunk.recordMap?.block ?? {})[0]
    const block: any = entry ? getBlockValue(entry) : undefined
    if (!space || block?.space_id !== space || !fileBlocks.has(block.type)) {
      return
    }
    const source: string | undefined = block.properties?.source?.[0]?.[0]
    if (!source) return
    const { signedUrls } = await notion.getSignedFileUrls([
      { url: source, permissionRecord: { table: 'block', id: block.id } }
    ])
    const fresh = signedUrls?.[0] ? new URL(signedUrls[0]) : undefined
    return fresh && isAllowed(fresh) ? fresh : undefined
  } catch {
    return undefined
  }
}

// Next.js intercetta fetch e duplica la risposta: chiudere una delle due
// copie non finisce mai (resterebbe appeso). Le risposte scartate si chiudono
// senza aspettare; e niente cache di Next per i file.
const get = (url: URL) =>
  fetch(url, { redirect: 'follow', cache: 'no-store' }).catch(() => null)
const discard = (response: Response | null | undefined) => {
  void response?.body?.cancel().catch(() => {})
}

const unavailable = () =>
  new Response(
    '<!doctype html><meta charset="utf-8"><title>File non disponibile</title>' +
      '<body style="font-family:Helvetica,Arial,sans-serif;padding:2rem">' +
      '<p>Il file non è disponibile in questo momento. Torna alla pagina, ' +
      'ricaricala e riprova.</p>',
    {
      status: 502,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    }
  )

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  let target: URL
  try {
    target = new URL(searchParams.get('url') ?? '')
  } catch {
    return new Response('Indirizzo del file non valido', { status: 400 })
  }

  if (!isAllowed(target)) {
    return new Response('File non consentito', { status: 400 })
  }

  // dal link si prende solo il blocco: il file è sempre quello del sito
  const file = await siteFileUrl(target)
  if (!file) {
    return new Response('File non consentito', { status: 400 })
  }
  // il nome del file: quello scritto nel link di Notion, non quello firmato
  const linkedName = target.pathname.split('/').pop()
  target = file

  const upstream = await get(target)
  if (!upstream?.ok || !upstream.body) {
    discard(upstream)
    return unavailable()
  }

  // se Notion manda il file compresso (gzip…), fetch lo decomprime: la misura
  // dichiarata è quella compressa e non va ripetuta, sennò il file arriva
  // tagliato
  const encoded = !!upstream.headers.get('content-encoding')
  const size = encoded ? 0 : Number(upstream.headers.get('content-length') ?? 0)

  const fallbackName = decodeURIComponent(
    target.pathname.split('/').pop() || linkedName || 'file'
  )
  const name = (searchParams.get('name') || fallbackName)
    .replaceAll(/[\r\n"\\/]/g, '')
    .slice(0, 200)
  const asciiName = name.replaceAll(/[^\x20-\x7e]/g, '_')

  const headers = new Headers({
    'Content-Type':
      upstream.headers.get('content-type') ?? 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  })
  // la misura solo per i file piccoli: sopra i 4 MB la risposta deve restare
  // in streaming anche per Vercel (vedi sopra)
  if (size && size <= 4 * 1024 * 1024) {
    headers.set('Content-Length', String(size))
  }

  return new Response(upstream.body, { headers })
}
