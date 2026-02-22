/**
 * Unit Tests: Client Naming
 *
 * Tests parameterized client class naming for multi-schema setups.
 */

import { describe, expect, test } from 'bun:test';
import { generateClientTemplate } from '../../../src/generators/client/template';
import type { ModelMetadata } from '../../../src/types';

describe('Client Naming', () => {
  const mockModels: ModelMetadata[] = [
    {
      name: 'User',
      tableName: 'user',
      fields: [],
    },
  ];

  describe('generateClientTemplate', () => {
    test('should use default CerialClient when no clientClassName provided', () => {
      const template = generateClientTemplate(mockModels);

      expect(template).toContain('export class CerialClient {');
      expect(template).toContain('export interface CerialClientConnectConfig');
    });

    test('should use custom clientClassName when provided', () => {
      const template = generateClientTemplate(mockModels, 'AuthCerialClient');

      expect(template).toContain('export class AuthCerialClient {');
      expect(template).toContain('export interface AuthCerialClientConnectConfig');
      expect(template).not.toContain('export class CerialClient {');
    });

    test('should parameterize connect method signature with custom clientClassName', () => {
      const template = generateClientTemplate(mockModels, 'CmsCerialClient');

      expect(template).toContain('async connect(config: CmsCerialClientConnectConfig)');
    });

    test('should handle various custom client names', () => {
      const names = ['AuthCerialClient', 'CmsCerialClient', 'ApiCerialClient', 'CustomCerialClient'];

      for (const name of names) {
        const template = generateClientTemplate(mockModels, name);

        expect(template).toContain(`export class ${name} {`);
        expect(template).toContain(`export interface ${name}ConnectConfig`);
        expect(template).toContain(`async connect(config: ${name}ConnectConfig)`);
      }
    });

    test('should preserve all other template content with custom clientClassName', () => {
      const template = generateClientTemplate(mockModels, 'CustomCerialClient');

      // Verify other key parts are still present
      expect(template).toContain('export interface TypedDb {');
      expect(template).toContain('export interface ClientOptions {');
      expect(template).toContain('export type MigrationEventType');
      expect(template).toContain('async migrate(): Promise<void>');
      expect(template).toContain('async $transaction');
    });
  });
});
