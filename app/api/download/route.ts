// Pulsante "Scarica" dei file caricati in Notion (vedi components/NotionPage.tsx).
// I link di Notion aprono il file in una scheda e non accettano parametri per
// forzare il download: qui lo prendiamo da Notion e lo consegniamo al browser
// come "allegato", così parte il download con il nome giusto.
// Accettiamo solo indirizzi di Notion: non è un proxy per qualsiasi sito.

const allowedHosts = new Set([
  'file.notion.com',
  'file.notion.so',
  'www.notion.so',
  'notion.so',
  'prod-files-secure.s3.us-west-2.amazonaws.com',
  's3.us-west-2.amazonaws.com'
])

// oltre questa misura il file non passa dal sito (limite delle funzioni di
// Vercel): si apre direttamente da Notion
const maxProxySize = 4 * 1024 * 1024

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  let target: URL
  try {
    target = new URL(searchParams.get('url') ?? '')
  } catch {
    return new Response('Indirizzo del file non valido', { status: 400 })
  }

  if (target.protocol !== 'https:' || !allowedHosts.has(target.hostname)) {
    return new Response('File non consentito', { status: 400 })
  }

  const upstream = await fetch(target, { redirect: 'follow' })
  if (!upstream.ok || !upstream.body) {
    return new Response('File non disponibile', { status: 502 })
  }

  const size = Number(upstream.headers.get('content-length') ?? 0)
  if (size > maxProxySize) {
    await upstream.body.cancel()
    return Response.redirect(target.toString(), 302)
  }

  const fallbackName = decodeURIComponent(
    target.pathname.split('/').pop() || 'file'
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
  if (size) headers.set('Content-Length', String(size))

  return new Response(upstream.body, { headers })
}
