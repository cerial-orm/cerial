import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { compareExact, emitCerial, emitTypescript } from '../../../../src/cli/convert';
import { emitField } from '../../../../src/cli/convert/emit-ts/field';
import { runPassThree } from '../../../../src/cli/passes/pass-three';
import { loadDeclarations, materialise } from '../../../../src/parser/builder';
import { parse } from '../../../../src/parser/parser';
import { SIZED_NUMBER_TYPES } from '../../../../src/parser/types/field-types/sized-number-parser';
import { e, f, model, object, tuple } from '../../../../src/schema';
import type { ASTField } from '../../../../src/types';

const SCHEMA_MODULE = resolve(import.meta.dir, '../../../../src/schema');
const dirs: string[] = [];

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const SOURCE = `model Sensor {
  id      Record @id
  channel Uint8
  offset  Int16? @default(-40)
  reading Float32 @default(1.5)
  coarse  Float16 @nullable
  counter Uint64 @default(0)
  samples Uint16[]
  tags    Int8[] @set
  wide    Int32 @unique
  mask    Uint32?
  calib   Calibration?
  px      Pixel
}

object Calibration {
  gain  Float32
  steps Uint32
}

tuple Pixel {
  Uint8,
  Uint8,
  Float16 @nullable
}
`;

function parsedField(line: string): ASTField {
  const { ast, errors } = parse(`model M {\n  x ${line}\n}\n`);
  expect(errors).toEqual([]);

  return ast.models[0]!.fields[0]!;
}

describe('field emitter', () => {
  test.each(SIZED_NUMBER_TYPES.map((t) => [t.name, t.fieldType] as const))(
    '%s writes f.%s() with its modifiers',
    (name, factory) => {
      expect(emitField(parsedField(name), { declaration: 'model M' })).toBe(`f.${factory}()`);
      expect(emitField(parsedField(`${name}? @nullable`), { declaration: 'model M' })).toBe(
        `f.${factory}().optional().nullable()`,
      );
      expect(emitField(parsedField(`${name}[] @set`), { declaration: 'model M' })).toBe(`f.${factory}().array().set()`);
      expect(emitField(parsedField(`${name} @default(-3)`), { declaration: 'model M' })).toBe(
        `f.${factory}().default(-3)`,
      );
    },
  );
});

describe('.cerial to TypeScript', () => {
  test('the emitted module loads and rebuilds the parsed AST exactly', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cerial-c1b-'));
    dirs.push(dir);
    const path = join(dir, 'sensor.cerial');
    const { ast, errors } = runPassThree([{ path, content: SOURCE }]);
    expect(errors).toEqual([]);

    const result = emitTypescript(ast, { schemaImport: SCHEMA_MODULE });
    expect(result.refusals).toEqual([]);
    const module = result.modules[0]!;
    for (const name of [
      'f.uint8()',
      'f.int16()',
      'f.float32()',
      'f.float16()',
      'f.uint64()',
      'f.uint16()',
      'e.uint8()',
    ]) {
      expect(module.text).toContain(name);
    }
    mkdirSync(dirname(module.path), { recursive: true });
    writeFileSync(module.path, module.text);

    const built = materialise(await loadDeclarations([module.path]));

    expect(
      compareExact(ast, built, {
        tolerate: { declarationOrder: result.modules.flatMap((m) => m.hoisted) },
      }),
    ).toEqual([]);
  });
});

describe('TypeScript to .cerial', () => {
  const Calibration = object('Calibration', { gain: f.float32(), steps: f.uint32() });
  const Pixel = tuple('Pixel', [e.uint8(), e.uint8(), e.float16().nullable()]);
  const Sensor = model('Sensor', {
    id: f.record().id(),
    channel: f.uint8(),
    offset: f.int16().optional().default(-40),
    coarse: f.float16().nullable(),
    counter: f.uint64().default(0),
    samples: f.uint16().array(),
    tags: f.int8().array().set(),
    wide: f.int32().unique(),
    calib: f.object(Calibration).optional(),
    px: f.tuple(Pixel),
  });

  test('prints the DSL names and the printed text parses back to the same AST', () => {
    const ast = materialise(
      ['Calibration', 'Pixel', 'Sensor'].map((exportName) => ({
        handle: { Calibration, Pixel, Sensor }[exportName as 'Sensor'],
        module: '/p/sensor.schema.ts',
        exportName,
      })),
    );
    // emitCerial re-parses its output and compares it with the AST, so a lossy print throws here
    const text = emitCerial(ast)[0]!.text.replace(/[ \t]+/g, ' ');

    expect(text).toContain('channel Uint8');
    expect(text).toContain('offset Int16? @default(-40)');
    expect(text).toContain('coarse Float16 @nullable');
    expect(text).toContain('counter Uint64 @default(0)');
    expect(text).toContain('samples Uint16[]');
    expect(text).toContain('tags Int8[] @set');
    expect(text).toContain('wide Int32 @unique');
    expect(text).toContain('gain Float32');
    expect(text).toContain('steps Uint32');
  });

  test('every sized type prints its DSL name', () => {
    const Every = model('Every', {
      id: f.record().id(),
      a: f.int8(),
      b: f.uint8(),
      c: f.int16(),
      d: f.uint16(),
      e: f.int32(),
      g: f.uint32(),
      h: f.uint64(),
      i: f.float16(),
      j: f.float32(),
    });
    const ast = materialise([{ handle: Every, module: '/p/every.schema.ts', exportName: 'Every' }]);
    const text = emitCerial(ast)[0]!.text;

    for (const t of SIZED_NUMBER_TYPES) expect(text).toMatch(new RegExp(`\\b${t.name}\\b`));
  });
});
