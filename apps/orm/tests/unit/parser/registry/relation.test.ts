import { describe, expect, test } from 'bun:test';
import { entryFor, expectSameAsDispatch } from './helpers';

describe('registry: relation decorators', () => {
  test('@field parses like the dispatch', () => {
    expectSameAsDispatch('@field', ['@field(authorId)', '@field(a_1)', '@field(bad-name)', '@field(a.b)']);
  });

  test('@model parses like the dispatch', () => {
    expectSameAsDispatch('@model', ['@model(User)', '@model(bad name)', '@model(User.x)']);
  });

  test('@key parses like the dispatch', () => {
    expectSameAsDispatch('@key', ['@key(author)', '@key(a-b)']);
  });

  test('@onDelete parses like the dispatch', () => {
    expectSameAsDispatch('@onDelete', [
      '@onDelete(Cascade)',
      '@onDelete(SetNull)',
      '@onDelete(SetNone)',
      '@onDelete(Restrict)',
      '@onDelete(NoAction)',
      '@onDelete(Bogus)',
      '@onDelete(cascade)',
    ]);
  });

  test('an unrecognised name or action leaves the value undefined', () => {
    expect(entryFor('@onDelete').parse('@onDelete(Bogus)', rangeOf())).toMatchObject({ value: undefined });
    expect(entryFor('@field').parse('@field(bad-name)', rangeOf())).toMatchObject({ value: undefined });
  });

  test('the onDelete choices are the actions the parser accepts', () => {
    const args = entryFor('@onDelete').args;
    if (args.kind !== 'choice') throw new Error('expected a choice');
    for (const choice of args.choices) {
      expect(entryFor('@onDelete').parse(`@onDelete(${choice})`, rangeOf())).toMatchObject({ value: choice });
    }
  });
});

function rangeOf() {
  return { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 0, offset: 0 } };
}
