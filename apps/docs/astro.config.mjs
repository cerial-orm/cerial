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
            {
              label: 'Decorators',
              collapsed: true,
              items: [
                { label: 'Overview', link: '/schema/decorators/' },
                { label: '@id', link: '/schema/decorators/id/' },
                {
                  label: 'Datetime',
                  collapsed: true,
                  items: [
                    { label: '@createdAt', link: '/schema/decorators/datetime/created-at/' },
                    { label: '@updatedAt', link: '/schema/decorators/datetime/updated-at/' },
                    { label: '@now', link: '/schema/decorators/datetime/now/' },
                  ],
                },
                {
                  label: 'Defaults',
                  collapsed: true,
                  items: [
                    { label: '@default', link: '/schema/decorators/defaults/default/' },
                    { label: '@defaultAlways', link: '/schema/decorators/defaults/default-always/' },
                  ],
                },
                {
                  label: 'Relations',
                  collapsed: true,
                  items: [
                    { label: '@field', link: '/schema/decorators/relations/field/' },
                    { label: '@model', link: '/schema/decorators/relations/model/' },
                    { label: '@key', link: '/schema/decorators/relations/key/' },
                    { label: '@onDelete', link: '/schema/decorators/relations/on-delete/' },
                  ],
                },
                {
                  label: 'Indexes',
                  collapsed: true,
                  items: [
                    { label: '@unique', link: '/schema/decorators/indexes/unique/' },
                    { label: '@index', link: '/schema/decorators/indexes/index-decorator/' },
                  ],
                },
                {
                  label: 'Control',
                  collapsed: true,
                  items: [
                    { label: '@nullable', link: '/schema/decorators/control/nullable/' },
                    { label: '@readonly', link: '/schema/decorators/control/readonly/' },
                    { label: '@flexible', link: '/schema/decorators/control/flexible/' },
                  ],
                },
                {
                  label: 'Arrays',
                  collapsed: true,
                  items: [
                    { label: '@set', link: '/schema/decorators/arrays/set/' },
                    { label: '@distinct', link: '/schema/decorators/arrays/distinct/' },
                    { label: '@sort', link: '/schema/decorators/arrays/sort/' },
                  ],
                },
                {
                  label: 'Composites',
                  collapsed: true,
                  items: [
                    { label: '@@index', link: '/schema/decorators/composites/composite-index/' },
                    { label: '@@unique', link: '/schema/decorators/composites/composite-unique/' },
                  ],
                },
                {
                  label: 'UUID',
                  collapsed: true,
                  items: [
                    { label: '@uuid', link: '/schema/decorators/uuid/uuid/' },
                    { label: '@uuid4', link: '/schema/decorators/uuid/uuid4/' },
                    { label: '@uuid7', link: '/schema/decorators/uuid/uuid7/' },
                  ],
                },
              ],
            },
            {
              label: 'Type Definitions',
              collapsed: true,
              items: [
                { label: 'Enums', link: '/schema/type-definitions/enums/' },
                { label: 'Literals', link: '/schema/type-definitions/literals/' },
                { label: 'Enums vs Literals', link: '/schema/type-definitions/enums-vs-literals/' },
              ],
            },
            {
              label: 'Inheritance',
              collapsed: true,
              items: [
                { label: 'Extends', link: '/schema/inheritance/extends/' },
                { label: 'Abstract Models', link: '/schema/inheritance/abstract/' },
                { label: 'Private Fields', link: '/schema/inheritance/private/' },
                { label: 'Typed IDs', link: '/schema/inheritance/typed-ids/' },
              ],
            },
          ],
        },
        {
          label: 'Relations',
          collapsed: true,
          items: [
            { label: 'Overview', link: '/relations/' },
            { label: 'One-to-One', link: '/relations/one-to-one/' },
            { label: 'One-to-Many', link: '/relations/one-to-many/' },
            { label: 'Many-to-Many', link: '/relations/many-to-many/' },
            { label: 'Self-Referential', link: '/relations/self-referential/' },
            { label: 'Single-Sided', link: '/relations/single-sided/' },
            { label: 'Multiple Relations', link: '/relations/multi-relation/' },
            { label: 'Nested Create', link: '/relations/nested-create/' },
            { label: 'Connect & Disconnect', link: '/relations/connect-disconnect/' },
            { label: 'Delete Behavior', link: '/relations/on-delete/' },
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
