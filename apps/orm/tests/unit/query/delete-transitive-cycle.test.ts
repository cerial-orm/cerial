/**
 * A cascade that comes back to a model it already passed is followed row by row, level by level, up to a
 * fixed limit. A model-level visited set would stop at one level and leave the rows below dangling.
 */

import { describe, expect, test } from 'bun:test';
import { CerialValidationError } from '../../../src/errors';
import { buildDeleteUniqueWithCascade, buildDeleteWithCascade } from '../../../src/query/builders';
import { parseModelRegistry } from '../../test-helpers';

const LIMIT = 16;

const registry = parseModelRegistry(`
model Node {
  id Record @id
  parentId Record?
  parent Relation? @field(parentId) @model(Node) @onDelete(Cascade) @key(tree)
  children Relation[] @model(Node) @key(tree)
}

model Tag {
  id Record @id
  parentId Record?
  parent Relation? @field(parentId) @model(Tag) @onDelete(SetNull) @key(tagTree)
  children Relation[] @model(Tag) @key(tagTree)
}

model Ping {
  id Record @id
  pongId Record?
  pong Relation? @field(pongId) @model(Pong) @onDelete(Cascade) @key(pp)
  pongs Relation[] @model(Pong) @key(qq)
}

model Pong {
  id Record @id
  pingId Record?
  ping Relation? @field(pingId) @model(Ping) @onDelete(Cascade) @key(qq)
  pings Relation[] @model(Ping) @key(pp)
}
`);

const deleteMany = (name: string): string => buildDeleteWithCascade(registry[name]!, {}, registry, true).text;

const lines = (text: string): string[] => text.split(';\n').map((l) => l.replace(/;$/, ''));
const captures = (text: string): string[] => lines(text).filter((l) => l.startsWith('LET $cd_'));
const deletes = (text: string): string[] => lines(text).filter((l) => l.startsWith('DELETE FROM'));

describe('a self-referential Cascade', () => {
  const text = deleteMany('Node');

  test('captures one level per step up to the limit', () => {
    expect(captures(text)).toHaveLength(LIMIT);
  });

  test('the first level reads the root ids, each next one the level before', () => {
    const [first, second, last] = [captures(text)[0]!, captures(text)[1]!, captures(text)[LIMIT - 1]!];

    expect(first).toBe(
      'LET $cd_1 = (SELECT VALUE id FROM node WHERE parentId IN $to_delete.id AND id NOT IN $to_delete.id)',
    );
    expect(second).toBe(
      'LET $cd_2 = (SELECT VALUE id FROM node WHERE parentId IN $cd_1 AND id NOT IN $to_delete.id AND id NOT IN $cd_1)',
    );
    expect(last).toContain(`WHERE parentId IN $cd_${LIMIT - 1} AND id NOT IN $to_delete.id`);
  });

  test('every level is deleted deepest first, all behind the guard', () => {
    const del = deletes(text);

    expect(del).toHaveLength(LIMIT + 1);
    expect(del[0]).toBe(`DELETE FROM node WHERE parentId IN (IF $blocked { [] } ELSE { $cd_${LIMIT - 1} })`);
    expect(del[LIMIT - 1]).toBe('DELETE FROM node WHERE parentId IN (IF $blocked { [] } ELSE { $to_delete.id })');
  });

  test('the level past the limit is checked before the first write and names the limit, model and path', () => {
    const all = lines(text);
    const check = all.findIndex((l) => l.startsWith('LET $deep_1'));
    const throwAt = all.findIndex((l) => l.startsWith('IF $deep_1 > 0'));
    const firstWrite = all.findIndex((l) => l.startsWith('DELETE FROM'));

    expect(all[check]).toContain(`FROM node WHERE parentId IN $cd_${LIMIT} AND id NOT IN $to_delete.id`);
    expect(throwAt).toBe(check + 1);
    expect(check).toBeLessThan(firstWrite);
    expect(all[throwAt]).toBe(
      `IF $deep_1 > 0 { THROW "Cannot delete Node: cascade deeper than ${LIMIT} levels at Node (${Array(LIMIT + 2)
        .fill('Node')
        .join(' > ')})" }`,
    );
    expect(all.find((l) => l.startsWith('LET $blocked'))).toBe('LET $blocked = $deep_1 > 0');
  });

  test('the whole script is 3 + 2 * limit + 3 statements', () => {
    // to_delete, LIMIT captures, depth check (2), blocked, LIMIT level deletes, the root delete
    expect(lines(text)).toHaveLength(1 + LIMIT + 2 + 1 + LIMIT + 1);
  });

  test('deleteUnique starts from the id list the same way', () => {
    const unique = buildDeleteUniqueWithCascade(registry.Node!, { id: 'n1' }, registry, true, true).text;

    expect(captures(unique)[0]).toBe(
      'LET $cd_1 = (SELECT VALUE id FROM node WHERE parentId IN $to_delete AND id NOT IN $to_delete)',
    );
    expect(captures(unique)).toHaveLength(LIMIT);
    expect(lines(unique).at(-1)).toBe('DELETE (IF $blocked { [] } ELSE { $deleteId }) RETURN BEFORE');
  });
});

describe('a mutual cycle of two models', () => {
  const text = deleteMany('Ping');

  test('alternates the two tables, one capture per level', () => {
    const tables = captures(text).map((c) => /FROM (\w+) WHERE/.exec(c)![1]);

    expect(tables).toHaveLength(LIMIT);
    expect(tables.slice(0, 4)).toEqual(['pong', 'ping', 'pong', 'ping']);
  });

  test('the root table is excluded where the cycle returns to it', () => {
    expect(captures(text)[1]).toBe(
      'LET $cd_2 = (SELECT VALUE id FROM ping WHERE pongId IN $cd_1 AND id NOT IN $to_delete.id)',
    );
  });

  test('refuses past the limit naming the model reached and the alternating path', () => {
    const throwLine = lines(text).find((l) => l.startsWith('IF $deep_'))!;

    expect(throwLine).toContain(`cascade deeper than ${LIMIT} levels at `);
    expect(throwLine).toContain('(Ping > Pong > Ping > Pong');
  });
});

describe('graphs without a cascade cycle', () => {
  test('a SetNull self-reference is one UPDATE and no unrolling', () => {
    const text = deleteMany('Tag');

    expect(captures(text)).toHaveLength(0);
    expect(text).not.toContain('$deep_');
    expect(text).not.toContain('NOT IN');
  });

  const chain = (length: number): ReturnType<typeof parseModelRegistry> => {
    const models = Array.from({ length }, (_, i) =>
      i === 0
        ? 'model M0 {\n  id Record @id\n  next Relation[] @model(M1)\n}'
        : `model M${i} {\n  id Record @id\n  prevId Record\n  prev Relation @field(prevId) @model(M${i - 1})\n${i + 1 < length ? `  next Relation[] @model(M${i + 1})\n` : ''}}`,
    );

    return parseModelRegistry(models.join('\n\n'));
  };

  test('a chain exactly at the limit emits no runtime check', () => {
    const reg = chain(LIMIT + 1);
    const text = buildDeleteWithCascade(reg.M0!, {}, reg, true).text;

    expect(text).not.toContain('$deep_');
    expect(text).not.toContain('$blocked');
    expect(captures(text)).toHaveLength(LIMIT - 1);
  });

  test('a chain past the limit is refused at build time naming the limit, model and path', () => {
    const reg = chain(LIMIT + 2);
    const refuse = (): unknown => buildDeleteWithCascade(reg.M0!, {}, reg, true);

    expect(refuse).toThrow(CerialValidationError);
    expect(refuse).toThrow(`Cannot delete M0: cascade deeper than ${LIMIT} levels at M${LIMIT + 1} (M0 > M1`);
  });
});
