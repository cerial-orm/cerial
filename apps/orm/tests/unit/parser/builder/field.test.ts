import { describe, expect, test } from 'bun:test';
import { f, fieldNode } from '../../../../src/parser/builder';
import type { Handle } from '../../../../src/parser/builder';
import { FIELD_TYPE_REGISTRY } from '../../../../src/parser/registry';
import { parse } from '../../../../src/parser/parser';
import type { ASTField } from '../../../../src/types';
import { withoutPosition } from './helpers';

/** The node `parse()` gives for one field line */
function parsed(line: string): ASTField {
  const { ast, errors } = parse(`model M {\n  x ${line}\n}\n`);
  expect(errors).toHaveLength(0);

  return ast.models[0]!.fields[0]!;
}

function expectSame(built: ASTField, line: string): void {
  expect(withoutPosition(built)).toEqual(withoutPosition(parsed(line)));
}

const SIMPLE = [...FIELD_TYPE_REGISTRY.values()].filter((e) => e.fieldType !== 'record' && e.fieldType !== 'relation');

describe('field factories', () => {
  test('there is one factory per registry field type, and f.relation comes from the relation helper', () => {
    const expected = [...SIMPLE.map((e) => e.fieldType), 'record', 'object', 'relation', 'reverse'].sort();

    expect(Object.keys(f).sort()).toEqual(expected);
    // 13 non-relation types besides Record, plus record, the object reference and the two relation helpers
    expect(expected).toHaveLength(17);
  });

  test.each(SIMPLE.map((e) => [e.name, e.fieldType] as const))(
    '%s matches the parser, plain and array',
    (name, type) => {
      const make = f[type as keyof typeof f] as () => object;

      expectSame(fieldNode(make(), 'x'), name);
      expectSame(fieldNode((make() as { array(): object }).array(), 'x'), `${name}[]`);
    },
  );

  test.each(SIMPLE.filter((e) => e.fieldType !== 'any').map((e) => [e.name, e.fieldType] as const))(
    '%s matches the parser when optional',
    (name, type) => {
      const make = f[type as keyof typeof f] as () => { optional(): object };

      expectSame(fieldNode(make().optional(), 'x'), `${name}?`);
    },
  );

  test('the node carries the name it is given', () => {
    expect(fieldNode(f.string(), 'title').name).toBe('title');
  });

  test('a value that is not a field builder is refused', () => {
    expect(() => fieldNode({}, 'x')).toThrow('Not a field builder');
  });
});

describe('omit convention', () => {
  test('f.string() has no isArray key at all, and .array() sets it true', () => {
    const plain = fieldNode(f.string(), 'x');

    expect('isArray' in plain).toBe(false);
    expect('isPrivate' in plain).toBe(false);
    expect('isNullable' in plain).toBe(false);
    expect(fieldNode(f.string().array(), 'x').isArray).toBe(true);
  });

  test('decorators is always present, even when empty', () => {
    expect(fieldNode(f.string(), 'x').decorators).toEqual([]);
  });
});

describe('chain methods', () => {
  test('optional, array and private match the parser in any order', () => {
    expectSame(fieldNode(f.string().optional().private(), 'x'), 'String? !!private');
    expectSame(fieldNode(f.string().private().array(), 'x'), 'String[] !!private');
    expectSame(fieldNode(f.int().array().private().unique(), 'x'), 'Int[] @unique !!private');
  });

  test('a builder is immutable: a chain can be reused', () => {
    const base = f.string();
    const withArray = base.array();

    expect('isArray' in fieldNode(base, 'x')).toBe(false);
    expect(fieldNode(withArray, 'x').isArray).toBe(true);
    expect(fieldNode(base.optional(), 'x').isOptional).toBe(true);
    expect(fieldNode(base, 'x').isOptional).toBe(false);
  });

  test('.nullable() pushes a nullable decorator and createField derives the flag', () => {
    const node = fieldNode(f.int().optional().nullable(), 'x');

    expect(node.decorators.map((d) => d.type)).toEqual(['nullable']);
    expect(node.isNullable).toBe(true);
    expectSame(node, 'Int? @nullable');
  });

  test('decorators keep call order and match the parser', () => {
    expectSame(fieldNode(f.string().unique().nullable().readonly(), 'x'), 'String @unique @nullable @readonly');
    expectSame(fieldNode(f.string().default('hi'), 'x'), "String @default('hi')");
    expectSame(fieldNode(f.int().default(3), 'x'), 'Int @default(3)');
    expectSame(fieldNode(f.float().default(1.5), 'x'), 'Float @default(1.5)');
    expectSame(fieldNode(f.bool().default(true), 'x'), 'Bool @default(true)');
    expectSame(fieldNode(f.duration().default('1h30m'), 'x'), 'Duration @default(1h30m)');
    expectSame(fieldNode(f.date().createdAt(), 'x'), 'Date @createdAt');
    expectSame(fieldNode(f.string().array().sort('desc'), 'x'), 'String[] @sort(desc)');
    expectSame(fieldNode(f.string().array().distinct(), 'x'), 'String[] @distinct');
  });
});

describe('record', () => {
  test.each([
    ['Record', []],
    ['Record(int)', ['int']],
    ['Record(string)', ['string']],
    ['Record(string, int)', ['string', 'int']],
    ['Record(uuid, int)', ['uuid', 'int']],
  ] as const)('%s matches the parser, plain and array', (line, ids) => {
    const make = () => f.record(...ids);

    expectSame(fieldNode(make(), 'x'), line);
    expectSame(fieldNode(make().array(), 'x'), `${line}[]`);
    expectSame(fieldNode(make().optional(), 'x'), `${line}?`);
  });

  test('plain Record has no recordIdTypes key', () => {
    expect('recordIdTypes' in fieldNode(f.record(), 'x')).toBe(false);
  });

  test('an id type is reduced from a handle, a thunk or a name, and only when materialised', () => {
    const Pair: Handle<'Pair'> = { name: 'Pair' };
    let calls = 0;
    const builder = f.record(() => {
      calls++;

      return Pair;
    });

    expect(calls).toBe(0);
    expect(fieldNode(builder, 'x').recordIdTypes).toEqual(['Pair']);
    expect(fieldNode(f.record(Pair), 'x').recordIdTypes).toEqual(['Pair']);
    expect(fieldNode(f.record('Pair'), 'x').recordIdTypes).toEqual(['Pair']);
  });
});

describe('geometry', () => {
  const MARKERS = [
    ['point', '@point'],
    ['line', '@line'],
    ['polygon', '@polygon'],
    ['multipoint', '@multipoint'],
    ['multiline', '@multiline'],
    ['multipolygon', '@multipolygon'],
    ['geoCollection', '@geoCollection'],
  ] as const;

  test.each(MARKERS)('.%s() matches the parser', (method, decorator) => {
    expectSame(fieldNode(f.geometry()[method](), 'x'), `Geometry ${decorator}`);
  });

  test('several markers chain and keep call order', () => {
    expectSame(fieldNode(f.geometry().point().line(), 'x'), 'Geometry @point @line');
  });

  test('@collection is not a method', () => {
    expect('collection' in f.geometry()).toBe(false);
  });
});

describe('any', () => {
  test('matches the parser, plain, array and with decorators that apply', () => {
    expectSame(fieldNode(f.any(), 'x'), 'Any');
    expectSame(fieldNode(f.any().array(), 'x'), 'Any[]');
    expectSame(fieldNode(f.any().private(), 'x'), 'Any !!private');
  });

  test('optional and nullable are absent from the type and the runtime object', () => {
    // @ts-expect-error Any? is blocked: TYPE any already accepts NONE
    expect(f.any().optional).toBeUndefined();
    // @ts-expect-error Any @nullable is blocked: TYPE any already accepts null
    expect(f.any().nullable).toBeUndefined();
    // @ts-expect-error the restriction survives chaining
    expect(f.any().array().nullable).toBeUndefined();
  });

  test('other types keep optional and nullable', () => {
    expect(typeof f.string().optional).toBe('function');
    expect(typeof f.string().nullable).toBe('function');
  });
});

describe('exclusivity survives the field chain', () => {
  test('a decorator excluded by an earlier call is absent from the type', () => {
    // @ts-expect-error @nullable excludes @id
    f.string().nullable().id;
    // @ts-expect-error @unique excludes @index
    f.string().unique().index;
    // @ts-expect-error @default excludes @createdAt, still after array()
    f.date().default('x').array().createdAt;
    expect(typeof f.string().unique().readonly).toBe('function');
  });

  test('relation-only and no-public methods are not on a plain field', () => {
    // @ts-expect-error @field belongs to f.relation
    expect(f.string().field).toBeUndefined();
    // @ts-expect-error @model has no public method
    expect(f.string().model).toBeUndefined();
  });
});
