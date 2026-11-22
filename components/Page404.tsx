import { MacAlert, alertButton } from './MacAlert'

// Pagina che non esiste: l'avviso del Mac col portatile e il punto di
// domanda (public/404.png) e il ritorno alla home.

export function Page404() {
  return (
    <MacAlert
      windowTitle='404'
      icon='/404.png'
      title='Pagina non trovata.'
      text='Forse la pagina ha cambiato nome o è stata spostata. Torna alla home per ricaricare il percorso e ritrovarla dalle cartelle.'
      buttons={
        <a className={alertButton(true)} href='/'>
          Torna alla home
        </a>
      }
    />
  )
}
