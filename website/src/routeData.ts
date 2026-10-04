import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

import { base, googleSiteVerification, site } from '../site.config.mjs';
import { scriptJson, structuredData } from './structured-data.mjs';

export const onRequest = defineRouteMiddleware((context) => {
  const route = context.locals.starlightRoute;
  const { head } = route;
  if (googleSiteVerification)
    head.push({
      tag: 'meta',
      attrs: { name: 'google-site-verification', content: googleSiteVerification },
    });

  // GitHub Pages also serves the not-found page at its own address, with a successful status.
  if (route.entry.id === '404') {
    head.push({ tag: 'meta', attrs: { name: 'robots', content: 'noindex' } });
    return;
  }
  const canonical = head.find((entry) => entry.tag === 'link' && entry.attrs?.rel === 'canonical');
  const url = canonical?.attrs?.href;
  if (typeof url !== 'string') return;
  const root = new URL(base.replace(/\/?$/, '/'), site);
  head.push({
    tag: 'script',
    attrs: { type: 'application/ld+json' },
    content: scriptJson(
      structuredData({
        url,
        home: new URL(route.locale ? `${route.locale}/` : '', root).href,
        title: route.entry.data.title,
        description: route.entry.data.description ?? '',
        lang: route.lang,
      }),
    ),
  });
});
