import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handlesPath, syncHandles } from '../../../../src/generators/handles';
import { validatePickOmitFields } from '../../../../src/cli/validators/extends-validator';
import { tuple, tupleNode } from '../../../../src/parser/builder';
import { parseSchema } from './helpers';

const FIXTURES = join(import.meta.dir, '../../typechecks/fixtures');

const dirs: string[] = [];
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

describe('the handles fixture the type checks compile against', () => {
  it('is byte-for-byte what the emitter writes for mixed.cerial', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'handles-fixture-'));
    dirs.push(dir);
    await syncHandles(dir, parseSchema(await readFile(join(FIXTURES, 'mixed.cerial'), 'utf-8')));

    // To refresh after an intended emitter change, copy the file written at handlesPath(dir) over handles.ts
    expect(await readFile(join(FIXTURES, 'handles.ts'), 'utf-8')).toBe(await readFile(handlesPath(dir), 'utf-8'));
  });
});

describe('a tuple position picked through a handle', () => {
  const build = async (index: number): Promise<string[]> => {
    const ast = parseSchema(await readFile(join(FIXTURES, 'mixed.cerial'), 'utf-8'));
    const { Point } = await import('../../typechecks/fixtures/handles');
    // The handle type takes any number, so the range is only known to the validator
    const node = tupleNode(tuple('Child', [], { extends: Point.pick(index) }));
    ast.tuples.push(node);

    return validatePickOmitFields(ast).map((e) => e.message);
  };

  it('is accepted inside the parent size', async () => {
    expect(await build(2)).toEqual([]);
  });

  it('is refused by the validator past the parent size, though tsc accepts it', async () => {
    const errors = await build(9);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('out of bounds');
  });
});
