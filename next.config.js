import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = path.dirname(fileURLToPath(import.meta.url))

export default {
  staticPageGenerationTimeout: 300,
  // react-notion-x usa "react-image" per le emoji personalizzate nel testo:
  // lo sostituiamo con un'immagine semplice (lib/react-image.tsx), perché
  // l'originale fa comparire l'errore "Can't perform a React state update on
  // a component that hasn't mounted yet". Vale per Turbopack e per Webpack.
  turbopack: {
    resolveAlias: {
      'react-image': './lib/react-image.tsx'
    }
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      'react-image': path.join(projectDir, 'lib/react-image.tsx')
    }
    return config
  },
  experimental: {
    agentUpgrade: 'security'
  },
  // in sviluppo il sito si apre anche dall'indirizzo di rete del Mac (es. dal
  // telefono): senza questo Next blocca i suoi script e la pagina resta senza
  // JavaScript (niente pulsante "Scarica", niente Raccoglitore, niente frecce).
  // L'indirizzo del Mac cambia con la rete/router: autorizziamo tutte le reti
  // di casa invece di un solo indirizzo.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '*.local'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'www.notion.so' },
      { protocol: 'https', hostname: 'notion.so' },
      { protocol: 'https', hostname: 'app.notion.com' },
      { protocol: 'https', hostname: 'file.notion.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'abs.twimg.com' },
      { protocol: 'https', hostname: 'pbs.twimg.com' },
      { protocol: 'https', hostname: 's3.us-west-2.amazonaws.com' },
      { protocol: 'https', hostname: 's3-us-west-2.amazonaws.com' },
      {
        protocol: 'https',
        hostname: 'prod-files-secure.s3.us-west-2.amazonaws.com'
      },
      { protocol: 'https', hostname: 'file.notion.so' },
      { protocol: 'https', hostname: 'img.notionusercontent.com' }
    ],
    formats: ['image/avif', 'image/webp'],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;"
  }
}
