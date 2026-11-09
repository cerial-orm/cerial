/**
 * Unit Tests: the `field` property of a where refusal is escaped like its message
 *
 * An undeclared @flexible key, an unknown operator and an unknown field are the caller's own text. The message
 * escapes control characters; the property a handler may log or print must not carry them raw.
 */

import { describe, expect, test } from 'bun:test';
import { compileDeleteMany, compileFindMany } from '../../../src/query/builder';
import { registryFor } from './helpers';

const registry = registryFor(`
object Loose {
  n Int?
}

model Doc {
  id Record @id
  meta Loose @flexible
  name String
}
`);
const doc = registry.Doc!;

const KEY = 'k\u001b[2J\u0007\nforged';
const hasControl = (text: string): boolean => /(?!\t)[\p{Cc}\p{Zl}\p{Zp}]/u.test(text);

const refusal = (run: () => unknown): { message: string; field: string | undefined } => {
  try {
    run();
  } catch (error) {
    const { message, field } = error as { message: string; field?: string };

    return { message, field };
  }
  throw new Error('expected a refusal');
};

const CASES: Array<[string, unknown]> = [
  ['a flexible key with a mistyped operand', { meta: { [KEY]: { in: 5 } } }],
  ['a flexible key with a mistyped text operand', { meta: { [KEY]: { contains: 5 } } }],
  ['an unknown operator on a flexible key', { meta: { [KEY]: { eq: 1, [`${KEY}op`]: 1 } } }],
  ['an unknown top-level field', { [KEY]: 1 }],
  ['an unknown sub-field of a strict path', { meta: { n: { [KEY]: 1 } } }],
];

describe('the field property carries no control characters', () => {
  test.each(CASES)('findMany: %s', (_name, where) => {
    const { message, field } = refusal(() => compileFindMany(doc, { where } as never, registry));
    expect(hasControl(message)).toBe(false);
    expect(field).toBeDefined();
    expect(hasControl(field!)).toBe(false);
  });

  test.each(CASES)('deleteMany: %s', (_name, where) => {
    const { field } = refusal(() => compileDeleteMany(doc, { where } as never, registry));
    expect(hasControl(field!)).toBe(false);
  });

  test('the escaped key is still readable in the property', () => {
    const { field } = refusal(() => compileFindMany(doc, { where: { meta: { [KEY]: { in: 5 } } } } as never, registry));
    expect(field).toContain('\\u{1b}');
  });

  test('a plain field name is unchanged', () => {
    const { field } = refusal(() => compileFindMany(doc, { where: { name: 5 } } as never, registry));
    expect(field).toBe('name');
  });
});
