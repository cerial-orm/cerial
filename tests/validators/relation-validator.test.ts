/**
 * Relation validator tests
 */

import { describe, expect, test } from 'bun:test';
import { parse } from '../../src/parser/parser';
import {
  validatePKStructure,
  validateCardinalityMatch,
  validateOnDeletePlacement,
  validateKeyRequired,
  validateRelationRules,
} from '../../src/cli/validators/relation-validator';

describe('relation-validator', () => {
  describe('validatePKStructure', () => {
    test('passes when Relation @field has paired Record field', () => {
      const source = `model Post {
  id Record @id
  authorId Record
  author Relation @field(authorId) @model(User)
}

model User {
  id Record @id
}`;
      const result = parse(source);
      const errors = validatePKStructure(result.ast);

      expect(errors.length).toBe(0);
    });

    test('fails when Relation @field references non-existent Record', () => {
      const source = `model Post {
  id Record @id
  author Relation @field(authorId) @model(User)
}

model User {
  id Record @id
}`;
      const result = parse(source);
      const errors = validatePKStructure(result.ast);

      expect(errors.length).toBe(1);
      expect(errors[0]?.message).toContain('authorId');
    });

    test('passes for reverse relation without @field', () => {
      const source = `model User {
  id Record @id
  posts Relation[] @model(Post)
}

model Post {
  id Record @id
  authorId Record
  author Relation @field(authorId) @model(User)
}`;
      const result = parse(source);
      const errors = validatePKStructure(result.ast);

      expect(errors.length).toBe(0);
    });
  });

  describe('validateCardinalityMatch', () => {
    test('passes when Record[] pairs with Relation[]', () => {
      const source = `model User {
  id Record @id
  tagIds Record[]
  tags Relation[] @field(tagIds) @model(Tag)
}

model Tag {
  id Record @id
}`;
      const result = parse(source);
      const errors = validateCardinalityMatch(result.ast);

      expect(errors.length).toBe(0);
    });

    test('passes when Record pairs with Relation', () => {
      const source = `model Post {
  id Record @id
  authorId Record
  author Relation @field(authorId) @model(User)
}

model User {
  id Record @id
}`;
      const result = parse(source);
      const errors = validateCardinalityMatch(result.ast);

      expect(errors.length).toBe(0);
    });

    test('fails when Record[] pairs with Relation (not array)', () => {
      const source = `model User {
  id Record @id
  tagIds Record[]
  tags Relation @field(tagIds) @model(Tag)
}

model Tag {
  id Record @id
}`;
      const result = parse(source);
      const errors = validateCardinalityMatch(result.ast);

      expect(errors.length).toBe(1);
      expect(errors[0]?.message).toContain('mismatch');
    });
  });

  describe('validateOnDeletePlacement', () => {
    test('passes when @onDelete is on optional relation', () => {
      const source = `model Profile {
  id Record @id
  userId Record?
  user Relation? @field(userId) @model(User) @onDelete(Cascade)
}

model User {
  id Record @id
}`;
      const result = parse(source);
      const errors = validateOnDeletePlacement(result.ast);

      expect(errors.length).toBe(0);
    });

    test('fails when @onDelete is on required relation', () => {
      const source = `model Profile {
  id Record @id
  userId Record
  user Relation @field(userId) @model(User) @onDelete(Cascade)
}

model User {
  id Record @id
}`;
      const result = parse(source);
      const errors = validateOnDeletePlacement(result.ast);

      expect(errors.length).toBe(1);
      expect(errors[0]?.message).toContain('optional');
    });

    test('fails when @onDelete is on array relation', () => {
      const source = `model User {
  id Record @id
  tagIds Record[]
  tags Relation[] @field(tagIds) @model(Tag) @onDelete(Cascade)
}

model Tag {
  id Record @id
}`;
      const result = parse(source);
      const errors = validateOnDeletePlacement(result.ast);

      // May have multiple errors (array and optionality checks)
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('array') || e.message.includes('optional'))).toBe(true);
    });
  });

  describe('validateKeyRequired', () => {
    test('passes when @key is used for multiple relations to same model', () => {
      const source = `model Document {
  id Record @id
  authorId Record
  author Relation @field(authorId) @model(Writer) @key(author)
  reviewerId Record?
  reviewer Relation? @field(reviewerId) @model(Writer) @key(reviewer)
}

model Writer {
  id Record @id
  authoredDocs Relation[] @model(Document) @key(author)
  reviewedDocs Relation[] @model(Document) @key(reviewer)
}`;
      const result = parse(source);
      const errors = validateKeyRequired(result.ast);

      expect(errors.length).toBe(0);
    });

    test('fails when multiple relations to same model lack @key', () => {
      const source = `model Document {
  id Record @id
  authorId Record
  author Relation @field(authorId) @model(Writer)
  reviewerId Record?
  reviewer Relation? @field(reviewerId) @model(Writer)
}

model Writer {
  id Record @id
}`;
      const result = parse(source);
      const errors = validateKeyRequired(result.ast);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.message).toContain('@key');
    });

    test('passes for single relation without @key', () => {
      const source = `model Post {
  id Record @id
  authorId Record
  author Relation @field(authorId) @model(User)
}

model User {
  id Record @id
  posts Relation[] @model(Post)
}`;
      const result = parse(source);
      const errors = validateKeyRequired(result.ast);

      expect(errors.length).toBe(0);
    });

    test('passes for self-referential with @key for forward/reverse pair', () => {
      const source = `model Employee {
  id Record @id
  managerId Record?
  manager Relation? @field(managerId) @model(Employee) @key(manages)
  directReports Relation[] @model(Employee) @key(manages)
}`;
      const result = parse(source);
      const errors = validateKeyRequired(result.ast);

      expect(errors.length).toBe(0);
    });
  });

  describe('validateRelationRules (combined)', () => {
    test('passes for valid 1-1 bidirectional relation', () => {
      const source = `model User {
  id Record @id
  profile Relation? @model(Profile)
}

model Profile {
  id Record @id
  userId Record?
  user Relation? @field(userId) @model(User)
}`;
      const result = parse(source);
      const errors = validateRelationRules(result.ast);

      expect(errors.length).toBe(0);
    });

    test('passes for valid n-n bidirectional relation', () => {
      const source = `model Student {
  id Record @id
  courseIds Record[]
  courses Relation[] @field(courseIds) @model(Course)
}

model Course {
  id Record @id
  studentIds Record[]
  students Relation[] @field(studentIds) @model(Student)
}`;
      const result = parse(source);
      const errors = validateRelationRules(result.ast);

      expect(errors.length).toBe(0);
    });

    test('passes for valid self-referential relation', () => {
      const source = `model Person {
  id Record @id
  mentorId Record?
  mentor Relation? @field(mentorId) @model(Person)
}`;
      const result = parse(source);
      const errors = validateRelationRules(result.ast);

      expect(errors.length).toBe(0);
    });
  });
});
