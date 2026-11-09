/**
 * Unit Tests: a filter through a forward relation on the target model's own foreign key
 *
 * `{ p: { intRefId: 1 } }` filters the related row by its own foreign key, a field of a model, not of an
 * object, so it is validated and converted exactly as `{ intRefId: 1 }` is on that model: the same bound
 * value or the same refusal. A foreign key inside an object has no model to name its table and reads the table
 * off the value, which is a different rule.
 */

import { describe, expect, test } from 'bun:test';
import { RecordId, Uuid } from 'surrealdb';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import { buildConditions } from '../../../src/query/filters/condition-builder';
import { validateWhere } from '../../../src/query/validators';
import type { ModelMetadata, WhereClause } from '../../../src/types';
import { CerialId } from '../../../src/utils/cerial-id';
import { CerialUuid } from '../../../src/utils/cerial-uuid';
import { registryFor } from './helpers';

const registry = registryFor(`
object Box {
  ref Record?
}

model P {
  id Record @id
  name String
  intRefId Record?
  intRef Relation? @field(intRefId) @model(IntId)
  uniRefId Record?
  uniRef Relation? @field(uniRefId) @model(UniId)
  uuRefId Record?
  uuRef Relation? @field(uuRefId) @model(UuId)
  strRefId Record?
  strRef Relation? @field(strRefId) @model(StrId)
  box Box?
  refs Relation[] @model(PRef)
}

model PRef {
  id Record @id
  label String
  pId Record?
  p Relation? @field(pId) @model(P)
}

model IntId {
  id Record(int) @id
  ps Relation[] @model(P)
}

model UniId {
  id Record(string, int) @id
  ps Relation[] @model(P)
}

model UuId {
  id Record(uuid) @id
  ps Relation[] @model(P)
}

model StrId {
  id Record @id
  ps Relation[] @model(P)
}

model Q {
  id Record @id
  uuRefIds Record[]
  uuRefs Relation[] @field(uuRefIds) @model(UuQ)
  qrefs Relation[] @model(QRef)
}

model QRef {
  id Record @id
  qId Record?
  q Relation? @field(qId) @model(Q)
}

model UuQ {
  id Record(uuid) @id
  qs Relation[] @model(Q)
}
`);
const p = registry.P!;
const pRef = registry.PRef!;
const q = registry.Q!;
const qRef = registry.QRef!;

const U0 = '0190c3f8-6c5d-7a3a-9d3a-1e1f2a3b4c5d';
const w = (value: unknown): WhereClause => value as WhereClause;

/** The outcome of one filter: what it binds, or the refusal's text with the model's name stripped of the path */
const outcome = (model: ModelMetadata, where: unknown): { vars: unknown[] } | { refused: true } => {
  if (validateWhere(w(where), model, registry).errors.length) return { refused: true };
  try {
    return { vars: Object.values(buildConditions(createCompileContext(), w(where), model, registry).vars) };
  } catch {
    return { refused: true };
  }
};

const FORMS: Array<[string, string, unknown]> = [
  ['intRefId', 'a number', 1],
  ['intRefId', 'a table:id string', 'int_id:1'],
  ['intRefId', 'a CerialId', CerialId.parse('int_id:1')],
  ['intRefId', 'a RecordId', new RecordId('int_id', 1)],
  ['intRefId', 'a bare numeric string', '1'],
  ['intRefId', 'a wrong table', 'other:1'],
  ['uuRefId', 'a uuid string', U0],
  ['uuRefId', 'an SDK Uuid', new Uuid(U0)],
  ['uuRefId', 'a CerialUuid', new CerialUuid(U0)],
  ['uuRefId', 'a table:id string', `uu_id:${U0}`],
  ['uuRefId', 'a RecordId', new RecordId('uu_id', new Uuid(U0))],
  ['uuRefId', 'a malformed uuid', 'nope'],
  ['strRefId', 'a bare string id', 's1'],
  ['strRefId', 'a table:id string', 'str_id:s1'],
  ['strRefId', 'a RecordId', new RecordId('str_id', 's1')],
  ['uniRefId', 'a number', 7],
  ['uniRefId', 'a string key', 'k'],
  ['uniRefId', 'a table:id string', 'uni_id:7'],
  ['uniRefId', 'a RecordId', new RecordId('uni_id', 7)],
];

const SHAPES: Array<[string, (key: string, value: unknown) => unknown]> = [
  ['eq shorthand', (key, value) => ({ [key]: value })],
  ['eq', (key, value) => ({ [key]: { eq: value } })],
  ['neq', (key, value) => ({ [key]: { neq: value } })],
  ['in', (key, value) => ({ [key]: { in: [value] } })],
  ['notIn', (key, value) => ({ [key]: { notIn: [value] } })],
  ['NOT', (key, value) => ({ NOT: { [key]: value } })],
  ['OR', (key, value) => ({ OR: [{ [key]: value }] })],
];

describe("a filter on the related model's foreign key is the model's own filter", () => {
  describe.each(FORMS)('%s, %s', (key, _form, value) => {
    test.each(SHAPES)('%s agrees with the model filtered directly', (_shape, make) => {
      const direct = outcome(p, make(key, value));
      const viaRelation = outcome(pRef, { p: make(key, value) });
      expect(viaRelation).toEqual(direct);
    });

    test('so does the reverse side, and the same value is bound at depth two', () => {
      const direct = outcome(p, { [key]: value });
      expect(outcome(p, { refs: { some: { p: { [key]: value } } } })).toEqual(direct);
    });
  });

  test('a valid operand is accepted and bound as the RecordId create stores', () => {
    const { vars } = buildConditions(createCompileContext(), w({ p: { intRefId: 1 } }), pRef, registry);
    expect(Object.values(vars)).toEqual([new RecordId('int_id', 1)]);
  });

  test('the cases a plain filter refuses stay refused through the relation', () => {
    expect(outcome(pRef, { p: { intRefId: 'other:1' } })).toEqual({ refused: true });
    expect(outcome(pRef, { p: { uuRefId: 'nope' } })).toEqual({ refused: true });
  });

  test('has, hasAny and hasAll on an array foreign key of the related model', () => {
    for (const shape of [{ has: U0 }, { has: new Uuid(U0) }, { hasAny: [U0] }, { hasAll: [new Uuid(U0)] }]) {
      expect(outcome(qRef, { q: { uuRefIds: shape } })).toEqual(outcome(q, { uuRefIds: shape }));
      expect(outcome(qRef, { q: { uuRefIds: shape } })).not.toEqual({ refused: true });
    }
  });

  test('a Record inside an object still reads its table off the value', () => {
    expect(outcome(p, { box: { ref: 'victim:v' } })).toEqual({ vars: [new RecordId('victim', 'v')] });
    expect(outcome(p, { box: { ref: 'v' } })).toEqual({ refused: true });
    expect(outcome(pRef, { p: { box: { ref: 'victim:v' } } })).toEqual({ vars: [new RecordId('victim', 'v')] });
    expect(outcome(pRef, { p: { box: { ref: 'v' } } })).toEqual({ refused: true });
  });
});
