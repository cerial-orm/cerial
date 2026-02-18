/**
 * Types generator smoke tests
 *
 * These tests verify that generators produce output.
 * For comprehensive type-level verification, see type-safety.test.ts
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
  id Record @id
  name String
  email Email @unique
  age Int?
  createdAt Date @now
}
`;

const registry = parseModelRegistry(dsl);
const userModel = registry.User!;

// Parse model with Record[] for array testing
const dslWithRecords = `
model User {
  id Record @id
  profileId Record?
  tagIds Record[]
  profile Relation @field(profileId) @model(Profile)
  tags Relation @field(tagIds) @model(Tag)
}

model Profile {
  id Record @id
}

model Tag {
  id Record @id
}
`;

const registryWithRecords = parseModelRegistry(dslWithRecords);
const userWithRecordsModel = registryWithRecords.User!;

describe('types generator', () => {
  describe('generateInterface', () => {
    test('generates interface with correct structure', () => {
      const result = generateInterface(userModel);

      // Smoke test: verify output exists and has basic structure
      expect(result).toContain('export interface User {');
      expect(result).toContain('id:');
      expect(result).toContain('name:');
      expect(result).toContain('email:');
      expect(result).toContain('age?:');
      expect(result).toContain('createdAt:');
      expect(result.length).toBeGreaterThan(50);
    });

    test('generates interface with Record[] as string[]', () => {
      const result = generateInterface(userWithRecordsModel);

      expect(result).toContain('export interface User {');
      expect(result).toContain('tagIds:');
      // Relation fields should be skipped
      expect(result).not.toContain('profile:');
      expect(result).not.toContain('tags:');
    });
  });

  describe('generateCreateType', () => {
    test('generates create type', () => {
      const result = generateCreateType(userModel);

      expect(result).toContain('export type UserCreate');
      expect(result).toContain('User');
      expect(result.length).toBeGreaterThan(20);
    });
  });

  describe('generateUpdateType', () => {
    test('generates update type as partial', () => {
      const result = generateUpdateType(userModel);

      expect(result).toContain('export type UserUpdate');
      expect(result).toContain('Partial<');
      expect(result.length).toBeGreaterThan(20);
    });

    test('generates update type with array operations', () => {
      const result = generateUpdateType(userWithRecordsModel);

      expect(result).toContain('export type UserUpdate');
      expect(result).toContain('tagIds?:');
      expect(result).toContain('push?:');
      expect(result).toContain('unset?:');
    });
  });

  describe('generateSelectType', () => {
    test('generates select type with field options', () => {
      const result = generateSelectType(userModel);

      expect(result).toContain('export type UserSelect');
      expect(result).toContain('boolean');
      expect(result.length).toBeGreaterThan(30);
    });
  });

  describe('generateWhereInterface', () => {
    test('generates where type with operators', () => {
      const result = generateWhereInterface(userModel);

      expect(result).toContain('export interface UserWhere');
      // String operators
      expect(result).toContain('eq?:');
      expect(result).toContain('contains?:');
      // Number operators
      expect(result).toContain('gt?:');
      expect(result).toContain('between?:');
      expect(result.length).toBeGreaterThan(100);
    });
  });

  describe('Primitive array types', () => {
    const dslWithArrays = `
model User {
  id Record @id
  nicknames String[]
  scores Int[]
  loginDates Date[]
  ratings Float[]
}
`;
    const registryWithArrays = parseModelRegistry(dslWithArrays);
    const userWithArraysModel = registryWithArrays.User!;

    test('generates interface with primitive arrays', () => {
      const result = generateInterface(userWithArraysModel);

      expect(result).toContain('nicknames:');
      expect(result).toContain('scores:');
      expect(result).toContain('loginDates:');
      expect(result).toContain('ratings:');
    });

    test('generates update type with array operations', () => {
      const result = generateUpdateType(userWithArraysModel);

      expect(result).toContain('nicknames?:');
      expect(result).toContain('push?:');
      expect(result).toContain('unset?:');
    });

    test('generates where type with array operators', () => {
      const result = generateWhereInterface(userWithArraysModel);

      expect(result).toContain('has?:');
      expect(result).toContain('hasAll?:');
      expect(result).toContain('hasAny?:');
      expect(result).toContain('isEmpty?:');
    });
  });

  describe('Relations', () => {
    const dslForwardRelation = `
model User {
  id Record @id
  profileId Record?
  profile Relation @field(profileId) @model(Profile)
}

model Profile {
  id Record @id
  bio String?
}
`;
    const registryForward = parseModelRegistry(dslForwardRelation);
    const userForward = registryForward.User!;

    const dslReverseRelation = `
model User {
  id Record @id
  posts Relation @model(Post)
}

model Post {
  id Record @id
  authorId Record
  author Relation @field(authorId) @model(User)
}
`;
    const registryReverse = parseModelRegistry(dslReverseRelation);
    const userReverse = registryReverse.User!;

    test('forward relation has correct relationInfo', () => {
      const profileField = userForward.fields.find((f) => f.name === 'profile');

      expect(profileField).toBeDefined();
      expect(profileField?.relationInfo?.fieldRef).toBe('profileId');
      expect(profileField?.relationInfo?.isReverse).toBe(false);
      expect(profileField?.relationInfo?.targetModel).toBe('Profile');
    });

    test('reverse relation has correct relationInfo', () => {
      const postsField = userReverse.fields.find((f) => f.name === 'posts');

      expect(postsField).toBeDefined();
      expect(postsField?.relationInfo?.fieldRef).toBeUndefined();
      expect(postsField?.relationInfo?.isReverse).toBe(true);
      expect(postsField?.relationInfo?.targetModel).toBe('Post');
    });

    test('generates where with nested relation types', () => {
      const result = generateWhereInterface(userForward, registryForward);

      expect(result).toContain('export interface UserWhere');
      expect(result).toContain('profile?: ProfileWhere');
    });

    test('generates where with reverse relation types', () => {
      const result = generateWhereInterface(userReverse, registryReverse);

      expect(result).toContain('export interface UserWhere');
      expect(result).toContain('posts?: PostWhere');
    });
  });
});
