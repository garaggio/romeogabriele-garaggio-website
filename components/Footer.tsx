import * as React from 'react'

const STRIP = ['−', '+', 'you', 'tu']

// Spostiamo la funzione Date() fuori dal render per rispettare la "React purity"
const currentYear = new Date().getFullYear()

export function FooterImpl() {
  return (
    <>
      {/* striscia che accompagna lo scorrimento e si ferma sopra il footer.
          È "sticky": la tiene il browser, senza calcoli, quindi resta al suo
          posto anche quando su telefono la barra di Chrome/Safari compare e
          scompare mentre scorri */}
      <div className='g-strip g-strip-sticky' aria-hidden='true'>
        {STRIP.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>

      {/* Usiamo il tag semantico <footer> invece del div generico */}
      <footer className='g-footer'>
        <div className='g-contacts'>
          <p className='g-contacts-title'>Benvenuto a bordo</p>

          <ul>
            <li>
              <a href='mailto:romeogabriele.studio@proton.me'>
                romeogabriele.studio@proton.me
              </a>
            </li>
            <li>
              <a href='tel:+393488199393'>+39 348 81 99 393</a>
            </li>
          </ul>

          <p className='g-contacts-credit'>
            © {currentYear} Romeo Gabriele · Garaggio. Sito costruito con{' '}
            <a
              href='https://github.com/transitive-bullshit/nextjs-notion-starter-kit'
              target='_blank'
              rel='noopener noreferrer'
            >
              Next.js Notion Starter Kit
            </a>{' '}
            di Travis Fischer e{' '}
            <a
              href='https://github.com/NotionX/react-notion-x'
              target='_blank'
              rel='noopener noreferrer'
            >
              react-notion-x
            </a>
          </p>
        </div>
      </footer>
    </>
  )
}

// React.memo ottimizza le performance evitando re-render inutili del footer
export const Footer = React.memo(FooterImpl)
