/**
 * A nested create is checked against the target model exactly as a top-level create is, before any
 * transform, on both the forward and the reverse side and for every item of a create array.
 */

import { describe, expect, test } from 'bun:test';
import { compileCreate } from '../../../src/query/builder';
import { registry } from './select-validation-helpers';

const author = registry.Author!;
const post = registry.Post!;
const addr = { city: 'c', geo: { lat: 1, lng: 2 } };
const postData = { title: 't', address: addr, loose: addr, spot: ['s', { lat: 1, lng: 2 }] };

const reverse = (create: unknown) => () =>
  compileCreate(author, { data: { name: 'A', posts: { create } } } as never, registry);
const forward = (create: unknown) => () =>
  compileCreate(post, { data: { ...postData, author: { create } } } as never, registry);

describe('nested create validation', () => {
  test('a reverse create refuses a wrong-typed field, naming it', () => {
    expect(reverse({ ...postData, title: 1 })).toThrow(/title must be of type string/);
  });

  test('a reverse create refuses a wrong-typed nested object member, naming its path', () => {
    expect(reverse({ ...postData, address: { ...addr, city: 1 } })).toThrow(/address\.city/);
  });

  test('a reverse create refuses a missing required field', () => {
    expect(reverse({ title: 't' })).toThrow(/address is required/);
  });

  test('every item of a reverse create array is checked', () => {
    expect(reverse([postData, { ...postData, title: 2 }])).toThrow(/title must be of type string/);
  });

  test('a forward create refuses a wrong-typed field, naming it', () => {
    expect(forward({ name: 1 })).toThrow(/name must be of type string/);
  });

  test('a forward create refuses a missing required field', () => {
    expect(forward({})).toThrow(/name is required/);
  });

  test('a valid reverse create compiles; the foreign key comes from the parent', () => {
    expect(reverse(postData)).not.toThrow();
    expect(reverse([postData, postData])).not.toThrow();
  });

  test('a valid forward create compiles', () => {
    expect(forward({ name: 'A' })).not.toThrow();
  });
});
