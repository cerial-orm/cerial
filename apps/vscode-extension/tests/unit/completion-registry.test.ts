import { describe, expect, test } from 'bun:test';
import {
  DECORATOR_REGISTRY,
  type DecoratorName,
  type DecoratorTarget,
  FIELD_TYPE_REGISTRY,
} from '../../../orm/src/parser/registry';
import {
  DECORATOR_TYPE_RESTRICTIONS,
  getDecoratorCompletions,
  getFieldTypeCompletions,
} from '../../server/src/providers/completion';
import type { BlockContext } from '../../server/src/utils/ast-location';
import { createIndexerWithContent, testPath } from './helpers';

type FieldBlock = 'model' | 'object' | 'tuple';

const BLOCKS: ReadonlyArray<{ blockType: FieldBlock; target: DecoratorTarget }> = [
  { blockType: 'model', target: 'modelField' },
  { blockType: 'object', target: 'objectField' },
  { blockType: 'tuple', target: 'tupleElement' },
];

/** Completion items for a field in a block of the given kind; the cursor sits after `existing` and a `@`. */
function complete(blockType: FieldBlock, existing = '') {
  const lineText = `  x String ${existing}@`;
  const indexer = createIndexerWithContent({ 'test.cerial': `${blockType} B {\n${lineText}\n}` });
  const blockContext: BlockContext = { blockType, blockName: 'B', fieldContext: 'decorator' };

  return getDecoratorCompletions(
    null,
    blockContext,
    lineText,
    { line: 2, column: lineText.length, offset: 0 },
    testPath('test.cerial'),
    indexer,
  );
}

const labelOf = (name: DecoratorName): string =>
  DECORATOR_REGISTRY.get(name)!.args.kind === 'none' ? name : `${name}()`;

describe('completion reads the registry', () => {
  for (const { blockType, target } of BLOCKS) {
    test(`${blockType} block offers exactly the registry decorators for ${target}`, () => {
      const expected = [...DECORATOR_REGISTRY.values()]
        .filter((entry) => entry.targets.includes(target) || (blockType === 'model' && entry.targets.includes('model')))
        .flatMap((entry) =>
          entry.args.kind === 'choice' && entry.args.optional
            ? [entry.name, labelOf(entry.name)]
            : [labelOf(entry.name)],
        );

      expect(
        complete(blockType)
          .map((item) => item.label)
          .sort(),
      ).toEqual(expected.sort());
    });
  }

  test('model-level directives are offered only in model blocks', () => {
    const model = complete('model').map((item) => item.label);

    expect(model).toContain('@@index()');
    expect(model).toContain('@@unique()');
    expect(complete('object').map((item) => item.label)).not.toContain('@@index()');
    expect(complete('tuple').map((item) => item.label)).not.toContain('@@unique()');
  });

  test('snippets are derived from the argument shape', () => {
    const items = complete('model');
    const insert = (label: string) => items.find((item) => item.label === label)?.insertText;

    expect(insert('@id')).toBe('@id');
    // oxlint-disable-next-line eslint/no-template-curly-in-string -- VS Code snippet syntax
    expect(insert('@default()')).toBe('@default(${1:value})');
    // oxlint-disable-next-line eslint/no-template-curly-in-string -- VS Code snippet syntax
    expect(insert('@sort()')).toBe('@sort(${1|asc,desc|})');
    // oxlint-disable-next-line eslint/no-template-curly-in-string -- VS Code snippet syntax
    expect(insert('@onDelete()')).toBe('@onDelete(${1|Cascade,SetNull,SetNone,Restrict,NoAction|})');
    // oxlint-disable-next-line eslint/no-template-curly-in-string -- VS Code snippet syntax
    expect(insert('@field()')).toBe('@field(${1:fieldName})');
    // oxlint-disable-next-line eslint/no-template-curly-in-string -- VS Code snippet syntax
    expect(insert('@@index()')).toBe('@@index(${1:name}, [${2:field1}, ${3:field2}])');
  });

  test('an applied decorator hides what the registry says it excludes, and itself', () => {
    const labels = complete('model', '@createdAt ').map((item) => item.label);

    for (const excluded of DECORATOR_REGISTRY.get('@createdAt')!.excludes) {
      expect(labels).not.toContain(labelOf(excluded));
    }
    expect(labels).not.toContain('@createdAt');
  });

  test('exclusion also applies in the reverse direction', () => {
    // @readonly lists @now, but @now is the one applied here and lists @readonly too; use a pair that is
    // one-directional in the registry if there is one, else fall back to the symmetric check.
    const labels = complete('model', '@index ').map((item) => item.label);

    expect(DECORATOR_REGISTRY.get('@unique')!.excludes).toContain('@index');
    expect(labels).not.toContain('@unique');
  });

  test('type restrictions only name registry decorators', () => {
    for (const key of Object.keys(DECORATOR_TYPE_RESTRICTIONS)) {
      expect(DECORATOR_REGISTRY.has(`@${key}` as DecoratorName)).toBe(true);
    }
  });

  test('field type completion offers every registry type and its array form', () => {
    const labels = getFieldTypeCompletions(null, testPath('none.cerial'), null).map((item) => item.label);
    const names = [...FIELD_TYPE_REGISTRY.keys()];

    expect(labels.filter((label) => !label.endsWith('[]')).sort()).toEqual([...names].sort());
    expect(labels.filter((label) => label.endsWith('[]')).sort()).toEqual(names.map((name) => `${name}[]`).sort());
  });
});
