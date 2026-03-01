/**
 * Unit Tests: Transaction Assembly
 *
 * Tests the transaction assembly helper functions used by $transaction
 * to prefix variables, strip wrappers, and detect multi-statement queries.
 */

import { describe, expect, test } from 'bun:test';
import type { CompiledQuery } from '../../../src/query/compile/types';
import { isMultiStatementQuery, prefixQueryVars, stripTransactionWrapper } from '../../../src/query/executor';

describe('Transaction Assembly', () => {
  describe('prefixQueryVars', () => {
    test('prefixes bound variables in text and vars', () => {
      const query: CompiledQuery = {
        text: 'SELECT * FROM user WHERE name = $name_eq_0 AND age > $age_gt_0',
        vars: { name_eq_0: 'Alice', age_gt_0: 25 },
      };

      const result = prefixQueryVars(query, 'tx0_');

      expect(result.vars).toEqual({ tx0_name_eq_0: 'Alice', tx0_age_gt_0: 25 });
      expect(result.text).toContain('$tx0_name_eq_0');
      expect(result.text).toContain('$tx0_age_gt_0');
      expect(result.text).not.toContain('$name_eq_0');
      expect(result.text).not.toContain('$age_gt_0');
    });

    test('prefixes LET-assigned variables', () => {
      const query: CompiledQuery = {
        text: 'LET $result = (CREATE user SET name = $name_eq_0); RETURN $result;',
        vars: { name_eq_0: 'Bob' },
      };

      const result = prefixQueryVars(query, 'tx0_');

      expect(result.text).toContain('LET $tx0_result');
      expect(result.text).toContain('RETURN $tx0_result');
      expect(result.vars).toEqual({ tx0_name_eq_0: 'Bob' });
    });

    test('handles empty vars', () => {
      const query: CompiledQuery = {
        text: 'SELECT * FROM user',
        vars: {},
      };

      const result = prefixQueryVars(query, 'tx0_');

      expect(result.text).toBe('SELECT * FROM user');
      expect(result.vars).toEqual({});
    });

    test('preserves query structure', () => {
      const query: CompiledQuery = {
        text: 'SELECT name, age FROM user WHERE active = $active_eq_0 ORDER BY name ASC LIMIT 10',
        vars: { active_eq_0: true },
      };

      const result = prefixQueryVars(query, 'tx1_');

      expect(result.text).toBe('SELECT name, age FROM user WHERE active = $tx1_active_eq_0 ORDER BY name ASC LIMIT 10');
      expect(result.vars).toEqual({ tx1_active_eq_0: true });
    });

    test('handles multiple vars without collision', () => {
      const query: CompiledQuery = {
        text: 'SELECT * FROM user WHERE name = $name_eq_0 AND name_prefix = $name_prefix_eq_0',
        vars: { name_eq_0: 'Alice', name_prefix_eq_0: 'Al' },
      };

      const result = prefixQueryVars(query, 'tx0_');

      // Both vars should be independently prefixed
      expect(result.vars).toEqual({ tx0_name_eq_0: 'Alice', tx0_name_prefix_eq_0: 'Al' });
      expect(result.text).toContain('$tx0_name_eq_0');
      expect(result.text).toContain('$tx0_name_prefix_eq_0');
    });

    // Bug regression: Variable names must be sorted longest-first to prevent partial
    // replacements. E.g., replacing $result before $resultId would corrupt $resultId
    // into $tx0_resultId becoming $tx0_tx0_resultId.
    test('sorts variable names longest-first to avoid partial replacement', () => {
      const query: CompiledQuery = {
        text: 'LET $result = (CREATE user SET name = $name_eq_0);\nLET $resultId = $result.id;\nRETURN $result;',
        vars: { name_eq_0: 'Alice' },
      };

      const result = prefixQueryVars(query, 'tx0_');

      // $resultId should be prefixed independently, not double-prefixed
      expect(result.text).toContain('$tx0_resultId');
      expect(result.text).toContain('$tx0_result');
      // Must not contain double-prefixed variables
      expect(result.text).not.toContain('$tx0_tx0_');
    });

    // Bug regression: LET-assigned variable names like $result and $resultId must
    // both be discovered and prefixed, even though only bound vars are in the vars object.
    test('discovers and prefixes LET-assigned variables from query text', () => {
      const query: CompiledQuery = {
        text: 'LET $data = (CREATE user SET name = "test");\nLET $dataId = $data.id;\nRETURN $dataId;',
        vars: {},
      };

      const result = prefixQueryVars(query, 'tx1_');

      expect(result.text).toContain('LET $tx1_data');
      expect(result.text).toContain('LET $tx1_dataId');
      expect(result.text).toContain('RETURN $tx1_dataId');
    });
  });

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
