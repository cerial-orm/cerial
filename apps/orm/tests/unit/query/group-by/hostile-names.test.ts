import { describe, expect, test } from 'bun:test';
import { buildGroupByQuery } from '../../../../src/query/builders';
import type { GroupByArgs } from '../../../../src/query/validators';
import { order, problems, registry } from './helpers';

const PAYLOADS = ['status; REMOVE TABLE order', 'status` OR 1=1 --', "x'y", '__proto__', 'constructor', 'a.b', ''];

describe('groupBy never lets a name that is not a field reach the query text', () => {
  test.each(PAYLOADS)('%j as a group key, aggregate field and orderBy key is refused', (payload) => {
    expect(problems({ by: { [payload]: true } }).length).toBeGreaterThan(0);
    for (const aggregate of ['_count', '_sum', '_avg', '_min', '_max', '_group']) {
      expect(problems({ by: { status: true }, [aggregate]: { [payload]: true } }).length).toBeGreaterThan(0);
    }
    expect(problems({ by: { status: true }, orderBy: { [payload]: 'asc' } }).length).toBeGreaterThan(0);
  });

  test.each(PAYLOADS)('%j as a sub-key of an object and of a flexible object is refused', (payload) => {
    expect(problems({ by: { address: { [payload]: true } } }).length).toBeGreaterThan(0);
    expect(problems({ by: { meta: { [payload]: true } } }).length).toBeGreaterThan(0);
  });

  test('a hostile order direction is refused', () => {
    expect(problems({ by: { status: true }, orderBy: { status: 'asc; REMOVE TABLE order' } }).length).toBeGreaterThan(
      0,
    );
  });

  test('a hostile limit or offset is refused', () => {
    expect(problems({ by: { status: true }, limit: '1; REMOVE TABLE order' }).length).toBeGreaterThan(0);
    expect(problems({ by: { status: true }, offset: '1; REMOVE TABLE order' }).length).toBeGreaterThan(0);
  });

  test('the builder quotes a name that is not a plain identifier, as a last line of defence', () => {
    const args = { by: { 'a-b': true } } as unknown as GroupByArgs;
    expect(buildGroupByQuery(order, args, registry).text).toBe('SELECT `a-b` FROM order GROUP BY `a-b`');
  });
});
