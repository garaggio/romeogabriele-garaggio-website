// Tipi minimi per react-dom (il pacchetto @types/react-dom non è installato):
// dichiariamo solo preload, con cui galleria retrò e notifiche annunciano
// nel <head> le foto da scaricare subito (components/Scrapbook.tsx e
// components/LockScreen.tsx).
declare module 'react-dom' {
  export function preload(
    href: string,
    options: {
      as: 'image' | 'font' | 'style' | 'script' | 'fetch'
      fetchPriority?: 'high' | 'low' | 'auto'
      imageSrcSet?: string
      imageSizes?: string
      crossOrigin?: string
      type?: string
    }
  ): void
}
