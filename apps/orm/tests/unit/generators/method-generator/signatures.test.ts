/**
 * Unit tests for the method signature writers in method-generator.ts.
 * The emitted text is the contract, so each signature is asserted in full, once for a
 * model without relations (no include generic) and once for a model with them.
 */

import { describe, expect, test } from 'bun:test';
import {
  generateCountMethod,
  generateCreateMethod,
  generateDeleteManyMethod,
  generateDeleteUniqueMethod,
  generateExistsMethod,
  generateFindManyMethod,
  generateFindOneMethod,
  generateFindUniqueMethod,
  generateIntrospectionMethods,
  generateRawMethod,
  generateMethodSignatures,
  generateUpdateMethod,
  generateUpdateUniqueMethod,
  generateUpsertMethod,
} from '../../../../src/generators/types/method-generator';
import { field, model, relationField } from '../fixtures';

const plain = model('User', [field({ name: 'name' })]);
const related = model('User', [field({ name: 'name' }), relationField('posts', 'Post')]);
// A relation field with no relationInfo is not a relation for signature purposes
const danglingRelation = model('User', [field({ name: 'posts', type: 'relation' })]);

describe('generateFindOneMethod', () => {
  test('without relations', () => {
    expect(generateFindOneMethod(plain))
      .toBe(`findOne<S extends UserSelect | undefined = undefined, C extends Record<string, SqlFragment> = Record<never, never>>(options?: {
    where?: UserWhere;
    select?: S;
    compute?: C & { [K in keyof C & (keyof User | keyof UserWhere)]?: never };
    orderBy?: UserOrderBy & NoInfer<{ [K in keyof C]?: 'asc' | 'desc' }>;
    txn?: CerialTransaction;
  }): CerialQueryPromise<(GetUserPayload<S> & { [K in keyof C]: C[K] extends SqlFragment<infer T> ? T : unknown }) | null>;`);
  });

  test('with relations', () => {
    expect(generateFindOneMethod(related)).toBe(`findOne<
    S extends UserSelect | undefined = undefined,
    I extends UserInclude | undefined = undefined,
    C extends Record<string, SqlFragment> = Record<never, never>,
  >(options?: {
    where?: UserWhere;
    select?: S;
    include?: I;
    compute?: C & { [K in keyof C & (keyof User | keyof UserWhere)]?: never };
    orderBy?: UserOrderBy & NoInfer<{ [K in keyof C]?: 'asc' | 'desc' }>;
    txn?: CerialTransaction;
  }): CerialQueryPromise<(GetUserPayload<S, I> & { [K in keyof C]: C[K] extends SqlFragment<infer T> ? T : unknown }) | null>;`);
  });

  test('a relation field without relationInfo takes the plain form', () => {
    expect(generateFindOneMethod(danglingRelation)).toBe(generateFindOneMethod(plain));
  });
});

describe('generateFindManyMethod', () => {
  test('without relations', () => {
    expect(generateFindManyMethod(plain))
      .toBe(`findMany<S extends UserSelect | undefined = undefined, C extends Record<string, SqlFragment> = Record<never, never>>(options?: {
    where?: UserWhere;
    select?: S;
    compute?: C & { [K in keyof C & (keyof User | keyof UserWhere)]?: never };
    orderBy?: UserOrderBy & NoInfer<{ [K in keyof C]?: 'asc' | 'desc' }>;
    limit?: number;
    offset?: number;
    txn?: CerialTransaction;
  }): CerialQueryPromise<(GetUserPayload<S> & { [K in keyof C]: C[K] extends SqlFragment<infer T> ? T : unknown })[]>;`);
  });

  test('with relations', () => {
    expect(generateFindManyMethod(related)).toBe(`findMany<
    S extends UserSelect | undefined = undefined,
    I extends UserInclude | undefined = undefined,
    C extends Record<string, SqlFragment> = Record<never, never>,
  >(options?: {
    where?: UserWhere;
    select?: S;
    compute?: C & { [K in keyof C & (keyof User | keyof UserWhere)]?: never };
    orderBy?: UserOrderBy & NoInfer<{ [K in keyof C]?: 'asc' | 'desc' }>;
    limit?: number;
    offset?: number;
    include?: I;
    txn?: CerialTransaction;
  }): CerialQueryPromise<(GetUserPayload<S, I> & { [K in keyof C]: C[K] extends SqlFragment<infer T> ? T : unknown })[]>;`);
  });
});

describe('generateFindUniqueMethod', () => {
  test('without relations', () => {
    expect(generateFindUniqueMethod(plain))
      .toBe(`findUnique<S extends UserSelect | undefined = undefined, C extends Record<string, SqlFragment> = Record<never, never>>(options: {
    where: UserFindUniqueWhere;
    select?: S;
    compute?: C & { [K in keyof C & (keyof User | keyof UserWhere)]?: never };
    txn?: CerialTransaction;
  }): CerialQueryPromise<(GetUserPayload<S> & { [K in keyof C]: C[K] extends SqlFragment<infer T> ? T : unknown }) | null>;`);
  });

  test('with relations', () => {
    expect(generateFindUniqueMethod(related)).toBe(`findUnique<
    S extends UserSelect | undefined = undefined,
    I extends UserInclude | undefined = undefined,
    C extends Record<string, SqlFragment> = Record<never, never>,
  >(options: {
    where: UserFindUniqueWhere;
    select?: S;
    include?: I;
    compute?: C & { [K in keyof C & (keyof User | keyof UserWhere)]?: never };
    txn?: CerialTransaction;
  }): CerialQueryPromise<(GetUserPayload<S, I> & { [K in keyof C]: C[K] extends SqlFragment<infer T> ? T : unknown }) | null>;`);
  });
});

describe('generateCreateMethod', () => {
  test('without relations', () => {
    expect(generateCreateMethod(plain)).toBe(`create<S extends UserSelect | undefined = undefined>(options: {
    data: UserCreateInput;
    select?: S;
    txn?: CerialTransaction;
  }): CerialQueryPromise<GetUserPayload<S>>;`);
  });

  test('with relations (no trailing comma after the last generic)', () => {
    expect(generateCreateMethod(related)).toBe(`create<
    S extends UserSelect | undefined = undefined,
    I extends UserInclude | undefined = undefined
  >(options: {
    data: UserCreateInput;
    select?: S;
    include?: I;
    txn?: CerialTransaction;
  }): CerialQueryPromise<GetUserPayload<S, I>>;`);
  });
});

describe('generateUpdateMethod', () => {
  test('without relations', () => {
    expect(generateUpdateMethod(plain)).toBe(`updateMany<
    S extends UserSelect | undefined = undefined,
    D extends UserUpdateInput = UserUpdateInput
  >(options: {
    where: UserWhere;
    data: D;
    unset?: SafeUnset<UserUnset, D>;
    select?: S;
    txn?: CerialTransaction;
  }): CerialQueryPromise<GetUserPayload<S>[]>;`);
  });

  test('with relations', () => {
    expect(generateUpdateMethod(related)).toBe(`updateMany<
    S extends UserSelect | undefined = undefined,
    I extends UserInclude | undefined = undefined,
    D extends UserUpdateInput = UserUpdateInput
  >(options: {
    where: UserWhere;
    data: D;
    unset?: SafeUnset<UserUnset, D>;
    select?: S;
    include?: I;
    txn?: CerialTransaction;
  }): CerialQueryPromise<GetUserPayload<S, I>[]>;`);
  });
});

describe('generateDeleteManyMethod', () => {
  test('is the same for models with and without relations', () => {
    const expected = `deleteMany(options: {
    where: UserWhere;
    txn?: CerialTransaction;
  }): CerialQueryPromise<number>;`;

    expect(generateDeleteManyMethod(plain)).toBe(expected);
    expect(generateDeleteManyMethod(related)).toBe(expected);
  });
});

describe('generateDeleteUniqueMethod', () => {
  test('is the same for models with and without relations', () => {
    const expected = `deleteUnique<R extends DeleteUniqueReturn = undefined>(options: {
    where: UserFindUniqueWhere;
    /**
     * Return option for the deleted record
     * - undefined/null: returns boolean (always true - operation succeeded)
     * - true: returns boolean (true if record existed, false if not)
     * - 'before': returns User | null (deleted data)
     */
    return?: R;
    txn?: CerialTransaction;
  }): CerialQueryPromise<DeleteUniqueReturnType<User, R>>;`;

    expect(generateDeleteUniqueMethod(plain)).toBe(expected);
    expect(generateDeleteUniqueMethod(related)).toBe(expected);
  });
});

describe('generateUpdateUniqueMethod', () => {
  test('without relations', () => {
    expect(generateUpdateUniqueMethod(plain)).toBe(`updateUnique<
    S extends UserSelect | undefined = undefined,
    D extends UserUpdateInput = UserUpdateInput,
    R extends UpdateUniqueReturn = undefined
  >(options: {
    where: UserFindUniqueWhere;
    data: D;
    unset?: SafeUnset<UserUnset, D>;
    select?: S;
    /**
     * Return option for the updated record
     * - undefined/null/'after': returns updated record (supports select)
     * - true: returns boolean (true if found and updated, false if not)
     * - 'before': returns User | null (pre-update state, select reads before the write)
     */
    return?: R;
    txn?: CerialTransaction;
  }): CerialQueryPromise<UpdateUniqueReturnType<GetUserPayload<S>, R>>;`);
  });

  test('with relations', () => {
    expect(generateUpdateUniqueMethod(related)).toBe(`updateUnique<
    S extends UserSelect | undefined = undefined,
    I extends UserInclude | undefined = undefined,
    D extends UserUpdateInput = UserUpdateInput,
    R extends UpdateUniqueReturn = undefined
  >(options: {
    where: UserFindUniqueWhere;
    data: D;
    unset?: SafeUnset<UserUnset, D>;
    select?: S;
    include?: I;
    /**
      * Return option for the updated record
      * - undefined/null/'after': returns updated record (supports select/include)
      * - true: returns boolean (true if found and updated, false if not)
      * - 'before': returns User | null (pre-update state, select and include read before the write)
      */
    return?: R;
    txn?: CerialTransaction;
  }): CerialQueryPromise<UpdateUniqueReturnType<GetUserPayload<S, I>, R>>;`);
  });
});

describe('generateUpsertMethod', () => {
  test('without relations: unique overload then array overload', () => {
    expect(generateUpsertMethod(plain)).toBe(`upsert<
    S extends UserSelect | undefined = undefined,
    D extends UserUpdateInput = UserUpdateInput,
    R extends UpsertReturn = undefined
  >(options: {
    where: UserFindUniqueWhere;
    create: UserCreateInput;
    update?: D;
    unset?: SafeUnset<UserUnset, D>;
    select?: S;
    /**
     * Return option for the upserted record
     * - undefined/null/'after': returns upserted record (supports select)
     * - true: returns boolean (true if record was created or updated)
     * - 'before': returns previous state | null (null for new records)
     */
    return?: R;
    txn?: CerialTransaction;
  }): CerialQueryPromise<UpsertReturnType<GetUserPayload<S>, R>>;

  upsert<
    S extends UserSelect | undefined = undefined,
    D extends UserUpdateInput = UserUpdateInput,
    R extends UpsertReturn = undefined
  >(options: {
    where: UserWhere;
    create: UserCreateInput;
    update?: D;
    unset?: SafeUnset<UserUnset, D>;
    select?: S;
    /**
     * Return option for the upserted record
     * - undefined/null/'after': returns upserted records
     * - true: returns boolean (true if any records were affected)
     * - 'before': returns previous states of matched records
     */
    return?: R;
    txn?: CerialTransaction;
  }): CerialQueryPromise<UpsertArrayReturnType<GetUserPayload<S>, R>>;`);
  });

  test('with relations: unique overload then array overload', () => {
    expect(generateUpsertMethod(related)).toBe(`upsert<
    S extends UserSelect | undefined = undefined,
    I extends UserInclude | undefined = undefined,
    D extends UserUpdateInput = UserUpdateInput,
    R extends UpsertReturn = undefined
  >(options: {
    where: UserFindUniqueWhere;
    create: UserCreateInput;
    update?: D;
    unset?: SafeUnset<UserUnset, D>;
    select?: S;
    include?: I;
    /**
     * Return option for the upserted record
     * - undefined/null/'after': returns upserted record (supports select/include)
     * - true: returns boolean (true if record was created or updated)
     * - 'before': returns previous state | null (null for new records)
     */
    return?: R;
    txn?: CerialTransaction;
  }): CerialQueryPromise<UpsertReturnType<GetUserPayload<S, I>, R>>;

  upsert<
    S extends UserSelect | undefined = undefined,
    I extends UserInclude | undefined = undefined,
    D extends UserUpdateInput = UserUpdateInput,
    R extends UpsertReturn = undefined
  >(options: {
    where: UserWhere;
    create: UserCreateInput;
    update?: D;
    unset?: SafeUnset<UserUnset, D>;
    select?: S;
    include?: I;
    /**
     * Return option for the upserted record
     * - undefined/null/'after': returns upserted records
     * - true: returns boolean (true if any records were affected)
     * - 'before': returns previous states of matched records
     */
    return?: R;
    txn?: CerialTransaction;
  }): CerialQueryPromise<UpsertArrayReturnType<GetUserPayload<S, I>, R>>;`);
  });
});

describe('count, exists and introspection signatures', () => {
  test('count', () => {
    expect(generateCountMethod(plain)).toBe(
      'count(where?: UserWhere, txn?: CerialTransaction): CerialQueryPromise<number>;',
    );
  });

  test('exists', () => {
    expect(generateExistsMethod(plain)).toBe(
      'exists(where?: UserWhere, txn?: CerialTransaction): CerialQueryPromise<boolean>;',
    );
  });

  test('$raw takes a fragment and an optional txn and returns an array of the claimed row type', () => {
    expect(generateRawMethod()).toBe(
      '$raw<R = unknown>(fragment: SqlFragment<R>, options?: { txn?: CerialTransaction }): CerialQueryPromise<R[]>;',
    );
  });

  test('introspection methods are blank-line separated', () => {
    expect(generateIntrospectionMethods()).toBe(
      'getMetadata(): ModelMetadata;\n\n  getName(): string;\n\n  getTableName(): string;',
    );
  });

  test('the model name is interpolated, not hardcoded', () => {
    expect(generateCountMethod(model('BlogPost', []))).toContain('BlogPostWhere');
    expect(generateFindOneMethod(model('BlogPost', []))).toContain('GetBlogPostPayload<S>');
  });
});

describe('generateMethodSignatures', () => {
  test('returns the thirteen signatures in declaration order', () => {
    expect(generateMethodSignatures(related)).toEqual([
      generateFindOneMethod(related),
      generateFindManyMethod(related),
      generateFindUniqueMethod(related),
      generateCreateMethod(related),
      generateUpdateMethod(related),
      generateUpdateUniqueMethod(related),
      generateUpsertMethod(related),
      generateDeleteManyMethod(related),
      generateDeleteUniqueMethod(related),
      generateCountMethod(related),
      generateExistsMethod(related),
      generateRawMethod(),
      generateIntrospectionMethods(),
    ]);
  });
});
