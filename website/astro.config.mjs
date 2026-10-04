// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

import { base, site } from './site.config.mjs';

// https://astro.build/config
export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  image: {
    service: {
      entrypoint: 'astro/assets/services/sharp',
      config: { webp: { lossless: true } },
    },
  },
  // This package must not load the Electron application's parent PostCSS configuration.
  vite: { css: { postcss: { plugins: [] } } },
  devToolbar: {
    enabled: false,
  },
  integrations: [
    starlight({
      title: 'Mangabound',
      description:
        'Mangabound is a free, open-source desktop app that groups manga chapters into volumes and converts them to EPUB, CBZ or PDF for Kindle, Kobo and KOReader.',
      routeMiddleware: './src/routeData.ts',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/gustavommcv/mangabound' },
      ],
      defaultLocale: 'root',
      locales: {
        root: {
          label: 'English',
          lang: 'en',
        },
        'pt-br': {
          label: 'Português (Brasil)',
          lang: 'pt-BR',
        },
      },
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Introduction',
          translations: { 'pt-BR': 'Introdução' },
          slug: 'index',
        },
        {
          label: 'User Guide',
          translations: { 'pt-BR': 'Guia do Usuário' },
          items: [
            { slug: 'getting-started/installation' },
            { slug: 'getting-started/quickstart' },
            { slug: 'user-guide/adding-manga' },
            { slug: 'user-guide/mapping-editor' },
            { slug: 'user-guide/output-profiles' },
            { slug: 'user-guide/processing' },
            { slug: 'user-guide/exporting' },
            { slug: 'getting-started/overview' },
          ],
        },
        {
          label: 'KOReader & E-Reader Setup',
          translations: { 'pt-BR': 'KOReader e E-Readers' },
          items: [
            { slug: 'koreader/opds-sharing' },
            { slug: 'koreader/connecting' },
            { slug: 'koreader/recommended-settings' },
          ],
        },
        {
          label: 'CLI Reference (Power Users)',
          translations: { 'pt-BR': 'Referência das CLIs' },
          items: [
            { slug: 'cli/mangabind' },
            { slug: 'cli/mangapress' },
            { slug: 'cli/machine-protocol' },
          ],
        },
        {
          label: 'Contributing & Development',
          translations: { 'pt-BR': 'Contribuição e Desenvolvimento' },
          items: [{ slug: 'development/architecture' }, { slug: 'development/metadata-providers' }],
        },
      ],
    }),
  ],
});
