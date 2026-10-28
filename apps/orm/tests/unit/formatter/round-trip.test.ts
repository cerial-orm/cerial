/**
 * Round trip over the e2e schema corpus: parse, print from the AST alone, parse again, compare.
 * One test per schema file, so a failure names the schema. The corpus is enumerated by `loadCorpus`,
 * the same loader the golden snapshot and parity manifest use, so a new schema is picked up here.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { printSchema } from '../../../src/formatter';
import { attachComments } from '../../../src/formatter/comment-attacher';
import { buildSourceLayout } from '../../../src/formatter/layout';
import { parse } from '../../../src/parser/parser';
import { tokenize } from '../../../src/parser/tokenizer';
import type { SchemaAST } from '../../../src/types';
import { loadCorpus, SCHEMAS_DIR } from '../../generators/parity-corpus';

const corpus = loadCorpus();

/** Position and provenance are not structure; comments are not on the AST at all. */
const NOT_STRUCTURE = new Set(['range', 'origin', 'source', 'position']);

/**
 * The printer writes decorators in `DECORATOR_ORDER`, not source order, and no decorator's meaning depends
 * on its neighbours' position. So decorator lists compare as sets; everything else compares in order.
 */
function structure(ast: SchemaAST): unknown {
  return JSON.parse(
    JSON.stringify(ast, (key, value) => {
      if (NOT_STRUCTURE.has(key)) return undefined;
      if (key === 'decorators' && Array.isArray(value))
        return [...value].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

      return value;
    }),
  );
}

/** Parses with the name sets the generator collects across every file, so sibling-file refs resolve. */
function parseWithCorpusNames(source: string): SchemaAST {
  const { ast, errors } = parse(source, corpus.objectNames, corpus.tupleNames, corpus.literalNames, corpus.enumNames);
  if (errors.length) throw new Error(errors.map((e) => e.message).join('; '));

  return ast;
}

/** The text of every comment, without its marker, so `//` to `#` normalisation does not count as loss. */
function commentTexts(source: string): string[] {
  return tokenize(source)
    .filter((t) => t.type === 'comment')
    .map((t) =>
      t.value
        .replace(/^\s*(\/\/|#|\/\*)/, '')
        .replace(/\*\/\s*$/, '')
        .split('\n')
        .map((line) => line.replace(/^\s*\*?\s?/, '').trim())
        .join(' ')
        .trim(),
    )
    .sort();
}

describe('round trip over the schema corpus', () => {
  it('finds the corpus and parses it cleanly', () => {
    expect(corpus.errors).toEqual([]);
    expect(corpus.files.length).toBeGreaterThan(0);
  });

  describe.each(corpus.files)('%s', (file) => {
    const source = readFileSync(join(SCHEMAS_DIR, file), 'utf8');

    it('parses, prints, re-parses to the same structure and prints the same text again', () => {
      const ast = parseWithCorpusNames(source);
      const printed = printSchema(ast);
      const again = parseWithCorpusNames(printed);

      expect(structure(again)).toEqual(structure(ast));
      expect(printSchema(again)).toBe(printed);
    });

    const hasComments = commentTexts(source).length > 0;
    it.skipIf(!hasComments)('keeps every comment when given attachments, and stays stable', () => {
      const ast = parseWithCorpusNames(source);
      const options = { comments: attachComments(tokenize(source), ast), layout: buildSourceLayout(tokenize(source)) };
      const printed = printSchema(ast, options);
      const again = parseWithCorpusNames(printed);

      expect(commentTexts(printed)).toEqual(commentTexts(source));
      expect(structure(again)).toEqual(structure(ast));
      expect(
        printSchema(again, {
          comments: attachComments(tokenize(printed), again),
          layout: buildSourceLayout(tokenize(printed)),
        }),
      ).toBe(printed);
    });
  });
});
