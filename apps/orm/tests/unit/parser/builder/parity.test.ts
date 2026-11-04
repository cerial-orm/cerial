import { describe, expect, test } from 'bun:test';
import { BUILDER_RANGE, createChain } from '../../../../src/parser/builder';
import { parseDefaultAlwaysDecorator } from '../../../../src/parser/types/field-decorators/default-always-parser';
import { parseDefaultDecorator } from '../../../../src/parser/types/field-decorators/default-parser';
import { parseKeyDecorator } from '../../../../src/parser/types/field-decorators/key-parser';
import { parseOnDeleteDecorator } from '../../../../src/parser/types/field-decorators/ondelete-parser';
import { parseSortDecorator } from '../../../../src/parser/types/field-decorators/sort-parser';
import { parseUniqueDecorator } from '../../../../src/parser/types/field-decorators/unique-parser';
import { parse } from '../../../../src/parser/parser';

/** A builder node must equal the parser's node key for key, so the two frontends cannot drift. */
describe('builder nodes equal the parser nodes', () => {
  const chain = createChain('modelField', { kind: 'relation' });

  test('none: @unique', () => {
    expect(chain.unique().decorators()).toEqual([parseUniqueDecorator('@unique', BUILDER_RANGE)]);
  });

  test('choice: @onDelete, and @sort with and without its optional argument', () => {
    expect(chain.onDelete('SetNull').decorators()).toEqual([
      parseOnDeleteDecorator('@onDelete(SetNull)', BUILDER_RANGE),
    ]);
    expect(chain.sort('desc').decorators()).toEqual([parseSortDecorator('@sort(desc)', BUILDER_RANGE)]);
    expect(chain.sort().decorators()).toEqual([parseSortDecorator('@sort', BUILDER_RANGE)]);
  });

  test('name: @key', () => {
    expect(chain.key('author').decorators()).toEqual([parseKeyDecorator('@key(author)', BUILDER_RANGE)]);
  });

  test('literal: @default and @defaultAlways, value always present', () => {
    expect(chain.default(5).decorators()).toEqual([parseDefaultDecorator('@default(5)', BUILDER_RANGE)]);
    expect(chain.default('1h30m').decorators()).toEqual([parseDefaultDecorator("@default('1h30m')", BUILDER_RANGE)]);
    expect(chain.defaultAlways(null).decorators()).toEqual([
      parseDefaultAlwaysDecorator('@defaultAlways(null)', BUILDER_RANGE),
    ]);
    expect(chain.unique().decorators()[0]).toHaveProperty('value');
  });

  test('a schema parsed from text yields the same decorator types and values', () => {
    const { ast } = parse('model Test {\n  id Record @id\n  n Int @default(5) @unique\n  s Int[] @sort(desc)\n}');
    const nodes = ast.models[0]!.fields.flatMap((f) => f.decorators);
    const fromBuilder = [
      ...createChain('modelField').id().decorators(),
      ...createChain('modelField').default(5).unique().decorators(),
      ...createChain('modelField').sort('desc').decorators(),
    ];

    expect(fromBuilder.map((d) => ('type' in d ? [d.type, d.value] : null))).toEqual(
      nodes.map((d) => [d.type, d.value]),
    );
  });
});
