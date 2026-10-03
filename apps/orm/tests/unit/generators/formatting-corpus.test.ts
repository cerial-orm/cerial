import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatCode } from '../../../src/generators/shared/formatting';

const GENERATED_DIR = join(import.meta.dir, '../../e2e/generated');

/** The generated client is gitignored, so it only exists after `generate:test-client`. */
const files = existsSync(GENERATED_DIR)
  ? (readdirSync(GENERATED_DIR, { recursive: true, encoding: 'utf8' }) as string[]).filter((f) => f.endsWith('.ts'))
  : [];

describe('formatCode over the generated client', () => {
  it.skipIf(!files.length)('leaves every generated file byte-identical', async () => {
    const drifted: string[] = [];

    for (const file of files) {
      const onDisk = readFileSync(join(GENERATED_DIR, file), 'utf8');
      if ((await formatCode(onDisk, '')) !== onDisk) drifted.push(file);
    }

    expect(drifted).toEqual([]);
  });
});
