import { defineDocs, defineConfig } from 'fumadocs-mdx/config';
import { remarkAdmonition } from 'fumadocs-core/mdx-plugins';
import cerialGrammar from './src/grammars/cerial.tmLanguage.json';

export const docs = defineDocs({
  dir: 'content/docs',
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkAdmonition],
    rehypeCodeOptions: {
      langs: [{ ...cerialGrammar, id: 'cerial', aliases: ['cerial'] } as any],
    },
  },
});
