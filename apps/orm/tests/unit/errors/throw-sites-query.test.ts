/**
 * Unit tests: the query layer throws the right class, carrying the model, operation and field it knows.
 *
 * Each case asserts the class and code, the context fields, and that no sibling class matches, because
 * the hierarchy is flat and an `instanceof` against the wrong one must be false.
 */

import { describe, expect, test } from 'bun:test';
import { CerialError, CerialUnknownFieldError, CerialValidationError } from '../../../src/errors';
import {
  compileCreate,
  compileDeleteMany,
  compileFindMany,
  compileFindOne,
  compileFindUnique,
  compileUpdateMany,
  compileUpdateUnique,
  compileUpsert,
} from '../../../src/query/builder';
import { validateUniqueField } from '../../../src/query/builders';
import { transformDestructiveWhere } from '../../../src/query/filters/transformer';
import { post, registry } from '../query/select-validation-helpers';
import { thrown, wrongClasses } from './helpers';

const validPost = {
  title: 'T',
  authorId: 'author:1',
  address: { city: 'c', geo: { lat: 1, lng: 2 } },
  loose: { city: 'c', geo: { lat: 1, lng: 2 } },
  spot: ['l', { lat: 1, lng: 2 }],
};

interface Expected {
  readonly ctor: typeof CerialUnknownFieldError | typeof CerialValidationError;
  readonly code: 'C2001' | 'C3000';
  readonly model: string;
  readonly operation?: string;
  readonly field?: string;
}

function expectError(fn: () => unknown, expected: Expected): void {
  const error = thrown(fn);

  expect(error).toBeInstanceOf(expected.ctor);
  expect(error).toBeInstanceOf(CerialError);
  const cerial = error as CerialError;

  expect(cerial.code).toBe(expected.code);
  expect(cerial.model).toBe(expected.model);
  expect(cerial.operation).toBe(expected.operation);
  expect(cerial.field).toBe(expected.field);
  for (const wrong of wrongClasses(expected.ctor)) expect(error).not.toBeInstanceOf(wrong);
}

const unknownField = (operation: string, field: string): Expected => ({
  ctor: CerialUnknownFieldError,
  code: 'C2001',
  model: 'Post',
  operation,
  field,
});
const invalid = (operation: string, field?: string): Expected => ({
  ctor: CerialValidationError,
  code: 'C3000',
  model: 'Post',
  operation,
  field,
});

describe('where clause failures', () => {
  test('an unknown field is an unknown-field error naming the field and the call', () => {
    expectError(
      () => compileFindMany(post, { where: { nope: 1 } as never }, registry),
      unknownField('findMany', 'nope'),
    );
    expectError(() => compileFindOne(post, { where: { nope: 1 } as never }, registry), unknownField('findOne', 'nope'));
    expectError(
      () => compileDeleteMany(post, { where: { nope: 1 } as never }, registry),
      unknownField('deleteMany', 'nope'),
    );
  });

  test('an unknown sub-key keeps the full path as the field', () => {
    expectError(
      () => compileFindMany(post, { where: { address: { cty: 'x' } } as never }, registry),
      unknownField('findMany', 'address.cty'),
    );
  });

  test('a unique lookup on an unknown field reports the unique call, not findMany', () => {
    expectError(
      () => compileFindUnique(post, { where: { nope: 1 } as never }, registry),
      unknownField('findUnique', 'nope'),
    );
  });
});

describe('data failures', () => {
  test('a missing required field is a validation error naming the field', () => {
    const { title: _title, ...rest } = validPost;

    expectError(() => compileCreate(post, { data: rest } as never, registry), invalid('create', 'title'));
  });

  test('an unknown data key is an unknown-field error', () => {
    expectError(
      () => compileCreate(post, { data: { ...validPost, typo: 1 } } as never, registry),
      unknownField('create', 'typo'),
    );
    expectError(
      () => compileUpdateMany(post, { where: { title: 'T' }, data: { typo: 1 } } as never, registry),
      unknownField('updateMany', 'typo'),
    );
  });

  test('upsert reports the same operation and one message for either half', () => {
    const create = thrown(() =>
      compileUpsert(
        post,
        { where: { id: 'post:1' }, create: { ...validPost, typo: 1 }, update: { title: 'U' } } as never,
        registry,
      ),
    ) as CerialError;
    const update = thrown(() =>
      compileUpsert(post, { where: { id: 'post:1' }, create: validPost, update: { typo: 1 } } as never, registry),
    ) as CerialError;

    expect(create).toBeInstanceOf(CerialUnknownFieldError);
    expect(update).toBeInstanceOf(CerialUnknownFieldError);
    expect(create.operation).toBe('upsert');
    expect(update.operation).toBe('upsert');
    expect(create.message).toBe(update.message);
  });

  test('an unknown unset key is an unknown-field error', () => {
    expectError(
      () =>
        compileUpdateMany(
          post,
          { where: { title: 'T' }, data: { title: 'U' }, unset: { typo: true } } as never,
          registry,
        ),
      unknownField('updateMany', 'typo'),
    );
  });

  test('unsetting a field that cannot be unset is a validation error', () => {
    expectError(
      () =>
        compileUpdateUnique(
          post,
          { where: { id: 'post:1' }, data: { title: 'U' }, unset: { id: true } } as never,
          registry,
        ),
      invalid('updateUnique', 'id'),
    );
  });
});

describe('select, orderBy and pagination failures', () => {
  test('an unknown select key is an unknown-field error', () => {
    expectError(
      () => compileFindMany(post, { select: { titel: true } as never }, registry),
      unknownField('findMany', 'titel'),
    );
  });

  test('an unknown orderBy key is an unknown-field error', () => {
    expectError(
      () => compileFindMany(post, { orderBy: { titel: 'asc' } as never }, registry),
      unknownField('findMany', 'titel'),
    );
  });

  test('a bad sort direction is a validation error', () => {
    expectError(
      () => compileFindMany(post, { orderBy: { title: 'up' } as never }, registry),
      invalid('findMany', 'title'),
    );
  });

  test('a negative limit is a validation error', () => {
    expectError(() => compileFindMany(post, { limit: -1 }, registry), invalid('findMany', 'limit'));
  });
});

describe('include failures', () => {
  test('an unknown include key is an unknown-field error', () => {
    const error = thrown(() => compileFindMany(post, { include: { psots: true } as never }, registry));

    expect(error).toBeInstanceOf(CerialUnknownFieldError);
    expect((error as CerialError).model).toBe('Post');
    expect((error as CerialError).field).toBe('psots');
    expect((error as CerialError).operation).toBe('include');
    expect(error).not.toBeInstanceOf(CerialValidationError);
  });

  test('including a non-relation field is a validation error', () => {
    const error = thrown(() => compileFindMany(post, { include: { title: true } as never }, registry));

    expect(error).toBeInstanceOf(CerialValidationError);
    expect((error as CerialError).field).toBe('title');
    expect(error).not.toBeInstanceOf(CerialUnknownFieldError);
  });

  test('a bad orderBy inside an include names the included model and the relation', () => {
    const error = thrown(() =>
      compileFindMany(post, { include: { author: { orderBy: { nmae: 'asc' } } } as never }, registry),
    );

    expect(error).toBeInstanceOf(CerialUnknownFieldError);
    expect((error as CerialError).model).toBe('Author');
    expect((error as CerialError).field).toBe('nmae');
    expect((error as CerialError).message).toContain("in include 'author'");
  });
});

describe('unique-key and destructive-where failures', () => {
  test('a unique lookup with no unique field names the model and the call', () => {
    expectError(() => validateUniqueField({ title: 'T' }, post, 'findUnique'), invalid('findUnique'));
  });

  test('a unique key given an operator object names the key as the field', () => {
    expectError(
      () => validateUniqueField({ id: { in: ['a'] } } as never, post, 'deleteUnique'),
      invalid('deleteUnique', 'id'),
    );
  });

  test('a destructive where that resolved to nothing names the model and the call', () => {
    expectError(
      () => transformDestructiveWhere({ nope: 1 } as never, post, 'deleteMany', registry),
      invalid('deleteMany'),
    );
  });
});

describe('nested relation rules', () => {
  test('create with connect on a single relation is a validation error naming the field and model', () => {
    const error = thrown(() =>
      compileCreate(
        post,
        { data: { ...validPost, author: { create: { name: 'A' }, connect: 'author:1' } } } as never,
        registry,
      ),
    );

    expect(error).toBeInstanceOf(CerialValidationError);
    expect((error as CerialError).model).toBe('Post');
    expect((error as CerialError).field).toBe('author');
    expect(error).not.toBeInstanceOf(CerialUnknownFieldError);
  });
});
