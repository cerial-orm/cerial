import { expect } from 'bun:test';
import { getDecoratorEntry, matchDecoratorToken } from '../../../../src/parser/registry';
import type { DecoratorEntry } from '../../../../src/parser/registry';
import { parse } from '../../../../src/parser/parser';
import { parseDecorators } from '../../../../src/parser/types/model';

export function entryFor(name: string): DecoratorEntry {
  const entry = getDecoratorEntry(name);
  if (!entry) throw new Error(`No registry entry for ${name}`);

  return entry;
}

/**
 * For each token, the entry's `parse` must return exactly the node the parser's current dispatch
 * (`parseDecorators`) produces for the same token, handed the same range.
 */
export function expectSameAsDispatch(name: string, tokens: readonly string[]): void {
  const entry = entryFor(name);
  for (const token of tokens) {
    const errors: string[] = [];
    const [expected, ...rest] = parseDecorators(`field String ${token}`, 1, errors);
    expect(expected, `dispatch accepts ${token}`).toBeDefined();
    expect(rest).toHaveLength(0);
    expect(errors).toEqual([]);
    expect(entry.parse(token, expected!.range), token).toEqual(expected!);
  }
}

/** A token the dispatch refuses with an error must make `parse` throw rather than yield a node. */
export function expectRefusedLikeDispatch(name: string, tokens: readonly string[]): void {
  const entry = entryFor(name);
  const range = { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 0, offset: 0 } };
  for (const token of tokens) {
    const errors: string[] = [];
    expect(parseDecorators(`field String ${token}`, 1, errors), token).toEqual([]);
    expect(errors, token).toHaveLength(1);
    expect(() => entry.parse(token, range), token).toThrow();
  }
}

/** The directive the parser builds from a model body line, with the line number it was found on. */
export function parseDirectiveInModel(line: string) {
  const result = parse(`model M {\n  id Record @id\n  a String\n  b String\n  ${line}\n}`);

  return { directive: result.ast.models[0]?.directives?.[0], errors: result.errors };
}

/** Whether the registry resolves `token` to the decorator `name`, the lookup the parser dispatches through. */
export function isDecoratorToken(name: string, token: string): boolean {
  return matchDecoratorToken(token)?.name === name;
}
