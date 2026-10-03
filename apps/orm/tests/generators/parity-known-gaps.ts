/**
 * The constructs no schema under tests/e2e/schemas/ exercises yet.
 *
 * Each gap needs a schema that uses the construct. A gap leaves this list by being closed, never by
 * being edited out; the coverage test fails on a stale entry so the list cannot rot. When it is
 * empty, delete this file and the ledger test, and the strict test becomes the only gate.
 *
 * Where the obvious schema will not just work:
 * - tuple.element.literal: a literal or enum as a direct tuple element parses, but migration emits
 *   DDL SurrealDB refuses, because `literal` is not a kind name in a type position. Fix the two
 *   emission sites before adding the schema, or a schema that cannot migrate fails the global
 *   setup for every file in the suite, not just its own.
 * - A construct on the e2e corpus that needs a new schema file also needs its tables registered in
 *   tests/e2e/test-helper.ts.
 */

import type { CorpusConstructId } from '../../src/parity';

export const KNOWN_GAPS: readonly CorpusConstructId[] = [
  'array.email',
  'array.bool',
  'decorator.onDelete.SetNone',
  'decorator.multipoint',
  'decorator.multiline',
  'decorator.multipolygon',
  'decorator.geoCollection',
  'directive.index.object',
  'directive.index.record',
  'directive.index.primitive+object',
  'directive.index.primitive+record',
  'directive.index.object+record',
  'directive.unique.primitive+record',
  'directive.unique.object+record',
  'literal.variant.float',
  'literal.broad.Float',
  'literal.broad.Date',
  'tuple.element.defaultAlways',
  'tuple.element.createdAt',
  'tuple.element.updatedAt',
  'tuple.element.literal',
  'extends.tuple.pick-name',
  'extends.tuple.omit-name',
  'extends.literal.identity-quoted',
  'extends.chain.pick-then-omit',
  'extends.chain.omit-then-pick',
];
