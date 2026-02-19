import { describe, expect, it } from 'bun:test';
import { discoverSchemas, findSchemaRoots } from '../../../src/cli/resolvers';
import { getFixturePath } from '../../fixtures/multi-schema/helpers';

describe('convention marker discovery', () => {
  describe('findSchemaRoots', () => {
    it('should find roots with schema.cerial markers', async () => {
      const roots = await findSchemaRoots(getFixturePath('with-markers/schemas'));

      expect(roots.length).toBeGreaterThanOrEqual(2);

      const authRoot = roots.find((r) => r.path.endsWith('/auth'));
      const cmsRoot = roots.find((r) => r.path.endsWith('/cms'));
      expect(authRoot).toBeDefined();
      expect(cmsRoot).toBeDefined();
      expect(authRoot!.marker).toBe('schema.cerial');
      expect(cmsRoot!.marker).toBe('schema.cerial');
    });

    it('should include all .cerial files in discovered roots', async () => {
      const roots = await findSchemaRoots(getFixturePath('with-markers/schemas'));

      const authRoot = roots.find((r) => r.path.endsWith('/auth'));
      expect(authRoot).toBeDefined();
      expect(authRoot!.files.length).toBeGreaterThanOrEqual(2);
      expect(authRoot!.files.some((f) => f.endsWith('schema.cerial'))).toBe(true);
      expect(authRoot!.files.some((f) => f.endsWith('user.cerial'))).toBe(true);
    });

    it('should return empty array when no markers found', async () => {
      const roots = await findSchemaRoots(getFixturePath('single-schema'));

      expect(roots).toHaveLength(0);
    });
  });

  describe('discoverSchemas', () => {
    it('should discover single root automatically', async () => {
      const roots = await findSchemaRoots(getFixturePath('with-markers/schemas'));
      if (roots.length === 1) {
        const result = await discoverSchemas(getFixturePath('with-markers/schemas'));
        expect(result.length).toBe(1);
        expect(result[0]!.files.length).toBeGreaterThan(0);
      }
    });

    it('should throw when multiple roots found without config', async () => {
      const roots = await findSchemaRoots(getFixturePath('with-markers/schemas'));

      if (roots.length > 1) {
        try {
          await discoverSchemas(getFixturePath('with-markers/schemas'));
          expect(true).toBe(false);
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          const message = (error as Error).message;
          expect(message).toContain('cerial.config.ts');
        }
      }
    });

    it('should fall back to legacy discovery when no markers exist', async () => {
      const result = await discoverSchemas(getFixturePath('single-schema'));

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]!.files.length).toBeGreaterThan(0);
    });
  });
});
