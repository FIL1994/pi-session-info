import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  integrations: [
    starlight({
      title: 'pi-session-info',
      customCss: ['./src/styles/global.css'],
      description: 'Pi extension and CLI for listing running Pi processes on Linux.',
      sidebar: [
        { label: 'Overview', link: '/' },
        { label: 'Getting started', link: '/getting-started/' },
        { label: 'CLI reference', link: '/cli/' },
        { label: 'Pi extension', link: '/extension/' },
        { label: 'Discovery & privacy', link: '/discovery/' },
        { label: 'Development & roadmap', link: '/development/' },
      ],
    }),
  ],
  vite: { plugins: [tailwindcss()] },
});
