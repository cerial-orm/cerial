/**
 * Unit Tests: Filter Handlers
 *
 * Tests the isNull, isDefined, and isNone filter operator handlers.
 */

import { describe, expect, test } from 'bun:test';
import { handleIsNull, handleIsNotNull } from '../../../src/query/filters/special-operators/isNull-handler';
import { handleIsDefined, handleIsNotDefined } from '../../../src/query/filters/special-operators/isDefined-handler';
import { handleIsNone } from '../../../src/query/filters/comparison-operators/is-none-handler';
import { getOperatorHandler } from '../../../src/query/filters/registry';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import type { FieldMetadata } from '../../../src/types';

const dummyCtx = createCompileContext();

const dummyField: FieldMetadata = {
  name: 'test',
  type: 'string',
  isId: false,
  isUnique: false,
  isRequired: true,
  isArray: false,
};

describe('Filter Handlers', () => {
  describe('handleIsNull', () => {
    test('generates field = NULL', () => {
      const result = handleIsNull('name');
      expect(result.text).toBe('name = NULL');
      expect(result.vars).toEqual({});
    });

    test('generates correct SQL for nested field paths', () => {
      const result = handleIsNull('address.city');
      expect(result.text).toBe('address.city = NULL');
    });
  });

  describe('handleIsNotNull', () => {
    test('generates field != NULL', () => {
      const result = handleIsNotNull('name');
      expect(result.text).toBe('name != NULL');
      expect(result.vars).toEqual({});
    });
  });

  describe('handleIsDefined', () => {
    test('generates field != NONE', () => {
      const result = handleIsDefined('bio');
      expect(result.text).toBe('bio != NONE');
      expect(result.vars).toEqual({});
    });
  });

  describe('handleIsNotDefined', () => {
    test('generates field = NONE', () => {
      const result = handleIsNotDefined('bio');
      expect(result.text).toBe('bio = NONE');
      expect(result.vars).toEqual({});
    });
  });

  describe('handleIsNone', () => {
    test('isNone: true generates field = NONE', () => {
      const result = handleIsNone(dummyCtx, 'bio', true, dummyField);
      expect(result.text).toBe('bio = NONE');
      expect(result.vars).toEqual({});
    });

    test('isNone: false generates field != NONE', () => {
      const result = handleIsNone(dummyCtx, 'bio', false, dummyField);
      expect(result.text).toBe('bio != NONE');
      expect(result.vars).toEqual({});
    });
  });

  describe('registry integration', () => {
    test('isNull: true → field = NULL (via registry)', () => {
      const handler = getOperatorHandler('isNull');
      expect(handler).toBeDefined();

      const result = handler!(dummyCtx, 'name', true, dummyField);
      expect(result.text).toBe('name = NULL');
    });

    test('isNull: false → field != NULL (via registry)', () => {
      const handler = getOperatorHandler('isNull');

      const result = handler!(dummyCtx, 'name', false, dummyField);
      expect(result.text).toBe('name != NULL');
    });

    test('isDefined: true → field != NONE (via registry)', () => {
      const handler = getOperatorHandler('isDefined');
      expect(handler).toBeDefined();

      const result = handler!(dummyCtx, 'bio', true, dummyField);
      expect(result.text).toBe('bio != NONE');
    });

    test('isDefined: false → field = NONE (via registry)', () => {
      const handler = getOperatorHandler('isDefined');

      const result = handler!(dummyCtx, 'bio', false, dummyField);
      expect(result.text).toBe('bio = NONE');
    });

    test('isNone: true → field = NONE (via registry)', () => {
      const handler = getOperatorHandler('isNone');
      expect(handler).toBeDefined();

      const result = handler!(dummyCtx, 'bio', true, dummyField);
      expect(result.text).toBe('bio = NONE');
    });

    test('isNone: false → field != NONE (via registry)', () => {
      const handler = getOperatorHandler('isNone');

      const result = handler!(dummyCtx, 'bio', false, dummyField);
      expect(result.text).toBe('bio != NONE');
    });

    test('isNull and isNone generate distinct SurrealQL', () => {
      const isNullHandler = getOperatorHandler('isNull');
      const isNoneHandler = getOperatorHandler('isNone');

      const isNullResult = isNullHandler!(dummyCtx, 'bio', true, dummyField);
      const isNoneResult = isNoneHandler!(dummyCtx, 'bio', true, dummyField);

      // isNull checks for stored null value, isNone checks for absent field
      expect(isNullResult.text).toBe('bio = NULL');
      expect(isNoneResult.text).toBe('bio = NONE');
      expect(isNullResult.text).not.toBe(isNoneResult.text);
    });
  });
});
