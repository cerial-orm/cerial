import { describe, expect, spyOn, test } from 'bun:test';
import type { Surreal } from 'surrealdb';
import { warnAutoChange } from '../../../src/migrations';

const input = { manifest: { tables: [], unmanaged: [] }, statements: [], tables: ['user'] };
const state = { models: new Map(), schema: undefined };

describe('warnAutoChange', () => {
  test('a plan that cannot be computed warns on one line and does not throw', async () => {
    const broken = {
      query: () => {
        throw new Error('INFO failed\nsecond line \u001b[31m');
      },
    } as unknown as Surreal;
    const warn = spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await warnAutoChange(broken, state, input);

      expect(warn).toHaveBeenCalledTimes(1);
      const text = String(warn.mock.calls[0]![0]);
      expect(text).toContain('could not compute the plan');
      expect(text).not.toMatch(/\p{Cc}/u);
    } finally {
      warn.mockRestore();
    }
  });
});
