import { describe, expect, test } from 'bun:test';
import { cerialRangeToLsp } from '../../server/src/utils/position';
import { parseFixture } from './helpers';

describe('Symbols Logic', () => {
  describe('document symbols from AST', () => {
    test('simple-model.cerial has 2 model symbols', () => {
      const ast = parseFixture('simple-model.cerial');

      expect(ast.models.length).toBe(2);
      expect(ast.models[0]!.name).toBe('User');
      expect(ast.models[1]!.name).toBe('Article');
    });

    test('complex-types.cerial has all block types', () => {
      const ast = parseFixture('complex-types.cerial');

      expect(ast.objects.length).toBeGreaterThan(0);
      expect(ast.tuples.length).toBeGreaterThan(0);
      expect(ast.enums.length).toBeGreaterThan(0);
      expect(ast.literals.length).toBeGreaterThan(0);
      expect(ast.models.length).toBeGreaterThan(0);
    });

    test('model fields are nested within model', () => {
      const ast = parseFixture('simple-model.cerial');
      const user = ast.models.find((m) => m.name === 'User')!;

      expect(user.fields.length).toBeGreaterThan(0);

      const fieldNames = user.fields.map((f) => f.name);

      expect(fieldNames).toContain('id');
      expect(fieldNames).toContain('email');
      expect(fieldNames).toContain('name');
      expect(fieldNames).toContain('age');
    });

    test('object fields are nested within object', () => {
      const ast = parseFixture('complex-types.cerial');
      const addr = ast.objects.find((o) => o.name === 'Address')!;

      expect(addr.fields.length).toBe(3); // street, city, zip
    });

    test('field decorators are nested within fields', () => {
      const ast = parseFixture('simple-model.cerial');
      const user = ast.models.find((m) => m.name === 'User')!;
      const idField = user.fields.find((f) => f.name === 'id')!;

      expect(idField.decorators.length).toBe(1);
      expect(idField.decorators[0]!.type).toBe('id');
    });

    test('enum values are accessible', () => {
      const ast = parseFixture('complex-types.cerial');
      const status = ast.enums.find((e) => e.name === 'Status')!;

      expect(status.values).toEqual(['ACTIVE', 'INACTIVE', 'PENDING', 'ARCHIVED']);
    });

    test('tuple elements are accessible', () => {
      const ast = parseFixture('complex-types.cerial');
      const point = ast.tuples.find((t) => t.name === 'Point3D')!;

      expect(point.elements.length).toBe(3);
    });

    test('literal variants are accessible', () => {
      const ast = parseFixture('complex-types.cerial');
      const severity = ast.literals.find((l) => l.name === 'Severity')!;

      expect(severity.variants.length).toBe(5);
    });
  });

  describe('symbol ranges', () => {
    test('model range converts to LSP range', () => {
      const ast = parseFixture('simple-model.cerial');
      const user = ast.models.find((m) => m.name === 'User')!;
      const lspRange = cerialRangeToLsp(user.range);

      // LSP ranges are 0-indexed
      expect(lspRange.start.line).toBeGreaterThanOrEqual(0);
      expect(lspRange.end.line).toBeGreaterThan(lspRange.start.line);
    });

    test('field range is within parent model range', () => {
      const ast = parseFixture('simple-model.cerial');
      const user = ast.models.find((m) => m.name === 'User')!;
      const emailField = user.fields.find((f) => f.name === 'email')!;

      expect(emailField.range.start.line).toBeGreaterThanOrEqual(user.range.start.line);
      expect(emailField.range.end.line).toBeLessThanOrEqual(user.range.end.line);
    });

    test('decorator range is within field range', () => {
      const ast = parseFixture('simple-model.cerial');
      const user = ast.models.find((m) => m.name === 'User')!;
      const emailField = user.fields.find((f) => f.name === 'email')!;
      const uniqueDec = emailField.decorators.find((d) => d.type === 'unique')!;

      expect(uniqueDec.range.start.line).toBe(emailField.range.start.line);
    });
  });

  describe('workspace symbols search', () => {
    test('query filters symbols by name (case-insensitive)', () => {
      const ast = parseFixture('complex-types.cerial');
      const query = 'addr';
      const allNames = [
        ...ast.models.map((m) => m.name),
        ...ast.objects.map((o) => o.name),
        ...ast.tuples.map((t) => t.name),
        ...ast.enums.map((e) => e.name),
        ...ast.literals.map((l) => l.name),
      ];

      const matches = allNames.filter((n) => n.toLowerCase().includes(query));

      expect(matches).toContain('Address');
    });

    test('empty query matches all symbols', () => {
      const ast = parseFixture('complex-types.cerial');
      const query = '';
      const allNames = [
        ...ast.models.map((m) => m.name),
        ...ast.objects.map((o) => o.name),
        ...ast.tuples.map((t) => t.name),
        ...ast.enums.map((e) => e.name),
        ...ast.literals.map((l) => l.name),
      ];

      const matches = allNames.filter((n) => !query || n.toLowerCase().includes(query));

      expect(matches.length).toBe(allNames.length);
    });
  });

  describe('abstract model symbol', () => {
    test('abstract model has abstract flag', () => {
      const ast = parseFixture('inheritance.cerial');
      const baseEntity = ast.models.find((m) => m.name === 'BaseEntity');

      expect(baseEntity).toBeDefined();
      expect(baseEntity!.abstract).toBe(true);
    });

    test('concrete model does not have abstract flag', () => {
      const ast = parseFixture('inheritance.cerial');
      const customer = ast.models.find((m) => m.name === 'Customer');

      expect(customer).toBeDefined();
      expect(customer!.abstract).toBeFalsy();
    });
  });
});
