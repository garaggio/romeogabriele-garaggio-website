// used for rendering equations (optional)
import 'katex/dist/katex.min.css'
// used for code syntax highlighting (optional)
import 'prismjs/themes/prism-coy.css'
// core styles shared by all of react-notion-x (required)
import 'react-notion-x/styles.css'
// global styles shared across the entire site
import '@/styles/global.css'
// global style overrides for notion
import '@/styles/notion.css'
// global style overrides for prism theme (optional)
import '@/styles/prism-theme.css'

import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import * as config from '@/lib/config'

import { Providers } from './providers'

export const metadata: Metadata = {
  metadataBase: new URL(config.host),
  title: config.name,
  description: config.description,
  manifest: '/manifest.json',
  icons: {
    shortcut: '/favicon.ico',
    icon: [
      {
        url: '/favicon.png',
        type: 'image/png',
        sizes: '32x32'
      }
    ]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black'
  },
  alternates: {
    types: {
      'application/rss+xml': [
        {
          url: '/feed',
          title: config.name
        }
      ]
    }
  },
  openGraph: {
    type: 'website',
    siteName: config.name,
    title: config.name,
    description: config.description
  },
  twitter: {
    card: 'summary',
    creator: config.twitter ? `@${config.twitter}` : undefined,
    title: config.name,
    description: config.description
  },
  other: {
    'mobile-web-app-capable': 'yes'
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // il blu della barra in alto, anche per la barra del browser sul telefono
  themeColor: '#0a1a9e'
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang='it' suppressHydrationWarning>
      <head>
        {/* Il contenuto della pagina compare quando le immagini in vista
            sono pronte (components/NotionPage.tsx toglie "g-wait"), con
            una dissolvenza. Al massimo 1,5 s: poi compare comunque, anche se
            il JavaScript non parte. Senza JavaScript non si nasconde nulla. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "document.documentElement.classList.add('g-wait');setTimeout(function(){document.documentElement.classList.remove('g-wait')},1500)"
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
