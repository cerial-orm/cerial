/**
 * Unit Tests: Duplicate Name Validator
 *
 * Duplicate declarations are only visible before inheritance resolution, which keys
 * types by name. These tests pin both halves: the validator sees the duplicates in a
 * merged AST, and the resolver would have hidden them.
 */

import { describe, expect, test } from 'bun:test';
import { validateDuplicateNames } from '../../../src/cli/validators';
import { parse } from '../../../src/parser/parser';
import { resolveInheritance } from '../../../src/resolver';
import type { SchemaAST } from '../../../src/types';

/** Merge several files the way generate does */
function merge(...sources: string[]): SchemaAST {
  const asts = sources.map((s) => parse(s).ast);

  return {
    source: '',
    models: asts.flatMap((a) => a.models),
    objects: asts.flatMap((a) => a.objects),
    tuples: asts.flatMap((a) => a.tuples),
    literals: asts.flatMap((a) => a.literals),
    enums: asts.flatMap((a) => a.enums),
  };
}

const messages = (ast: SchemaAST) => validateDuplicateNames(ast).map((e) => e.message);
// The part naming the kind and the name, without the origins that follow it
const heads = (ast: SchemaAST) => messages(ast).map((m) => m.replace(/ \(declared in .*\)$/, ''));

describe('Duplicate Name Validator', () => {
  const user = 'model User {\n  id Record @id\n}';

  test('reports a model declared in two files', () => {
    expect(heads(merge(user, user))).toEqual(['Duplicate model name: User']);
  });

  test('the resolver collapses that duplicate, which is why the check runs first', () => {
    const merged = merge(user, user);

    expect(merged.models).toHaveLength(2);
    expect(resolveInheritance(merged).models).toHaveLength(1);
  });

  test('reports a duplicate of every kind', () => {
    const found = heads(
      merge(
        'object Geo {\n  lat Float\n}\ntuple Pair {\n  Int,\n  Int\n}\nliteral Lv { "a", "b" }\nenum Role { A }',
        'object Geo {\n  lng Float\n}\ntuple Pair {\n  Float,\n  Float\n}\nliteral Lv { "c" }\nenum Role { B }',
      ),
    );

    expect(found).toEqual([
      'Duplicate object name: Geo',
      'Duplicate tuple name: Pair',
      'Duplicate literal name: Lv',
      'Duplicate enum name: Role',
    ]);
  });

  test('names where both declarations are, whether they come from DSL or TypeScript', () => {
    const [dsl] = merge(user).models;
    const ts = { ...dsl!, origin: { kind: 'ts' as const, file: '/app/user.ts', export: 'User' } };
    const [message] = messages({ ...merge(user), models: [dsl!, ts] });

    expect(message).toContain('Duplicate model name: User');
    expect(message).toContain(`${dsl!.origin.file}:`);
    expect(message).toContain('/app/user.ts (export User)');
  });

  test('accepts distinct names across files', () => {
    expect(messages(merge(user, 'model Guest {\n  id Record @id\n}'))).toEqual([]);
  });

  test('does not treat one name used by two different kinds as a duplicate', () => {
    expect(messages(merge(user, 'object User {\n  x Int\n}'))).toEqual([]);
  });
});
