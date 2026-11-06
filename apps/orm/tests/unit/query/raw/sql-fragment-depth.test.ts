import { describe, expect, test } from 'bun:test';

import { CerialValidationError } from '../../../../src/errors';
import { compileFragment, createCompileContext, sql } from '../../../../src/query';
import { MAX_FRAGMENT_DEPTH } from '../../../../src/query/compile/sql-fragment';

/** A chain of `levels` fragments: the innermost is `a = $x`, each outer one wraps the previous in parentheses. */
function chain(levels: number): ReturnType<typeof sql> {
  let fragment = sql`a = ${1}`;
  for (let i = 1; i < levels; i++) fragment = sql`(${fragment})`;

  return fragment;
}

describe('sql fragment nesting depth', () => {
  test('the limit is 64', () => {
    expect(MAX_FRAGMENT_DEPTH).toBe(64);
  });

  test.each([1, 10, MAX_FRAGMENT_DEPTH])('depth %d compiles to the nested text and one bound var', (levels) => {
    const out = compileFragment(chain(levels), createCompileContext());
    const inner = Object.keys(out.vars);

    expect(inner).toHaveLength(1);
    expect(out.vars[inner[0]!]).toBe(1);
    expect(out.text).toBe(`${'('.repeat(levels - 1)}a = $${inner[0]}${')'.repeat(levels - 1)}`);
  });

  test('one past the limit is refused naming the limit', () => {
    const run = () => compileFragment(chain(MAX_FRAGMENT_DEPTH + 1), createCompileContext());

    expect(run).toThrow(CerialValidationError);
    expect(run).toThrow(`nested deeper than ${MAX_FRAGMENT_DEPTH} levels`);
  });

  test('200000 levels deep is refused, not a stack overflow', () => {
    const run = () => compileFragment(chain(200000), createCompileContext());

    expect(run).toThrow(CerialValidationError);
    expect(run).not.toThrow(RangeError);
  });
});
