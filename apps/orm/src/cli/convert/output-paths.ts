import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { CerialGenerationError } from '../../errors';

/** `--to ts` writes `<basename>.schema.ts`; `--to cerial` writes `<basename>.cerial`. */
export type OutputExtension = '.schema.ts' | '.cerial';

export interface PlanOutputsInput {
  readonly sources: readonly string[];
  readonly entryRoot: string;
  readonly toExtension: OutputExtension;
  /** `-o`. Absent means each output sits beside its source. */
  readonly outDir?: string;
  /** Sources of every config entry, not only the one being converted. */
  readonly protectedSources?: readonly string[];
  /** TypeScript modules a converted module imports and the run leaves in place. */
  readonly keptModules?: readonly string[];
}

export interface PlannedOutput {
  readonly source: string;
  readonly target: string;
}

export interface OutputPlan {
  readonly entryRoot: string;
  readonly outDir?: string;
  readonly outputs: readonly PlannedOutput[];
  readonly protectedSources: readonly string[];
  readonly keptModules: readonly string[];
}

/** True when `path` is `root` or lies under it. */
export function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);

  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function commonAncestor(paths: readonly string[]): string {
  const split = paths.map((p) => dirname(p).split(sep));
  const first = split[0] ?? [];
  let length = first.length;
  for (const parts of split) {
    let i = 0;
    while (i < length && i < parts.length && parts[i] === first[i]) i++;
    length = i;
  }

  return first.slice(0, length).join(sep) || sep;
}

function swapExtension(path: string, toExtension: OutputExtension): string {
  const name = basename(path);
  const stem = name.endsWith('.schema.ts')
    ? name.slice(0, -'.schema.ts'.length)
    : name.slice(0, name.length - extname(name).length);

  return join(dirname(path), stem + toExtension);
}

/** Maps each source to its output path and refuses two sources that reach one target. */
export function planOutputs(input: PlanOutputsInput): OutputPlan {
  const entryRoot = resolve(input.entryRoot);
  const sources = input.sources.map((s) => resolve(s));
  const outDir = input.outDir === undefined ? undefined : resolve(input.outDir);

  // A scattered layout (a source outside the entry root) mirrors from the sources' common ancestor
  const base = sources.every((s) => isInside(entryRoot, s)) ? entryRoot : commonAncestor(sources);

  const outputs: PlannedOutput[] = sources.map((source) => {
    const beside = swapExtension(source, input.toExtension);

    return { source, target: outDir === undefined ? beside : join(outDir, relative(base, beside)) };
  });

  const bySource = new Map<string, string[]>();
  for (const { source, target } of outputs) bySource.set(target, [...(bySource.get(target) ?? []), source]);
  const clashes = [...bySource].filter(([, from]) => from.length > 1);
  if (clashes.length) {
    const lines = clashes.map(([target, from]) => `  ${target} <- ${from.join(', ')}`);
    throw new CerialGenerationError(`Two sources would be written to one file:\n${lines.join('\n')}`);
  }

  return {
    entryRoot,
    outDir,
    outputs,
    protectedSources: (input.protectedSources ?? []).map((s) => resolve(s)),
    keptModules: (input.keptModules ?? []).map((s) => resolve(s)),
  };
}
