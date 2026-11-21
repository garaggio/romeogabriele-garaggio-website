import * as React from 'react'

// Sostituto di "react-image" per react-notion-x (vedi next.config.js).
// React-notion-x lo usa per le emoji personalizzate nel testo, le foto degli
// utenti e le anteprime di Google Drive. L'originale aggiorna il proprio
// stato prima di essere montato e in sviluppo fa comparire l'errore "Can't
// perform a React state update on a component that hasn't mounted yet".
// Qui basta un'immagine normale: stesso risultato, nessun errore.

type ImgProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  /** react-image accetta anche un elenco di indirizzi: usiamo il primo */
  src?: string | string[]
  // opzioni di react-image che un'immagine normale non conosce
  loader?: React.ReactNode
  unloader?: React.ReactNode
  container?: unknown
  loaderContainer?: unknown
  unloaderContainer?: unknown
  useSuspense?: boolean
  imgPromise?: unknown
}

export function Img({
  src,
  loader: _loader,
  unloader: _unloader,
  container: _container,
  loaderContainer: _loaderContainer,
  unloaderContainer: _unloaderContainer,
  useSuspense: _useSuspense,
  imgPromise: _imgPromise,
  ...props
}: ImgProps) {
  const first = Array.isArray(src) ? src[0] : src
  if (!first) return null
  return <img src={first} {...props} />
}

export default Img
