'use client'

import * as Fathom from 'fathom-client'
import { usePathname, useSearchParams } from 'next/navigation'
import { ThemeProvider } from 'next-themes'
import type PostHog from 'posthog-js-lite'
import * as React from 'react'

import { bootstrap } from '@/lib/bootstrap-client'
import { fathomConfig, fathomId, posthogConfig, posthogId } from '@/lib/config'
import { blockPinchZoom } from '@/lib/no-pinch-zoom'

const themeClassNames = { dark: 'dark-mode', light: 'light-mode' }

export function Providers({ children }: { children: React.ReactNode }) {
  // niente zoom col pizzico, su tutto il sito (vedi lib/no-pinch-zoom.ts)
  React.useEffect(() => blockPinchZoom(), [])

  return (
    // un solo tema: il sito ha sempre i suoi colori, a prescindere dal sistema
    <ThemeProvider
      attribute='class'
      forcedTheme='dark'
      disableTransitionOnChange
      enableSystem={false}
      value={themeClassNames}
    >
      <React.Suspense fallback={null}>
        <Analytics />
      </React.Suspense>

      {children}
    </ThemeProvider>
  )
}

function Analytics() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const posthogRef = React.useRef<PostHog | undefined>(undefined)
  const previousUrlRef = React.useRef<string | undefined>(undefined)
  const url = [pathname, searchParams?.toString()].filter(Boolean).join('?')

  React.useEffect(() => {
    let isDisposed = false

    bootstrap()

    if (fathomId) {
      Fathom.load(fathomId, fathomConfig)
    }

    const posthogApiKey = posthogId

    if (posthogApiKey) {
      void import('posthog-js-lite').then(({ default: PostHogClient }) => {
        if (isDisposed) {
          return
        }

        const posthog = new PostHogClient(posthogApiKey, posthogConfig)
        posthog.capture('$pageview')
        posthogRef.current = posthog
      })
    }

    return () => {
      isDisposed = true
      void posthogRef.current?._shutdown()
      posthogRef.current = undefined
    }
  }, [])

  React.useEffect(() => {
    if (previousUrlRef.current === undefined) {
      previousUrlRef.current = url
      return
    }

    if (previousUrlRef.current === url) {
      return
    }

    previousUrlRef.current = url

    if (fathomId) {
      Fathom.trackPageview()
    }

    posthogRef.current?.capture('$pageview')
  }, [url])

  return null
}
