/**
 * Unit tests for the model, object and tuple import statement generators in import-helpers.ts
 */

import { describe, expect, test } from 'bun:test';
import {
  generateObjectImports,
  generateRelatedImports,
  generateTupleImports,
} from '../../../../src/generators/client/import-helpers';
import type { ObjectRegistry, TupleRegistry } from '../../../../src/types';
import { element, field, model, object, relationField, tuple, tupleInfo } from '../fixtures';

describe('generateRelatedImports', () => {
  test('returns an empty string for no related models', () => {
    expect(generateRelatedImports([], [])).toBe('');
  });

  test('a target without relations imports the five base names', () => {
    const post = model('Post', [field({ name: 'title' })]);

    expect(generateRelatedImports(['Post'], [post])).toBe(
      `import type { Post, PostWhere, PostSelect, PostOrderBy, PostNestedCreate } from './post.js';\n`,
    );
  });

  test('a target with relations also imports Include and the include payload', () => {
    const post = model('Post', [relationField('author', 'User')]);

    expect(generateRelatedImports(['Post'], [post])).toBe(
      `import type { Post, PostWhere, PostSelect, PostOrderBy, PostNestedCreate, PostInclude, GetPostIncludePayload } from './post.js';\n`,
    );
  });

  test('a target missing from allModels gets the base names only', () => {
    expect(generateRelatedImports(['Ghost'], [])).toBe(
      `import type { Ghost, GhostWhere, GhostSelect, GhostOrderBy, GhostNestedCreate } from './ghost.js';\n`,
    );
  });

  test('lowercases the file name and joins statements with newlines', () => {
    const out = generateRelatedImports(['BlogPost', 'Tag'], [model('BlogPost', []), model('Tag', [])]);

    expect(out).toBe(
      `import type { BlogPost, BlogPostWhere, BlogPostSelect, BlogPostOrderBy, BlogPostNestedCreate } from './blogpost.js';\n` +
        `import type { Tag, TagWhere, TagSelect, TagOrderBy, TagNestedCreate } from './tag.js';\n`,
    );
  });
});

describe('generateObjectImports', () => {
  test('returns an empty string for no names', () => {
    expect(generateObjectImports([])).toBe('');
  });

  test('imports the five names from the same directory by default, with no registry', () => {
    expect(generateObjectImports(['Address'])).toBe(
      `import type { Address, AddressInput, AddressWhere, AddressSelect, AddressOrderBy } from './address.js';\n`,
    );
  });

  test('honours a custom import prefix', () => {
    expect(generateObjectImports(['Address'], undefined, '../objects')).toBe(
      `import type { Address, AddressInput, AddressWhere, AddressSelect, AddressOrderBy } from '../objects/address.js';\n`,
    );
  });

  test('adds CreateInput when the object has a default', () => {
    const registry: ObjectRegistry = { Address: object('Address', [field({ name: 'c', defaultValue: 'x' })]) };

    expect(generateObjectImports(['Address'], registry)).toBe(
      `import type { Address, AddressInput, AddressWhere, AddressSelect, AddressOrderBy, AddressCreateInput } from './address.js';\n`,
    );
  });

  test('omits CreateInput when the registered object has no defaults or timestamps', () => {
    const registry: ObjectRegistry = { Address: object('Address', [field({ name: 'c' })]) };

    expect(generateObjectImports(['Address'], registry)).not.toContain('CreateInput');
  });

  test('omits CreateInput when the object is absent from the registry', () => {
    expect(generateObjectImports(['Address'], {})).not.toContain('CreateInput');
  });

  test('adds CreateInput for a default that lives in a nested object', () => {
    const registry: ObjectRegistry = {
      Outer: object('Outer', [
        { ...field({ name: 'in', type: 'object' }), objectInfo: { objectName: 'Inner', fields: [] } },
      ]),
      Inner: object('Inner', [field({ name: 'at', timestampDecorator: 'createdAt' })]),
    };

    expect(generateObjectImports(['Outer'], registry)).toContain('OuterCreateInput');
  });

  test('one statement per object, newline separated', () => {
    expect(generateObjectImports(['A', 'B'])).toBe(
      `import type { A, AInput, AWhere, ASelect, AOrderBy } from './a.js';\nimport type { B, BInput, BWhere, BSelect, BOrderBy } from './b.js';\n`,
    );
  });
});

describe('generateTupleImports', () => {
  test('returns an empty string for no names', () => {
    expect(generateTupleImports([])).toBe('');
  });

  test('imports the four base names with no registry', () => {
    expect(generateTupleImports(['Coord'])).toBe(
      `import type { Coord, CoordInput, CoordWhere, CoordUpdate } from './coord.js';\n`,
    );
  });

  test('honours a custom import prefix', () => {
    expect(generateTupleImports(['Coord'], undefined, '../tuples')).toBe(
      `import type { Coord, CoordInput, CoordWhere, CoordUpdate } from '../tuples/coord.js';\n`,
    );
  });

  test('a primitive-only required tuple gets neither Select nor Unset', () => {
    const registry: TupleRegistry = { Coord: tuple('Coord', [element(0, 'float'), element(1, 'float')]) };

    expect(generateTupleImports(['Coord'], registry)).toBe(
      `import type { Coord, CoordInput, CoordWhere, CoordUpdate } from './coord.js';\n`,
    );
  });

  test('a tuple with an object element adds Select', () => {
    const registry: TupleRegistry = {
      Located: tuple('Located', [element(0, 'object', { objectInfo: { objectName: 'Geo', fields: [] } })]),
    };

    expect(generateTupleImports(['Located'], registry)).toBe(
      `import type { Located, LocatedInput, LocatedWhere, LocatedUpdate, LocatedSelect } from './located.js';\n`,
    );
  });

  test('Select is found through a nested tuple', () => {
    const inner = tupleInfo('Inner', [element(0, 'object', { objectInfo: { objectName: 'Geo', fields: [] } })]);
    const registry: TupleRegistry = { Outer: tuple('Outer', [element(0, 'tuple', { tupleInfo: inner })]) };

    expect(generateTupleImports(['Outer'], registry)).toContain('OuterSelect');
  });

  test('a tuple with an optional element adds Unset', () => {
    const registry: TupleRegistry = {
      Coord: tuple('Coord', [element(0, 'float'), element(1, 'float', { isOptional: true })]),
    };

    expect(generateTupleImports(['Coord'], registry)).toBe(
      `import type { Coord, CoordInput, CoordWhere, CoordUpdate, CoordUnset } from './coord.js';\n`,
    );
  });

  test('a tuple with both adds Select before Unset', () => {
    const registry: TupleRegistry = {
      Both: tuple('Both', [
        element(0, 'object', { objectInfo: { objectName: 'Geo', fields: [] } }),
        element(1, 'string', { isOptional: true }),
      ]),
    };

    expect(generateTupleImports(['Both'], registry)).toBe(
      `import type { Both, BothInput, BothWhere, BothUpdate, BothSelect, BothUnset } from './both.js';\n`,
    );
  });

  test('a name absent from the registry gets the base names only', () => {
    expect(generateTupleImports(['Ghost'], {})).toBe(
      `import type { Ghost, GhostInput, GhostWhere, GhostUpdate } from './ghost.js';\n`,
    );
  });
});
