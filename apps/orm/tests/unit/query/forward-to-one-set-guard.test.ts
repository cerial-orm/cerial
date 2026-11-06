/**
 * Unit Tests: a filter on a forward to-one relation requires the relation to be set
 *
 * The body compiles over the dotted foreign key path, and with no related record that path is NONE, which
 * satisfies every negative operator. The whole body sits behind the record existing (`fk.id != NONE`), so a row with no
 * relation never matches it and a NOT around the relation key matches that row. Asserts the full compiled
 * text for a required and for an optional nullable relation, at depth 1 and nested.
 */

import { describe, expect, test } from 'bun:test';
import {
  convertModels,
  convertObjects,
  convertTuples,
  createTupleRegistry,
  resolveObjectFields,
} from '../../../src/generators/metadata';
import { createObjectRegistry, createRegistry } from '../../../src/generators/metadata/registry-generator';
import { parse } from '../../../src/parser/parser';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import { buildConditions } from '../../../src/query/filters/condition-builder';
import { CerialValidationError } from '../../../src/errors';
import type { WhereClause } from '../../../src/types';

const schema = `
model Emp {
  id Record @id
  name String
  age Int
  managerId Record? @nullable
  manager Relation? @field(managerId) @model(Emp)
  reports Relation[] @model(Emp)
}

model Doc {
  id Record @id
  title String
  authorId Record
  author Relation @field(authorId) @model(Emp)
  reviewerId Record? @nullable
  reviewer Relation? @field(reviewerId) @model(Emp)
}

model Note {
  id Record @id
  body String
  docId Record
  doc Relation @field(docId) @model(Doc)
}
`;

const { ast } = parse(schema);
const models = convertModels(ast.models);
const objects = convertObjects(ast.objects);
const tuples = convertTuples(ast.tuples);
resolveObjectFields(models, objects, createObjectRegistry(objects), createTupleRegistry(tuples));
const registry = createRegistry(models);

const compile = (model: string, where: WhereClause) =>
  buildConditions(createCompileContext(), where, registry[model]!, registry);

const G = (fk: string, body: string) => `(${fk}.id != NONE AND ${body})`;

// [label, model, where, text, vars]
type Row = [string, string, WhereClause, string, Record<string, unknown>];

const rows: Row[] = [
  // optional nullable relation
  [
    'eq',
    'Emp',
    { manager: { name: 'a' } },
    G('managerId', 'managerId.name = $managerId_name_eq_0'),
    { managerId_name_eq_0: 'a' },
  ],
  [
    'neq',
    'Emp',
    { manager: { name: { neq: 'zz' } } },
    G('managerId', 'managerId.name != $managerId_name_neq_0'),
    { managerId_name_neq_0: 'zz' },
  ],
  [
    'in',
    'Emp',
    { manager: { name: { in: ['a', 'b'] } } },
    G('managerId', 'managerId.name IN $managerId_name_in_0'),
    { managerId_name_in_0: ['a', 'b'] },
  ],
  [
    'notIn',
    'Emp',
    { manager: { name: { notIn: ['zz'] } } },
    G('managerId', 'managerId.name NOT IN $managerId_name_notIn_0'),
    { managerId_name_notIn_0: ['zz'] },
  ],
  [
    'contains',
    'Emp',
    { manager: { name: { contains: 'x' } } },
    G('managerId', 'string::contains(managerId.name, $managerId_name_contains_0)'),
    { managerId_name_contains_0: 'x' },
  ],
  [
    'gt',
    'Emp',
    { manager: { age: { gt: 3 } } },
    G('managerId', 'managerId.age > $managerId_age_gt_0'),
    { managerId_age_gt_0: 3 },
  ],
  [
    'isNone on a sub-field',
    'Emp',
    { manager: { name: { isNone: true } } },
    G('managerId', 'managerId.name = NONE'),
    {},
  ],
  [
    'NOT inside the body',
    'Emp',
    { manager: { NOT: { name: 'zz' } } },
    G('managerId', 'NOT (managerId.name = $managerId_name_eq_0)'),
    { managerId_name_eq_0: 'zz' },
  ],
  [
    'OR around neq inside the body',
    'Emp',
    { manager: { OR: [{ name: { neq: 'zz' } }, { age: { gt: 3 } }] } },
    G('managerId', '(managerId.name != $managerId_name_neq_0 OR managerId.age > $managerId_age_gt_1)'),
    { managerId_name_neq_0: 'zz', managerId_age_gt_1: 3 },
  ],
  [
    'AND inside the body',
    'Emp',
    { manager: { AND: [{ name: 'a' }, { age: 3 }] } },
    G('managerId', '(managerId.name = $managerId_name_eq_0 AND managerId.age = $managerId_age_eq_1)'),
    { managerId_name_eq_0: 'a', managerId_age_eq_1: 3 },
  ],
  [
    'NOT around the relation key',
    'Emp',
    { NOT: { manager: { name: { neq: 'zz' } } } },
    `NOT (${G('managerId', 'managerId.name != $managerId_name_neq_0')})`,
    { managerId_name_neq_0: 'zz' },
  ],
  [
    'OR around the relation key',
    'Emp',
    { OR: [{ manager: { name: { neq: 'zz' } } }, { name: 'q' }] },
    `(${G('managerId', 'managerId.name != $managerId_name_neq_0')} OR name = $name_eq_1)`,
    { managerId_name_neq_0: 'zz', name_eq_1: 'q' },
  ],
  [
    'several fields',
    'Emp',
    { manager: { name: 'a', age: { gt: 3 } } },
    G('managerId', 'managerId.name = $managerId_name_eq_0 AND managerId.age > $managerId_age_gt_1'),
    { managerId_name_eq_0: 'a', managerId_age_gt_1: 3 },
  ],
  // self relation inside itself: the inner relation key keeps its own guard
  [
    'manager of manager',
    'Emp',
    { manager: { manager: { name: { neq: 'zz' } } } },
    G(
      'managerId',
      `managerId IN (SELECT VALUE id FROM emp WHERE ${G('managerId', 'managerId.name != $managerId_name_neq_0')})`,
    ),
    { managerId_name_neq_0: 'zz' },
  ],
  // required relation
  [
    'required: eq',
    'Doc',
    { author: { name: 'a' } },
    G('authorId', 'authorId.name = $authorId_name_eq_0'),
    { authorId_name_eq_0: 'a' },
  ],
  [
    'required: neq',
    'Doc',
    { author: { name: { neq: 'zz' } } },
    G('authorId', 'authorId.name != $authorId_name_neq_0'),
    { authorId_name_neq_0: 'zz' },
  ],
  [
    'required: notIn under NOT',
    'Doc',
    { NOT: { author: { name: { notIn: ['zz'] } } } },
    `NOT (${G('authorId', 'authorId.name NOT IN $authorId_name_notIn_0')})`,
    { authorId_name_notIn_0: ['zz'] },
  ],
  // two relations to the same model do not share a guard
  [
    'two relations',
    'Doc',
    { author: { name: 'a' }, reviewer: { name: { neq: 'zz' } } },
    `${G('authorId', 'authorId.name = $authorId_name_eq_0')} AND ${G('reviewerId', 'reviewerId.name != $reviewerId_name_neq_1')}`,
    { authorId_name_eq_0: 'a', reviewerId_name_neq_1: 'zz' },
  ],
  // nested: forward inside a forward
  [
    'nested forward -> forward',
    'Note',
    { doc: { author: { name: { neq: 'zz' } } } },
    G('docId', `docId IN (SELECT VALUE id FROM doc WHERE ${G('authorId', 'authorId.name != $authorId_name_neq_0')})`),
    { authorId_name_neq_0: 'zz' },
  ],
  [
    'nested: NOT around the inner key',
    'Note',
    { doc: { NOT: { reviewer: { name: 'a' } } } },
    G(
      'docId',
      `NOT (docId IN (SELECT VALUE id FROM doc WHERE ${G('reviewerId', 'reviewerId.name = $reviewerId_name_eq_0')}))`,
    ),
    { reviewerId_name_eq_0: 'a' },
  ],
  [
    'nested: doc field beside the inner key',
    'Note',
    { doc: { title: 'x', reviewer: { name: 'a' } } },
    G(
      'docId',
      `docId.title = $docId_title_eq_0 AND docId IN (SELECT VALUE id FROM doc WHERE ${G('reviewerId', 'reviewerId.name = $reviewerId_name_eq_1')})`,
    ),
    { docId_title_eq_0: 'x', reviewerId_name_eq_1: 'a' },
  ],
];

describe('a forward to-one filter requires the relation to be set', () => {
  test.each(rows)('%s', (_label, model, where, text, vars) => {
    expect(compile(model, where)).toEqual({ text, vars });
  });
});

const NO = (fk: string) => `(${fk}.id = NONE)`;
const HAS = (fk: string) => `(${fk}.id != NONE)`;

describe('an empty to-one body means the related record exists', () => {
  const empties: Array<[string, WhereClause]> = [
    ['{}', { manager: {} }],
    ['{ AND: [] }', { manager: { AND: [] } }],
    ['{ name: undefined }', { manager: { name: undefined } }],
    ['{ name: {} }', { manager: { name: {} } }],
    ['{ name: { eq: undefined } }', { manager: { name: { eq: undefined } } }],
    ['{ AND: [{}] }', { manager: { AND: [{}] } }],
  ];

  test.each(empties)('manager: %s', (_label, where) => {
    expect(compile('Emp', where)).toEqual({ text: HAS('managerId'), vars: {} });
  });

  test('required relation', () => {
    expect(compile('Doc', { author: {} })).toEqual({ text: HAS('authorId'), vars: {} });
  });

  test('under NOT it is the rows with no related record', () => {
    expect(compile('Emp', { NOT: { manager: {} } })).toEqual({ text: `NOT (${HAS('managerId')})`, vars: {} });
  });

  test('beside a sibling filter, ANDed with it', () => {
    expect(compile('Emp', { name: { neq: 'zz' }, manager: {} })).toEqual({
      text: `name != $name_neq_0 AND ${HAS('managerId')}`,
      vars: { name_neq_0: 'zz' },
    });
  });

  test('at depth 2 the inner key keeps its own existence check', () => {
    expect(compile('Emp', { manager: { manager: {} } })).toEqual({
      text: G('managerId', `managerId IN (SELECT VALUE id FROM emp WHERE ${HAS('managerId')})`),
      vars: {},
    });
  });

  test('nested through another model', () => {
    expect(compile('Note', { doc: { author: {} } })).toEqual({
      text: G('docId', `docId IN (SELECT VALUE id FROM doc WHERE ${HAS('authorId')})`),
      vars: {},
    });
  });

  test('in a reverse body', () => {
    expect(compile('Emp', { reports: { some: { manager: {} } } }).text).toContain(HAS('managerId'));
  });

  test('a body with an unknown key still refuses', () => {
    expect(() => compile('Emp', { manager: { nope: 1 } as WhereClause })).toThrow(CerialValidationError);
    expect(() => compile('Emp', { manager: { AND: [{ nope: 1 } as WhereClause] } })).toThrow(CerialValidationError);
  });
});

describe('a null to-one relation means no related record', () => {
  test('manager: null is the complement of manager: {}', () => {
    expect(compile('Emp', { manager: null })).toEqual({ text: NO('managerId'), vars: {} });
  });

  test('required relation', () => {
    expect(compile('Doc', { author: null })).toEqual({ text: NO('authorId'), vars: {} });
  });

  test('NOT around it is the rows with a related record', () => {
    expect(compile('Emp', { NOT: { manager: null } })).toEqual({ text: `NOT (${NO('managerId')})`, vars: {} });
  });

  test('beside a sibling filter', () => {
    expect(compile('Emp', { name: 'a', manager: null })).toEqual({
      text: `name = $name_eq_0 AND ${NO('managerId')}`,
      vars: { name_eq_0: 'a' },
    });
  });

  test('inside a relation body', () => {
    expect(compile('Note', { doc: { reviewer: null } })).toEqual({
      text: G('docId', `docId IN (SELECT VALUE id FROM doc WHERE ${NO('reviewerId')})`),
      vars: {},
    });
  });

  test('at depth 2', () => {
    expect(compile('Emp', { manager: { manager: null } })).toEqual({
      text: G('managerId', `managerId IN (SELECT VALUE id FROM emp WHERE ${NO('managerId')})`),
      vars: {},
    });
  });

  test('in a reverse body', () => {
    expect(compile('Emp', { reports: { some: { manager: null } } }).text).toContain(NO('managerId'));
  });

  test('a reverse relation still refuses null', () => {
    expect(() => compile('Emp', { reports: null })).toThrow(CerialValidationError);
  });
});

describe('field-level comparisons keep their own meaning', () => {
  test('managerId: null compares the stored NULL only', () => {
    expect(compile('Emp', { managerId: null })).toEqual({ text: 'managerId = NULL', vars: {} });
  });

  test('managerId: { isNone: true } selects the unset rows', () => {
    expect(compile('Emp', { managerId: { isNone: true } })).toEqual({ text: 'managerId = NONE', vars: {} });
  });

  test('managerId: { isNull: true } selects the stored NULL', () => {
    expect(compile('Emp', { managerId: { isNull: true } })).toEqual({ text: 'managerId = NULL', vars: {} });
  });
});
