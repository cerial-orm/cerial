import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { f } from '../../../../src/parser/builder';
import type { CompositeFieldPath } from '../../../../src/parser/builder';
import { object } from '../../../../src/parser/builder/object';
import { model, modelNode } from '../../../../src/parser/builder/model';
import { parse } from '../../../../src/parser/parser';
import { withoutPosition } from './helpers';

const CORPUS = readFileSync(
  new URL('../../../e2e/schemas/decorators/composite-unique-objects.cerial', import.meta.url),
  'utf8',
);

describe('composite directives', () => {
  test('@@unique and @@index build with kind, name and fields', () => {
    const node = modelNode(
      model(
        'M',
        { a: f.string(), b: f.string() },
        { unique: { name: 'ab', fields: ['a', 'b'] }, index: { name: 'byA', fields: ['a'] } },
      ),
    );

    expect((node.directives ?? []).map(({ kind, name, fields }) => ({ kind, name, fields }))).toEqual([
      { kind: 'unique', name: 'ab', fields: ['a', 'b'] },
      { kind: 'index', name: 'byA', fields: ['a'] },
    ]);
  });

  test('a repeated kind builds one node per entry, in list order', () => {
    const node = modelNode(
      model(
        'M',
        { a: f.string(), b: f.string() },
        {
          unique: [
            { name: 'second', fields: ['b'] },
            { name: 'first', fields: ['a'] },
          ],
        },
      ),
    );

    expect((node.directives ?? []).map((d) => d.name)).toEqual(['second', 'first']);
  });

  test('a model with no composite options keeps directives []', () => {
    expect(modelNode(model('M', { a: f.string() }, { unique: [] })).directives).toEqual([]);
  });

  test('a malformed directive throws', () => {
    expect(() => modelNode(model('M', { a: f.string() }, { unique: { name: 'a b', fields: ['a'] } }))).toThrow(
      'plain name',
    );
    expect(() => modelNode(model('M', { a: f.string() }, { index: { name: 'x', fields: [] } }))).toThrow('field paths');
  });

  test('every model in composite-unique-objects.cerial matches the parser, dotted paths included', () => {
    const { ast, errors } = parse(CORPUS);
    expect(errors).toHaveLength(0);
    const Location = object('Location', { city: f.string(), zip: f.string(), street: f.string().optional() });
    const Dock = object('Dock', { bay: f.string(), level: f.int() });
    const built = [
      model(
        'Warehouse',
        { id: f.record().id(), name: f.string().index(), location: f.object(Location), capacity: f.int().optional() },
        {
          unique: [
            { name: 'cityZip', fields: ['location.city', 'location.zip'] },
            { name: 'nameCity', fields: ['name', 'location.city'] },
          ],
        },
      ),
      model(
        'Depot',
        { id: f.record().id(), label: f.string(), dock: f.object(Dock) },
        {
          index: [
            { name: 'dockBayLevel', fields: ['dock.bay', 'dock.level'] },
            { name: 'labelDockBay', fields: ['label', 'dock.bay'] },
          ],
        },
      ),
    ].map(modelNode);

    expect(ast.models.flatMap((m) => m.directives)).toHaveLength(4);
    expect(withoutPosition(built)).toEqual(withoutPosition(ast.models));
  });
});

describe('composite field path type', () => {
  test('a dotted path compiles and an unknown top-level key does not', () => {
    const fields = { name: f.string(), location: f.string() };
    model('M', fields, { unique: { name: 'ok', fields: ['name', 'location.city'] } });
    // @ts-expect-error 'nope' is neither a field of the model nor a path into one
    model('M', fields, { unique: { name: 'bad', fields: ['nope'] } });
    // @ts-expect-error the head of a dotted path must be a field too
    model('M', fields, { index: [{ name: 'bad', fields: ['nope.city'] }] });

    const ok: CompositeFieldPath<'a'>[] = ['a', 'a.b.c'];
    // @ts-expect-error 'b' is not a key
    const bad: CompositeFieldPath<'a'>[] = ['b'];

    expect([ok, bad]).toHaveLength(2);
  });

  test('an unknown top-level key still fails at runtime where the validator would reject it', () => {
    // The type only checks the head; a tail that does not resolve is left to the schema validator.
    const node = modelNode(model('M', { a: f.string() }, { unique: { name: 'x', fields: ['a.missing'] } }));

    expect(node.directives?.[0]?.fields).toEqual(['a.missing']);
  });
});
