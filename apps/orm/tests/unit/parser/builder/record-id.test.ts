import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { validateRecordIdTypes } from '../../../../src/cli/validators/record-type-validator';
import { validateRelationRules } from '../../../../src/cli/validators/relation-validator';
import { generateCreateType } from '../../../../src/generators/types/derived-generator';
import { e, f, fieldNode } from '../../../../src/parser/builder';
import type { Handle } from '../../../../src/parser/builder';
import { model, modelNode } from '../../../../src/parser/builder/model';
import { object } from '../../../../src/parser/builder/object';
import { tuple } from '../../../../src/parser/builder/tuple';
import { modelToMetadata } from '../../../../src/parser/model-metadata';
import { parse } from '../../../../src/parser/parser';
import type { ASTModel } from '../../../../src/types';
import { withoutPosition } from './helpers';

const CORPUS = readFileSync(new URL('../../../e2e/schemas/features/typed-ids.cerial', import.meta.url), 'utf8');

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function expectType<_T extends true>(): void {}

function parsedModel(name: string): ASTModel {
  const { ast, errors } = parse(CORPUS);
  expect(errors).toHaveLength(0);
  const found = ast.models.find((m) => m.name === name);
  if (!found) throw new Error(`No model ${name} in typed-ids.cerial`);

  return found;
}

const IdCoord = tuple('IdCoord', [e.float(), e.float()]);
const IdMetricKey = object('IdMetricKey', { service: f.string(), timestamp: f.int() });

// Every model of typed-ids.cerial that needs no relation helper, built in TypeScript
const BUILT = {
  IntIdModel: model('IntIdModel', { id: f.record('int').id(), name: f.string() }),
  NumberIdModel: model('NumberIdModel', { id: f.record('number').id(), label: f.string() }),
  StringIdModel: model('StringIdModel', { id: f.record('string').id(), payload: f.string() }),
  UuidIdModel: model('UuidIdModel', { id: f.record('uuid').id(), data: f.string() }),
  TupleIdModel: model('TupleIdModel', { id: f.record(IdCoord).id(), city: f.string() }),
  ObjectIdModel: model('ObjectIdModel', { id: f.record(IdMetricKey).id(), payload: f.float() }),
  UnionIdModel: model('UnionIdModel', { id: f.record('string', 'int').id(), label: f.string() }),
  IntUnionIdModel: model('IntUnionIdModel', { id: f.record('int', 'uuid').id(), label: f.string() }),
  StandaloneRefModel: model('StandaloneRefModel', {
    id: f.record().id(),
    externalRef: f.record('int'),
    externalRefs: f.record('int').array(),
    label: f.string(),
  }),
};

describe('record id arity', () => {
  test('f.record().id() has no recordIdTypes key', () => {
    const node = fieldNode(f.record().id(), 'id');

    expect('recordIdTypes' in node).toBe(false);
    expect(node.decorators.map((d) => d.type)).toEqual(['id']);
  });

  test.each([
    ['int', ['int']],
    ['number', ['number']],
    ['string', ['string']],
    ['uuid', ['uuid']],
  ] as const)('Record(%s) is a one-entry array', (_name, ids) => {
    expect(fieldNode(f.record(...ids).id(), 'id').recordIdTypes).toEqual([...ids]);
  });

  test.each([
    ['string', 'int'],
    ['uuid', 'int'],
    ['int', 'uuid'],
  ] as const)('Record(%s, %s) is two entries in declaration order', (a, b) => {
    expect(fieldNode(f.record(a, b).id(), 'id').recordIdTypes).toEqual([a, b]);
  });

  test('declaration order is kept, not sorted', () => {
    expect(fieldNode(f.record('int', 'string').id(), 'id').recordIdTypes).toEqual(['int', 'string']);
  });

  test.each(Object.keys(BUILT))('%s matches typed-ids.cerial', (name) => {
    const built = modelNode(BUILT[name as keyof typeof BUILT]);

    expect(withoutPosition(built)).toEqual(withoutPosition(parsedModel(name)));
  });

  test('the built tuple and object id types match the parsed twins', () => {
    const { ast } = parse(CORPUS);

    expect(ast.tuples.map((t) => t.name)).toContain('IdCoord');
    expect(ast.objects.map((o) => o.name)).toContain('IdMetricKey');
    expect(modelNode(BUILT.TupleIdModel).fields[0]!.recordIdTypes).toEqual(['IdCoord']);
    expect(modelNode(BUILT.ObjectIdModel).fields[0]!.recordIdTypes).toEqual(['IdMetricKey']);
  });

  test('a standalone typed Record that is not the id keeps its types and has no id decorator', () => {
    const [, standalone] = modelNode(BUILT.StandaloneRefModel).fields.slice(1);

    expect(standalone!.recordIdTypes).toEqual(['int']);
    expect(standalone!.isArray).toBe(true);
    expect(standalone!.decorators).toEqual([]);
  });

  test('Record(float) is refused by the schema validator that the type bars', () => {
    const { ast } = parse('model M {\n  id Record(float) @id\n}');
    const errors = validateRecordIdTypes(ast);

    expect(errors.length).toBeGreaterThan(0);
    // @ts-expect-error -- float is not a record id type; the schema refuses it
    f.record('float');
    // @ts-expect-error -- one refused name among valid ones is still refused
    f.record('string', 'bool');
  });
});

describe('union ids in create', () => {
  const CASES: readonly (readonly [string, boolean])[] = [
    ['UnionIdModel', false],
    ['IntUnionIdModel', false],
    ['StringIdModel', true],
    ['UuidIdModel', true],
    ['IntIdModel', false],
    ['StandaloneRefModel', true],
  ];

  test.each(CASES)('%s: the generated create type equals the .cerial twin', (name) => {
    const built = modelToMetadata(modelNode(BUILT[name as keyof typeof BUILT]));
    const parsed = modelToMetadata(parsedModel(name));

    expect(generateCreateType(built)).toBe(generateCreateType(parsed));
  });

  test.each(CASES)('%s: id is optional in create only when plain, string or uuid', (name, optional) => {
    const created = generateCreateType(modelToMetadata(modelNode(BUILT[name as keyof typeof BUILT])));

    expect(created.includes("'id'")).toBe(optional);
  });
});

describe('@id and the foreign-key path', () => {
  test('a typed id passes the record-type validator', () => {
    const { ast } = parse('');

    expect(validateRecordIdTypes({ ...ast, models: [modelNode(BUILT.UnionIdModel)] })).toEqual([]);
  });

  test('an explicit type on a foreign key is still refused, and .id() is not the foreign-key entry', () => {
    const { ast, errors } = parse(`model A {
  id Record(int) @id
}

model B {
  id Record @id
  aId Record(int)
  a Relation @field(aId) @model(A)
}`);

    expect(errors).toHaveLength(0);
    expect(validateRecordIdTypes(ast).some((x) => x.message.includes('FK field "aId"'))).toBe(true);
    expect(fieldNode(f.record('int'), 'aId').decorators).toEqual([]);
  });

  test('a plain @id passes validateRelationRules with no paired Relation', () => {
    const { ast } = parse('');
    const User = model('User', { id: f.record().id(), name: f.string() });

    expect(validateRelationRules({ ...ast, models: [modelNode(User)] })).toEqual([]);
  });
});

describe('the handle carries the id type', () => {
  const Pair = tuple('Pair', [e.int(), e.int()]);

  test('plain, single-type and union ids', () => {
    const Plain = model('Plain', { id: f.record().id() });
    const Single = model('Single', { id: f.record('int').id() });
    const Str = model('Str', { id: f.record('uuid').id() });
    const Union = model('Union', { id: f.record('string', 'int').id() });

    expectType<Equal<typeof Plain, Handle<'Plain', string>>>();
    expectType<Equal<typeof Single, Handle<'Single', number>>>();
    expectType<Equal<typeof Str, Handle<'Str', string>>>();
    expectType<Equal<typeof Union, Handle<'Union', string | number>>>();
    expect(Union.name).toBe('Union');
  });

  test('the id field is found by .id(), not by its key', () => {
    const Keyed = model('Keyed', { key: f.record('int').id(), id: f.record('string') });

    expectType<Equal<typeof Keyed, Handle<'Keyed', number>>>();
  });

  test('a tuple id is not narrowed to a primitive', () => {
    const ByPair = model('ByPair', { id: f.record(Pair).id() });
    const ByThunk = model('ByThunk', { id: f.record(() => Pair).id() });

    expectType<Equal<typeof ByPair, Handle<'ByPair', unknown>>>();
    expectType<Equal<typeof ByThunk, Handle<'ByThunk', unknown>>>();
  });

  test('a model without .id() has no id type', () => {
    const NoId = model('NoId', { id: f.record('int') });

    expectType<Equal<typeof NoId, Handle<'NoId', never>>>();
  });

  test('the id type survives the chain after .id()', () => {
    const Chained = model('Chained', { id: f.record('int').id().private() });

    expectType<Equal<typeof Chained, Handle<'Chained', number>>>();
  });

  test('a wrong id type is not assignable', () => {
    const Union = model('Union', { id: f.record('string', 'int').id() });
    // @ts-expect-error -- the handle carries string | number, not boolean
    const wrong: Handle<'Union', boolean> = Union;

    expect(wrong.name).toBe('Union');
  });
});
