// Tipi minimi per react-dom (il pacchetto @types/react-dom non è installato):
// dichiariamo solo createPortal, usato da components/NotionPage.tsx per il
// Raccoglitore.
declare module 'react-dom' {
  import type { ReactNode, ReactPortal } from 'react'

  export function createPortal(
    children: ReactNode,
    container: Element | DocumentFragment,
    key?: string | null
  ): ReactPortal
}
