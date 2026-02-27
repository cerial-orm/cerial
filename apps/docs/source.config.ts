import { defineDocs, defineConfig } from 'fumadocs-mdx/config';
import remarkDirective from 'remark-directive';
import { remarkDirectiveAdmonition } from 'fumadocs-core/mdx-plugins';
import cerialGrammar from './src/grammars/cerial.tmLanguage.json';

export const docs = defineDocs({
  dir: 'content/docs',
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkDirective, remarkDirectiveAdmonition],
    rehypeCodeOptions: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      langs: [{ ...cerialGrammar, id: 'cerial', aliases: ['cerial'] } as any],
    },
  },
});
