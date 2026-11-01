import { describe, expect, test } from 'bun:test';
import { emitCerial } from '../../../../src/cli/convert';
import { materialise } from '../../../../src/parser/builder';
import type { ExportedDeclaration } from '../../../../src/parser/builder';
import { derivedForeignKeys } from '../../../../src/parser/builder/model';
import { f, model } from '../../../../src/schema';

const place = (handle: object, exportName: string): ExportedDeclaration => ({
  handle,
  module: '/p/schema.ts',
  exportName,
});

const comment = (name: string) =>
  `// derived by cerial convert from the TypeScript relation '${name}': the key was not declared there`;

function convert(declarations: ExportedDeclaration[]): string {
  const files = emitCerial(materialise(declarations), declarations);

  return files.map((file) => file.text).join('\n');
}

describe('derived keys', () => {
  const Author = model('Author', { id: f.record().id() });
  const Tag = model('Tag', { id: f.record().id() });
  const Post = model('Post', {
    id: f.record().id(),
    author: f.relation(() => Author),
    tags: f.relation(() => Tag).array(),
    editor: f.relation(() => Author).field('editedBy'),
    reviewer: f
      .relation(() => Author)
      .optional()
      .onDelete('SetNull'),
    owner: f
      .relation(() => Author)
      .optional()
      .onDelete('SetNone'),
  });
  const declarations = [place(Author, 'Author'), place(Tag, 'Tag'), place(Post, 'Post')];

  test('derives the key for each relation shape', () => {
    expect(derivedForeignKeys(Post)).toEqual(['authorId', 'tagIds', 'editedBy', 'reviewerId', 'ownerId']);
    const text = convert(declarations);
    for (const [key, relation] of [
      ['authorId', 'author'],
      ['tagIds', 'tags'],
      ['editedBy', 'editor'],
      ['reviewerId', 'reviewer'],
      ['ownerId', 'owner'],
    ] as const) {
      expect(text).toMatch(new RegExp(`${comment(relation)}\\n\\s+${key} `));
    }
    expect(text.match(/derived by cerial convert/g)).toHaveLength(5);
  });

  test('bound key gets no comment', () => {
    const Owner = model('Owner', { id: f.record().id() });
    const Item = model('Item', {
      id: f.record().id(),
      ownerRef: f.record(),
      owner: f.relation(() => Owner).field('ownerRef'),
      back: f.reverse(() => Item),
    });

    expect(derivedForeignKeys(Item)).toEqual([]);
    expect(convert([place(Owner, 'Owner'), place(Item, 'Item')])).not.toContain('derived by cerial convert');
  });

  test('a reverse relation gets no comment', () => {
    const Author2 = model('Author2', { id: f.record().id(), posts: f.reverse(() => Author2).array() });

    expect(derivedForeignKeys(Author2)).toEqual([]);
  });

  test('attributes an inherited key to the parent', () => {
    const Target = model('Target', { id: f.record().id() });
    const Base = model('Base', { id: f.record().id(), target: f.relation(() => Target) }, { abstract: true });
    const Child = model('Child', { name: f.string() }, { extends: Base });
    const text = convert([place(Target, 'Target'), place(Base, 'Base'), place(Child, 'Child')]);

    expect(derivedForeignKeys(Base)).toEqual(['targetId']);
    expect(derivedForeignKeys(Child)).toEqual([]);
    expect(text.match(/derived by cerial convert/g)).toHaveLength(1);
    expect(text.indexOf('derived by cerial convert')).toBeLessThan(text.indexOf('model Child'));
  });

  test('a conversion with no declarations prints no comment', () => {
    expect(
      emitCerial(materialise(declarations))
        .map((file) => file.text)
        .join(''),
    ).not.toContain('derived by');
  });
});
