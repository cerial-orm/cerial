/**
 * Unit tests: the create half of a WHERE-based upsert is a CREATE, never the UPSERT's own create path.
 *
 * An UPSERT ... WHERE whose new row hits a unique index updates the conflicting row instead, which the
 * WHERE then filters out, so the statement writes nothing and raises nothing. A CREATE raises the
 * violation, so the builder reads whether the WHERE matches and branches.
 */

import { describe, expect, test } from 'bun:test';
import { astToRegistry } from '../../../src/parser/model-metadata';
import { parse } from '../../../src/parser/parser';
import { buildUpsertQuery } from '../../../src/query/builders/upsert-builder';

const registry = astToRegistry(
  parse(`
model User {
  id Record @id
  email Email @unique
  nickname String? @unique
  name String
  first String?
  last String?
  @@unique(fullName, [first, last])
}

model Post {
  id Record @id
  title String
}
`).ast,
);
const user = registry.User!;
const post = registry.Post!;

/** The text between `{ ` and ` }` of each IF branch */
function branches(text: string): { matched: string; created: string } {
  const match = text.match(/LET \$up_result = IF \$up_matched \{ (.+) \} ELSE \{ (.+) \};/);
  if (!match) throw new Error(`no branching LET in:\n${text}`);

  return { matched: match[1]!, created: match[2]! };
}

function setClause(statement: string): string {
  return statement.match(/ SET (.+?)(?: WHERE | RETURN |$)/)![1]!;
}

describe('WHERE-based upsert branches on a read of its WHERE', () => {
  test('a unique-field where reads one match, upserts it, and otherwise creates', () => {
    const query = buildUpsertQuery(
      user,
      { email: 'a@b.co' },
      { email: 'a@b.co', name: 'A', nickname: null },
      { nickname: 'n' },
      undefined,
    );
    const { matched, created } = branches(query.text);

    expect(query.text.startsWith('BEGIN TRANSACTION;\n')).toBe(true);
    expect(query.text).toContain('LET $up_matched = (SELECT id FROM user WHERE email = $email_eq_0 LIMIT 1)[0];');
    expect(matched.startsWith('UPSERT ONLY user SET ')).toBe(true);
    expect(matched).toContain(' WHERE email = $email_eq_0 RETURN *');
    expect(created.startsWith('CREATE ONLY user SET ')).toBe(true);
    expect(created.endsWith(' RETURN *')).toBe(true);
    expect(created).not.toContain('WHERE');
    expect(query.text.endsWith('COMMIT TRANSACTION;\nRETURN $up_result;')).toBe(true);
  });

  test('both branches carry the same SET clauses, so $this == NONE picks the create values in the CREATE', () => {
    const query = buildUpsertQuery(user, { email: 'a@b.co' }, { email: 'a@b.co', name: 'A' }, { name: 'B' }, undefined);
    const { matched, created } = branches(query.text);

    expect(setClause(created)).toBe(setClause(matched));
    expect(setClause(created)).toContain('name = IF $this == NONE THEN $name_create_');
  });

  test('a composite unique where reads by its expanded fields and keeps ONLY on both branches', () => {
    const query = buildUpsertQuery(
      user,
      { fullName: { first: 'A', last: 'B' } },
      { email: 'a@b.co', name: 'A', first: 'A', last: 'B' },
      { name: 'C' },
      undefined,
    );
    const { matched, created } = branches(query.text);

    expect(query.text).toMatch(/LET \$up_matched = \(SELECT id FROM user WHERE .*first.*last.* LIMIT 1\)\[0\];/);
    expect(matched.startsWith('UPSERT ONLY user SET ')).toBe(true);
    expect(created.startsWith('CREATE ONLY user SET ')).toBe(true);
  });

  test('a non-unique where creates without ONLY, so the result stays an array', () => {
    const { matched, created } = branches(
      buildUpsertQuery(post, { title: 'T' }, { title: 'T' }, { title: 'U' }, undefined).text,
    );

    expect(matched.startsWith('UPDATE $bulk_ids_n_2 SET ')).toBe(true);
    expect(created.startsWith('CREATE post SET ')).toBe(true);
  });

  test('return before and return true carry the same RETURN on both branches', () => {
    const before = branches(
      buildUpsertQuery(user, { email: 'a@b.co' }, { email: 'a@b.co', name: 'A' }, {}, 'before').text,
    );
    expect(before.matched.endsWith(' RETURN BEFORE')).toBe(true);
    expect(before.created.endsWith(' RETURN BEFORE')).toBe(true);

    const flag = branches(buildUpsertQuery(user, { email: 'a@b.co' }, { email: 'a@b.co', name: 'A' }, {}, true).text);
    expect(flag.matched).not.toContain('RETURN');
    expect(flag.created).not.toContain('RETURN');
  });

  test('a projected return before reads the snapshot first and writes with RETURN NONE on both branches', () => {
    const query = buildUpsertQuery(user, { email: 'a@b.co' }, { email: 'a@b.co', name: 'A' }, { name: 'B' }, 'before', {
      name: true,
    });
    const { matched, created } = branches(query.text);

    expect(query.text.indexOf('LET $before = ')).toBeLessThan(query.text.indexOf('LET $up_matched'));
    expect(matched.endsWith(' RETURN NONE')).toBe(true);
    expect(created.endsWith(' RETURN NONE')).toBe(true);
    expect(query.text.endsWith('RETURN $before;')).toBe(true);
  });
});
