/**
 * $transaction runs each item as its own query, so no statement text is rewritten, and the wrapper
 * helpers never parse quotes or comments: a caller-chosen @flexible key cannot change what they do.
 */

import { describe, expect, test } from 'bun:test';
import * as executor from '../../../src/query/executor';
import { isMultiStatementQuery, stripTransactionWrapper, unwrapQuery } from '../../../src/query/executor';

describe('no text rewrite in the executor', () => {
  test('prefixQueryVars is gone', () => {
    expect('prefixQueryVars' in executor).toBe(false);
  });
});

describe('stripTransactionWrapper without quote masking', () => {
  test('removes the real COMMIT, not one inside a key', () => {
    const text = 'BEGIN TRANSACTION;\nUPDATE t SET `COMMIT TRANSACTION` = $v_0;\nCOMMIT TRANSACTION;';

    expect(stripTransactionWrapper(text)).toBe('UPDATE t SET `COMMIT TRANSACTION` = $v_0;');
  });

  test('keeps a trailing RETURN after the real COMMIT', () => {
    const text = 'BEGIN TRANSACTION;\nUPDATE t SET `COMMIT TRANSACTION` = $v_0;\nCOMMIT TRANSACTION;\nRETURN $r;';

    expect(stripTransactionWrapper(text)).toBe('UPDATE t SET `COMMIT TRANSACTION` = $v_0;\nRETURN $r;');
  });

  test('a text with no BEGIN is returned untouched, even with a COMMIT key', () => {
    const text = 'UPDATE t SET `COMMIT TRANSACTION` = $v_0';

    expect(stripTransactionWrapper(text)).toBe(text);
  });

  test('an apostrophe in a comment or a quote in a regex does not matter', () => {
    const text = "BEGIN TRANSACTION;\n-- don't touch\nUPDATE t SET a = /O'B/ WHERE x = $v_0;\nCOMMIT TRANSACTION;";

    expect(stripTransactionWrapper(text)).toBe("-- don't touch\nUPDATE t SET a = /O'B/ WHERE x = $v_0;");
  });
});

describe('isMultiStatementQuery', () => {
  test('ignores LET and BEGIN inside a key', () => {
    expect(isMultiStatementQuery('UPDATE t SET `LET $x` = 1')).toBe(false);
    expect(isMultiStatementQuery('UPDATE t SET `BEGIN TRANSACTION` = 1')).toBe(false);
  });

  test('positive: still sees real LET and BEGIN', () => {
    expect(isMultiStatementQuery('LET $x = 1; RETURN $x')).toBe(true);
    expect(isMultiStatementQuery('SELECT 1; LET $x = 1; RETURN $x')).toBe(true);
    expect(isMultiStatementQuery('BEGIN TRANSACTION; SELECT 1; COMMIT TRANSACTION;')).toBe(true);
  });
});

describe('nested writes return their statements by position', () => {
  test('without a guard the RETURN is its own part and the wrapper is not searched for', () => {
    const query = {
      text: 'BEGIN TRANSACTION;\nA;\nCOMMIT TRANSACTION;\nRETURN (SELECT `x; COMMIT TRANSACTION; y` FROM $result);',
      vars: {},
    };
    const parts = { body: 'A;', ret: 'RETURN (SELECT `x; COMMIT TRANSACTION; y` FROM $result);' };

    expect(unwrapQuery({ ...query, parts })).toBe(`A;\n${parts.ret}`);
    // The text search alone takes the key's COMMIT for the wrapper's
    expect(stripTransactionWrapper(query.text)).not.toBe(`A;\n${parts.ret}`);
  });
});
