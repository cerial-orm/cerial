/**
 * Types generator tests
 */

import { describe, expect, test } from 'bun:test';
import {
  generateCreateType,
  generateInterface,
  generateSelectType,
  generateUpdateType,
  generateWhereInterface,
} from '../../src/generators/types';
import { parseModelRegistry } from '../test-helpers';

// Parse model using DSL to ensure correct behavior
const dsl = `
model User {
  id String @id
  name String
  email Email @unique
  age Int?
  createdAt Date @now
}
`;

const registry = parseModelRegistry(dsl);
const userModel = registry['User']!;

// Parse model with Record[] for array testing
const dslWithRecords = `
model User {
  id String @id
  profileId Record?
  tagIds Record[]
  profile Relation @field(profileId) @model(Profile)
  tags Relation @field(tagIds) @model(Tag)
}

model Profile {
  id String @id
}

model Tag {
  id String @id
}
`;

const registryWithRecords = parseModelRegistry(dslWithRecords);
const userWithRecordsModel = registryWithRecords['User']!;

describe('types generator', () => {
  describe('generateInterface', () => {
    test('generates interface with all fields', () => {
      const result = generateInterface(userModel);

      expect(result).toContain('export interface User {');
      expect(result).toContain('id: string;'); // id field is now required
      expect(result).toContain('name: string;');
      expect(result).toContain('email: string;');
      expect(result).toContain('age?: number | null;');
      expect(result).toContain('createdAt: Date;');
    });
  });

  describe('generateCreateType', () => {
    test('generates create type with @id and @now fields optional', () => {
      const result = generateCreateType(userModel);

      expect(result).toContain('export type UserCreate');
      // @id field (id) should be optional
      expect(result).toContain(`Partial<Pick<User, 'id' | 'age' | 'createdAt'>>`);
    });
  });

  describe('generateUpdateType', () => {
    test('generates update type as partial without id', () => {
      const result = generateUpdateType(userModel);

      expect(result).toContain('export type UserUpdate');
      expect(result).toContain('Partial<');
      expect(result).toContain("Omit<User, 'id'>"); // only id field is omitted in update
    });
  });

  describe('generateSelectType', () => {
    test('generates select type requiring at least one field', () => {
      const result = generateSelectType(userModel);

      expect(result).toContain('export type UserSelect');
      expect(result).toContain('| { id: boolean }');
      expect(result).toContain('| { name: boolean }');
      expect(result).toContain('| { email: boolean }');
      expect(result).toContain('| { age: boolean }');
      expect(result).toContain('| { createdAt: boolean }');
    });
  });

  describe('generateWhereInterface', () => {
    test('generates where type with appropriate operators', () => {
      const result = generateWhereInterface(userModel);

      expect(result).toContain('export interface UserWhere');

      // id field (string type, @id) - no ordering, no between, no isNull (id fields are always present)
      expect(result).toContain('id?:');
      expect(result).toContain('eq?: string;');
      expect(result).toContain('neq?: string;');
      expect(result).toContain('contains?: string;');
      expect(result).toContain('startsWith?: string;');
      expect(result).toContain('endsWith?: string;');

      // id field should NOT have isNull even though isRequired is false
      expect(result.substring(result.indexOf('id?'), result.indexOf('name?'))).not.toContain('isNull');

      // name field (string type, required) - no ordering, no between, no isNull
      expect(result).toContain('name?:');

      // email field (email type, required) - no ordering, no between, no isNull
      expect(result).toContain('email?:');

      // age field (int type, optional) - has ordering, between, and isNull
      expect(result).toContain('age?:');
      expect(result).toContain('gt?: number;');
      expect(result).toContain('gte?: number;');
      expect(result).toContain('lt?: number;');
      expect(result).toContain('lte?: number;');
      expect(result).toContain('between?: [number, number];');
      expect(result).toContain('isNull?: boolean;');

      // createdAt field (date type, required) - has ordering, between, but no isNull
      expect(result).toContain('createdAt?:');
      expect(result).toContain('gt?: Date;');
      expect(result).toContain('between?: [Date, Date]');
    });
  });

  describe('Record[] and Relation types', () => {
    test('generates interface with Record[] as string[]', () => {
      const result = generateInterface(userWithRecordsModel);

      expect(result).toContain('export interface User {');
      expect(result).toContain('id: string;');
      expect(result).toContain('profileId?: string | null;'); // Record? is optional string
      expect(result).toContain('tagIds: string[];'); // Record[] is string array
      // Relation fields should be skipped
      expect(result).not.toContain('profile:');
      expect(result).not.toContain('tags:');
    });

    test('generates update type with array operations for Record[]', () => {
      const result = generateUpdateType(userWithRecordsModel);

      expect(result).toContain('export type UserUpdate');
      // tagIds should have push/unset operations
      expect(result).toContain('tagIds?:');
      expect(result).toContain('push?:');
      expect(result).toContain('unset?:');
    });
  });

  describe('Primitive array types (String[], Int[], Date[])', () => {
    // Parse model with primitive arrays
    const dslWithArrays = `
model User {
  id String @id
  nicknames String[]
  scores Int[]
  loginDates Date[]
  ratings Float[]
}
`;
    const registryWithArrays = parseModelRegistry(dslWithArrays);
    const userWithArraysModel = registryWithArrays['User']!;

    test('generates interface with primitive arrays', () => {
      const result = generateInterface(userWithArraysModel);

      expect(result).toContain('export interface User {');
      expect(result).toContain('nicknames: string[];');
      expect(result).toContain('scores: number[];');
      expect(result).toContain('loginDates: Date[];');
      expect(result).toContain('ratings: number[];');
    });

    test('generates create type with arrays as optional', () => {
      const result = generateCreateType(userWithArraysModel);

      expect(result).toContain('export type UserCreate');
      // Arrays should be in the optional (Partial) fields
      expect(result).toContain("'nicknames'");
      expect(result).toContain("'scores'");
      expect(result).toContain("'loginDates'");
      expect(result).toContain("'ratings'");
    });

    test('generates update type with array operations for all array types', () => {
      const result = generateUpdateType(userWithArraysModel);

      expect(result).toContain('export type UserUpdate');

      // String[] should have string push/unset
      expect(result).toContain('nicknames?:');
      expect(result).toContain('push?: string | string[]');
      expect(result).toContain('unset?: string | string[]');

      // Int[] should have number push/unset
      expect(result).toContain('scores?:');
      expect(result).toContain('push?: number | number[]');
      expect(result).toContain('unset?: number | number[]');

      // Date[] should have Date push/unset
      expect(result).toContain('loginDates?:');
      expect(result).toContain('push?: Date | Date[]');
      expect(result).toContain('unset?: Date | Date[]');
    });

    test('generates where type with array operators for all array types', () => {
      const result = generateWhereInterface(userWithArraysModel);

      expect(result).toContain('export interface UserWhere');

      // String[] - has, hasAll, hasAny, isEmpty
      expect(result).toContain('nicknames?:');
      expect(result).toContain('has?: string');
      expect(result).toContain('hasAll?: string[]');
      expect(result).toContain('hasAny?: string[]');
      expect(result).toContain('isEmpty?: boolean');

      // Int[] - has, hasAll, hasAny, isEmpty with number type
      expect(result).toContain('scores?:');
      expect(result).toContain('has?: number');
      expect(result).toContain('hasAll?: number[]');
      expect(result).toContain('hasAny?: number[]');

      // Date[] - has, hasAll, hasAny, isEmpty with Date type
      expect(result).toContain('loginDates?:');
      expect(result).toContain('has?: Date');
      expect(result).toContain('hasAll?: Date[]');
      expect(result).toContain('hasAny?: Date[]');
    });
  });

  describe('Forward and Reverse Relations', () => {
    // Model with forward relation (has @field decorator)
    const dslForwardRelation = `
model User {
  id String @id
  profileId Record?
  profile Relation @field(profileId) @model(Profile)
}

model Profile {
  id String @id
  bio String?
}
`;
    const registryForward = parseModelRegistry(dslForwardRelation);
    const userForward = registryForward['User']!;

    // Model with reverse relation (no @field decorator)
    const dslReverseRelation = `
model User {
  id String @id
  posts Relation @model(Post)
}

model Post {
  id String @id
  authorId Record
  author Relation @field(authorId) @model(User)
}
`;
    const registryReverse = parseModelRegistry(dslReverseRelation);
    const userReverse = registryReverse['User']!;

    test('forward relation has fieldRef and isReverse=false', () => {
      const profileField = userForward.fields.find((f) => f.name === 'profile');

      expect(profileField).toBeDefined();
      expect(profileField?.relationInfo?.fieldRef).toBe('profileId');
      expect(profileField?.relationInfo?.isReverse).toBe(false);
      expect(profileField?.relationInfo?.targetModel).toBe('Profile');
    });

    test('reverse relation has no fieldRef and isReverse=true', () => {
      const postsField = userReverse.fields.find((f) => f.name === 'posts');

      expect(postsField).toBeDefined();
      expect(postsField?.relationInfo?.fieldRef).toBeUndefined();
      expect(postsField?.relationInfo?.isReverse).toBe(true);
      expect(postsField?.relationInfo?.targetModel).toBe('Post');
    });

    test('generates where with nested relation types', () => {
      const result = generateWhereInterface(userForward, registryForward);

      expect(result).toContain('export interface UserWhere');
      expect(result).toContain('profile?: ProfileWhere;');
    });

    test('generates where with reverse relation nested type', () => {
      const result = generateWhereInterface(userReverse, registryReverse);

      expect(result).toContain('export interface UserWhere');
      expect(result).toContain('posts?: PostWhere;');
    });
  });
});
