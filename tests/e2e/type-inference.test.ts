/**
 * E2E Runtime Tests for Generated Client
 *
 * Tests that the generated client structure is correct at runtime.
 * Type-level verification is done in tests/e2e/typechecks/*.check.ts
 * and verified with `bun run typecheck`.
 */

import { describe, expect, test } from 'bun:test';
import { modelRegistry } from './generated';
import { CerialClient, createTestClient } from './test-helper';

describe('E2E Generated Client', () => {
  describe('Exports', () => {
    test('should export CerialClient class', () => {
      expect(typeof CerialClient).toBe('function');
    });

    test('should export modelRegistry', () => {
      expect(typeof modelRegistry).toBe('object');
      expect(modelRegistry).toBeDefined();
    });
  });

  describe('Client structure', () => {
    test('should have connection methods', () => {
      const client = createTestClient();
      expect(client).toBeDefined();
      expect(typeof client.connect).toBe('function');
      expect(typeof client.disconnect).toBe('function');
    });

    test('should have db property', () => {
      const client = createTestClient();
      expect(client).toBeDefined();
    });
  });

  describe('Model registry', () => {
    test('should contain User model', () => {
      expect(modelRegistry['User']).toBeDefined();
    });

    test('should contain Profile model', () => {
      expect(modelRegistry['Profile']).toBeDefined();
    });

    test('should contain Post model', () => {
      expect(modelRegistry['Post']).toBeDefined();
    });

    test('should contain Tag model', () => {
      expect(modelRegistry['Tag']).toBeDefined();
    });
  });
});
