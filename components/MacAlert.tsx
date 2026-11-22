import * as React from 'react'

import styles from './ErrorScreens.module.css'

// Avviso del Mac classico (come il Raccoglitore) su sfondo blu con la
// striscia colorata: la forma comune della pagina 404 (components/Page404.tsx)
// e della pagina di errore (components/ErrorPage.tsx). L'icona è il portatile
// in pixel art: public/404.png e public/error.png (272 × 168, mostrati a
// metà, così ogni pixel del disegno resta netto).

export function MacAlert({
  windowTitle,
  icon,
  title,
  text,
  buttons
}: {
  windowTitle: string
  icon: string
  title: string
  text: React.ReactNode
  /** pulsanti in fondo all'avviso (alertButton(true) = quello giallo) */
  buttons: React.ReactNode
}) {
  return (
    <div className={styles.screen}>
      <main className={styles.alert} role='alert'>
        <div className={styles.alertBar}>
          <i className={styles.closeBox} aria-hidden='true' />
          <span>{windowTitle}</span>
        </div>
        <div className={styles.alertBody}>
          <img
            className={styles.icon}
            src={icon}
            alt=''
            width={136}
            height={84}
          />
          <div>
            <h1 className={styles.alertTitle}>{title}</h1>
            <p className={styles.alertText}>{text}</p>
          </div>
        </div>
        <div className={styles.alertButtons}>{buttons}</div>
      </main>
      <div className={styles.strip} aria-hidden='true'>
        <span>-</span>
        <span>+</span>
        <span>YOU</span>
        <span>TU</span>
      </div>
    </div>
  )
}

/** classe dei pulsanti; primary = giallo col doppio bordo del Mac classico */
export const alertButton = (primary = false) =>
  primary ? `${styles.button} ${styles.primary}` : styles.button!
