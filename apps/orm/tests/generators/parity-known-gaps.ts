/**
 * The constructs no schema under tests/e2e/schemas/ exercises yet.
 *
 * Each gap needs a schema that uses the construct. A gap leaves this list by being closed, never by
 * being edited out; the coverage test fails on a stale entry so the list cannot rot. When it is
 * empty, delete this file and the ledger test, and the strict test becomes the only gate.
 *
 * The sized number types wait for their e2e schema.
 * The UNIQUE NULLS NOT DISTINCT forms wait for their e2e schema.
 *
 * Where the obvious schema will not just work:
 * - A construct on the e2e corpus that needs a new schema file also needs its tables registered in
 *   tests/e2e/test-helper.ts.
 */

import type { CorpusConstructId } from '../../src/parity';

export const KNOWN_GAPS: readonly CorpusConstructId[] = [
  'type.int8',
  'type.uint8',
  'type.int16',
  'type.uint16',
  'type.int32',
  'type.uint32',
  'type.uint64',
  'type.float16',
  'type.float32',
  'decorator.unique.nulls-not-distinct',
  'directive.unique.nulls-not-distinct',
];
