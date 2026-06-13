// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Base: / para NaN Cloud (subdominio propio), /nan-video-pipeline para GitHub Pages.
const base = process.env.SITE_BASE ?? '/';
const site = process.env.SITE_URL ?? 'https://hackathon-mlorentedev-nan-video-demo.apps.nan.builders';

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
        { label: 'Cómo funciona', slug: 'demo' },
        { label: 'El pipeline', slug: 'pipeline' },
        { label: 'Caso demo: la comunidad NaN', slug: 'caso-nan-community' },
        { label: 'Imágenes con IA externa', slug: 'imagenes-ia' },
        { label: 'Empezar', slug: 'empezar' },
        { label: 'Troubleshooting', slug: 'troubleshooting' },
      ],
    }),
  ],
});
