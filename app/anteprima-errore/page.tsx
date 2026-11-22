import { notFound } from 'next/navigation'

import { ErrorPage } from '@/components/ErrorPage'
import { isDev } from '@/lib/config'

// Solo sul server locale: mostra la pagina di errore, che altrimenti compare
// solo quando qualcosa si rompe davvero. Sul sito pubblicato è una 404.
export default function ErrorPreview() {
  if (!isDev) notFound()
  return <ErrorPage />
}
