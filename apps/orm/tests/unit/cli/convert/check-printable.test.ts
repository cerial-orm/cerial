import { describe, expect, test } from 'bun:test';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { checkPrintable } from '../../../../src/cli/convert/check-printable';
import { LOSSY_CASES } from '../../../../src/cli/convert/lossy-cases';
import { loadDeclarations, materialise } from '../../../../src/parser/builder';
import type { ExportedDeclaration } from '../../../../src/parser/builder';
import { e, enum as enumeration, f, literal, model, object, tuple, variant } from '../../../../src/schema';
import type { SchemaAST } from '../../../../src/types';

const MODULE = '/p/a.schema.ts';

const place = (handle: object, exportName: string): ExportedDeclaration => ({ handle, module: MODULE, exportName });
const build = (...handles: [string, object][]): SchemaAST =>
  materialise(handles.map(([name, handle]) => place(handle, name)));
const ids = (ast: SchemaAST): string[] => checkPrintable(ast).map((finding) => finding.id);

const TWINS = join(import.meta.dir, '..', '..', '..', 'e2e', 'schemas-ts');
function twinFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);

    return statSync(path).isDirectory() ? twinFiles(path) : path.endsWith('.schema.ts') ? [path] : [];
  });
}

describe('LOSSY_CASES', () => {
  test('pins the id set', () => {
    expect(LOSSY_CASES.map((entry) => entry.id).sort()).toEqual(
      [
        'loop-built-model',
        'helper-built-declaration',
        'shared-field-set',
        'npm-field-set',
        'conditional-structure',
        'computed-value',
        'literal-constant-argument',
        'derived-foreign-key',
        'inherited-derived-key',
        'bound-or-reverse-relation',
        'typescript-comments',
        'cerial-comments',
        'layout-not-preserved',
        'export-name-differs',
        'default-export',
        'multi-name-export',
        'barrel-reexport',
        'schema-import-alias',
        'reference-form',
        'pick-omit-extends',
        'define-schema-registration',
        'non-schema-code',
        'module-fails-to-load',
        'reassigned-export',
        'unexported-declaration',
        'duplicate-declaration-name',
        'non-identifier-name',
        'non-identifier-id-type',
        'reserved-keyword-name',
        'string-with-both-quotes',
        'unprintable-default-string',
        'unprintable-variant-string',
        'ast-mismatch',
        'invalid-source',
        'unknown-construct',
        'declared-foreign-key-to-ts',
        'extends-parent-after-child',
        'extends-cross-file-cycle',
        'extends-thunk-back-edge',
        'alternating-directives',
        'reserved-word-binding',
        'proto-field-key',
      ].sort(),
    );
    expect(LOSSY_CASES).toHaveLength(42);
  });

  test('every action is refuse or expand and every entry is filled in', () => {
    for (const entry of LOSSY_CASES) {
      expect(['refuse', 'expand']).toContain(entry.action);
      expect(['to-cerial', 'to-ts', 'both']).toContain(entry.direction);
      expect(entry.construct).not.toBe('');
      expect(entry.reason).not.toBe('');
    }
  });

  test('texts carry no planning ids', () => {
    for (const entry of LOSSY_CASES) {
      const text = `${entry.construct} ${entry.reason} ${entry.comment ?? ''}`;

      expect(text).not.toMatch(/\bD\d+\b|ADR-\d+|SR-\d+|\b\d{2}\.\d{2}\.\d{2}\b|\bband\b/i);
    }
  });
});

describe('names', () => {
  test('refuses a name that is not an identifier, every kind, all findings at once', () => {
    const bad = build(
      ['M', model('M', { id: f.record().id(), ok: f.string() })],
      ['O', object('O', { a: f.string() })],
      ['T', tuple('T', [e.int()])],
      ['E', enumeration('E', ['a'])],
    );
    bad.models[0]!.name = 'a b';
    bad.models[0]!.fields[1]!.name = 'x-y';
    bad.objects[0]!.fields[0]!.name = '1st';
    bad.tuples[0]!.elements[0]!.name = 'p q';
    bad.enums[0]!.values = ['fine', 'not fine'];

    const findings = checkPrintable(bad);

    expect(findings.map((finding) => finding.id)).toEqual(Array(5).fill('non-identifier-name'));
    expect(findings[0]!.message).toContain("model 'a b'");
    expect(findings[0]!.message).toContain(MODULE);
    expect(findings[0]!.message).toContain('which is not an identifier');
  });

  test('passes identifiers', () => {
    const ok = build(['M', model('M', { id: f.record().id(), ok_1: f.string() })], ['E', enumeration('E', ['a', 'b'])]);

    expect(checkPrintable(ok)).toEqual([]);
  });

  test('refuses an id type that is not an identifier', () => {
    const bad = build(['M', model('M', { id: f.record().id(), ref: f.record('a b') })]);
    const [finding] = checkPrintable(bad);

    expect(ids(bad)).toEqual(['non-identifier-id-type']);
    expect(finding!.declaration).toBe('M');
    expect(finding!.member).toBe('ref');
    expect(ids(build(['M', model('M', { id: f.record('int').id() })]))).toEqual([]);
  });

  test('refuses a reserved keyword, case-insensitively, but not an ordinary name', () => {
    const bad = build(
      ['select', model('select', { id: f.record().id(), Value: f.string() })],
      ['Fine', model('Fine', { id: f.record().id(), title: f.string() })],
    );
    const findings = checkPrintable(bad);

    expect(findings.map((finding) => finding.id)).toEqual(['reserved-keyword-name', 'reserved-keyword-name']);
    expect(findings.map((finding) => finding.declaration)).toEqual(['select', 'select']);
    expect(ids(build(['Fine', model('Fine', { id: f.record().id(), title: f.string() })]))).toEqual([]);
  });
});

describe('strings', () => {
  const withDefault = (value: string): SchemaAST =>
    build(['M', model('M', { id: f.record().id(), s: f.string().default(value) })]);

  test('refuses a default the printer cannot spell', () => {
    for (const value of ['a ) b', 'a // b']) {
      const found = checkPrintable(withDefault(value));

      expect(found.map((finding) => finding.id)).toEqual(['unprintable-default-string']);
      expect(found[0]!.declaration).toBe('M');
      expect(found[0]!.member).toBe('s');
      expect(found[0]!.module).toBe(MODULE);
    }
  });

  test('refuses a defaultAlways and a tuple element default the same way', () => {
    const always = build(['M', model('M', { id: f.record().id(), s: f.string().defaultAlways('a ) b') })]);
    const element = build(['T', tuple('T', [e.string().default('a ) b')])]);

    expect(ids(always)).toEqual(['unprintable-default-string']);
    expect(ids(element)).toEqual(['unprintable-default-string']);
  });

  test('passes a plain default, one holding both quotes, and a non-string default', () => {
    expect(ids(withDefault('plain'))).toEqual([]);
    expect(ids(withDefault('it\'s "x"'))).toEqual([]);
    expect(ids(build(['M', model('M', { id: f.record().id(), n: f.int().default(1) })]))).toEqual([]);
  });

  test('refuses a variant the printer cannot spell', () => {
    const bad = build(['L', literal('L', [variant.string('a, b'), variant.string('ok')])]);
    const found = checkPrintable(bad);

    expect(found.map((finding) => finding.id)).toEqual(['unprintable-variant-string']);
    expect(found[0]!.declaration).toBe('L');
    expect(ids(build(['L', literal('L', [variant.string('a'), variant.string('it\'s "x"')])]))).toEqual([]);
  });
});

describe('corpus', () => {
  test('reports nothing for any twin', async () => {
    const ast = materialise(await loadDeclarations(twinFiles(TWINS)));

    expect(ast.models.length).toBeGreaterThan(0);
    expect(checkPrintable(ast)).toEqual([]);
  });
});
