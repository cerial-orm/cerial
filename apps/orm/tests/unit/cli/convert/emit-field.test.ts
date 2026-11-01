import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chainOrder, emitElement, emitField, emitVariant } from '../../../../src/cli/convert/emit-ts/field';
import type { EmitContext } from '../../../../src/cli/convert/emit-ts/field';
import { quote } from '../../../../src/cli/convert/emit-ts/strings';
import { CerialGenerationError } from '../../../../src/errors';
import {
  LITERAL_VARIANT_METHODS,
  chainEntries,
  fieldNode,
  isRelationBuilder,
  literalNode,
  relationNodes,
  tupleNode,
} from '../../../../src/parser/builder';
import { parse } from '../../../../src/parser/parser';
import { DECORATOR_REGISTRY, FIELD_TYPE_REGISTRY } from '../../../../src/parser/registry';
import type { DecoratorEntry, DecoratorName } from '../../../../src/parser/registry';
import { e, f, literal, tuple, variant } from '../../../../src/schema';
import type { ASTField, ASTLiteralVariant, ASTTupleElement } from '../../../../src/types';
import type { Element, VariantSpec } from '../../../../src/schema';
import { withoutPosition } from '../../parser/builder/helpers';

const CTX: EmitContext = { declaration: 'model M' };

const DECLARATIONS = [
  'object Obj {\n  a String\n}',
  'tuple Tup {\n  Int\n}',
  "literal Lit { 'a', 'b' }",
  'enum Color { red, green }',
  'model U {\n  id Record @id\n}',
].join('\n');

function parseWith(body: string) {
  const { ast, errors } = parse(`${DECLARATIONS}\n${body}\n`);
  expect(errors).toEqual([]);

  return ast;
}

function parsedField(line: string): ASTField {
  return parseWith(`model M {\n  x ${line}\n}`).models.find((m) => m.name === 'M')!.fields[0]!;
}

function parsedElements(lines: string): ASTTupleElement[] {
  return parseWith(`tuple T {\n  ${lines}\n}`).tuples.find((t) => t.name === 'T')!.elements;
}

/** Runs an emitted expression against the real builder, exactly as a generated module would. */
function run(expression: string): unknown {
  return new Function('f', 'e', 'variant', `return (${expression});`)(f, e, variant);
}

function runBuilder(expression: string): object {
  return run(expression) as object;
}

/** The node a model would hold for the builder; a forward relation bound to `target` leaves just the relation. */
function nodeOf(builder: object): ASTField {
  if (isRelationBuilder(builder)) return relationNodes(builder, 'x', new Set(['target'])).at(-1)!;

  return fieldNode(builder, 'x');
}

function roundTrip(line: string, ctx: EmitContext = CTX): string {
  const source = parsedField(line);
  const expression = emitField(source, ctx);
  expect(withoutPosition(nodeOf(runBuilder(expression)))).toEqual(withoutPosition(source));

  return expression;
}

function expectRefused(act: () => unknown, ...mentions: string[]): void {
  let thrown: unknown;
  try {
    act();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(CerialGenerationError);
  for (const text of mentions) expect((thrown as Error).message).toContain(text);
}

const FIELD_DECORATORS = [...DECORATOR_REGISTRY.values()].filter((entry) => !entry.name.startsWith('@@'));

const LITERAL_SAMPLES = [
  'true',
  'false',
  'null',
  '5',
  '-3',
  '1.5',
  '-0.25',
  '"text"',
  "'single'",
  '"it\'s"',
  '\'say "hi"\'',
  "'a\\b'",
  '""',
  '1h30m',
];

/** Every spelling of one decorator, from its own argument shape. */
function samples(entry: DecoratorEntry): string[] {
  const { args, name } = entry;
  switch (args.kind) {
    case 'none':
      return [name];
    case 'choice':
      return [...(args.optional ? [name] : []), ...args.choices.map((choice) => `${name}(${choice})`)];
    case 'name':
      return [`${name}(target)`];
    case 'literal':
      return LITERAL_SAMPLES.map((value) => `${name}(${value})`);
    case 'nameAndFields':
      return [];
  }
}

/** The field line that carries one decorator; the relation decorators need a relation around them. */
function fieldLineFor(sample: string): string {
  if (sample.startsWith('@field')) return `Relation ${sample} @model(U)`;
  if (sample.startsWith('@model')) return 'Relation @model(U)';

  return `String ${sample}`;
}

/** Built from code points, because the formatter rewrites these escapes into raw separators. */
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

describe('quote', () => {
  const VALUES = [
    'plain',
    '',
    'back\\slash',
    "it's",
    'say "hi"',
    `both ' and "`,
    'a\nb',
    'a\r\nb',
    'tab\there',
    `line${LS}sep`,
    `para${PS}sep`,
    'back`tick',
    `\${not.interpolated}`,
    '`' + '$' + '{process.exit(1)}`',
    '\\',
    "\\'",
    '\0',
    '\u007f\u0085',
    'emoji \u{1f600}',
    'lone \ud800 surrogate',
    "'); process.exit(1); //",
    "'; process.exit(1); '",
    "\\'); process.exit(1); //",
    `''"); process.exit(1); //`,
    `\\''\\"); process.exit(1); //`,
  ];

  /** Evaluates `String(<quoted>)` with a `process` that records any call, so a run is visible. */
  function evaluate(source: string): { value: unknown; exits: number } {
    let exits = 0;
    const fake = {
      exit: () => {
        exits += 1;
      },
    };
    const value = new Function('process', `const text = String(${source}); return text;`)(fake) as unknown;

    return { value, exits };
  }

  test.each(VALUES)('%j comes back as the same string with nothing run', (value) => {
    const result = evaluate(quote(value));

    expect(result.value).toBe(value);
    expect(result.exits).toBe(0);
  });

  test('the injection payload survives a UTF-8 file round trip', () => {
    for (const value of VALUES) {
      const written = Buffer.from(quote(value), 'utf8').toString('utf8');

      expect(evaluate(written).value).toBe(value);
    }
  });

  test('every code unit below U+0100 and the separators come back unchanged', () => {
    const all = Array.from({ length: 0x100 }, (_, i) => String.fromCharCode(i)).join('');

    expect(evaluate(quote(all)).value).toBe(all);
  });

  test('the output holds no raw newline, separator or control character', () => {
    expect(quote(VALUES.join('')).search(/[\p{Cc}\p{Zl}\p{Zp}]/u)).toBe(-1);
  });

  test('naive interpolation runs the payload, which the evaluation above would catch', () => {
    const payload = "'); process.exit(1); //";

    expect(evaluate(`'${payload}`).exits).toBe(1);
  });

  test('the quote kind follows the formatter', () => {
    expect(quote('ab')).toBe(`'ab'`);
    expect(quote('a"b')).toBe(`'a"b'`);
    expect(quote("a'b")).toBe(`"a'b"`);
    expect(quote(`a'b"c`)).toBe(`'a\\'b"c'`);
    expect(quote(`a''b"c`)).toBe(`"a''b\\"c"`);
  });
});

describe('field types', () => {
  const SIMPLE = [...FIELD_TYPE_REGISTRY.values()].filter((entry) => !['record', 'relation'].includes(entry.fieldType));

  test.each(SIMPLE.map((entry) => [entry.name, entry.fieldType] as const))('%s, plain and array', (name, type) => {
    expect(roundTrip(name)).toBe(`f.${type}()`);
    expect(roundTrip(`${name}[]`)).toBe(`f.${type}().array()`);
  });

  test.each(SIMPLE.filter((entry) => entry.fieldType !== 'any').map((entry) => [entry.name, entry.fieldType] as const))(
    '%s, optional',
    (name, type) => {
      expect(roundTrip(`${name}?`)).toBe(`f.${type}().optional()`);
    },
  );

  test('Record takes its id types as the factory arguments', () => {
    expect(roundTrip('Record')).toBe('f.record()');
    expect(roundTrip('Record(int)')).toBe("f.record('int')");
    expect(roundTrip('Record(string, int)')).toBe("f.record('string', 'int')");
    expect(roundTrip('Record(uuid, number)?')).toBe("f.record('uuid', 'number').optional()");
    expect(roundTrip('Record(Tup)')).toBe("f.record('Tup')");
    expect(roundTrip('Record(int)[]')).toBe("f.record('int').array()");
  });

  test('an object, tuple, literal and enum field names its declaration', () => {
    expect(roundTrip('Obj')).toBe("f.object('Obj')");
    expect(roundTrip('Obj?')).toBe("f.object('Obj').optional()");
    expect(roundTrip('Obj[]')).toBe("f.object('Obj').array()");
    expect(roundTrip('Tup')).toBe("f.tuple('Tup')");
    expect(roundTrip('Tup[]')).toBe("f.tuple('Tup').array()");
    expect(roundTrip('Lit')).toBe("f.literal('Lit')");
    expect(roundTrip('Lit @nullable')).toBe("f.literal('Lit').nullable()");
    expect(roundTrip('Color?')).toBe("f.literal('Color').optional()");
  });

  test('every registry field type is covered by a case above', () => {
    expect(FIELD_TYPE_REGISTRY.size).toBe(15);
    for (const entry of FIELD_TYPE_REGISTRY.values()) {
      const line = entry.fieldType === 'relation' ? 'Relation @field(target) @model(U)' : entry.name;

      expect(emitField(parsedField(line), CTX)).toContain(`f.${entry.fieldType}(`);
    }
  });

  test('the reference callback writes every reference, models included', () => {
    const ctx: EmitContext = { ...CTX, reference: (kind, name) => `${kind}:${name}` };

    expect(emitField(parsedField('Obj'), ctx)).toBe('f.object(object:Obj)');
    expect(emitField(parsedField('Tup'), ctx)).toBe('f.tuple(tuple:Tup)');
    expect(emitField(parsedField('Lit'), ctx)).toBe('f.literal(literal:Lit)');
    expect(emitField(parsedField('Relation @field(target) @model(U)'), ctx)).toBe(
      "f.relation(model:U).field('target')",
    );
  });
});

describe('modifiers', () => {
  test('private follows every other call', () => {
    expect(roundTrip('String? !!private')).toBe('f.string().optional().private()');
    expect(roundTrip('String[] @distinct !!private')).toBe('f.string().array().distinct().private()');
  });

  test('absent flags write nothing', () => {
    expect(roundTrip('String')).toBe('f.string()');
  });

  test('optional and array come before the decorators and a nullable one stays in order', () => {
    expect(roundTrip('Int? @nullable @unique')).toBe('f.int().optional().nullable().unique()');
  });
});

describe('decorators', () => {
  test('the registry holds 28 field decorators and two directives', () => {
    expect(FIELD_DECORATORS).toHaveLength(28);
    expect(DECORATOR_REGISTRY.size).toBe(30);
  });

  describe.each(FIELD_DECORATORS.map((entry) => [entry.name, entry] as const))('%s', (_name, entry) => {
    const spellings = samples(entry);

    test('has at least one spelling to test', () => {
      expect(spellings.length).toBeGreaterThan(0);
    });

    test.each(spellings)('%s rebuilds the parsed field', (sample) => {
      roundTrip(fieldLineFor(sample));
    });

    test('is written as a method named by its table route', () => {
      const [sample] = spellings;
      const expression = emitField(parsedField(fieldLineFor(sample!)), CTX);
      const method = entry.name.slice(1);

      if (method === 'model') expect(expression).toBe("f.reverse('U')");
      else expect(expression).toContain(`.${method}(`);
    });
  });

  test('a choice decorator prefers the shortest spelling and then the first choice', () => {
    expect(roundTrip('Int[] @sort')).toBe('f.int().array().sort()');
    expect(roundTrip('Int[] @sort(asc)')).toBe('f.int().array().sort()');
    expect(roundTrip('Int[] @sort(true)')).toBe('f.int().array().sort()');
    expect(roundTrip('Int[] @sort(desc)')).toBe("f.int().array().sort('desc')");
    expect(roundTrip('Int[] @sort(false)')).toBe("f.int().array().sort('desc')");
  });

  test('a default is written as the value the parser read, quotes and all', () => {
    expect(roundTrip('String @default("it\'s")')).toBe(`f.string().default("it's")`);
    expect(roundTrip('String @default(\'say "hi"\')')).toBe(`f.string().default('say "hi"')`);
    expect(roundTrip('Duration @default(1h30m)')).toBe("f.duration().default('1h30m')");
    expect(roundTrip('Int @default(-3)')).toBe('f.int().default(-3)');
    expect(roundTrip('Float @default(1.5)')).toBe('f.float().default(1.5)');
    expect(roundTrip('Bool @default(false)')).toBe('f.bool().default(false)');
    expect(roundTrip('String @nullable @default(null)')).toBe('f.string().nullable().default(null)');
  });

  test('a hostile default is a string and runs nothing', () => {
    const source = parsedField('String');
    const payload = "'); process.exit(1); //";
    const hostile: ASTField = {
      ...source,
      decorators: [{ ...parsedField('String @default(1)').decorators[0]!, value: payload }],
    };
    const expression = emitField(hostile, CTX);

    expect(withoutPosition(nodeOf(runBuilder(expression)))).toEqual(withoutPosition(hostile));
    expect(expression).toBe(`f.string().default("'); process.exit(1); //")`);
  });

  test('several decorators keep their order when it type-checks', () => {
    expect(roundTrip('String @unique @readonly @default("a")')).toBe("f.string().unique().readonly().default('a')");
  });

  test('a decorator the registry does not know is refused with its name', () => {
    const source = parsedField('String @unique');
    // @ts-expect-error a decorator outside the union stands for one the registry does not know
    const unknown: ASTField = { ...source, decorators: [{ ...source.decorators[0]!, type: 'bogus' }] };

    expectRefused(() => emitField(unknown, CTX), 'model M', "field 'x'", '@bogus');
  });

  test('a value the method cannot take is refused rather than approximated', () => {
    const base = parsedField('String @default(1)');
    const withValue = (value: unknown): ASTField => ({ ...base, decorators: [{ ...base.decorators[0]!, value }] });

    expectRefused(() => emitField(withValue('two\nlines'), CTX), '@default', "field 'x'");
    expectRefused(() => emitField(withValue(1e21), CTX), '@default');
    expectRefused(() => emitField(withValue(Number.NaN), CTX), '@default');
    expectRefused(() => emitField(withValue({ nested: true }), CTX), '@default');
    expectRefused(() => emitField(withValue(-0), CTX), '@default');
  });

  test('a value outside a choice is refused', () => {
    const base = parsedField('String? @field(a) @model(U) @onDelete(Cascade)'.replace('String', 'Relation'));
    const bad: ASTField = {
      ...base,
      decorators: base.decorators.map((d) => (d.type === 'onDelete' ? { ...d, value: 'Explode' } : d)),
    };

    expectRefused(() => emitField(bad, CTX), '@onDelete');
  });

  test('a name decorator whose value is not a plain name is refused', () => {
    const base = parsedField('String @key(k)');
    const bad: ASTField = { ...base, decorators: [{ ...base.decorators[0]!, value: 'two words' }] };

    expectRefused(() => emitField(bad, CTX), '@key');
  });

  test('a zero-argument decorator carrying a value is refused', () => {
    const base = parsedField('String @unique');
    const bad: ASTField = { ...base, decorators: [{ ...base.decorators[0]!, value: 'x' }] };

    expectRefused(() => emitField(bad, CTX), '@unique');
  });
});

describe('chain order', () => {
  const item = (name: DecoratorName, excludes: DecoratorName[] = []) => ({ id: name, entry: { name, excludes } });

  test('an order the types allow is left alone', () => {
    const items = [item('@flexible'), item('@index'), item('@set')];

    expect(chainOrder(items)).toEqual(items);
  });

  test('a decorator that would remove a later one moves after it, and nothing is lost', () => {
    // @a removes @b once chained, so @b has to come first
    const a = item('@unique', ['@index']);
    const b = item('@index');
    const c = item('@set');
    const ordered = chainOrder([a, b, c])!;

    expect(ordered.map((i) => i.id)).toEqual(['@index', '@unique', '@set']);
    expect(ordered).toHaveLength(3);
    expect(new Set(ordered)).toEqual(new Set([a, b, c]));
  });

  test('two decorators that exclude each other have no order', () => {
    expect(chainOrder([item('@unique', ['@index']), item('@index', ['@unique'])])).toBeNull();
  });

  test('a decorator never excludes itself, so a repeated one stays', () => {
    const items = [item('@flexible'), item('@flexible')];

    expect(chainOrder(items)).toEqual(items);
  });

  const CHAINED = chainEntries('modelField', 'plain');

  test('the registry has no one-sided exclusion, so no source order ever needs moving', () => {
    for (const a of DECORATOR_REGISTRY.values()) {
      for (const name of a.excludes) expect(DECORATOR_REGISTRY.get(name)!.excludes).toContain(a.name);
    }
  });

  test('over every pair, a chain is written exactly when neither decorator excludes the other', () => {
    const one = (decorator: DecoratorEntry) => samples(decorator)[0]!;
    let written = 0;
    let refused = 0;
    for (const a of CHAINED) {
      for (const b of CHAINED) {
        const line = `String ${one(a)} ${one(b)}`;
        const field = parsedField(line);
        const conflict = a.excludes.includes(b.name) || b.excludes.includes(a.name);
        if (conflict) {
          expectRefused(() => emitField(field, CTX), a.name, b.name);
          refused += 1;
        } else {
          expect(withoutPosition(nodeOf(runBuilder(emitField(field, CTX))))).toEqual(withoutPosition(field));
          written += 1;
        }
      }
    }

    expect(written).toBeGreaterThan(0);
    expect(refused).toBeGreaterThan(0);
  });
});

describe('relations', () => {
  test('a forward relation names its foreign key', () => {
    expect(roundTrip('Relation @field(target) @model(U)')).toBe("f.relation('U').field('target')");
  });

  test('optional comes before onDelete, as the builder types need', () => {
    expect(roundTrip('Relation? @field(target) @model(U) @onDelete(SetNull)')).toBe(
      "f.relation('U').optional().field('target').onDelete('SetNull')",
    );
  });

  test('an array and a private relation', () => {
    expect(roundTrip('Relation[] @field(target) @model(U)')).toBe("f.relation('U').array().field('target')");
    expect(roundTrip('Relation @field(target) @model(U) !!private')).toBe("f.relation('U').field('target').private()");
  });

  test('a relation without a foreign key is the reverse side', () => {
    expect(roundTrip('Relation @model(U)')).toBe("f.reverse('U')");
    expect(roundTrip('Relation[] @model(U) @key(k)')).toBe("f.reverse('U').array().key('k')");
    expect(roundTrip('Relation? @model(U)')).toBe("f.reverse('U').optional()");
  });

  test('a derived foreign key writes no .field call and is still a forward relation', () => {
    const source = parsedField('Relation @field(xId) @model(U)');
    const expression = emitField(source, { ...CTX, derivedForeignKey: true });

    expect(expression).toBe("f.relation('U')");
    expect(withoutPosition(relationNodes(runBuilder(expression), 'x').at(-1))).toEqual(withoutPosition(source));
  });

  test('without the derived flag the same relation names its key', () => {
    expect(emitField(parsedField('Relation @field(xId) @model(U)'), CTX)).toBe("f.relation('U').field('xId')");
  });

  test('a relation with no target is refused', () => {
    const source = parsedField('Relation @field(target) @model(U)');
    const bare: ASTField = { ...source, decorators: source.decorators.filter((d) => d.type !== 'model') };

    expectRefused(() => emitField(bare, CTX), 'model M', "field 'x'", 'f.relation');
  });

  test('a relation decorator on a plain field is refused', () => {
    const base = parsedField('String @unique');
    const model: ASTField = { ...base, decorators: parsedField('Relation @model(U)').decorators };

    expectRefused(() => emitField(model, CTX), '@model');
  });
});

describe('refusals name the construct and the declaration', () => {
  test('a type with no field factory', () => {
    // @ts-expect-error a type outside the union stands for a construct the table has no route for
    const bogus: ASTField = { ...parsedField('String'), type: 'bogus' };

    expectRefused(() => emitField(bogus, { declaration: 'object Address' }), 'object Address', "field 'x'", 'bogus');
  });

  test('a reference type with no name', () => {
    const source = parsedField('Obj');
    const nameless: ASTField = { ...source, objectName: undefined };

    expectRefused(() => emitField(nameless, CTX), 'f.object', "field 'x'");
  });

  test('a name that belongs to another kind of declaration', () => {
    const source = parsedField('Obj');
    const crossed: ASTField = { ...source, objectName: undefined, tupleName: 'Tup' };

    expectRefused(() => emitField(crossed, CTX), 'tuple name');
  });

  test('a field naming two declarations', () => {
    const doubled: ASTField = { ...parsedField('Obj'), tupleName: 'Tup' };

    expectRefused(() => emitField(doubled, CTX), 'more than one');
  });

  test('Any takes neither ? nor @nullable, because the builder has no such method', () => {
    expectRefused(() => emitField({ ...parsedField('Any'), isOptional: true }, CTX), 'optional');
    expectRefused(() => emitField(parsedField('Any @nullable'), CTX), '@nullable');
  });

  test('an object and a tuple field take no @nullable', () => {
    expectRefused(() => emitField(parsedField('Obj @nullable'), CTX), '@nullable');
    expectRefused(() => emitField(parsedField('Tup @nullable'), CTX), '@nullable');
  });

  test('a directive is not a field decorator', () => {
    const source = parsedField('String @unique');
    // @ts-expect-error a decorator outside the union stands for one the registry does not know
    const directive: ASTField = { ...source, decorators: [{ ...source.decorators[0]!, type: 'bogus' }] };

    expectRefused(() => emitField(directive, CTX), '@bogus');
  });

  test.each([
    ['@id', '@nullable'],
    ['@default(1)', '@createdAt'],
    ['@sort', '@set'],
  ])('%s with %s have no chain order that type-checks', (first, second) => {
    expectRefused(
      () => emitField(parsedField(`Int[] ${first} ${second}`), CTX),
      'exclude one another',
      first.split('(')[0]!,
    );
  });
});

describe('tuple elements', () => {
  function elementsOf(expressions: string[], keyed?: string[]): ReturnType<typeof tupleNode>['elements'] {
    const built = run(`[${expressions.join(', ')}]`) as Element[];
    if (!keyed) return tupleNode(tuple('T', built)).elements;
    const record: Record<string, Element> = Object.fromEntries(keyed.map((key, i) => [key, built[i]!]));

    return tupleNode(tuple('T', record)).elements;
  }

  function emitAll(lines: string, ctx: EmitContext = { declaration: 'tuple T' }): string[] {
    return parsedElements(lines).map((element) => emitElement(element, ctx));
  }

  function check(lines: string, ctx?: EmitContext): string[] {
    const expressions = emitAll(lines, ctx);

    expect(withoutPosition(elementsOf(expressions))).toEqual(withoutPosition(parsedElements(lines)));

    return expressions;
  }

  test('positional elements of every plain type', () => {
    const types = [...FIELD_TYPE_REGISTRY.values()].filter(
      (entry) => !['record', 'relation'].includes(entry.fieldType),
    );
    const lines = types.map((entry) => entry.name).join(',\n  ');

    expect(check(lines)).toEqual(types.map((entry) => `e.${entry.fieldType}()`));
  });

  test('references: object, tuple, literal and enum', () => {
    expect(check('Obj,\n  Tup,\n  Lit,\n  Color')).toEqual([
      "e.object('Obj')",
      "e.tuple('Tup')",
      "e.literal('Lit')",
      "e.literal('Color')",
    ]);
  });

  test('a named element in the array form is named with .named()', () => {
    expect(check('lat Float,\n  Int,\n  tag String')).toEqual([
      "e.float().named('lat')",
      'e.int()',
      "e.string().named('tag')",
    ]);
  });

  test('a keyed element leaves the name to its key', () => {
    const lines = 'lat Float,\n  lng Float';
    const expressions = emitAll(lines, { declaration: 'tuple T', keyed: true });

    expect(expressions).toEqual(['e.float()', 'e.float()']);
    expect(withoutPosition(elementsOf(expressions, ['lat', 'lng']))).toEqual(withoutPosition(parsedElements(lines)));
  });

  test('every decorator an element takes, from its own target list', () => {
    const accepted = FIELD_DECORATORS.filter((entry) => entry.targets.includes('tupleElement'));

    expect(accepted.length).toBeGreaterThan(0);
    for (const entry of accepted) {
      for (const sample of samples(entry)) {
        const type = entry.name === '@nullable' ? 'Float' : 'Int';

        check(`${type} ${sample}`);
      }
    }
  });

  test('nullable, private and named follow the factory in that order', () => {
    expect(check('a Float @nullable !!private,\n  Int @default(5) @nullable')).toEqual([
      "e.float().nullable().private().named('a')",
      'e.int().default(5).nullable()',
    ]);
  });

  test('an element is refused where the builder has no route', () => {
    const [element] = parsedElements('Float');

    expectRefused(
      () => emitElement({ ...element!, isOptional: true }, { declaration: 'tuple T' }),
      'tuple T',
      'optional',
    );
    const object = parsedElements('Obj')[0]!;

    expectRefused(
      () => emitElement({ ...object, decorators: parsedField('Obj @nullable').decorators }, { declaration: 'tuple T' }),
      '@nullable',
    );
    expectRefused(
      () =>
        emitElement({ ...element!, decorators: parsedField('String @unique').decorators }, { declaration: 'tuple T' }),
      '@unique',
    );
  });

  test('a type with no element factory is refused', () => {
    const [element] = parsedElements('Float');

    expectRefused(() => emitElement({ ...element!, type: 'record' }, { declaration: 'tuple T' }), 'tuple T', 'record');
    expectRefused(() => emitElement({ ...element!, type: 'relation' }, { declaration: 'tuple T' }), 'relation');
  });

  test('a reference element with no name is refused', () => {
    const [element] = parsedElements('Obj');

    expectRefused(() => emitElement({ ...element!, objectName: undefined }, { declaration: 'tuple T' }), 'e.object');
  });
});

describe('literal variants', () => {
  const ALL = parseWith(
    "literal Big { 'a', 1, 1.5, true, String, Int, Float, Bool, Date, Tup, Obj, Lit, Color, 'it\\'s', -2, 0.5 }",
  ).literals.find((l) => l.name === 'Big')!;

  function rebuild(variants: ASTLiteralVariant[], ctx: EmitContext = { declaration: 'literal Big' }) {
    const expressions = variants.map((v) => emitVariant(v, ctx));
    const specs = run(`[${expressions.join(', ')}]`) as VariantSpec[];

    return { expressions, node: literalNode(literal('Big', specs)) };
  }

  test('every variant of the parsed literal rebuilds', () => {
    const { node } = rebuild(ALL.variants);

    expect(node.variants).toEqual(ALL.variants);
  });

  test('every kind in the table is exercised, each through its own route', () => {
    const kinds = new Set(ALL.variants.map((v) => v.kind));

    expect([...kinds].map(String).sort()).toEqual(Object.keys(LITERAL_VARIANT_METHODS).sort());
    expect(Object.keys(LITERAL_VARIANT_METHODS)).toHaveLength(8);
    for (const variantKind of ALL.variants) {
      const route = LITERAL_VARIANT_METHODS[variantKind.kind] as string;

      expect(emitVariant(variantKind, { declaration: 'literal Big' }).startsWith(`${route}(`)).toBe(true);
    }
  });

  test('written spellings', () => {
    const ctx: EmitContext = { declaration: 'literal Big' };

    expect(emitVariant({ kind: 'string', value: 'a' }, ctx)).toBe("variant.string('a')");
    expect(emitVariant({ kind: 'int', value: -2 }, ctx)).toBe('variant.int(-2)');
    expect(emitVariant({ kind: 'float', value: 0.5 }, ctx)).toBe('variant.float(0.5)');
    expect(emitVariant({ kind: 'bool', value: false }, ctx)).toBe('variant.bool(false)');
    expect(emitVariant({ kind: 'broadType', typeName: 'Date' }, ctx)).toBe("variant.broadType('Date')");
    expect(emitVariant({ kind: 'tupleRef', tupleName: 'Tup' }, ctx)).toBe("variant.tuple('Tup')");
    expect(emitVariant({ kind: 'objectRef', objectName: 'Obj' }, ctx)).toBe("variant.object('Obj')");
    expect(emitVariant({ kind: 'literalRef', literalName: 'Lit' }, ctx)).toBe("variant.literal('Lit')");
  });

  test('a string variant survives quotes, backslashes and separators', () => {
    const values = [
      "it's",
      'say "hi"',
      'a\\b',
      'x\ny',
      `p${LS}q`,
      `r${PS}s`,
      '`' + '$' + '{1}`',
      "'); process.exit(1); //",
    ];
    const { node } = rebuild(values.map((value) => ({ kind: 'string', value })));

    expect(node.variants).toEqual(values.map((value) => ({ kind: 'string', value })));
  });

  test('the reference callback writes the references', () => {
    const ctx: EmitContext = { declaration: 'literal Big', reference: (kind, name) => `${kind}:${name}` };

    expect(emitVariant({ kind: 'tupleRef', tupleName: 'Tup' }, ctx)).toBe('variant.tuple(tuple:Tup)');
    expect(emitVariant({ kind: 'literalRef', literalName: 'Lit' }, ctx)).toBe('variant.literal(literal:Lit)');
  });

  test('a number a variant factory would refuse is refused here, naming the declaration', () => {
    const ctx: EmitContext = { declaration: 'literal Big' };

    expectRefused(() => emitVariant({ kind: 'int', value: 1.5 }, ctx), 'literal Big', 'int');
    expectRefused(() => emitVariant({ kind: 'float', value: Number.NaN }, ctx), 'literal Big', 'float');
    expectRefused(() => emitVariant({ kind: 'float', value: Number.POSITIVE_INFINITY }, ctx), 'float');
  });

  test('a kind the table does not route is refused', () => {
    // @ts-expect-error a kind outside the union stands for a variant the builder has no factory for
    const unknown: ASTLiteralVariant = { kind: 'regex', value: 'x' };

    expectRefused(() => emitVariant(unknown, { declaration: 'literal Big' }), 'literal Big', 'regex');
  });
});

describe('the emitted chains type-check', () => {
  const SCHEMA = resolve(import.meta.dir, '../../../../src/schema/index.ts');
  const BASE = resolve(import.meta.dir, '../../../../tsconfig.json');
  const CWD = resolve(import.meta.dir, '../../../..');
  const TYPES = resolve(CWD, 'node_modules/@types');

  function expressions(): string[] {
    const out: string[] = [];
    for (const entry of FIELD_DECORATORS) {
      for (const sample of samples(entry)) out.push(emitField(parsedField(fieldLineFor(sample)), CTX));
    }
    for (const entry of FIELD_TYPE_REGISTRY.values()) {
      if (entry.fieldType !== 'record' && entry.fieldType !== 'relation') {
        out.push(emitField(parsedField(entry.name), CTX), emitField(parsedField(`${entry.name}[]`), CTX));
      }
    }
    for (const line of [
      'Int? @nullable @unique',
      'Record(int, string) @id',
      'Obj?',
      'Tup[]',
      'Lit @nullable',
      'Relation? @field(target) @model(U) @onDelete(SetNull)',
      'Relation[] @field(target) @model(U)',
      'Relation[] @model(U) @key(k)',
      'Relation? @model(U) !!private',
    ]) {
      out.push(emitField(parsedField(line), CTX));
    }

    return out;
  }

  function elementExpressions(): string[] {
    return parsedElements(
      'a Float @nullable !!private,\n  Int @default(5),\n  Obj,\n  Tup @nullable,\n  Lit @createdAt',
    ).map((el) => emitElement(el, { declaration: 'tuple T' }));
  }

  async function check(sources: Record<string, string>): Promise<string> {
    const dir = mkdtempSync(join(tmpdir(), 'cerial-emit-field-'));
    try {
      for (const [name, body] of Object.entries(sources)) {
        writeFileSync(join(dir, name), `import { e, f, variant } from '${SCHEMA.replace(/\.ts$/, '')}';\n${body}\n`);
      }
      writeFileSync(
        join(dir, 'tsconfig.json'),
        JSON.stringify({
          extends: BASE,
          compilerOptions: { noEmit: true, rootDir: '/', typeRoots: [TYPES], types: ['bun'] },
          include: Object.keys(sources),
        }),
      );
      const proc = Bun.spawn(['bunx', 'tsc', '-p', join(dir, 'tsconfig.json')], {
        cwd: CWD,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const output = await new Response(proc.stdout).text();
      await proc.exited;

      return output;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test('field and element chains pass tsc; the opposite order of optional and onDelete does not', async () => {
    const good = [...expressions(), ...elementExpressions()];
    const goodFile = `${good.map((expression, i) => `export const g${i} = ${expression};`).join('\n')}`;
    const badFile = "export const bad = f.relation('U').onDelete('SetNull').optional();";
    const output = await check({ 'good.ts': goodFile, 'bad.ts': badFile });

    const lines = output.split('\n').filter((line) => line.includes('error TS'));

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line.includes('bad.ts'))).toBe(true);
  }, 240000);
});
