import { describe, expect, test } from 'bun:test';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cerialPathOf, emitCerial, verifyCerial } from '../../../../src/cli/convert';
import { CerialGenerationError } from '../../../../src/errors';
import { runPassThree } from '../../../../src/cli/passes/pass-three';
import { enum as enumeration, e, f, literal, model, object, tuple, variant } from '../../../../src/schema';
import { loadDeclarations, materialise } from '../../../../src/parser/builder';
import type { ExportedDeclaration } from '../../../../src/parser/builder';
import type { SchemaAST } from '../../../../src/types';

const place = (handle: object, module: string, exportName: string): ExportedDeclaration => ({
  handle,
  module,
  exportName,
});

const TWINS = join(import.meta.dir, '..', '..', '..', 'e2e', 'schemas-ts');

function twinFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);

    return statSync(path).isDirectory() ? twinFiles(path) : path.endsWith('.schema.ts') ? [path] : [];
  });
}

describe('paths', () => {
  test('a .schema.ts module becomes a .cerial file at the same place', () => {
    expect(cerialPathOf('/p/user.schema.ts')).toBe('/p/user.cerial');
    expect(cerialPathOf('/p/index.ts')).toBe('/p/index.cerial');
  });
});

describe('one file per origin', () => {
  const Address = object('Address', { city: f.string() });
  const User = model('User', { id: f.record().id(), home: f.object(Address) });
  const Tag = model('Tag', { id: f.record().id() });
  const ast = materialise([
    place(Address, '/p/user.schema.ts', 'Address'),
    place(User, '/p/user.schema.ts', 'User'),
    place(Tag, '/p/tag.schema.ts', 'Tag'),
  ]);

  test('each module with declarations yields one file holding only its own', () => {
    const files = emitCerial(ast);

    expect(files.map((file) => file.path)).toEqual(['/p/tag.cerial', '/p/user.cerial']);
    expect(files[0]!.text).toContain('model Tag');
    expect(files[0]!.text).not.toContain('model User');
    expect(files[1]!.text).toContain('model User');
    expect(files[1]!.text).toContain('object Address');
  });

  test('follows origin.file for a re-export', () => {
    const Shared = model('Shared', { id: f.record().id() });
    const reexported = materialise([
      place(Shared, '/p/index.ts', 'Shared'),
      place(Shared, '/p/shared.schema.ts', 'Shared'),
    ]);
    const files = emitCerial(reexported);

    expect(reexported.models[0]!.origin.file).toBe('/p/index.ts');
    expect(files.map((file) => file.path)).toEqual(['/p/index.cerial']);
  });

  test('an entry module that only calls defineSchema yields no file', () => {
    const files = emitCerial(ast);

    expect(files.some((file) => file.from === '/p/entry.ts')).toBe(false);
    expect(emitCerial(materialise([]))).toEqual([]);
  });
});

describe('the reparse gate', () => {
  test('accepts all five declaration kinds with extends, read before inheritance resolves', () => {
    const Base = model('Base', { id: f.record().id(), kind: f.string() }, { abstract: true });
    const Child = model('Child', { name: f.string() }, { extends: Base });
    const Pair = tuple('Pair', [e.int(), e.int()]);
    const Mode = literal('Mode', [variant.string('a'), variant.string('b')]);
    const Color = enumeration('Color', ['red', 'blue']);
    const Spot = object('Spot', { at: f.tuple(Pair), mode: f.literal(Mode), color: f.enum(Color) });
    const Holder = model('Holder', { id: f.record().id(), spot: f.object(() => Spot) });
    const ast = materialise(
      [Base, Child, Pair, Mode, Color, Spot, Holder].map((handle) =>
        place(handle, '/p/all.schema.ts', (handle as { name: string }).name),
      ),
    );
    const [file] = emitCerial(ast);

    expect(file!.text).toContain('model Child extends Base');
    expect(runPassThree([{ path: file!.path, content: file!.text }]).errors).toEqual([]);
  });

  test('accepts the whole corpus of twins and reparses every file', async () => {
    const ast = materialise(await loadDeclarations(twinFiles(TWINS)));
    const files = emitCerial(ast);

    expect(files.length).toBeGreaterThan(40);
    for (const kind of ['models', 'objects', 'tuples', 'literals', 'enums'] as const) {
      expect(ast[kind].length).toBeGreaterThan(0);
    }
    expect(ast.models.some((item) => item.extends)).toBe(true);
  });

  test('refuses output that reparses differently, naming the declaration and the path', () => {
    const Bad = model('Bad', { id: f.record().id() });
    const good = materialise([place(Bad, '/p/bad.schema.ts', 'Bad')]);
    const wrong: SchemaAST = structuredClone(good);
    const id = wrong.models[0]!.fields[0]!;
    id.recordIdTypes = ['a b'];

    const attempt = (): unknown => emitCerial(wrong);

    expect(attempt).toThrow(CerialGenerationError);
    expect(attempt).toThrow(/model 'Bad' \(\/p\/bad\.schema\.ts\)/);
    expect(attempt).toThrow(/models\.Bad\.fields\[0\]/);
  });

  test('refuses text that does not parse', () => {
    const ast = materialise([place(model('Ok', { id: f.record().id() }), '/p/ok.schema.ts', 'Ok')]);

    expect(() => verifyCerial(ast, [{ from: '/p/ok.schema.ts', path: '/p/ok.cerial', text: 'model {' }])).toThrow(
      CerialGenerationError,
    );
  });

  test('refuses a file set that lost a declaration', () => {
    const A = model('A', { id: f.record().id() });
    const B = model('B', { id: f.record().id() });
    const ast = materialise([place(A, '/p/a.schema.ts', 'A'), place(B, '/p/b.schema.ts', 'B')]);
    const files = emitCerial(ast);

    expect(() => verifyCerial(ast, files.slice(0, 1))).toThrow(CerialGenerationError);
  });
});
