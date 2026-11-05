/** Names that match Object.prototype members must not resolve through the prototype chain. */

import { afterAll, describe, expect, it } from 'bun:test';
import { cleanupFixtures, generateFixture } from './helpers';

afterAll(cleanupFixtures);

describe('prototype-named types are refused end to end', () => {
  for (const name of ['toString', 'valueOf']) {
    it(`refuses a tuple named ${name} used as a record id type`, async () => {
      const source = `tuple ${name} {\n  Float,\n  Float\n}\n\nmodel Host {\n  id Record(${name}) @id\n  name String\n}\n`;
      const result = await generateFixture({ 'a.cerial': source });

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout + result.stderr).not.toContain('function Object');
    });

    it(`refuses ${name} as a literal variant instead of resolving a broad type`, async () => {
      const result = await generateFixture({
        'a.cerial': `model Host {\n  id Record @id\n  r L\n}\n\nliteral L { ${name}, 'a' }\n`,
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout + result.stderr).not.toContain('function Object');
    });
  }
});
