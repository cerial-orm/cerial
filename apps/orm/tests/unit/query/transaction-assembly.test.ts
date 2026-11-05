/**
 * Unit Tests: Transaction Assembly
 *
 * Tests the transaction assembly helper functions used by $transaction
 * to strip wrappers and detect multi-statement queries.
 */

import { describe, expect, test } from 'bun:test';
import { isMultiStatementQuery, stripTransactionWrapper } from '../../../src/query/executor';

describe('Transaction Assembly', () => {
  describe('stripTransactionWrapper', () => {
    test('removes BEGIN/COMMIT', () => {
      const text = 'BEGIN TRANSACTION; LET $result = (CREATE user SET name = "test"); COMMIT TRANSACTION;';

      const result = stripTransactionWrapper(text);

      expect(result).not.toContain('BEGIN TRANSACTION');
      expect(result).not.toContain('COMMIT TRANSACTION');
      expect(result).toContain('LET $result');
    });

    test('handles no wrapper', () => {
      const text = 'SELECT * FROM user WHERE name = $name_eq_0';

      const result = stripTransactionWrapper(text);

      expect(result).toBe(text);
    });

    // Bug regression: COMMIT TRANSACTION must be replaced with ";\n" separator,
    // not empty string, to avoid merging adjacent statements together.
    // Without the separator, "UPDATE ... RETURN *\nCOMMIT TRANSACTION;\nRETURN $result"
    // would become "UPDATE ... RETURN *RETURN $result" — concatenated on the same line.
    test('preserves statement boundaries when stripping COMMIT', () => {
      // Simulate nested builder output where RETURN is on the line after COMMIT
      const text = 'BEGIN TRANSACTION;\nUPDATE user SET name = "test" RETURN *\nCOMMIT TRANSACTION;\nRETURN $result;';

      const result = stripTransactionWrapper(text);

      // Must not concatenate "RETURN *" and "RETURN $result" on the same line
      expect(result).toContain('RETURN *');
      expect(result).toContain('RETURN $result');
      // The two RETURN statements must be on separate lines, not merged
      expect(result).not.toContain('RETURN *RETURN');
      expect(result).not.toContain('RETURN * RETURN');
    });
  });

  describe('isMultiStatementQuery', () => {
    test('detects LET statements', () => {
      const text = 'LET $result = (CREATE user SET name = "test"); RETURN $result;';

      expect(isMultiStatementQuery(text)).toBe(true);
    });

    test('detects BEGIN TRANSACTION', () => {
      const text = 'BEGIN TRANSACTION; CREATE user SET name = "test"; COMMIT TRANSACTION;';

      expect(isMultiStatementQuery(text)).toBe(true);
    });

    test('returns false for simple query', () => {
      const text = 'SELECT * FROM user WHERE name = $name_eq_0';

      expect(isMultiStatementQuery(text)).toBe(false);
    });
  });
});
