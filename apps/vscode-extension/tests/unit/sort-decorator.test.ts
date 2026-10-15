import { describe, expect, test } from 'bun:test';
import { DECORATOR_DOCS } from '../../server/src/data/hover-docs';
import { getDecoratorCompletions } from '../../server/src/providers/completion';
import type { BlockContext } from '../../server/src/utils/ast-location';
import { createIndexerWithContent, testPath } from './helpers';

describe('@sort hover', () => {
  const doc = DECORATOR_DOCS.sort!;
  const text = `${doc.signature} ${doc.description} ${doc.constraints ?? ''}`;

  test('signature shows the optional direction argument', () => {
    expect(doc.signature).toContain('@sort');
    expect(doc.signature).toContain('asc');
    expect(doc.signature).toContain('desc');
  });

  test('explains no argument, true/asc, false/desc', () => {
    expect(text).toMatch(/no argument/i);
    for (const spelling of ['true', 'asc', 'false', 'desc']) expect(text).toContain(spelling);
  });

  test('says any other argument is a generation error', () => {
    expect(text).toMatch(/any other argument/i);
    expect(text).toMatch(/generation error/i);
  });
});

describe('@sort completion', () => {
  function sortItem(fieldType: string) {
    const indexer = createIndexerWithContent({
      'test.cerial': `model M {\n  id Record @id\n  scores ${fieldType} @\n}`,
    });
    const uri = testPath('test.cerial');
    const blockContext: BlockContext = { blockType: 'model', blockName: 'M', fieldContext: 'decorator' };
    const lineText = `  scores ${fieldType} @`;
    const cerialPos = { line: 3, column: lineText.length + 1, offset: 0 };
    const items = getDecoratorCompletions(indexer.getAST(uri)!, blockContext, lineText, cerialPos, uri, indexer);

    return items.find((i) => i.label === '@sort()');
  }

  test('offered on array fields as a choice snippet of the asc and desc spellings', () => {
    const item = sortItem('Int[]');

    expect(item).toBeDefined();
    // oxlint-disable-next-line eslint/no-template-curly-in-string -- VS Code snippet syntax
    expect(item!.insertText).toBe('@sort(${1|asc,desc|})');
  });

  test('the snippet offers only spellings the parser accepts', () => {
    const choices = /\$\{1\|([^|]+)\|\}/.exec(sortItem('Int[]')!.insertText!)![1]!.split(',');

    expect(choices).toEqual(['asc', 'desc']);
  });

  test('not offered on a non-array field', () => {
    expect(sortItem('Int')).toBeUndefined();
  });
});
