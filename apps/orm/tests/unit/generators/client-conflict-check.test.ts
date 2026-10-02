/**
 * Unit Tests: the generated client's transaction-retry check
 *
 * The callback-mode retry loop in the emitted client decides whether to retry from the shared
 * structured check, not from the wording of an error message.
 */

import { describe, expect, test } from 'bun:test';
import { generateClientTemplate } from '../../../src/generators/client/template';

describe('generated client conflict check', () => {
  const template = generateClientTemplate([{ name: 'User', tableName: 'user', fields: [] }]);

  test('imports the structured check from the package', () => {
    expect(template).toMatch(/import \{[^}]*\bisTransactionConflict\b[^}]*\} from 'cerial'/);
  });

  test('retries through that check', () => {
    expect(template).toContain('isTransactionConflict(error) && attempt < maxRetries');
  });

  test('does not read the wording of an error message', () => {
    expect(template).not.toMatch(/message\.toLowerCase\(\)\.includes/);
    expect(template).not.toContain('write conflict');
    expect(template).not.toContain('transaction conflict');
  });
});
