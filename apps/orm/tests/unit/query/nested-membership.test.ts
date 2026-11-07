/**
 * Unit Tests: enum and literal values nested in objects and tuples
 *
 * A value outside the variant set is rejected wherever it sits, with the dotted path from the
 * model root. Enum fields carry type 'literal', so one set of cases covers both.
 */

import { describe, expect, test } from 'bun:test';
import {
  convertLiterals,
  convertModels,
  convertObjects,
  convertTuples,
  createLiteralRegistry,
  createTupleRegistry,
  resolveObjectFields,
} from '../../../src/generators/metadata';
import { convertEnums } from '../../../src/generators/metadata/model-converter';
import { createObjectRegistry, createRegistry } from '../../../src/generators/metadata/registry-generator';
import { parse } from '../../../src/parser/parser';
import {
  validateCreateData,
  validateFieldValue,
  validateUpdateData,
} from '../../../src/query/validators/data-validator';
import { NONE } from '../../../src/utils/none';

const schema = `
enum Grade { LOW, MID, HIGH }

literal Code { 'a1', 'b2', 7 }

object Leaf {
  grade Grade
  code Code?
  codes Code[]
}

object Mid {
  label String
  leaf Leaf
}

object Top {
  title String
  mid Mid
}

tuple Pair {
  Grade,
  Int
}

tuple Named {
  grade Grade,
  n Int
}

tuple Outer {
  Pair,
  Int
}

tuple WithLeaf {
  label String,
  Leaf
}

object HoldsPair {
  pair Pair
}

object HoldsHolder {
  holder HoldsPair
}

model ObjectDoc {
  id Record @id
  name String
  leaf Leaf?
  mid Mid?
  top Top?
  leaves Leaf[]
  tops Top[]
}

model TupleDoc {
  id Record @id
  name String
  pair Pair?
  named Named?
  outer Outer?
  withLeaf WithLeaf?
  holds HoldsPair?
  deepHolds HoldsHolder?
  pairs Pair[]
  nameds Named[]
}
`;

const { ast, errors: parseErrors } = parse(schema);
if (parseErrors?.length) throw new Error(JSON.stringify(parseErrors));
const models = convertModels(ast.models);
const objects = convertObjects(ast.objects);
const tuples = convertTuples(ast.tuples);
const literals = createLiteralRegistry([...convertLiterals(ast.literals), ...convertEnums(ast.enums)]);
resolveObjectFields(models, objects, createObjectRegistry(objects), createTupleRegistry(tuples), literals);

const registry = createRegistry(models);
const objectDoc = registry.ObjectDoc!;
const tupleDoc = registry.TupleDoc!;

const GRADE = "must be one of: 'LOW', 'MID', 'HIGH'";
const CODE = "must be one of: 'a1', 'b2', 7";

const create = (model: typeof objectDoc, data: Record<string, unknown>) =>
  validateCreateData({ name: 'n', ...data }, model).errors;
const update = (model: typeof objectDoc, data: Record<string, unknown>) => validateUpdateData(data, model).errors;

/** Both write paths must agree, so every rejection case runs through each. */
function bothPaths(model: typeof objectDoc, data: Record<string, unknown>) {
  return { create: create(model, data), update: update(model, data) };
}

describe('nested membership: objects', () => {
  test('depth 1: names the permitted values, the received value and the path', () => {
    const { create: c, update: u } = bothPaths(objectDoc, { leaf: { grade: 'NOPE', codes: [] } });
    for (const errors of [c, u]) {
      expect(errors).toHaveLength(1);
      expect(errors[0]!.field).toBe('leaf.grade');
      expect(errors[0]!.message).toBe(`leaf.grade ${GRADE} (received 'NOPE')`);
    }
  });

  test('depth 2', () => {
    const data = { mid: { label: 'l', leaf: { grade: 'NOPE', codes: [] } } };
    expect(create(objectDoc, data).map((e) => e.field)).toEqual(['mid.leaf.grade']);
    expect(update(objectDoc, data).map((e) => e.field)).toEqual(['mid.leaf.grade']);
  });

  test('depth 3', () => {
    const data = { top: { title: 't', mid: { label: 'l', leaf: { grade: 'NOPE', codes: [] } } } };
    expect(create(objectDoc, data).map((e) => e.field)).toEqual(['top.mid.leaf.grade']);
    expect(update(objectDoc, data).map((e) => e.field)).toEqual(['top.mid.leaf.grade']);
  });

  test('a partial update merge checks only the keys it carries', () => {
    expect(update(objectDoc, { leaf: { grade: 'HIGH' } })).toEqual([]);
    expect(update(objectDoc, { top: { mid: { leaf: { grade: 'BAD' } } } }).map((e) => e.field)).toEqual([
      'top.mid.leaf.grade',
    ]);
  });

  test('is case sensitive', () => {
    expect(update(objectDoc, { leaf: { grade: 'low' } })).toHaveLength(1);
  });

  test('a literal with mixed variants checks each kind', () => {
    expect(update(objectDoc, { leaf: { code: 'a1' } })).toEqual([]);
    expect(update(objectDoc, { leaf: { code: 7 } })).toEqual([]);
    const errors = update(objectDoc, { leaf: { code: 8 } });
    expect(errors[0]!.message).toBe(`leaf.code ${CODE} (received 8)`);
    expect(update(objectDoc, { leaf: { code: 'zz' } })[0]!.field).toBe('leaf.code');
  });

  test('an array of literals inside an object names the element index', () => {
    const errors = update(objectDoc, { leaf: { codes: ['a1', 'zz'] } });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe(`leaf.codes[1] ${CODE} (received 'zz')`);
  });

  test('every bad value is reported, valid siblings are not', () => {
    const errors = update(objectDoc, { leaf: { grade: 'BAD', code: 'zz', codes: ['a1', 'q'] } });
    expect(errors.map((e) => e.field)).toEqual(['leaf.grade', 'leaf.code', 'leaf.codes']);
  });

  test('NONE and an absent key pass on optional sub-fields', () => {
    expect(update(objectDoc, { leaf: { code: NONE } })).toEqual([]);
    expect(update(objectDoc, { leaf: { code: undefined } })).toEqual([]);
    expect(update(objectDoc, { leaf: NONE })).toEqual([]);
  });

  test('null on a sub-field that is not @nullable is rejected', () => {
    expect(update(objectDoc, { leaf: { code: null } })[0]!.message).toContain('leaf.code is not nullable');
  });

  test('array of objects: names the index', () => {
    const data = {
      leaves: [
        { grade: 'LOW', codes: [] },
        { grade: 'NOPE', codes: [] },
      ],
    };
    expect(create(objectDoc, data).map((e) => e.field)).toEqual(['leaves[1].grade']);
    expect(update(objectDoc, data).map((e) => e.field)).toEqual(['leaves[1].grade']);
  });

  test('array of objects at depth 3', () => {
    const data = { tops: [{ title: 't', mid: { label: 'l', leaf: { grade: 'NOPE', codes: [] } } }] };
    expect(create(objectDoc, data).map((e) => e.field)).toEqual(['tops[0].mid.leaf.grade']);
    expect(update(objectDoc, data).map((e) => e.field)).toEqual(['tops[0].mid.leaf.grade']);
  });

  test('array of objects: push item, push list and set', () => {
    expect(update(objectDoc, { leaves: { push: { grade: 'NOPE', codes: [] } } }).map((e) => e.field)).toEqual([
      'leaves.push[0].grade',
    ]);
    const list = {
      leaves: {
        push: [
          { grade: 'LOW', codes: [] },
          { grade: 'NOPE', codes: [] },
        ],
      },
    };
    expect(update(objectDoc, list).map((e) => e.field)).toEqual(['leaves.push[1].grade']);
    expect(update(objectDoc, { leaves: { set: [{ grade: 'NOPE', codes: [] }] } }).map((e) => e.field)).toEqual([
      'leaves[0].grade',
    ]);
    expect(update(objectDoc, { leaves: { push: { grade: 'LOW', codes: [] } } })).toEqual([]);
  });

  test('a { set } wrapper on an object checks its contents', () => {
    expect(update(objectDoc, { leaf: { set: { grade: 'NOPE', codes: [] } } }).map((e) => e.field)).toEqual([
      'leaf.grade',
    ]);
    expect(update(objectDoc, { leaf: { set: { grade: 'LOW', codes: [] } } })).toEqual([]);
  });

  test('an array is not an object: it is rejected by the type check, not walked', () => {
    const errors = update(objectDoc, { leaf: [{ grade: 'NOPE' }] });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe('leaf must be of type object');
  });

  test('create refuses an undeclared sub-key of a strict object', () => {
    expect(create(objectDoc, { leaf: { grade: 'LOW', codes: [], extra: 1 } }).map((e) => e.field)).toEqual([
      'leaf.extra',
    ]);
  });
});

describe('nested membership: tuples', () => {
  test('array form, positional element', () => {
    const errors = create(tupleDoc, { pair: ['NOPE', 1] });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.field).toBe('pair[0]');
    expect(errors[0]!.message).toBe(`pair[0] ${GRADE} (received 'NOPE')`);
    expect(update(tupleDoc, { pair: ['NOPE', 1] }).map((e) => e.field)).toEqual(['pair[0]']);
  });

  test('object form by index and by name accepts the same tuple input', () => {
    expect(create(tupleDoc, { pair: { 0: 'NOPE', 1: 1 } }).map((e) => e.field)).toEqual(['pair.0']);
    expect(create(tupleDoc, { named: { grade: 'NOPE', n: 1 } }).map((e) => e.field)).toEqual(['named.grade']);
    expect(update(tupleDoc, { pair: { 0: 'NOPE' } }).map((e) => e.field)).toEqual(['pair.0']);
    expect(update(tupleDoc, { named: { grade: 'NOPE' } }).map((e) => e.field)).toEqual(['named.grade']);
    expect(update(tupleDoc, { named: { 0: 'NOPE' } }).map((e) => e.field)).toEqual(['named.0']);
  });

  test('valid values pass in every form', () => {
    for (const data of [
      { pair: ['LOW', 1] },
      { pair: { 0: 'HIGH', 1: 2 } },
      { named: { grade: 'MID', n: 1 } },
      { named: ['MID', 1] },
    ])
      expect([create(tupleDoc, data), update(tupleDoc, data)]).toEqual([[], []]);
  });

  test('depth 2: a tuple inside a tuple', () => {
    expect(create(tupleDoc, { outer: [['NOPE', 1], 2] }).map((e) => e.field)).toEqual(['outer[0][0]']);
    expect(update(tupleDoc, { outer: { 0: ['NOPE', 1] } }).map((e) => e.field)).toEqual(['outer.0[0]']);
    expect(update(tupleDoc, { outer: { 0: { 0: 'NOPE' } } }).map((e) => e.field)).toEqual(['outer.0.0']);
  });

  test('depth 2: an object inside a tuple', () => {
    const data = { withLeaf: ['x', { grade: 'NOPE', codes: [] }] };
    expect(create(tupleDoc, data).map((e) => e.field)).toEqual(['withLeaf[1].grade']);
    expect(update(tupleDoc, data).map((e) => e.field)).toEqual(['withLeaf[1].grade']);
    expect(update(tupleDoc, { withLeaf: { 1: { grade: 'NOPE' } } }).map((e) => e.field)).toEqual(['withLeaf.1.grade']);
  });

  test('depth 2 and 3: a tuple inside an object, and inside two', () => {
    expect(create(tupleDoc, { holds: { pair: ['NOPE', 1] } }).map((e) => e.field)).toEqual(['holds.pair[0]']);
    expect(update(tupleDoc, { holds: { pair: ['NOPE', 1] } }).map((e) => e.field)).toEqual(['holds.pair[0]']);
    expect(create(tupleDoc, { deepHolds: { holder: { pair: ['NOPE', 1] } } }).map((e) => e.field)).toEqual([
      'deepHolds.holder.pair[0]',
    ]);
    expect(update(tupleDoc, { deepHolds: { holder: { pair: { 0: 'NOPE' } } } }).map((e) => e.field)).toEqual([
      'deepHolds.holder.pair.0',
    ]);
  });

  test('array of tuples: names the index', () => {
    const data = {
      pairs: [
        ['LOW', 1],
        ['NOPE', 2],
      ],
    };
    expect(create(tupleDoc, data).map((e) => e.field)).toEqual(['pairs[1][0]']);
    expect(update(tupleDoc, data).map((e) => e.field)).toEqual(['pairs[1][0]']);
    expect(create(tupleDoc, { nameds: [{ grade: 'NOPE', n: 1 }] }).map((e) => e.field)).toEqual(['nameds[0].grade']);
  });

  test('array of tuples: push a single tuple, push a list, set', () => {
    expect(update(tupleDoc, { pairs: { push: ['NOPE', 1] } }).map((e) => e.field)).toEqual(['pairs.push[0][0]']);
    expect(
      update(tupleDoc, {
        pairs: {
          push: [
            ['LOW', 1],
            ['NOPE', 1],
          ],
        },
      }).map((e) => e.field),
    ).toEqual(['pairs.push[1][0]']);
    expect(update(tupleDoc, { pairs: { set: [['NOPE', 1]] } }).map((e) => e.field)).toEqual(['pairs[0][0]']);
    expect(update(tupleDoc, { pairs: { push: ['LOW', 1] } })).toEqual([]);
    expect(
      update(tupleDoc, {
        pairs: {
          push: [
            ['LOW', 1],
            ['HIGH', 2],
          ],
        },
      }),
    ).toEqual([]);
  });

  test('a { set } wrapper on a tuple element checks its contents', () => {
    expect(update(tupleDoc, { outer: { 0: { set: ['NOPE', 1] } } }).map((e) => e.field)).toEqual(['outer.0[0]']);
    expect(update(tupleDoc, { outer: { 0: { set: ['LOW', 1] } } })).toEqual([]);
  });

  test('NONE and an absent element pass', () => {
    expect(update(tupleDoc, { pair: NONE })).toEqual([]);
    expect(update(tupleDoc, { pair: { 0: undefined } })).toEqual([]);
  });

  test('an unknown element key still reports as unknown, not as a membership failure', () => {
    expect(update(tupleDoc, { pair: { 5: 'NOPE' } }).map((e) => e.message)).toEqual([
      "Unknown field 'pair.5' on model TupleDoc — check the field name against the schema",
    ]);
  });
});

describe('validateFieldValue signature', () => {
  const literalInfo = {
    literalName: 'Grade',
    isEnum: true,
    variants: [
      { kind: 'string' as const, value: 'LOW' },
      { kind: 'string' as const, value: 'HIGH' },
    ],
  };

  test('takes the rules as one options object', () => {
    expect(validateFieldValue('g', 'LOW', { type: 'literal', isRequired: true, literalInfo })).toBeNull();
    expect(validateFieldValue('g', 'MID', { type: 'literal', isRequired: true, literalInfo })?.message).toBe(
      "g must be one of: 'LOW', 'HIGH' (received 'MID')",
    );
  });

  test('has no ninth positional parameter', () => {
    expect(validateFieldValue.length).toBe(3);
  });
});

describe('nested literal metadata', () => {
  // The validator reads variants from the copy embedded in the model, so the copy must be resolved
  test('variants are filled in on object sub-fields and tuple elements at every depth', () => {
    const leaf = objectDoc.fields.find((f) => f.name === 'top')!.objectInfo!.fields.find((f) => f.name === 'mid')!;
    const grade = leaf
      .objectInfo!.fields.find((f) => f.name === 'leaf')!
      .objectInfo!.fields.find((f) => f.name === 'grade')!;
    expect(grade.literalInfo!.variants).toHaveLength(3);
    expect(grade.literalInfo!.isEnum).toBe(true);

    const outer = tupleDoc.fields.find((f) => f.name === 'outer')!.tupleInfo!;
    const inner = outer.elements[0]!.tupleInfo!;
    expect(inner.elements[0]!.literalInfo!.variants).toHaveLength(3);
  });
});
