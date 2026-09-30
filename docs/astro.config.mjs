// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  site: 'https://gustavommcv.github.io',
  base: process.env.BASE_PATH || '/mangabound/',
  devToolbar: {
    enabled: false,
  },
  integrations: [
    starlight({
      title: 'Mangabound',
      description:
        'Documentation for Mangabound — the desktop manga organizer and converter for e-readers.',
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
      components: {
        ThemeSelect: './src/components/ThemeSelect.astro',
        ThemeProvider: './src/components/ThemeProvider.astro',
      },
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
            { label: 'Overview & Ecosystem', slug: 'getting-started/overview' },
            { label: 'Installation', slug: 'getting-started/installation' },
            { label: 'Quickstart', slug: 'getting-started/quickstart' },
            { label: 'Queue & Adding Manga', slug: 'user-guide/adding-manga' },
            { label: 'Volume Mapping Editor', slug: 'user-guide/mapping-editor' },
            { label: 'Output Profiles & Settings', slug: 'user-guide/output-profiles' },
            { label: 'Processing & Queue', slug: 'user-guide/processing' },
            { label: 'Exporting & Ready Books', slug: 'user-guide/exporting' },
          ],
        },
        {
          label: 'KOReader & E-Reader Setup',
          translations: { 'pt-BR': 'KOReader e E-Readers' },
          items: [
            { label: 'Recommended Reader Settings', slug: 'koreader/recommended-settings' },
            { label: 'Wi-Fi Sharing via OPDS', slug: 'koreader/opds-sharing' },
            { label: 'Connecting in KOReader', slug: 'koreader/connecting' },
          ],
        },
        {
          label: 'CLI Reference (Power Users)',
          translations: { 'pt-BR': 'Referência das CLIs' },
          items: [
            { label: 'mangabind CLI (Go)', slug: 'cli/mangabind' },
            { label: 'mangapress CLI (Rust)', slug: 'cli/mangapress' },
            { label: 'Machine Protocol v1', slug: 'cli/machine-protocol' },
          ],
        },
        {
          label: 'Contributing & Development',
          translations: { 'pt-BR': 'Contribuição e Desenvolvimento' },
          items: [
            { label: 'Architecture & Verification', slug: 'development/architecture' },
            { label: 'Adding Metadata Providers', slug: 'development/metadata-providers' },
          ],
        },
      ],
    }),
  ],
});
