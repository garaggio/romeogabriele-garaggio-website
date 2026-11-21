import 'server-only'

import { cache } from 'react'

import { domain } from './config'
import { resolveNotionPage } from './resolve-notion-page'

export const getPageData = cache(async (pageId?: string) => ({
  ...(await resolveNotionPage(domain, pageId)),
  // ora di generazione: vedi l'aggiornamento automatico in NotionPage.tsx
  generatedAt: Date.now()
}))
