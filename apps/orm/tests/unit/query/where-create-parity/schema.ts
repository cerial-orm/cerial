/**
 * The schema the parity oracle runs over, written out of one table so a field kind added to the table
 * reaches every shape (required, optional, nullable, array, set) and every path.
 */

import {
  convertEnums,
  convertLiterals,
  convertModels,
  convertObjects,
  convertTuples,
  createLiteralRegistry,
  createTupleRegistry,
  inferFKTypes,
  resolveObjectFields,
} from '../../../../src/generators/metadata';
import { createObjectRegistry, createRegistry } from '../../../../src/generators/metadata/registry-generator';
import { parse } from '../../../../src/parser/parser';
import type { ModelMetadata, ModelRegistry, SchemaFieldType } from '../../../../src/types';

export interface ScalarKind {
  /** Field name suffix and corpus key */
  readonly key: string;
  readonly schemaType: string;
  readonly decorators?: string;
  readonly type: SchemaFieldType;
  /** Gets array and @set shapes; Any and the narrower geometries do not */
  readonly shapes: 'all' | 'single';
  /** Takes the ordering operators and between */
  readonly ordered: boolean;
}

const num = (key: string, schemaType: string, type: SchemaFieldType): ScalarKind => ({
  key,
  schemaType,
  type,
  shapes: 'all',
  ordered: true,
});

export const SCALARS: readonly ScalarKind[] = [
  { key: 'Str', schemaType: 'String', type: 'string', shapes: 'all', ordered: false },
  { key: 'Mail', schemaType: 'Email', type: 'email', shapes: 'all', ordered: false },
  num('Int', 'Int', 'int'),
  num('Flt', 'Float', 'float'),
  num('Num', 'Number', 'number'),
  { key: 'Bool', schemaType: 'Bool', type: 'bool', shapes: 'all', ordered: false },
  num('Date', 'Date', 'date'),
  num('Uuid', 'Uuid', 'uuid'),
  num('Dur', 'Duration', 'duration'),
  num('Dec', 'Decimal', 'decimal'),
  num('I8', 'Int8', 'int8'),
  num('U8', 'Uint8', 'uint8'),
  num('I16', 'Int16', 'int16'),
  num('U16', 'Uint16', 'uint16'),
  num('I32', 'Int32', 'int32'),
  num('U32', 'Uint32', 'uint32'),
  num('U64', 'Uint64', 'uint64'),
  num('F16', 'Float16', 'float16'),
  num('F32', 'Float32', 'float32'),
  { key: 'Bytes', schemaType: 'Bytes', type: 'bytes', shapes: 'all', ordered: false },
  { key: 'Pt', schemaType: 'Geometry', decorators: '@point', type: 'geometry', shapes: 'all', ordered: false },
  { key: 'Poly', schemaType: 'Geometry', decorators: '@polygon', type: 'geometry', shapes: 'single', ordered: false },
  { key: 'Geo', schemaType: 'Geometry', type: 'geometry', shapes: 'single', ordered: false },
  {
    key: 'Multi',
    schemaType: 'Geometry',
    decorators: '@point @line',
    type: 'geometry',
    shapes: 'single',
    ordered: false,
  },
  { key: 'Any', schemaType: 'Any', type: 'any', shapes: 'single', ordered: true },
];

/** Kinds that get a set shape as well (the server de-duplicates and sorts them) */
export const SET_KEYS = ['Str', 'Int', 'Flt', 'Date', 'Uuid', 'Dur', 'Dec'];
/** Kinds that cannot carry @nullable */
const NOT_NULLABLE = ['Any'];

export interface NamedLiteral {
  readonly key: string;
  readonly schemaType: string;
}

/** Enum and literal fields: each is `type: 'literal'` internally */
export const LITERALS: readonly NamedLiteral[] = [
  { key: 'Tier', schemaType: 'Tier' },
  { key: 'Status', schemaType: 'Status' },
  { key: 'Prio', schemaType: 'Priority' },
  { key: 'Mixed', schemaType: 'Mixed' },
  { key: 'Broad', schemaType: 'Broad' },
  { key: 'Moment', schemaType: 'DateOrFlag' },
  { key: 'Ratio', schemaType: 'Ratio' },
  { key: 'Shape', schemaType: 'WithBoth' },
];

/** Fields of the shared leaf object, which every object slot walks */
export const LEAF_KEYS = ['Int', 'Str', 'Date', 'Uuid', 'Dur', 'Dec', 'Pt', 'Bytes', 'U8', 'F16'];

const leafFields = (): string =>
  SCALARS.filter((s) => LEAF_KEYS.includes(s.key))
    .map((s) => `  f${s.key} ${s.schemaType} ${s.decorators ?? ''}`)
    .join('\n');

/** The field block shared by Host and Kid, so a path through a relation reaches the same kinds */
const kindFields = (): string => {
  const lines: string[] = [];
  for (const s of SCALARS) {
    const d = s.decorators ?? '';
    lines.push(`  r${s.key} ${s.schemaType} ${d}`);
    lines.push(`  o${s.key} ${s.schemaType}? ${d}`);
    if (!NOT_NULLABLE.includes(s.key)) lines.push(`  n${s.key} ${s.schemaType}? ${d} @nullable`);
    if (s.shapes === 'all') lines.push(`  a${s.key} ${s.schemaType}[] ${d}`);
    if (SET_KEYS.includes(s.key)) lines.push(`  s${s.key} ${s.schemaType}[] ${d} @set`);
  }
  for (const l of LITERALS) {
    lines.push(`  r${l.key} ${l.schemaType}`);
    lines.push(`  o${l.key} ${l.schemaType}?`);
    lines.push(`  n${l.key} ${l.schemaType}? @nullable`);
    lines.push(`  a${l.key} ${l.schemaType}[]`);
  }
  lines.push('  oneLeaf Leaf');
  lines.push('  optLeaf Leaf?');
  lines.push('  leaves Leaf[]');
  lines.push('  flexLeaf Leaf @flexible');
  lines.push('  deep Top');
  lines.push('  selfRef Self');
  lines.push('  pairT Pair');
  lines.push('  pairs Pair[]');
  lines.push('  optPair Pair?');
  lines.push('  boxT Boxed');
  lines.push('  deepT TupleDeep');
  lines.push('  objTup ObjInTuple');
  lines.push('  recBox RecBox');

  return lines.join('\n');
};

/** id types, each with a model carrying it and a child that holds a foreign key (single and array) to it */
export const ID_MODELS = [
  { key: 'Root', type: '' },
  { key: 'Int', type: '(int)' },
  { key: 'Uuid', type: '(uuid)' },
  { key: 'Str', type: '(string)' },
  { key: 'Union', type: '(string, int)' },
  { key: 'UuidInt', type: '(int, uuid)' },
  { key: 'Tuple', type: '(Pair)' },
  { key: 'Object', type: '(IdKey)' },
] as const;
/** Id types whose model also takes a foreign key array */
export const FK_ARRAY_KEYS = ['Root', 'Int', 'Uuid', 'Union'];

const idModels = (): string =>
  ID_MODELS.map(({ key, type }) => {
    const hasArray = FK_ARRAY_KEYS.includes(key);

    return `
model Id${key} {
  id Record${type} @id
  n Int?
  fks Relation[] @model(Fk${key})
${hasArray ? `  peerIds Record[]\n  peers Relation[] @field(peerIds) @model(FkArr${key})` : ''}
}

model Fk${key} {
  id Record @id
  tId Record
  t Relation @field(tId) @model(Id${key})
  optId Record?
  opt Relation? @field(optId) @model(Id${key})
}
${
  hasArray
    ? `
model FkArr${key} {
  id Record @id
  tIds Record[]
  ts Relation[] @field(tIds) @model(Id${key})
}
`
    : ''
}`;
  }).join('\n');

export const SCHEMA = `
enum Tier { LOW, HIGH }

literal Status { 'active', 'inactive', 'pending' }
literal Priority { 1, 2, 3 }
literal Mixed { 'low', 'high', 1, 2, true }
literal Broad { String, Int }
literal DateOrFlag { Date, Bool }
literal Ratio { 0.5, 1.5, 2.5 }
literal WithBoth { 'none', 'empty', ShapeTuple, ShapeObject }

tuple ShapeTuple {
  Int,
  String
}

object ShapeObject {
  n Int
  s String
}

object Leaf {
${leafFields()}
}

object Mid {
  leaf Leaf
  fInt Int
}

object Top {
  mid Mid
  fStr String
}

object Self {
  fInt Int
  fDate Date
  child Self?
}

tuple Pair {
  Int,
  Date
}

object Boxed2 {
  fUuid Uuid
  fDur Duration
}

tuple Boxed {
  Int,
  Boxed2
}

tuple TupleInner {
  Int,
  Duration
}

object WithTuple {
  t TupleInner
  fDec Decimal
}

tuple TupleDeep {
  Int,
  WithTuple
}

tuple ObjInTuple {
  Date,
  Leaf
}

object RecBox {
  ref Record?
  refs Record[]
}

object IdKey {
  service String
  stamp Int
}

model Host {
  id Record @id
${kindFields()}
  kids Relation[] @model(Kid)
}

model Kid {
  id Record @id
${kindFields()}
  hostId Record
  host Relation @field(hostId) @model(Host)
}
${idModels()}
`;

const { ast } = parse(SCHEMA);
const models = convertModels(ast.models);
const objects = convertObjects(ast.objects);
const tuples = convertTuples(ast.tuples);
const literals = createLiteralRegistry([...convertLiterals(ast.literals), ...convertEnums(ast.enums)]);
resolveObjectFields(models, objects, createObjectRegistry(objects), createTupleRegistry(tuples), literals);
export const registry: ModelRegistry = createRegistry(models);
inferFKTypes(models, registry);

export const model = (name: string): ModelMetadata => {
  const found = registry[name];
  if (!found) throw new Error(`no model ${name}`);

  return found;
};
