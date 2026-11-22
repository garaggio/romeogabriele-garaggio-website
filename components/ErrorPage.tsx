'use client'

import { MacAlert, alertButton } from './MacAlert'

// Errore di caricamento: l'avviso del Mac col portatile triste
// (public/error.png). "Riprova" ricarica la parte rotta della pagina;
// "Home" riporta all'inizio.

export function ErrorPage({ onRetry }: { onRetry?: () => void }) {
  return (
    <MacAlert
      windowTitle='Errore'
      icon='/error.png'
      title='Si è verificato un errore.'
      text='La pagina non si è caricata come doveva. Riprova tra un attimo: di solito basta.'
      buttons={
        <>
          <a className={alertButton()} href='/'>
            Home
          </a>
          <button
            type='button'
            className={alertButton(true)}
            onClick={() => (onRetry ? onRetry() : window.location.reload())}
          >
            Riprova
          </button>
        </>
      }
    />
  )
}
