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
      sidebar: [
        { label: 'Getting Started', link: '/getting-started/' },
        {
          label: 'Schema',
          collapsed: true,
          items: [
            { label: 'Overview', link: '/schema/' },
            {
              label: 'Field Types',
              collapsed: true,
              items: [
                { label: 'Overview', link: '/schema/field-types/' },
                { label: 'UUID', link: '/schema/field-types/uuid/' },
                { label: 'Number', link: '/schema/field-types/number/' },
                { label: 'Duration', link: '/schema/field-types/duration/' },
                { label: 'Decimal', link: '/schema/field-types/decimal/' },
                { label: 'Bytes', link: '/schema/field-types/bytes/' },
                { label: 'Geometry', link: '/schema/field-types/geometry/' },
                { label: 'Any', link: '/schema/field-types/any/' },
                { label: 'Arrays', link: '/schema/field-types/arrays/' },
              ],
            },
            { label: 'Optional Fields', link: '/schema/optional-fields/' },
            { label: 'Comments', link: '/schema/comments/' },
            { label: 'Cross-File References', link: '/schema/cross-file-references/' },
          ],
        },
        {
          label: 'Relations',
          items: [
            { label: 'Overview', link: '/relations/' },
          ],
        },
        {
          label: 'Queries',
          items: [
            { label: 'Overview', link: '/queries/' },
          ],
        },
        {
          label: 'Filtering',
          items: [
            { label: 'Overview', link: '/filtering/' },
          ],
        },
        {
          label: 'Select & Include',
          items: [
            { label: 'Overview', link: '/select-and-include/' },
          ],
        },
        {
          label: 'Objects & Tuples',
          items: [
            { label: 'Overview', link: '/objects/' },
          ],
        },
        {
          label: 'Type System',
          items: [
            { label: 'Overview', link: '/types/' },
          ],
        },
        {
          label: 'CLI',
          items: [
            { label: 'Overview', link: '/cli/' },
          ],
        },
        {
          label: 'VS Code Extension',
          items: [
            { label: 'Overview', link: '/extension/' },
          ],
        },
      ],
      customCss: ['./src/styles/global.css'],
      expressiveCode: {
        shiki: {
          langs: [
            (() => {
              const grammar = JSON.parse(
                fs.readFileSync(new URL('./src/grammars/cerial.tmLanguage.json', import.meta.url), 'utf-8')
              );
              grammar.id = 'cerial';
              grammar.aliases = ['cerial'];
              return grammar;
            })(),
          ],
        },
      },
    }),
  ],
});
