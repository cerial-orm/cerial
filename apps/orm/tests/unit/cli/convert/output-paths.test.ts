import { describe, expect, it } from 'bun:test';
import { CerialGenerationError } from '../../../../src/errors';
import { isInside, planOutputs } from '../../../../src/cli/convert/output-paths';

const targets = (plan: ReturnType<typeof planOutputs>): string[] => plan.outputs.map((o) => o.target);

describe('planOutputs', () => {
  it('maps to .schema.ts beside the source by default', () => {
    const plan = planOutputs({
      sources: ['/p/db/user.cerial', '/p/db/sub/post.cerial'],
      entryRoot: '/p/db',
      toExtension: '.schema.ts',
    });

    expect(targets(plan)).toEqual(['/p/db/user.schema.ts', '/p/db/sub/post.schema.ts']);
  });

  it('maps user.schema.ts to user.cerial for the other direction', () => {
    const plan = planOutputs({ sources: ['/p/db/user.schema.ts'], entryRoot: '/p/db', toExtension: '.cerial' });

    expect(targets(plan)).toEqual(['/p/db/user.cerial']);
  });

  it('mirrors the path relative to the entry root under -o', () => {
    const plan = planOutputs({
      sources: ['/p/db/sub/post.cerial'],
      entryRoot: '/p/db',
      toExtension: '.schema.ts',
      outDir: '/p/out',
    });

    expect(targets(plan)).toEqual(['/p/out/sub/post.schema.ts']);
  });

  it('mirrors from the common ancestor when a source lies outside the entry root', () => {
    const plan = planOutputs({
      sources: ['/p/a/x/one.cerial', '/p/a/y/two.cerial'],
      entryRoot: '/p/entry',
      toExtension: '.schema.ts',
      outDir: '/out',
    });

    expect(targets(plan)).toEqual(['/out/x/one.schema.ts', '/out/y/two.schema.ts']);
  });

  it('refuses two sources reaching one target and names both', () => {
    const run = () =>
      planOutputs({
        sources: ['/p/db/user.cerial', '/p/db/user.schema.ts'],
        entryRoot: '/p/db',
        toExtension: '.schema.ts',
      });

    expect(run).toThrow(CerialGenerationError);
    expect(run).toThrow(/user\.cerial/);
    expect(run).toThrow(/user\.schema\.ts <- .*user\.cerial/);
  });

  it('carries protected sources and kept modules, resolved', () => {
    const plan = planOutputs({
      sources: ['/p/db/a.cerial'],
      entryRoot: '/p/db',
      toExtension: '.schema.ts',
      protectedSources: ['/p/other/b.cerial'],
      keptModules: ['/p/db/../db/k.ts'],
    });

    expect(plan.protectedSources).toEqual(['/p/other/b.cerial']);
    expect(plan.keptModules).toEqual(['/p/db/k.ts']);
  });
});

describe('isInside', () => {
  it('accepts the root and descendants, refuses siblings and parents', () => {
    expect(isInside('/a/b', '/a/b')).toBe(true);
    expect(isInside('/a/b', '/a/b/c/d')).toBe(true);
    expect(isInside('/a/b', '/a/bc')).toBe(false);
    expect(isInside('/a/b', '/a')).toBe(false);
  });
});
