import { describe, expect, test } from 'bun:test';
import { createChain } from '../../../../src/parser/builder';

describe('builder arguments', () => {
  const chain = createChain('modelField', { kind: 'relation' });

  test('choice: a member of the set is accepted', () => {
    expect(chain.onDelete('Cascade').decorators()).toMatchObject([{ type: 'onDelete', value: 'Cascade' }]);
  });

  test('choice: a value outside the set is refused at runtime and by the type', () => {
    // @ts-expect-error -- 'Explode' is not one of the choices
    expect(() => chain.onDelete('Explode')).toThrow('takes one of Cascade, SetNull, SetNone, Restrict, NoAction');
  });

  test('choice: a required choice needs its argument, an optional one does not', () => {
    // @ts-expect-error -- @onDelete needs a value
    expect(() => chain.onDelete()).toThrow('needs one of');
    expect(chain.sort().decorators()).toMatchObject([{ type: 'sort', value: true }]);
    expect(chain.sort('desc').decorators()).toMatchObject([{ type: 'sort', value: false }]);
  });

  test('name: a plain identifier is accepted, anything else is refused', () => {
    expect(chain.key('author').decorators()).toMatchObject([{ type: 'key', value: 'author' }]);
    expect(() => chain.key('a b')).toThrow('plain name');
    expect(() => chain.key('a)')).toThrow('plain name');
    // @ts-expect-error -- a name is a string
    expect(() => chain.key(3)).toThrow('plain name');
  });

  test('literal: every form is accepted', () => {
    const values = [true, false, null, 3, -2, 1.5, 'text', '1h30m'];
    const nodes = values.map((v) => chain.default(v).decorators()[0]);

    expect(nodes.map((n) => (n && 'value' in n ? n.value : undefined))).toEqual(values);
  });

  test('literal: values that would not read back as themselves are refused', () => {
    expect(() => chain.default(Number.NaN)).toThrow('cannot take');
    expect(() => chain.default(Number.POSITIVE_INFINITY)).toThrow('cannot take');
    expect(() => chain.default(1e21)).toThrow('cannot take');
    expect(() => chain.default('a\nb')).toThrow('cannot take');
    // @ts-expect-error -- an object is not a LiteralValue
    expect(() => chain.default({})).toThrow('cannot take');
  });

  test('literal: a string that looks like another form stays a string', () => {
    expect(chain.default('42').decorators()).toMatchObject([{ value: '42' }]);
    expect(chain.default('true').decorators()).toMatchObject([{ value: 'true' }]);
  });
});
