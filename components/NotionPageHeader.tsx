import type * as types from 'notion-types'
import cs from 'classnames'
import { uuidToId } from 'notion-utils'
import { Header, useNotionContext } from 'react-notion-x'

import {
  isSearchEnabled,
  name,
  navigationLinks,
  navigationStyle,
  rootNotionPageId
} from '@/lib/config'
import { SiteSearch } from './SiteSearch'
import styles from './styles.module.css'

export function NotionPageHeader({
  block
}: {
  block: types.CollectionViewPageBlock | types.PageBlock
}) {
  const { components, mapPageUrl } = useNotionContext()

  if (navigationStyle === 'default') {
    return <Header block={block} />
  }

  return (
    <header className='notion-header'>
      <div className='notion-nav-header'>
        <components.PageLink
          href={mapPageUrl(rootNotionPageId)}
          className={cs('breadcrumb', 'button', 'g-home')}
          title={name}
        >
          <span
            className='g-nav-icon'
            role='img'
            aria-label='Home'
            style={{
              WebkitMaskImage: 'url(/icons/home.svg)',
              maskImage: 'url(/icons/home.svg)'
            }}
          />
        </components.PageLink>

        <div className='notion-nav-header-rhs breadcrumbs'>
          {navigationLinks
            ?.map((link, index) => {
              if (!link || (!link.pageId && !link.url)) return null

              const content = link.icon ? (
                <span
                  className='g-nav-icon'
                  role='img'
                  aria-label={link.title}
                  style={{
                    WebkitMaskImage: `url(${link.icon})`,
                    maskImage: `url(${link.icon})`
                  }}
                />
              ) : (
                link.title
              )

              if (link.pageId) {
                // pagina corrente: l'icona resta accesa ("sei qui")
                const isCurrent = uuidToId(block.id) === uuidToId(link.pageId)
                return (
                  <components.PageLink
                    href={mapPageUrl(link.pageId)}
                    key={index}
                    className={cs(
                      styles.navLink,
                      'breadcrumb',
                      'button',
                      isCurrent && 'g-nav-current'
                    )}
                    title={link.title}
                    aria-current={isCurrent ? 'page' : undefined}
                  >
                    {content}
                  </components.PageLink>
                )
              }

              return (
                <components.Link
                  href={link.url as string}
                  key={index}
                  className={cs(styles.navLink, 'breadcrumb', 'button')}
                  target='_blank'
                  rel='noopener noreferrer'
                  title={link.title}
                >
                  {content}
                </components.Link>
              )
            })
            .filter(Boolean)}

          {isSearchEnabled && <SiteSearch />}
        </div>
      </div>
    </header>
  )
}
