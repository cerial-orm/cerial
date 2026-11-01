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

model Org {
  id Record @id
  depts Relation[] @model(Dept)
}

model Dept {
  id Record @id
  orgId Record
  org Relation @field(orgId) @model(Org)
  staff Relation[] @model(Staff)
  tagIds Record[]
  tags Relation[] @field(tagIds) @model(Label)
}

model Staff {
  id Record @id
  deptId Record? @nullable
  dept Relation? @field(deptId) @model(Dept) @onDelete(SetNull)
}

model Label {
  id Record @id
  deptIds Record[]
  depts Relation[] @field(deptIds) @model(Dept)
}
`);

const statements = (text: string): string[] => text.split(';\n');
const indexOfStatement = (text: string, needle: string): number =>
  statements(text).findIndex((s) => s.includes(needle));

describe('transitive cascade emission', () => {
  test('deleteMany deletes the grandchildren before the children', () => {
    const { text } = buildDeleteWithCascade(registry.Grandparent!, {}, registry, true);
    const child = indexOfStatement(text, 'DELETE FROM child');
    const parent = indexOfStatement(text, 'DELETE FROM parent');

    expect(child).toBeGreaterThan(-1);
    expect(parent).toBeGreaterThan(child);
  });

  test('deleteUnique by id deletes the grandchildren', () => {
    const { text } = buildDeleteUniqueWithCascade(registry.Grandparent!, { id: 'g1' }, registry, false, true);

    expect(indexOfStatement(text, 'DELETE FROM child')).toBeGreaterThan(-1);
  });

  test('deleteUnique by a unique field deletes the grandchildren', () => {
    const { text } = buildDeleteUniqueWithCascade(
      registry.Grandparent!,
      { email: 'a@example.com' },
      registry,
      true,
      true,
    );

    expect(indexOfStatement(text, 'DELETE FROM child')).toBeGreaterThan(-1);
  });

  test('the root delete stays last and keeps RETURN BEFORE', () => {
    const { text } = buildDeleteWithCascade(registry.Grandparent!, {}, registry, true);
    const all = statements(text);

    expect(all[all.length - 1]).toContain('DELETE FROM grandparent');
    expect(all[all.length - 1]).toContain('RETURN BEFORE');
    expect(indexOfStatement(text, 'DELETE FROM child')).toBeGreaterThan(-1);
  });

  test('Restrict at depth two is checked before the first write', () => {
    const { text } = buildDeleteWithCascade(registry.Boss!, {}, registry, true);
    const throwAt = indexOfStatement(text, 'THROW');
    const firstWrite = statements(text).findIndex((s) => s.startsWith('DELETE FROM') || s.startsWith('UPDATE'));

    expect(text).toContain('Member records with @onDelete(Restrict)');
    expect(throwAt).toBeGreaterThan(-1);
    expect(throwAt).toBeLessThan(firstWrite);
  });

  test('Restrict at depth two blocks deleteUnique too', () => {
    const { text } = buildDeleteUniqueWithCascade(registry.Boss!, { id: 'b1' }, registry, false, true);

    expect(text).toContain('Member records with @onDelete(Restrict)');
  });

  test('a delete with no dependents of its own still emits one level', () => {
    const { text } = buildDeleteWithCascade(registry.Parent!, {}, registry, true);

    expect(indexOfStatement(text, 'DELETE FROM child')).toBeGreaterThan(-1);
    expect(text).not.toContain('DELETE FROM grandparent');
  });

  test('every write after a Restrict check targets the guarded set', () => {
    const { text } = buildDeleteWithCascade(registry.Boss!, {}, registry, true);
    const all = statements(text);
    const blockedAt = all.findIndex((s) => s.startsWith('LET $blocked'));
    const writes = all.filter((s) => s.startsWith('DELETE FROM') || s.startsWith('UPDATE'));

    expect(blockedAt).toBeGreaterThan(all.findIndex((s) => s.includes('THROW')));
    expect(writes).toHaveLength(2);
    for (const write of writes) expect(write).toContain('IF $blocked { [] } ELSE {');
    expect(all[all.length - 1]).toBe(
      'DELETE FROM boss WHERE id IN (IF $blocked { [] } ELSE { $to_delete.id }) RETURN BEFORE;',
    );
  });

  test('deleteUnique guards the final delete by id and by a unique field', () => {
    const byId = buildDeleteUniqueWithCascade(registry.Boss!, { id: 'b1' }, registry, false, true).text;
    const byEmail = buildDeleteUniqueWithCascade(registry.Boss!, { email: 'a@example.com' }, registry, true, true).text;

    expect(statements(byId).pop()).toBe('DELETE (IF $blocked { [] } ELSE { $deleteId }) RETURN NONE;');
    expect(statements(byEmail).pop()).toBe(
      'DELETE (IF $deleteId IS NONE { [] } ELSE { (IF $blocked { [] } ELSE { $deleteId }) }) RETURN BEFORE;',
    );
  });

  test('levels are captured before anything is written, deepest delete first', () => {
    const all = statements(buildDeleteWithCascade(registry.Boss!, {}, registry, true).text);

    expect(all[1]).toBe('LET $cd_1 = (SELECT VALUE id FROM team WHERE bossId IN $to_delete.id)');
    expect(all.indexOf(all.find((s) => s.startsWith('LET $cd_1'))!)).toBeLessThan(
      all.findIndex((s) => s.startsWith('DELETE FROM')),
    );
    expect(all.findIndex((s) => s.startsWith('DELETE FROM team'))).toBeLessThan(
      all.findIndex((s) => s.startsWith('DELETE FROM boss')),
    );
  });

  test('a model with no Restrict anywhere takes no guard', () => {
    const { text } = buildDeleteWithCascade(registry.Grandparent!, {}, registry, true);

    expect(text).not.toContain('$blocked');
    expect(statements(text)).toEqual([
      'LET $to_delete = (SELECT id FROM grandparent )',
      'LET $cd_1 = (SELECT VALUE id FROM parent WHERE grandparentId IN $to_delete.id)',
      'DELETE FROM child WHERE parentId IN $cd_1',
      'DELETE FROM parent WHERE grandparentId IN $to_delete.id',
      'DELETE FROM grandparent WHERE id IN $to_delete.id RETURN BEFORE;',
    ]);
  });

  test('SetNull at depth two clears the foreign key and emits nothing below', () => {
    const all = statements(buildDeleteWithCascade(registry.Org!, {}, registry, true).text);

    expect(all).toContain('UPDATE staff SET deptId = NULL WHERE deptId IN $cd_1');
    expect(all.filter((s) => s.includes('staff'))).toHaveLength(1);
  });

  test('an array foreign key at depth two is cleaned up and never cascades', () => {
    const all = statements(buildDeleteWithCascade(registry.Org!, {}, registry, true).text);

    expect(all).toContain('UPDATE label SET deptIds -= $cd_1 WHERE deptIds CONTAINSANY $cd_1');
    expect(all.some((s) => s.startsWith('DELETE FROM label'))).toBe(false);
  });

  test('a delete with no matching dependents at any depth stays a plain delete', () => {
    const { text } = buildDeleteWithCascade(registry.Child!, {}, registry, true);

    expect(text).toBe('DELETE FROM child RETURN BEFORE');
  });
});
