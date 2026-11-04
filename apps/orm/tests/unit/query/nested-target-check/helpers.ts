/**
 * Shared fixtures for the nested target check tests. The result arrays are the `collect()` results
 * recorded in tests/integration/surrealdb-facts/nested-target-check.test.ts (SurrealDB 4.0.0): the
 * guarded text answers `[BEGIN, LET, RETURN $target_missing, IF, COMMIT]`, where the RETURN holds the
 * position of the first missing record, or NONE when every record is there.
 */

import { RecordId, type Surreal } from 'surrealdb';
import { astToRegistry } from '../../../../src/parser/model-metadata';
import { parse } from '../../../../src/parser/parser';
import { QueryBuilder } from '../../../../src/query/builder';

const schema = `
model User {
  id Record @id
  email Email @unique
  name String
  profileId Record?
  profile Relation? @field(profileId) @model(Profile)
  tagIds Record[]
  tags Relation[] @field(tagIds) @model(Tag)
}

model Profile {
  id Record @id
  bio String?
}

model Tag {
  id Record @id
  name String @unique
  userIds Record[]
  users Relation[] @field(userIds) @model(User)
}
`;

export const registry = astToRegistry(parse(schema).ast);
export const userModel = registry.User!;

export const userRow = { id: new RecordId('user', '1'), email: 'a@b.co', name: 'A', tagIds: [] };

/** Results of a guarded write whose targets all exist: the RETURN is NONE and the block yields the row */
export const written = [null, null, null, [userRow], null];

/** Results of a guarded write whose guard found the record at `position` missing: nothing was written */
export const missingAt = (position: number): unknown[] => [null, null, position, null, null];

/** The database's answer to an upsert's exists read when the record is there */
export const existsRead = [userRow];

export interface FakeDb {
  db: Surreal;
  /** The text and vars of each query sent, in order */
  sent: Array<{ text: string; vars: Record<string, unknown> }>;
}

/** A database that answers each query with the next queued `collect()` result and records what it was sent */
export function fakeDb(...answers: unknown[][]): FakeDb {
  const sent: FakeDb['sent'] = [];
  const db = {
    query: (bound: { query: string; bindings: Record<string, unknown> }) => ({
      collect: async () => {
        sent.push({ text: bound.query, vars: bound.bindings });
        const answer = answers[sent.length - 1];
        if (!answer) throw new Error('fakeDb: no answer queued for this query');

        return answer;
      },
    }),
  } as unknown as Surreal;

  return { db, sent };
}

export function userBuilder(db: Surreal): QueryBuilder<Record<string, unknown>> {
  return new QueryBuilder<Record<string, unknown>>(db, userModel, registry);
}
