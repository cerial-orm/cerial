/**
 * A delete reaches the dependents of its dependents. These pin that, and fail until the builders emit it.
 */

import { describe, expect, test } from 'bun:test';
import { buildDeleteUniqueWithCascade, buildDeleteWithCascade } from '../../../src/query/builders';
import { parseModelRegistry } from '../../test-helpers';

const registry = parseModelRegistry(`
model Grandparent {
  id Record @id
  email Email @unique
  parents Relation[] @model(Parent)
}

model Parent {
  id Record @id
  grandparentId Record
  grandparent Relation @field(grandparentId) @model(Grandparent)
  children Relation[] @model(Child)
}

model Child {
  id Record @id
  parentId Record
  parent Relation @field(parentId) @model(Parent)
}

model Boss {
  id Record @id
  email Email @unique
  teams Relation[] @model(Team)
}

model Team {
  id Record @id
  bossId Record
  boss Relation @field(bossId) @model(Boss)
  members Relation[] @model(Member)
}

model Member {
  id Record @id
  teamId Record?
  team Relation? @field(teamId) @model(Team) @onDelete(Restrict)
}
`);

const statements = (text: string): string[] => text.split(';\n');
const indexOfStatement = (text: string, needle: string): number =>
  statements(text).findIndex((s) => s.includes(needle));

describe('transitive cascade emission', () => {
  test.failing('deleteMany deletes the grandchildren before the children', () => {
    const { text } = buildDeleteWithCascade(registry.Grandparent!, {}, registry, true);
    const child = indexOfStatement(text, 'DELETE FROM child');
    const parent = indexOfStatement(text, 'DELETE FROM parent');

    expect(child).toBeGreaterThan(-1);
    expect(parent).toBeGreaterThan(child);
  });

  test.failing('deleteUnique by id deletes the grandchildren', () => {
    const { text } = buildDeleteUniqueWithCascade(registry.Grandparent!, { id: 'g1' }, registry, false, true);

    expect(indexOfStatement(text, 'DELETE FROM child')).toBeGreaterThan(-1);
  });

  test.failing('deleteUnique by a unique field deletes the grandchildren', () => {
    const { text } = buildDeleteUniqueWithCascade(
      registry.Grandparent!,
      { email: 'a@example.com' },
      registry,
      true,
      true,
    );

    expect(indexOfStatement(text, 'DELETE FROM child')).toBeGreaterThan(-1);
  });

  test.failing('the root delete stays last and keeps RETURN BEFORE', () => {
    const { text } = buildDeleteWithCascade(registry.Grandparent!, {}, registry, true);
    const all = statements(text);

    expect(all[all.length - 1]).toContain('DELETE FROM grandparent');
    expect(all[all.length - 1]).toContain('RETURN BEFORE');
    expect(indexOfStatement(text, 'DELETE FROM child')).toBeGreaterThan(-1);
  });

  test.failing('Restrict at depth two is checked before the first write', () => {
    const { text } = buildDeleteWithCascade(registry.Boss!, {}, registry, true);
    const throwAt = indexOfStatement(text, 'THROW');
    const firstWrite = statements(text).findIndex((s) => s.startsWith('DELETE FROM') || s.startsWith('UPDATE'));

    expect(text).toContain('Member records with @onDelete(Restrict)');
    expect(throwAt).toBeGreaterThan(-1);
    expect(throwAt).toBeLessThan(firstWrite);
  });

  test.failing('Restrict at depth two blocks deleteUnique too', () => {
    const { text } = buildDeleteUniqueWithCascade(registry.Boss!, { id: 'b1' }, registry, false, true);

    expect(text).toContain('Member records with @onDelete(Restrict)');
  });

  test('a delete with no dependents of its own still emits one level', () => {
    const { text } = buildDeleteWithCascade(registry.Parent!, {}, registry, true);

    expect(indexOfStatement(text, 'DELETE FROM child')).toBeGreaterThan(-1);
    expect(text).not.toContain('DELETE FROM grandparent');
  });
});
