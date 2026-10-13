import * as React from 'react'

const STRIP = ['−', '+', 'you', 'tu']

// Spostiamo la funzione Date() fuori dal render per rispettare la "React purity"
const currentYear = new Date().getFullYear()

export function FooterImpl() {
  const stripRef = React.useRef<HTMLDivElement>(null)
  const barRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const strip = stripRef.current
    const bar = barRef.current
    if (!strip || !bar) return

    let observer: IntersectionObserver | undefined

    const setup = () => {
      observer?.disconnect()

      // la barra fissa copia posizione e larghezza della striscia in fondo
      const { left, width } = strip.getBoundingClientRect()
      bar.style.left = `${left}px`
      bar.style.width = `${width}px`
      bar.classList.add('is-ready')

      // quando la striscia in fondo raggiunge la barra fissa, la barra sparisce
      const offset = Math.max(
        0,
        window.innerHeight - bar.getBoundingClientRect().bottom
      )
      observer = new IntersectionObserver(
        ([entry]) => {
          // Aggiungi questo controllo per garantire a TypeScript che entry sia definito
          if (!entry) return

          const limit = entry.rootBounds?.bottom ?? window.innerHeight
          document.body.classList.toggle(
            'g-strip-landed',
            entry.boundingClientRect.bottom <= limit
          )
        },
        { rootMargin: `0px 0px -${offset}px 0px`, threshold: [0, 1] }
      )
      observer.observe(strip)
    }

    setup()
    window.addEventListener('resize', setup)

    return () => {
      window.removeEventListener('resize', setup)
      observer?.disconnect()
      document.body.classList.remove('g-strip-landed')
    }
  }, [])

  return (
    <>
      {/* barra che accompagna lo scorrimento */}
      <div className='g-strip g-strip-fixed' ref={barRef} aria-hidden='true'>
        {STRIP.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>

      {/* Usiamo il tag semantico <footer> invece del div generico */}
      <footer className='g-footer'>
        {/* striscia in fondo alla pagina: la barra fissa si ferma qui */}
        <div className='g-strip' ref={stripRef} aria-hidden='true'>
          {STRIP.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>

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
            <li>
              <a
                href='https://linktr.ee/garaggio'
                target='_blank'
                rel='noopener noreferrer'
              >
                linktr.ee/garaggio
              </a>
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
