// Foto servite dall'ottimizzazione immagini di Next/Vercel invece che a piena
// grandezza dal server di Notion: ridotte alla misura che serve, in formato
// AVIF/WebP e tenute in cache vicino a chi visita. Le usano galleria retrò,
// sfondo delle notifiche e icone delle righe App Store (le foto normali delle
// pagine passano già da qui con next/image). I pulsanti "Scarica" usano
// sempre l'originale.
//
// Le larghezze devono essere tra quelle conosciute da Next (deviceSizes e
// imageSizes predefiniti); gli indirizzi tra i remotePatterns di next.config.js.

const widths = [640, 1080, 1920] as const

const isRemote = (url: string) => url.startsWith('https://')

export function optimizedImage(url: string, width: number, quality = 75) {
  if (!isRemote(url)) return url
  return `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=${quality}`
}

/** elenco di misure per srcset: il browser sceglie la più adatta allo schermo */
export function optimizedSrcSet(url: string) {
  if (!isRemote(url)) return undefined
  return widths.map((w) => `${optimizedImage(url, w)} ${w}w`).join(', ')
}
