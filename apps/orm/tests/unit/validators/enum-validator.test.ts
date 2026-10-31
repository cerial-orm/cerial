/**
 * Unit Tests: Enum Validator
 *
 * Enum name collisions and duplicate values, validated through the same checks
 * `cerial generate` runs. Each rule has a rejecting and an accepting case.
 */

import { describe, expect, test } from 'bun:test';
import { parse } from '../../../src/parser/parser';
import { validateAll } from './helpers';

function messages(schema: string): string[] {
  return validateAll(parse(schema).ast).map((e) => e.message);
}

const MODEL = 'model Host {\n  id Record @id\n}\n';

describe('Enum Validator', () => {
  describe('duplicate values', () => {
    test('rejects a repeated value', () => {
      expect(messages('enum Role { A, B, A }')).toContain("Duplicate value 'A' in enum Role");
    });

    test('accepts distinct values', () => {
      expect(messages('enum Role { A, B, C }')).toEqual([]);
    });
  });

  describe('name collisions', () => {
    test('rejects an enum named like a model', () => {
      expect(messages(`enum Host { A, B }\n${MODEL}`)).toContain(
        'Duplicate name: Host (declared as model in <input>:2 and as enum in <input>:1)',
      );
    });

    test('rejects an enum named like an object', () => {
      expect(messages('enum Geo { A, B }\nobject Geo {\n  lat Float\n}')).toContain(
        'Duplicate name: Geo (declared as object in <input>:2 and as enum in <input>:1)',
      );
    });

    test('rejects an enum named like a tuple', () => {
      expect(messages('enum Pair { A, B }\ntuple Pair {\n  Int,\n  Int\n}')).toContain(
        'Duplicate name: Pair (declared as tuple in <input>:2 and as enum in <input>:1)',
      );
    });

    test('rejects an enum named like a literal', () => {
      expect(messages("enum Level { A, B }\nliteral Level { 'x', 'y' }")).toContain(
        'Duplicate name: Level (declared as literal in <input>:2 and as enum in <input>:1)',
      );
    });

    test('accepts enums whose names differ from every other declaration', () => {
      expect(messages(`enum Role { A, B }\nenum Color { R, G }\nobject Geo {\n  lat Float\n}\n${MODEL}`)).toEqual([]);
    });
  });
});
