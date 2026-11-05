/**
 * Unit tests for @defaultAlways and @now on a nested-operation update
 *
 * The nested update takes its SET clauses from the plain update's builder, so the two must emit the
 * same decorator handling: a @defaultAlways field the caller did not write is reset with NONE so the
 * database re-fires its default, and a @now field is computed, never written. Every case compares the
 * nested clauses with the plain update's for the same data.
 */

import { describe, expect, test } from 'bun:test';
import { convertModels, createRegistry } from '../../../src/generators/metadata';
import { parse } from '../../../src/parser/parser';
import type { NestedOperation } from '../../../src/query/builders/nested-builder';
import { buildUpdateWithNestedTransaction } from '../../../src/query/builders/nested-builder';
import { buildUpdateManyQuery } from '../../../src/query/builders/update-builder';

const schema = `
model Owner {
  id Record @id
  name String
}

model Doc {
  id Record @id
  title String
  note String @defaultAlways("pending")
  flagged Bool @defaultAlways(false)
  seenAt Date @now
  ownerId Record?
  owner Relation? @field(ownerId) @model(Owner)
}
`;

// The runtime registry is built by the generator's converter, which carries defaultAlwaysValue
const registry = createRegistry(convertModels(parse(schema).ast.models));
const doc = registry.Doc!;
const where = { id: 'doc:1' };
const connect = new Map<string, NestedOperation>([['owner', { connect: 'owner:1' }]]);

/** The clauses between SET and WHERE, which is where the decorators act. */
const setClause = (text: string): string => {
  const match = text.match(/UPDATE doc SET (.*?) WHERE/s);
  if (!match) throw new Error(`no UPDATE ... SET ... WHERE in: ${text}`);

  return match[1]!;
};

const nested = (data: Record<string, unknown>) =>
  setClause(buildUpdateWithNestedTransaction(doc, where, data, connect, registry).text);
const plain = (data: Record<string, unknown>) => setClause(buildUpdateManyQuery(doc, where, data).text);

describe('nested update: @defaultAlways', () => {
  test('resets each @defaultAlways field the caller did not write, as the plain update does', () => {
    const clause = nested({ title: 't' });

    expect(clause).toContain('note = NONE');
    expect(clause).toContain('flagged = NONE');
    expect(clause).toContain('ownerId = $nested_connect_n_0[0]');
    for (const field of ['note', 'flagged']) expect(plain({ title: 't' })).toContain(`${field} = NONE`);
  });

  test('resets them when the nested op is the only change', () => {
    const clause = nested({});

    expect(clause).toContain('note = NONE');
    expect(clause).toContain('flagged = NONE');
    expect(plain({})).toContain('note = NONE');
  });

  test('a @defaultAlways field the caller wrote is bound, not reset', () => {
    const clause = nested({ note: 'written' });

    expect(clause).not.toContain('note = NONE');
    expect(clause).toMatch(/note = \$\w+/);
    expect(clause).toContain('flagged = NONE');
    expect(plain({ note: 'written' })).not.toContain('note = NONE');
  });

  test('a falsy value the caller wrote still counts as written', () => {
    const clause = nested({ flagged: false });

    expect(clause).not.toContain('flagged = NONE');
    expect(clause).toMatch(/flagged = \$\w+/);
  });

  test('the nested and plain updates reset the same fields', () => {
    const resets = (clause: string) => [...clause.matchAll(/(\w+) = NONE/g)].map((m) => m[1]).sort();

    expect(resets(nested({ title: 't' }))).toEqual(resets(plain({ title: 't' })));
    expect(resets(nested({ note: 'x' }))).toEqual(resets(plain({ note: 'x' })));
  });
});

describe('nested update: @now', () => {
  test('never writes a @now field', () => {
    expect(nested({ title: 't' })).not.toContain('seenAt');
    expect(plain({ title: 't' })).not.toContain('seenAt');
  });

  test('strips a @now field the caller passed, as the plain update does', () => {
    const data = { title: 't', seenAt: new Date('2020-01-01') };

    expect(nested(data)).not.toContain('seenAt');
    expect(plain(data)).not.toContain('seenAt');
  });

  test('keeps the rest of the data when it strips a @now field', () => {
    const clause = nested({ title: 't', seenAt: new Date('2020-01-01') });

    expect(clause).toMatch(/title = \$\w+/);
    expect(clause).toContain('ownerId = $nested_connect_n_0[0]');
  });
});
