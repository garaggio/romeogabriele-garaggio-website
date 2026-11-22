'use client'

import * as React from 'react'

import type { AppRowData } from '@/lib/appstore'
import type { LockScreenData } from '@/lib/lockscreen'
import type { ScrapbookBlock } from '@/lib/scrapbook'

import { AppRow } from './AppRow'
import { LockScreen } from './LockScreen'
import { Scrapbook } from './Scrapbook'

// Componenti del sito dentro le pagine di Notion: Raccoglitore 🗂️/🗃️,
// notifiche 🔔/🔒 e righe App Store 🛍️. Sul server (lib/notion.ts,
// embedCustomCallouts) il contenuto di quei callout diventa un blocco
// "codice" segnaposto; react-notion-x lo passa al nostro componente Code
// (NotionPage.tsx), che qui disegna il componente giusto. Così arriva già
// pronto nell'HTML invece di comparire dopo l'avvio del JavaScript.

export interface CustomBlocks {
  scrapbooks: Map<string, ScrapbookBlock>
  lockScreens: Map<string, LockScreenData>
  appRows: Map<string, AppRowData>
}

export const CustomBlocksContext = React.createContext<CustomBlocks>({
  scrapbooks: new Map(),
  lockScreens: new Map(),
  appRows: new Map()
})

/** elenco → mappa per id del callout (senza trattini) */
export const byBlockId = <T extends { blockId: string }>(list: T[]) =>
  new Map(list.map((item) => [item.blockId, item]))

/** il blocco è un segnaposto del sito? */
export const isCustomBlock = (block: any) =>
  block?.properties?.language?.[0]?.[0] === 'garaggio' &&
  !!block?.format?.g_kind

export function CustomBlock({ block }: { block: any }) {
  const { scrapbooks, lockScreens, appRows } =
    React.useContext(CustomBlocksContext)
  const id = String(block.format.g_for ?? '').replaceAll('-', '')

  switch (block.format.g_kind) {
    case 'scrapbook': {
      const data = scrapbooks.get(id)
      if (!data) return null
      return (
        <div className='g-scrapbook-mount'>
          <Scrapbook
            title={data.title}
            variant={data.variant}
            downloadable={data.downloadable}
            items={data.items}
          />
        </div>
      )
    }
    case 'lockscreen': {
      const data = lockScreens.get(id)
      if (!data) return null
      return (
        <div className='g-lock-mount'>
          <LockScreen
            variant={data.variant}
            label={data.label}
            big={data.big}
            wallpaper={data.wallpaper}
            notifications={data.notifications}
          />
        </div>
      )
    }
    case 'appstore': {
      const data = appRows.get(id)
      if (!data) return null
      return (
        <div className='g-app-mount'>
          <AppRow
            title={data.title}
            subtitle={data.subtitle}
            button={data.button}
            note={data.note}
            link={data.link}
            icon={data.icon}
          />
        </div>
      )
    }
    default:
      return null
  }
}
