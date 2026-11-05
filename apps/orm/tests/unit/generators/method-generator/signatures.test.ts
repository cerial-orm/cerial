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
  generateLiveMethod,
  generateMethodSignatures,
  generateUpdateMethod,
  generateUpdateUniqueMethod,
  generateUpsertMethod,
} from '../../../../src/generators/types/method-generator';
import { generateGroupByMethod } from '../../../../src/generators/types/group-by-generator';
import { field, model, relationField } from '../fixtures';

const plain = model('User', [field({ name: 'name' })]);
const related = model('User', [field({ name: 'name' }), relationField('posts', 'Post')]);
// A relation field with no relationInfo is not a relation for signature purposes
const danglingRelation = model('User', [field({ name: 'posts', type: 'relation' })]);

describe('select option', () => {
  const wide = model('User', [field({ name: 'name' }), field({ name: 'email' })]);

  test('a model of several selectable fields takes the declared fields interface', () => {
    expect(generateFindManyMethod(wide)).toContain('select?: SelectArg<S, UserSelectFields>;');
  });

  test('a model with fewer than two selectable fields has no fields interface', () => {
    expect(generateFindManyMethod(plain)).toContain('select?: SelectArg<S, UserSelect>;');
    expect(generateFindManyMethod(plain)).not.toContain('UserSelectFields');
  });
});

describe('generateFindOneMethod', () => {
  test('without relations', () => {
    expect(generateFindOneMethod(plain))
      .toBe(`findOne<S extends UserSelect | undefined = undefined, C extends Record<string, SqlFragment> = Record<never, never>>(options?: {
    where?: UserWhere;
    select?: SelectArg<S, UserSelect>;
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
    select?: SelectArg<S, UserSelect>;
    include?: IncludeArg<I, UserInclude>;
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
    select?: SelectArg<S, UserSelect>;
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
    select?: SelectArg<S, UserSelect>;
    compute?: C & { [K in keyof C & (keyof User | keyof UserWhere)]?: never };
    orderBy?: UserOrderBy & NoInfer<{ [K in keyof C]?: 'asc' | 'desc' }>;
    limit?: number;
    offset?: number;
    include?: IncludeArg<I, UserInclude>;
    txn?: CerialTransaction;
  }): CerialQueryPromise<(GetUserPayload<S, I> & { [K in keyof C]: C[K] extends SqlFragment<infer T> ? T : unknown })[]>;`);
  });
});

describe('generateFindUniqueMethod', () => {
  test('without relations', () => {
    expect(generateFindUniqueMethod(plain))
      .toBe(`findUnique<S extends UserSelect | undefined = undefined, C extends Record<string, SqlFragment> = Record<never, never>>(options: {
    where: UserFindUniqueWhere;
    select?: SelectArg<S, UserSelect>;
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
    select?: SelectArg<S, UserSelect>;
    include?: IncludeArg<I, UserInclude>;
    compute?: C & { [K in keyof C & (keyof User | keyof UserWhere)]?: never };
    txn?: CerialTransaction;
  }): CerialQueryPromise<(GetUserPayload<S, I> & { [K in keyof C]: C[K] extends SqlFragment<infer T> ? T : unknown }) | null>;`);
  });
});

describe('generateCreateMethod', () => {
  test('without relations', () => {
    expect(generateCreateMethod(plain)).toBe(`create<S extends UserSelect | undefined = undefined>(options: {
    data: UserCreateInput;
    select?: SelectArg<S, UserSelect>;
    txn?: CerialTransaction;
  }): CerialQueryPromise<GetUserPayload<S>>;`);
  });

  test('with relations (no trailing comma after the last generic)', () => {
    expect(generateCreateMethod(related)).toBe(`create<
    S extends UserSelect | undefined = undefined,
    I extends UserInclude | undefined = undefined
  >(options: {
    data: UserCreateInput;
    select?: SelectArg<S, UserSelect>;
    include?: IncludeArg<I, UserInclude>;
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
    data: DataArg<D, UserUpdateInput>;
    unset?: SafeUnset<UserUnset, D>;
    select?: SelectArg<S, UserSelect>;
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
    data: DataArg<D, UserUpdateInput>;
    unset?: SafeUnset<UserUnset, D>;
    select?: SelectArg<S, UserSelect>;
    include?: IncludeArg<I, UserInclude>;
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
    data: DataArg<D, UserUpdateInput>;
    unset?: SafeUnset<UserUnset, D>;
    select?: SelectArg<S, UserSelect>;
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
    data: DataArg<D, UserUpdateInput>;
    unset?: SafeUnset<UserUnset, D>;
    select?: SelectArg<S, UserSelect>;
    include?: IncludeArg<I, UserInclude>;
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
    update?: DataArg<D, UserUpdateInput>;
    unset?: SafeUnset<UserUnset, D>;
    select?: SelectArg<S, UserSelect>;
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
    update?: DataArg<D, UserUpdateInput>;
    unset?: SafeUnset<UserUnset, D>;
    select?: SelectArg<S, UserSelect>;
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
    update?: DataArg<D, UserUpdateInput>;
    unset?: SafeUnset<UserUnset, D>;
    select?: SelectArg<S, UserSelect>;
    include?: IncludeArg<I, UserInclude>;
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
    update?: DataArg<D, UserUpdateInput>;
    unset?: SafeUnset<UserUnset, D>;
    select?: SelectArg<S, UserSelect>;
    include?: IncludeArg<I, UserInclude>;
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

  test('$live takes an optional typed where and resolves to a handle of the model row', () => {
    expect(generateLiveMethod(plain)).toBe(
      "$live(options?: { where?: UserWhere }): Promise<import('cerial').CerialLiveHandle<User>>;",
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
  test('returns the fifteen signatures in declaration order', () => {
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
      generateGroupByMethod(related),
      generateExistsMethod(related),
      generateRawMethod(),
      generateLiveMethod(related),
      generateIntrospectionMethods(),
    ]);
  });
});
