/**
 * The include option key table must match IncludeOptions in both directions: a key added to the type and
 * missing from the table would be refused at runtime, and a table key the type lacks would be silently
 * accepted. Either makes `tsc` fail here.
 */

import { expect, test } from 'bun:test';
import type { INCLUDE_OPTION_KEYS, IncludeOptions } from '../../../src/query/builders';

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const agree: Same<(typeof INCLUDE_OPTION_KEYS)[number], keyof IncludeOptions> = true;

test('the include key table agrees with IncludeOptions', () => {
  expect(agree).toBe(true);
});
