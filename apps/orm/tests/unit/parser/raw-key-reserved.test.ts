import { describe, expect, test } from 'bun:test';
import { f } from '../../../src/parser/builder/field';
import { model } from '../../../src/parser/builder/model';
import { object } from '../../../src/parser/builder/object';
import { parse } from '../../../src/parser/parser';
import { generateWhereInterface } from '../../../src/generators/types/where-generator';
import { field, model as modelMetadata } from '../generators/helpers';

const modelSource = (name: string) => `model M {\n  id Record @id\n  ${name} String\n}\n`;
const objectSource = (name: string) => `object O {\n  ${name} String\n}\n`;

describe('the $raw key is reserved in every schema frontend', () => {
  describe('.cerial', () => {
    test('a model field named $raw fails to parse and is not kept', () => {
      const { ast, errors } = parse(modelSource('$raw'));

      expect(errors.map((e) => e.message)).toContain('Invalid field name: $raw');
      expect(ast.models[0]!.fields.map((x) => x.name)).not.toContain('$raw');
    });

    test('an object field named $raw fails to parse', () => {
      const { ast, errors } = parse(objectSource('$raw'));

      expect(errors.map((e) => e.message)).toContain('Invalid field name: $raw');
      expect(ast.objects[0]?.fields.map((x) => x.name) ?? []).not.toContain('$raw');
    });

    test.each(['raw', '_raw'])('a model field named %s is accepted', (name) => {
      const { ast, errors } = parse(modelSource(name));

      expect(errors).toHaveLength(0);
      expect(ast.models[0]!.fields.map((x) => x.name)).toContain(name);
    });
  });

  describe('TypeScript builder', () => {
    test('a model field named $raw is refused', () => {
      expect(() => model('M', { id: f.record().id(), $raw: f.string() })).toThrow(/"\$raw".*must be an identifier/);
    });

    test('an object field named $raw is refused', () => {
      expect(() => object('O', { $raw: f.string() })).toThrow(/"\$raw".*must be an identifier/);
    });

    test.each(['raw', '_raw'])('a model field named %s is accepted', (name) => {
      expect(() => model('M', { id: f.record().id(), [name]: f.string() })).not.toThrow();
    });
  });

  describe('generated where type', () => {
    test.each(['raw', '_raw'])('a field named %s keys the where type by that name, not by $raw', (name) => {
      const where = generateWhereInterface(modelMetadata('M', 'm', [field({ name })]));

      expect(where).toContain(`${name}?:`);
      // The only `$raw` key is the fragment slot; the field never collapses into it
      expect(where.match(/\$raw/g)).toHaveLength(1);
      expect(where).toContain('$raw?: SqlFragment;');
    });
  });
});
