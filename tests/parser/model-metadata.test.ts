/**
 * Model metadata tests
 * New schema format: fieldName Type @decorators
 */

import { describe, expect, test } from 'bun:test';
import {
  astToRegistry,
  fieldToMetadata,
  getTimestampFields,
  getUniqueFields,
  modelToMetadata,
} from '../../src/parser/model-metadata';
import { parse } from '../../src/parser/parser';

describe('model-metadata', () => {
  test('converts AST to registry', () => {
    const source = `model User {
  id Record @id
  name String
  createdAt Date @now
}`;
    const result = parse(source);
    const registry = astToRegistry(result.ast);

    expect(registry['User']).toBeDefined();
    expect(registry['User']?.name).toBe('User');
    expect(registry['User']?.tableName).toBe('user');
    expect(registry['User']?.fields.length).toBe(3);
  });

  test('converts field with @id to metadata', () => {
    const source = `model User {
  id Record @id
  name String?
}`;
    const result = parse(source);
    const field1 = result.ast.models[0]?.fields[0];
    const field2 = result.ast.models[0]?.fields[1];

    if (field1) {
      const metadata1 = fieldToMetadata(field1);
      expect(metadata1.name).toBe('id');
      expect(metadata1.type).toBe('record');
      expect(metadata1.isId).toBe(true);
      // @id does NOT imply @unique - they are separate decorators
      expect(metadata1.isUnique).toBe(false);
      expect(metadata1.isRequired).toBe(true);
    }

    if (field2) {
      const metadata2 = fieldToMetadata(field2);
      expect(metadata2.name).toBe('name');
      expect(metadata2.isRequired).toBe(false);
    }
  });

  test('converts PascalCase model name to snake_case table name', () => {
    const source = `model UserProfile {
  id Record @id
}`;
    const result = parse(source);
    const model = result.ast.models[0];

    if (model) {
      const metadata = modelToMetadata(model);
      expect(metadata.name).toBe('UserProfile');
      expect(metadata.tableName).toBe('user_profile');
    }
  });

  test('getUniqueFields returns unique fields (not @id)', () => {
    const source = `model User {
  id Record @id
  email Email @unique
  name String
}`;
    const result = parse(source);
    const registry = astToRegistry(result.ast);
    const uniqueFields = getUniqueFields(registry['User']!);

    // Only email has @unique, @id is separate from @unique
    expect(uniqueFields.length).toBe(1);
    expect(uniqueFields[0]?.name).toBe('email');
    expect(uniqueFields[0]?.isUnique).toBe(true);
  });

  test('@id and @unique are separate decorators', () => {
    const source = `model User {
  id Record @id
  email Email @unique
  code String @id @unique
}`;
    const result = parse(source);
    const registry = astToRegistry(result.ast);
    const user = registry['User']!;

    const idField = user.fields.find((f) => f.name === 'id');
    const emailField = user.fields.find((f) => f.name === 'email');
    const codeField = user.fields.find((f) => f.name === 'code');

    expect(idField?.isId).toBe(true);
    expect(idField?.isUnique).toBe(false);

    expect(emailField?.isId).toBe(false);
    expect(emailField?.isUnique).toBe(true);

    expect(codeField?.isId).toBe(true);
    expect(codeField?.isUnique).toBe(true);
  });

  test('getTimestampFields returns fields with @now decorator', () => {
    const source = `model User {
  id Record @id
  createdAt Date @now
  updatedAt Date @now
}`;
    const result = parse(source);
    const registry = astToRegistry(result.ast);
    const timestampFields = getTimestampFields(registry['User']!);

    expect(timestampFields.length).toBe(2);
    expect(timestampFields.every((f) => f.timestampDecorator)).toBe(true);
  });

  test('parses Record[] as array type', () => {
    const source = `model User {
  id Record @id
  tagIds Record[]
}`;
    const result = parse(source);
    const registry = astToRegistry(result.ast);
    const user = registry['User']!;

    const tagIdsField = user.fields.find((f) => f.name === 'tagIds');
    expect(tagIdsField).toBeDefined();
    expect(tagIdsField?.type).toBe('record');
    expect(tagIdsField?.isArray).toBe(true);
    expect(tagIdsField?.isRequired).toBe(true); // Record[] is required (defaults to empty)
  });

  test('parses Record? as optional single record', () => {
    const source = `model User {
  id Record @id
  profileId Record?
}`;
    const result = parse(source);
    const registry = astToRegistry(result.ast);
    const user = registry['User']!;

    const profileIdField = user.fields.find((f) => f.name === 'profileId');
    expect(profileIdField).toBeDefined();
    expect(profileIdField?.type).toBe('record');
    expect(profileIdField?.isArray).toBeUndefined(); // Not an array
    expect(profileIdField?.isRequired).toBe(false);
  });

  test('parses Relation with @field and @model decorators', () => {
    const source = `model User {
  id Record @id
  profileId Record?
  profile Relation @field(profileId) @model(Profile)
}

model Profile {
  id Record @id
}`;
    const result = parse(source);
    const registry = astToRegistry(result.ast);
    const user = registry['User']!;

    const profileField = user.fields.find((f) => f.name === 'profile');
    expect(profileField).toBeDefined();
    expect(profileField?.type).toBe('relation');
    expect(profileField?.relationInfo).toBeDefined();
    expect(profileField?.relationInfo?.targetModel).toBe('Profile');
    expect(profileField?.relationInfo?.targetTable).toBe('profile');
    expect(profileField?.relationInfo?.fieldRef).toBe('profileId');
    expect(profileField?.relationInfo?.isReverse).toBe(false);
  });

  test('parses reverse Relation (without @field decorator)', () => {
    const source = `model User {
  id Record @id
  posts Relation @model(Post)
}

model Post {
  id Record @id
  authorId Record
  author Relation @field(authorId) @model(User)
}`;
    const result = parse(source);
    const registry = astToRegistry(result.ast);
    const user = registry['User']!;

    const postsField = user.fields.find((f) => f.name === 'posts');
    expect(postsField).toBeDefined();
    expect(postsField?.type).toBe('relation');
    expect(postsField?.relationInfo).toBeDefined();
    expect(postsField?.relationInfo?.targetModel).toBe('Post');
    expect(postsField?.relationInfo?.fieldRef).toBeUndefined();
    expect(postsField?.relationInfo?.isReverse).toBe(true);
  });

  // Primitive array tests
  describe('primitive array types', () => {
    test('parses String[] as string array type', () => {
      const source = `model User {
  id Record @id
  nicknames String[]
}`;
      const result = parse(source);
      const registry = astToRegistry(result.ast);
      const user = registry['User']!;

      const nicknamesField = user.fields.find((f) => f.name === 'nicknames');
      expect(nicknamesField).toBeDefined();
      expect(nicknamesField?.type).toBe('string');
      expect(nicknamesField?.isArray).toBe(true);
      expect(nicknamesField?.isRequired).toBe(true); // Arrays default to empty, so always "present"
    });

    test('parses Int[] as int array type', () => {
      const source = `model User {
  id Record @id
  scores Int[]
}`;
      const result = parse(source);
      const registry = astToRegistry(result.ast);
      const user = registry['User']!;

      const scoresField = user.fields.find((f) => f.name === 'scores');
      expect(scoresField).toBeDefined();
      expect(scoresField?.type).toBe('int');
      expect(scoresField?.isArray).toBe(true);
    });

    test('parses Date[] as date array type', () => {
      const source = `model User {
  id Record @id
  loginDates Date[]
}`;
      const result = parse(source);
      const registry = astToRegistry(result.ast);
      const user = registry['User']!;

      const loginDatesField = user.fields.find((f) => f.name === 'loginDates');
      expect(loginDatesField).toBeDefined();
      expect(loginDatesField?.type).toBe('date');
      expect(loginDatesField?.isArray).toBe(true);
    });

    test('parses Float[] as float array type', () => {
      const source = `model User {
  id Record @id
  ratings Float[]
}`;
      const result = parse(source);
      const registry = astToRegistry(result.ast);
      const user = registry['User']!;

      const ratingsField = user.fields.find((f) => f.name === 'ratings');
      expect(ratingsField).toBeDefined();
      expect(ratingsField?.type).toBe('float');
      expect(ratingsField?.isArray).toBe(true);
    });

    test('parses multiple array types in same model', () => {
      const source = `model User {
  id Record @id
  tags String[]
  scores Int[]
  dates Date[]
  tagIds Record[]
}`;
      const result = parse(source);
      const registry = astToRegistry(result.ast);
      const user = registry['User']!;

      const tagsField = user.fields.find((f) => f.name === 'tags');
      const scoresField = user.fields.find((f) => f.name === 'scores');
      const datesField = user.fields.find((f) => f.name === 'dates');
      const tagIdsField = user.fields.find((f) => f.name === 'tagIds');

      expect(tagsField?.type).toBe('string');
      expect(tagsField?.isArray).toBe(true);

      expect(scoresField?.type).toBe('int');
      expect(scoresField?.isArray).toBe(true);

      expect(datesField?.type).toBe('date');
      expect(datesField?.isArray).toBe(true);

      expect(tagIdsField?.type).toBe('record');
      expect(tagIdsField?.isArray).toBe(true);
    });
  });

  // Relation decorator tests
  describe('relation decorators', () => {
    test('parses @key decorator on relation', () => {
      const source = `model Employee {
  id Record @id
  managerId Record?
  manager Relation? @field(managerId) @model(Employee) @key(manages)
  directReports Relation[] @model(Employee) @key(manages)
}`;
      const result = parse(source);
      const registry = astToRegistry(result.ast);
      const employee = registry['Employee']!;

      const managerField = employee.fields.find((f) => f.name === 'manager');
      const reportsField = employee.fields.find((f) => f.name === 'directReports');

      expect(managerField?.relationInfo?.key).toBe('manages');
      expect(reportsField?.relationInfo?.key).toBe('manages');
    });

    test('parses @onDelete decorator on optional relation', () => {
      const source = `model Profile {
  id Record @id
  userId Record?
  user Relation? @field(userId) @model(User) @onDelete(Cascade)
}

model User {
  id Record @id
}`;
      const result = parse(source);
      const registry = astToRegistry(result.ast);
      const profile = registry['Profile']!;

      const userField = profile.fields.find((f) => f.name === 'user');

      expect(userField?.relationInfo?.onDelete).toBe('Cascade');
    });

    test('parses all @onDelete values', () => {
      const source = `model Child {
  id Record @id
  parentCascade Record?
  cascade Relation? @field(parentCascade) @model(Parent) @onDelete(Cascade)
  parentSetNull Record?
  setNull Relation? @field(parentSetNull) @model(Parent) @onDelete(SetNull)
  parentRestrict Record?
  restrict Relation? @field(parentRestrict) @model(Parent) @onDelete(Restrict)
  parentNoAction Record?
  noAction Relation? @field(parentNoAction) @model(Parent) @onDelete(NoAction)
}

model Parent {
  id Record @id
}`;
      const result = parse(source);
      const registry = astToRegistry(result.ast);
      const child = registry['Child']!;

      expect(child.fields.find((f) => f.name === 'cascade')?.relationInfo?.onDelete).toBe('Cascade');
      expect(child.fields.find((f) => f.name === 'setNull')?.relationInfo?.onDelete).toBe('SetNull');
      expect(child.fields.find((f) => f.name === 'restrict')?.relationInfo?.onDelete).toBe('Restrict');
      expect(child.fields.find((f) => f.name === 'noAction')?.relationInfo?.onDelete).toBe('NoAction');
    });

    test('parses Relation[] array syntax', () => {
      const source = `model User {
  id Record @id
  tagIds Record[]
  tags Relation[] @field(tagIds) @model(Tag)
}

model Tag {
  id Record @id
}`;
      const result = parse(source);
      const registry = astToRegistry(result.ast);
      const user = registry['User']!;

      const tagsField = user.fields.find((f) => f.name === 'tags');
      expect(tagsField?.type).toBe('relation');
      expect(tagsField?.isArray).toBe(true);
      expect(tagsField?.relationInfo?.targetModel).toBe('Tag');
      expect(tagsField?.relationInfo?.fieldRef).toBe('tagIds');
    });

    test('parses Relation? optional syntax', () => {
      const source = `model Post {
  id Record @id
  authorId Record?
  author Relation? @field(authorId) @model(User)
}

model User {
  id Record @id
}`;
      const result = parse(source);
      const registry = astToRegistry(result.ast);
      const post = registry['Post']!;

      const authorField = post.fields.find((f) => f.name === 'author');
      expect(authorField?.type).toBe('relation');
      expect(authorField?.isRequired).toBe(false);
      expect(authorField?.relationInfo?.targetModel).toBe('User');
    });

    test('parses multiple decorators on single relation', () => {
      const source = `model Document {
  id Record @id
  authorId Record
  author Relation @field(authorId) @model(Writer) @key(author)
  reviewerId Record?
  reviewer Relation? @field(reviewerId) @model(Writer) @key(reviewer) @onDelete(SetNull)
}

model Writer {
  id Record @id
}`;
      const result = parse(source);
      const registry = astToRegistry(result.ast);
      const doc = registry['Document']!;

      const authorField = doc.fields.find((f) => f.name === 'author');
      const reviewerField = doc.fields.find((f) => f.name === 'reviewer');

      // Author: @field, @model, @key
      expect(authorField?.relationInfo?.fieldRef).toBe('authorId');
      expect(authorField?.relationInfo?.targetModel).toBe('Writer');
      expect(authorField?.relationInfo?.key).toBe('author');
      expect(authorField?.relationInfo?.onDelete).toBeUndefined();

      // Reviewer: @field, @model, @key, @onDelete
      expect(reviewerField?.relationInfo?.fieldRef).toBe('reviewerId');
      expect(reviewerField?.relationInfo?.targetModel).toBe('Writer');
      expect(reviewerField?.relationInfo?.key).toBe('reviewer');
      expect(reviewerField?.relationInfo?.onDelete).toBe('SetNull');
    });
  });
});
