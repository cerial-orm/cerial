import fs from 'node:fs';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://cerialorm.github.io',
  base: '/cerial',
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    starlight({
      title: 'Cerial',
      description:
        'A Prisma-like ORM for SurrealDB with schema-driven code generation and full TypeScript type safety.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/user/cerial' }],
      sidebar: [],
      customCss: ['./src/styles/global.css'],
      expressiveCode: {
        shiki: {
          langs: [
            JSON.parse(fs.readFileSync('./src/grammars/cerial.tmLanguage.json', 'utf-8')),
          ],
        },
      },
    }),
  ],
});
