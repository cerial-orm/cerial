/**
 * Migration generator tests
 */

import { describe, expect, test } from 'bun:test';
import { generateModelDefineStatements } from '../../src/generators/migrations/define-generator';

describe('Migration Generator', () => {
  describe('Timestamp decorator migrations', () => {
    // Helper: manually build metadata for precise control of timestampDecorator
    function makeField(
      overrides: Partial<import('../../src/types').FieldMetadata>,
    ): import('../../src/types').FieldMetadata {
      return {
        name: 'test',
        type: 'string',
        isId: false,
        isUnique: false,
        isRequired: true,
        ...overrides,
      };
    }

    test('model with @now field generates TYPE datetime COMPUTED time::now()', () => {
      const model = {
        name: 'Event',
        tableName: 'event',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({ name: 'title', type: 'string' }),
          makeField({ name: 'serverTime', type: 'date', timestampDecorator: 'now' }),
        ],
      };

      const statements = generateModelDefineStatements(model);
      const nowStmt = statements.find((s) => s.includes('serverTime'));

      expect(nowStmt).toBeDefined();
      expect(nowStmt).toContain('TYPE datetime');
      expect(nowStmt).toContain('COMPUTED time::now()');
      expect(nowStmt).toBe('DEFINE FIELD OVERWRITE serverTime ON TABLE event TYPE datetime COMPUTED time::now();');
    });

    test('model with @createdAt field generates DEFAULT time::now()', () => {
      const model = {
        name: 'Post',
        tableName: 'post',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({ name: 'createdAt', type: 'date', isRequired: false, timestampDecorator: 'createdAt' }),
        ],
      };

      const statements = generateModelDefineStatements(model);
      const createdStmt = statements.find((s) => s.includes('createdAt'));

      expect(createdStmt).toBeDefined();
      expect(createdStmt).toContain('TYPE option<datetime>');
      expect(createdStmt).toContain('DEFAULT time::now()');
      expect(createdStmt).not.toContain('COMPUTED');
      expect(createdStmt).not.toContain('ALWAYS');
    });

    test('model with @updatedAt field generates DEFAULT ALWAYS time::now()', () => {
      const model = {
        name: 'Post',
        tableName: 'post',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({ name: 'updatedAt', type: 'date', isRequired: false, timestampDecorator: 'updatedAt' }),
        ],
      };

      const statements = generateModelDefineStatements(model);
      const updatedStmt = statements.find((s) => s.includes('updatedAt'));

      expect(updatedStmt).toBeDefined();
      expect(updatedStmt).toContain('TYPE option<datetime>');
      expect(updatedStmt).toContain('DEFAULT ALWAYS time::now()');
      expect(updatedStmt).not.toContain('COMPUTED');
    });

    test('model with all three timestamp decorators on separate fields', () => {
      const model = {
        name: 'Audit',
        tableName: 'audit',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({ name: 'serverTime', type: 'date', timestampDecorator: 'now' }),
          makeField({ name: 'createdAt', type: 'date', isRequired: false, timestampDecorator: 'createdAt' }),
          makeField({ name: 'updatedAt', type: 'date', isRequired: false, timestampDecorator: 'updatedAt' }),
        ],
      };

      const statements = generateModelDefineStatements(model);

      const nowStmt = statements.find((s) => s.includes('serverTime'));
      expect(nowStmt).toContain('TYPE datetime');
      expect(nowStmt).toContain('COMPUTED time::now()');

      const createdStmt = statements.find((s) => s.includes('createdAt'));
      expect(createdStmt).toContain('DEFAULT time::now()');
      expect(createdStmt).not.toContain('ALWAYS');

      const updatedStmt = statements.find((s) => s.includes('updatedAt'));
      expect(updatedStmt).toContain('DEFAULT ALWAYS time::now()');
    });

    test('required @createdAt Date field generates TYPE datetime DEFAULT time::now()', () => {
      const model = {
        name: 'Post',
        tableName: 'post',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({ name: 'createdAt', type: 'date', isRequired: true, timestampDecorator: 'createdAt' }),
        ],
      };

      const statements = generateModelDefineStatements(model);
      const createdStmt = statements.find((s) => s.includes('createdAt'));

      expect(createdStmt).toBeDefined();
      expect(createdStmt).toContain('TYPE datetime');
      expect(createdStmt).toContain('DEFAULT time::now()');
    });

    test('object sub-field with @now is skipped (SurrealDB requires COMPUTED to be top-level)', () => {
      const objFields = [
        makeField({ name: 'label', type: 'string' }),
        makeField({ name: 'serverTime', type: 'date', timestampDecorator: 'now' }),
      ];
      const objectRegistry = { Meta: { name: 'Meta', fields: objFields } };
      const model = {
        name: 'User',
        tableName: 'user',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({ name: 'meta', type: 'object', objectInfo: { objectName: 'Meta', fields: objFields } }),
        ],
      };

      const statements = generateModelDefineStatements(model, undefined, undefined, objectRegistry);
      const nowStmt = statements.find((s) => s.includes('meta.serverTime'));

      // @now on sub-fields is skipped entirely — no DEFINE FIELD generated
      expect(nowStmt).toBeUndefined();
    });

    test('object sub-field with @createdAt generates DEFAULT time::now() at dot-notation path', () => {
      const objFields = [
        makeField({ name: 'name', type: 'string' }),
        makeField({ name: 'createdAt', type: 'date', isRequired: false, timestampDecorator: 'createdAt' }),
      ];
      const objectRegistry = { Meta: { name: 'Meta', fields: objFields } };
      const model = {
        name: 'User',
        tableName: 'user',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({ name: 'meta', type: 'object', objectInfo: { objectName: 'Meta', fields: objFields } }),
        ],
      };

      const statements = generateModelDefineStatements(model, undefined, undefined, objectRegistry);
      const createdStmt = statements.find((s) => s.includes('meta.createdAt'));

      expect(createdStmt).toBeDefined();
      expect(createdStmt).toContain('TYPE option<datetime>');
      expect(createdStmt).toContain('DEFAULT time::now()');
      expect(createdStmt).not.toContain('ALWAYS');
      expect(createdStmt).not.toContain('COMPUTED');
    });

    test('object sub-field with @updatedAt generates DEFAULT ALWAYS time::now() at dot-notation path', () => {
      const objFields = [
        makeField({ name: 'name', type: 'string' }),
        makeField({ name: 'updatedAt', type: 'date', isRequired: false, timestampDecorator: 'updatedAt' }),
      ];
      const objectRegistry = { Meta: { name: 'Meta', fields: objFields } };
      const model = {
        name: 'User',
        tableName: 'user',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({ name: 'meta', type: 'object', objectInfo: { objectName: 'Meta', fields: objFields } }),
        ],
      };

      const statements = generateModelDefineStatements(model, undefined, undefined, objectRegistry);
      const updatedStmt = statements.find((s) => s.includes('meta.updatedAt'));

      expect(updatedStmt).toBeDefined();
      expect(updatedStmt).toContain('TYPE option<datetime>');
      expect(updatedStmt).toContain('DEFAULT ALWAYS time::now()');
      expect(updatedStmt).not.toContain('COMPUTED');
    });

    test('array object sub-field with @now is skipped (SurrealDB requires COMPUTED to be top-level)', () => {
      const objFields = [makeField({ name: 'serverTime', type: 'date', timestampDecorator: 'now' })];
      const objectRegistry = { Entry: { name: 'Entry', fields: objFields } };
      const model = {
        name: 'Log',
        tableName: 'log',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({
            name: 'entries',
            type: 'object',
            isArray: true,
            objectInfo: { objectName: 'Entry', fields: objFields },
          }),
        ],
      };

      const statements = generateModelDefineStatements(model, undefined, undefined, objectRegistry);
      const nowStmt = statements.find((s) => s.includes('entries.*.serverTime'));

      // @now on sub-fields is skipped entirely — no DEFINE FIELD generated
      expect(nowStmt).toBeUndefined();
    });

    test('array object sub-field with @createdAt uses .* notation', () => {
      const objFields = [
        makeField({ name: 'createdAt', type: 'date', isRequired: false, timestampDecorator: 'createdAt' }),
      ];
      const objectRegistry = { Entry: { name: 'Entry', fields: objFields } };
      const model = {
        name: 'Log',
        tableName: 'log',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({
            name: 'entries',
            type: 'object',
            isArray: true,
            objectInfo: { objectName: 'Entry', fields: objFields },
          }),
        ],
      };

      const statements = generateModelDefineStatements(model, undefined, undefined, objectRegistry);
      const createdStmt = statements.find((s) => s.includes('entries.*.createdAt'));

      expect(createdStmt).toBeDefined();
      expect(createdStmt).toContain('DEFAULT time::now()');
    });

    test('array object sub-field with @updatedAt uses .* notation', () => {
      const objFields = [
        makeField({ name: 'updatedAt', type: 'date', isRequired: false, timestampDecorator: 'updatedAt' }),
      ];
      const objectRegistry = { Entry: { name: 'Entry', fields: objFields } };
      const model = {
        name: 'Log',
        tableName: 'log',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({
            name: 'entries',
            type: 'object',
            isArray: true,
            objectInfo: { objectName: 'Entry', fields: objFields },
          }),
        ],
      };

      const statements = generateModelDefineStatements(model, undefined, undefined, objectRegistry);
      const updatedStmt = statements.find((s) => s.includes('entries.*.updatedAt'));

      expect(updatedStmt).toBeDefined();
      expect(updatedStmt).toContain('DEFAULT ALWAYS time::now()');
    });

    test('model with @defaultAlways(false) Bool field generates DEFAULT ALWAYS false', () => {
      const model = {
        name: 'Article',
        tableName: 'article',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({ name: 'reviewed', type: 'bool', isRequired: false, defaultAlwaysValue: false }),
        ],
      };

      const statements = generateModelDefineStatements(model);
      const reviewedStmt = statements.find((s) => s.includes('reviewed'));

      expect(reviewedStmt).toBeDefined();
      expect(reviewedStmt).toContain('DEFAULT ALWAYS false');
      expect(reviewedStmt).not.toContain('COMPUTED');
    });

    test('model with @defaultAlways("dirty") String field generates DEFAULT ALWAYS string', () => {
      const model = {
        name: 'Product',
        tableName: 'product',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({ name: 'syncStatus', type: 'string', isRequired: false, defaultAlwaysValue: 'dirty' }),
        ],
      };

      const statements = generateModelDefineStatements(model);
      const syncStmt = statements.find((s) => s.includes('syncStatus'));

      expect(syncStmt).toBeDefined();
      expect(syncStmt).toContain("DEFAULT ALWAYS 'dirty'");
    });

    test('model with @defaultAlways(0) Int field generates DEFAULT ALWAYS 0', () => {
      const model = {
        name: 'Task',
        tableName: 'task',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({ name: 'retryCount', type: 'int', isRequired: false, defaultAlwaysValue: 0 }),
        ],
      };

      const statements = generateModelDefineStatements(model);
      const retryStmt = statements.find((s) => s.includes('retryCount'));

      expect(retryStmt).toBeDefined();
      expect(retryStmt).toContain('DEFAULT ALWAYS 0');
    });

    test('model with @defaultAlways(1.5) Float field generates DEFAULT ALWAYS 1.5', () => {
      const model = {
        name: 'Score',
        tableName: 'score',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({ name: 'rating', type: 'float', isRequired: false, defaultAlwaysValue: 1.5 }),
        ],
      };

      const statements = generateModelDefineStatements(model);
      const ratingStmt = statements.find((s) => s.includes('rating'));

      expect(ratingStmt).toBeDefined();
      expect(ratingStmt).toContain('DEFAULT ALWAYS 1.5');
    });

    test('object sub-field with @defaultAlways generates DEFAULT ALWAYS at dot-notation path', () => {
      const objFields = [
        makeField({ name: 'label', type: 'string' }),
        makeField({ name: 'flagged', type: 'bool', isRequired: false, defaultAlwaysValue: false }),
      ];
      const objectRegistry = { ReviewMeta: { name: 'ReviewMeta', fields: objFields } };
      const model = {
        name: 'Article',
        tableName: 'article',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({
            name: 'meta',
            type: 'object',
            objectInfo: { objectName: 'ReviewMeta', fields: objFields },
          }),
        ],
      };

      const statements = generateModelDefineStatements(model, undefined, undefined, objectRegistry);
      const flaggedStmt = statements.find((s) => s.includes('meta.flagged'));

      expect(flaggedStmt).toBeDefined();
      expect(flaggedStmt).toContain('DEFAULT ALWAYS false');
    });

    test('array object sub-field with @defaultAlways uses .* notation', () => {
      const objFields = [
        makeField({ name: 'note', type: 'string', isRequired: false, defaultAlwaysValue: 'pending review' }),
      ];
      const objectRegistry = { ReviewMeta: { name: 'ReviewMeta', fields: objFields } };
      const model = {
        name: 'Article',
        tableName: 'article',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({
            name: 'reviews',
            type: 'object',
            isArray: true,
            objectInfo: { objectName: 'ReviewMeta', fields: objFields },
          }),
        ],
      };

      const statements = generateModelDefineStatements(model, undefined, undefined, objectRegistry);
      const noteStmt = statements.find((s) => s.includes('reviews.*.note'));

      expect(noteStmt).toBeDefined();
      expect(noteStmt).toContain("DEFAULT ALWAYS 'pending review'");
    });
  });
});
