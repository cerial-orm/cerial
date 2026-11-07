/**
 * Unit Tests: `cerial migrate` renders control characters in the text it writes to stderr
 *
 * Server and argument text can hold ESC or BEL. A refusal that never reaches the database is enough to
 * show it: an unknown flag is echoed by name.
 */

import { describe, expect, test } from 'bun:test';
import { migrateApply } from '../../../../src/cli/migrate/apply';
import { migrateBaseline } from '../../../../src/cli/migrate/baseline';
import { migrateStatus } from '../../../../src/cli/migrate/status';

const RAW_CONTROL = /(?![\n\t])[\p{Cc}\p{Zl}\p{Zp}]/u;
const HOSTILE_FLAG = 'bad\u001b[2J\u001b]52;c;cHduZWQ\u0007';

describe('migrate stderr', () => {
  test.each([
    ['apply', migrateApply],
    ['status', migrateStatus],
    ['baseline', migrateBaseline],
  ] as const)('%s shows control characters in an echoed flag as escapes', async (_name, run) => {
    const result = await run({ argv: [`--${HOSTILE_FLAG}`], env: {} });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).not.toMatch(RAW_CONTROL);
    expect(result.stderr).toContain('--bad\\u{1b}[2J\\u{1b}]52;c;cHduZWQ\\u{7}');
    expect(result.stderr.endsWith('\n')).toBe(true);
  });

  test('keeps line breaks, escapes ESC, BEL and OSC, and escapes a carriage return', async () => {
    const result = await migrateApply({ argv: ['--a\nsecond\u001b]52;c;x\u0007\rover'], env: {} });

    expect(result.stderr).toContain('--a\nsecond\\u{1b}]52;c;x\\u{7}\\rover');
    expect(result.stderr).not.toContain('\r');
    expect(result.stderr).not.toContain('\u001b');
  });

  test('a plain refusal is unchanged', async () => {
    const result = await migrateApply({ argv: ['--nope'], env: {} });

    expect(result.stderr).toMatch(/^cerial migrate apply: Unknown migrate flag --nope\./);
  });
});
