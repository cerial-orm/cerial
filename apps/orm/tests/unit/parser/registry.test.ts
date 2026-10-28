import { describe, expect, test } from 'bun:test';
import {
  DECORATOR_REGISTRY,
  FIELD_TYPE_REGISTRY,
  getDecoratorEntry,
  matchDecoratorToken,
  matchFieldTypeToken,
} from '../../../src/parser/registry';
import type { DecoratorEntry, DecoratorTarget, LiteralForm } from '../../../src/parser/registry';
import type { SourceRange } from '../../../src/types';

/**
 * The completeness sweep: every entry is described, legal somewhere and reachable. The per-group
 * suites in ./registry/ pin what each entry parses to; this file only checks that none is a dead end.
 */

const RANGE: SourceRange = { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 0, offset: 0 } };

const LITERAL_SAMPLES: Record<LiteralForm, string> = {
  boolean: 'true',
  null: 'null',
  int: '1',
  float: '1.5',
  string: "'text'",
  raw: '1h30m',
};

/** Every token the entry's argument shape accepts, one per declared form. */
function tokensFor(entry: DecoratorEntry): string[] {
  const { args, name } = entry;
  switch (args.kind) {
    case 'none':
      return [name];
    case 'choice':
      return args.optional ? [name, `${name}(${args.choices[0]})`] : [`${name}(${args.choices[0]})`];
    case 'name':
      return [`${name}(x)`];
    case 'literal':
      return args.forms.map((form) => `${name}(${LITERAL_SAMPLES[form]})`);
    case 'nameAndFields':
      return [`${name}(idx, [a, b.c])`];
  }
}

const entries = [...DECORATOR_REGISTRY.values()];

describe('decorator registry completeness', () => {
  test('the registry is not empty and keys match entry names', () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const [key, entry] of DECORATOR_REGISTRY) expect(entry.name).toBe(key);
  });

  describe.each(entries.map((entry) => [entry.name, entry] as const))('%s', (_name, entry) => {
    test('has a trimmed one-line description', () => {
      expect(entry.description.length).toBeGreaterThan(10);
      expect(entry.description).toBe(entry.description.trim());
      expect(entry.description).not.toMatch(/[\r\n]/);
      expect(entry.description).toMatch(/[.:\])]$/);
    });

    test('has at least one target', () => {
      expect(entry.targets.length).toBeGreaterThan(0);
      expect(new Set(entry.targets).size).toBe(entry.targets.length);
    });

    test("uses the '@@' sigil exactly when its only target is model", () => {
      const modelOnly = entry.targets.length === 1 && entry.targets[0] === 'model';
      expect(entry.name.startsWith('@@')).toBe(modelOnly);
      expect(entry.targets.includes('model')).toBe(modelOnly);
      expect(entry.name).toMatch(/^@@?[A-Za-z]\w*$/);
    });

    test('excludes only registered decorators, never itself, and symmetrically', () => {
      expect(new Set(entry.excludes).size).toBe(entry.excludes.length);
      for (const other of entry.excludes) {
        expect(other, `${entry.name} excludes ${other}`).not.toBe(entry.name);
        const otherEntry = getDecoratorEntry(other);
        expect(otherEntry, `${other} is registered`).toBeDefined();
        expect(otherEntry!.excludes, `${other} excludes ${entry.name} back`).toContain(entry.name);
      }
    });

    test('its handler is reachable from every target and parses every declared form', () => {
      const tokens = tokensFor(entry);
      expect(tokens.length).toBeGreaterThan(0);
      for (const token of tokens) {
        // matchDecoratorToken resolves field decorators only; a model directive is reached by name.
        if (entry.name.startsWith('@@')) {
          expect(getDecoratorEntry(entry.name)).toBe(entry);
          expect(matchDecoratorToken(token), token).toBeUndefined();
        } else {
          expect(matchDecoratorToken(token), token).toBe(entry);
          for (const target of entry.targets)
            expect(matchDecoratorToken(token, target), `${token} on ${target}`).toBe(entry);
          const illegal = (['modelField', 'objectField', 'tupleElement', 'model'] as const).filter(
            (target: DecoratorTarget) => !entry.targets.includes(target),
          );
          for (const target of illegal)
            expect(matchDecoratorToken(token, target), `${token} on ${target}`).toBeUndefined();
        }

        const node = entry.parse(token, RANGE);
        expect(node, token).toBeDefined();
        expect(node.range, token).toBeDefined();
      }
    });
  });
});

describe('field type registry completeness', () => {
  const fieldTypes = [...FIELD_TYPE_REGISTRY.values()];

  test('names are unique and match their keys', () => {
    expect(fieldTypes.length).toBeGreaterThan(0);
    expect(new Set(fieldTypes.map((entry) => entry.name)).size).toBe(fieldTypes.length);
    for (const [key, entry] of FIELD_TYPE_REGISTRY) expect(entry.name).toBe(key);
  });

  describe.each(fieldTypes.map((entry) => [entry.name, entry] as const))('%s', (name, entry) => {
    test('has a trimmed one-line description', () => {
      expect(entry.description.length).toBeGreaterThan(10);
      expect(entry.description).toBe(entry.description.trim());
      expect(entry.description).not.toMatch(/[\r\n]/);
      expect(entry.description).toMatch(/[.:\])]$/);
    });

    test('matches its own name and its array form, and dispatch resolves both to it', () => {
      expect(entry.match(name, name)).toBe(true);
      expect(entry.match(`${name}[]`, name)).toBe(true);
      expect(matchFieldTypeToken(name)).toBe(entry);
      expect(matchFieldTypeToken(`${name}[]`)).toBe(entry);
    });

    test('records a field type in the AST', () => {
      expect(entry.fieldType).toBeDefined();
    });
  });
});
