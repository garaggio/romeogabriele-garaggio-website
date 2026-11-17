import { siteConfig } from './lib/site-config'

export default siteConfig({
  // the site's root Notion page (required)
  rootNotionPageId: '37e0e9fb28fd80089af3e62c7e0d2641',

  // if you want to restrict pages to a single notion workspace (optional)
  // (this should be a Notion ID; see the docs for how to extract this)
  rootNotionSpaceId: null,

  // basic site info (required)
  name: 'Romeo Gabriele | Studio Garaggio',
  domain: 'romeogabrielegaraggio.it',
  author:
    'Romeo Gabriele; costruito a partire dalla repository GitHub nextjs-notion-starter-kit (MIT) di Travis Fischer',

  // open graph metadata (optional)
  description: 'website Biografia',

  // default notion icon and cover images for site-wide consistency (optional)
  // page-specific values will override these site-wide defaults
  defaultPageIcon: null,
  defaultPageCover: null,
  defaultPageCoverPosition: 0.5,

  // whether or not to enable support for LQIP preview images (optional)
  isPreviewImageSupportEnabled: true,

  // whether or not redis is enabled for caching generated preview images (optional)
  // NOTE: if you enable redis, you need to set the `REDIS_HOST` and `REDIS_PASSWORD`
  // environment variables. see the readme for more info
  isRedisEnabled: false,

  // map of notion page IDs to URL paths (optional)
  // any pages defined here will override their default URL paths
  // example:
  //
  // pageUrlOverrides: {
  //   '/foo': '067dd719a912471ea9a3ac10710e7fdf',
  //   '/bar': '0be6efce9daf42688f65c76b89f8eb27'
  // }
  pageUrlOverrides: null,

  // whether to use the default notion navigation style or a custom one with links to
  // important pages. To use `navigationLinks`, set `navigationStyle` to `custom`.

  navigationStyle: 'custom',

  navigationLinks: [
    {
      title: 'Instagram',
      url: 'https://www.instagram.com/garaggio',
      icon: '/icons/instagram.svg'
    },
    {
      title: 'YouTube',
      url: 'https://www.youtube.com/channel/UCRkK2gW2MnCG7lZo-zDfOdg',
      icon: '/icons/youtube.svg'
    },
    {
      title: 'Spotify',
      url: 'https://open.spotify.com/intl-it/artist/0KpjBENsyjX4Bxs7Mz455B',
      icon: '/icons/spotify.svg'
    },
    {
      title: 'Bandcamp',
      url: 'https://studiogaraggio.bandcamp.com/',
      icon: '/icons/bandcamp.svg'
    },
    {
      title: 'GitHub',
      url: 'https://github.com/garaggio',
      icon: '/icons/github.svg'
    }
  ]
})
