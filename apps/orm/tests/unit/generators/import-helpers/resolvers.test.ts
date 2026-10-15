/**
 * Unit tests for the import-name resolvers in import-helpers.ts
 */

import { describe, expect, test } from 'bun:test';
import {
  collectTupleObjectNamesDeep,
  collectTupleTupleNamesDeep,
  getObjectReferencedObjectNames,
  getObjectReferencedTupleNames,
  getReferencedObjectNames,
  getReferencedTupleNames,
  getRelatedModelNames,
  getTupleReferencedObjectNames,
  getTupleReferencedTupleNames,
} from '../../../../src/generators/client/import-helpers';
import { element, field, model, object, objectField, relationField, tuple, tupleField, tupleInfo } from '../fixtures';

describe('getRelatedModelNames', () => {
  test('returns the target of each relation field, deduplicated', () => {
    const m = model('User', [
      relationField('posts', 'Post'),
      relationField('drafts', 'Post'),
      relationField('profile', 'Profile'),
    ]);

    expect(getRelatedModelNames(m)).toEqual(['Post', 'Profile']);
  });

  test('ignores a relation field without relationInfo', () => {
    expect(getRelatedModelNames(model('User', [field({ name: 'posts', type: 'relation' })]))).toEqual([]);
  });

  test('ignores non-relation fields', () => {
    expect(getRelatedModelNames(model('User', [field({ name: 'name' })]))).toEqual([]);
  });
});

describe('getReferencedObjectNames / getReferencedTupleNames (model)', () => {
  test('collects object names once, skipping fields without objectInfo', () => {
    const m = model('User', [
      objectField('home', 'Address'),
      objectField('work', 'Address'),
      objectField('geo', 'Geo'),
      field({ name: 'bare', type: 'object' }),
      field({ name: 'name' }),
    ]);

    expect(getReferencedObjectNames(m)).toEqual(['Address', 'Geo']);
  });

  test('collects tuple names once, skipping fields without tupleInfo', () => {
    const m = model('Place', [
      tupleField('a', 'Coord'),
      tupleField('b', 'Coord'),
      tupleField('c', 'Range'),
      field({ name: 'bare', type: 'tuple' }),
    ]);

    expect(getReferencedTupleNames(m)).toEqual(['Coord', 'Range']);
  });

  test('returns empty arrays for a model with neither', () => {
    const m = model('Plain', [field({ name: 'name' })]);

    expect(getReferencedObjectNames(m)).toEqual([]);
    expect(getReferencedTupleNames(m)).toEqual([]);
  });
});

describe('getObjectReferencedObjectNames', () => {
  test('excludes a self-reference so the file does not import itself', () => {
    const o = object('Node', [objectField('self', 'Node'), objectField('meta', 'Meta')]);

    expect(getObjectReferencedObjectNames(o)).toEqual(['Meta']);
  });

  test('deduplicates repeated references', () => {
    const o = object('A', [objectField('x', 'B'), objectField('y', 'B')]);

    expect(getObjectReferencedObjectNames(o)).toEqual(['B']);
  });

  test('skips object fields without objectInfo', () => {
    expect(getObjectReferencedObjectNames(object('A', [field({ name: 'x', type: 'object' })]))).toEqual([]);
  });
});

describe('getObjectReferencedTupleNames', () => {
  test('collects tuple names once and skips fields without tupleInfo', () => {
    const o = object('A', [tupleField('p', 'Coord'), tupleField('q', 'Coord'), field({ name: 'r', type: 'tuple' })]);

    expect(getObjectReferencedTupleNames(o)).toEqual(['Coord']);
  });
});

describe('getTupleReferencedObjectNames / getTupleReferencedTupleNames', () => {
  const inner = tupleInfo('Inner', []);
  const t = tuple('Outer', [
    element(0, 'object', { objectInfo: { objectName: 'Meta', fields: [] } }),
    element(1, 'object', { objectInfo: { objectName: 'Meta', fields: [] } }),
    element(2, 'object'),
    element(3, 'tuple', { tupleInfo: inner }),
    element(4, 'tuple', { tupleInfo: tupleInfo('Outer', []) }),
    element(5, 'tuple'),
    element(6, 'string'),
  ]);

  test('object names are deduplicated and need objectInfo', () => {
    expect(getTupleReferencedObjectNames(t)).toEqual(['Meta']);
  });

  test('tuple names exclude the tuple itself and need tupleInfo', () => {
    expect(getTupleReferencedTupleNames(t)).toEqual(['Inner']);
  });
});

describe('collectTupleObjectNamesDeep', () => {
  test('collects object names from nested tuples at every depth', () => {
    const deep = tupleInfo('Deep', [element(0, 'object', { objectInfo: { objectName: 'DeepObj', fields: [] } })]);
    const mid = tupleInfo('Mid', [
      element(0, 'object', { objectInfo: { objectName: 'MidObj', fields: [] } }),
      element(1, 'tuple', { tupleInfo: deep }),
    ]);
    const top = tupleInfo('Top', [element(0, 'tuple', { tupleInfo: mid }), element(1, 'string')]);

    expect([...collectTupleObjectNamesDeep(top)].sort()).toEqual(['DeepObj', 'MidObj']);
  });

  test('terminates on a self-referencing tuple', () => {
    const loop = tupleInfo('Loop', []);
    loop.elements.push(
      element(0, 'tuple', { tupleInfo: loop }),
      element(1, 'object', {
        objectInfo: { objectName: 'Obj', fields: [] },
      }),
    );

    expect([...collectTupleObjectNamesDeep(loop)]).toEqual(['Obj']);
  });

  test('returns an empty set when the tuple was already visited', () => {
    const t = tupleInfo('T', [element(0, 'object', { objectInfo: { objectName: 'Obj', fields: [] } })]);

    expect(collectTupleObjectNamesDeep(t, new Set(['T'])).size).toBe(0);
  });

  test('skips object and tuple elements that lack their info', () => {
    expect(collectTupleObjectNamesDeep(tupleInfo('T', [element(0, 'object'), element(1, 'tuple')])).size).toBe(0);
  });
});

describe('collectTupleTupleNamesDeep', () => {
  test('collects nested tuple names at every depth', () => {
    const deep = tupleInfo('Deep', []);
    const mid = tupleInfo('Mid', [element(0, 'tuple', { tupleInfo: deep })]);
    const top = tupleInfo('Top', [element(0, 'tuple', { tupleInfo: mid }), element(1, 'int')]);

    expect([...collectTupleTupleNamesDeep(top)].sort()).toEqual(['Deep', 'Mid']);
  });

  test('a self-referencing tuple reports itself once and terminates', () => {
    const loop = tupleInfo('Loop', []);
    loop.elements.push(element(0, 'tuple', { tupleInfo: loop }));

    expect([...collectTupleTupleNamesDeep(loop)]).toEqual(['Loop']);
  });

  test('returns an empty set when the tuple was already visited', () => {
    const t = tupleInfo('T', [element(0, 'tuple', { tupleInfo: tupleInfo('U', []) })]);

    expect(collectTupleTupleNamesDeep(t, new Set(['T'])).size).toBe(0);
  });

  test('ignores a tuple element without tupleInfo', () => {
    expect(collectTupleTupleNamesDeep(tupleInfo('T', [element(0, 'tuple')])).size).toBe(0);
  });
});
