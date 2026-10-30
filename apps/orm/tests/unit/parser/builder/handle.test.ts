import { describe, expect, test } from 'bun:test';
import type { Handle } from '../../../../src/parser/builder';
import { referenceName } from '../../../../src/parser/builder';
import type { Reference } from '../../../../src/parser/builder';
import { createField, createPosition, createRange } from '../../../../src/parser/types/ast';
import type { ASTField } from '../../../../src/types';

const RANGE = createRange(createPosition(0, 0, 0), createPosition(0, 0, 0));

// Minimal stand-in for the field builder: defers the reduction until the node is asked for
const objectField =
  (reference: Reference): (() => ASTField) =>
  () =>
    createField('home', 'object', false, [], RANGE, false, referenceName(reference));

const Address: Handle<'Address'> = { name: 'Address' };

describe('definition handle and reference forms', () => {
  test('handle, thunk and bare name produce an identical ASTField', () => {
    const byValue = objectField(Address)();
    const byThunk = objectField(() => Address)();
    const byName = objectField('Address')();

    expect(byThunk).toEqual(byValue);
    expect(byName).toEqual(byValue);
    expect(byValue.objectName).toBe('Address');
  });

  test('a different name produces a different node', () => {
    const other: Handle<'Other'> = { name: 'Other' };

    expect(objectField(other)()).not.toEqual(objectField(Address)());
  });

  test('a thunk is not called until the reference is reduced', () => {
    let calls = 0;
    const thunk = (): Handle<'Address'> => {
      calls++;

      return Address;
    };
    const build = objectField(thunk);

    expect(calls).toBe(0);
    build();
    expect(calls).toBe(1);
  });

  test('a thunk over a later const is unreachable at construction and resolves once the const exists', () => {
    const build = objectField(() => Later);

    expect(() => build()).toThrow(ReferenceError);

    const Later: Handle<'Later'> = { name: 'Later' };

    expect(build().objectName).toBe('Later');
  });

  test('the model ID type is carried by the handle type', () => {
    const user: Handle<'User', string> = { name: 'User' };
    const id: string | undefined = user.idType;

    expect(id).toBeUndefined();
    expect(referenceName(user)).toBe('User');
  });
});
