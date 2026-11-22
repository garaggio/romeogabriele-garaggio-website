# garaggio.art — Romeo Gabriele | Studio Garaggio

Sito personale costruito con Next.js e Notion: i contenuti si scrivono in Notion, il sito li impagina con la grafica del Garaggio. Nato dal [Next.js Notion Starter Kit](https://github.com/transitive-bullshit/nextjs-notion-starter-kit) di Travis Fischer (licenza MIT, vedi `license`).

## Come si usa

La guida completa per impaginare da Notion (segni da mettere nei callout, didascalie, gallerie, notifiche, menu, download…) è in `docs/guida` e nel PDF "Guida-Notion-sito-Garaggio v5.0_def".

## Struttura

- `site.config.ts` — pagina Notion principale, dominio, link della barra in alto
- `lib/notion.ts` — legge la pagina da Notion e riconosce i segni (🖼️ 🗂️ 🗃️ 🔔 🔒 🛍️ 🖱️ 🙈 ⬇️)
- `components/NotionPage.tsx` — la pagina e i comportamenti (gallerie, menu, indice…)
- `components/CustomBlock.tsx` — Raccoglitore, notifiche e righe App Store dentro le pagine
- `components/Scrapbook.tsx`, `LockScreen.tsx`, `AppRow.tsx` — i singoli componenti
- `styles/global.css` — la grafica del sito, divisa per sezioni
- `app/api/download` — download delle foto e dei file di Notion

## Sviluppo

```bash
pnpm install
pnpm dev      # http://localhost:3000
pnpm test     # formattazione, controlli e tipi
```

Il sito si pubblica su Vercel a ogni push sul ramo `main`.
