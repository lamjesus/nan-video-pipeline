// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Dos destinos de deploy con base distinta:
// - GitHub Pages (default):  https://lamjesus.github.io/nan-video-pipeline
// - nginx en NaN Cloud:      SITE_BASE=/ SITE_URL=https://<app>.apps.nan.builders yarn build
const base = process.env.SITE_BASE ?? '/nan-video-pipeline';
const site = process.env.SITE_URL ?? 'https://lamjesus.github.io';

export default defineConfig({
  site,
  base,
  integrations: [
    starlight({
      title: 'NaN Video Pipeline',
      favicon: '/favicon.svg',
      defaultLocale: 'root',
      locales: {
        root: { label: 'Español', lang: 'es' },
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/lamjesus/nan-video-pipeline',
        },
      ],
      sidebar: [
        { label: 'Empezar', slug: 'empezar' },
        { label: 'El pipeline', slug: 'pipeline' },
        { label: 'Caso demo: la comunidad NaN', slug: 'caso-nan-community' },
        { label: 'Imágenes con IA externa', slug: 'imagenes-ia' },
        { label: 'Troubleshooting', slug: 'troubleshooting' },
      ],
    }),
  ],
});
