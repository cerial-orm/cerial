import { CerialGenerationError } from '../../errors';
import { printSchema } from '../../formatter/formatter';
import { runPassThree } from '../passes/pass-three';
import type { SchemaSource } from '../passes/types';
import type { SchemaAST } from '../../types';
import { compareStructure } from './compare';

const LISTS = ['models', 'objects', 'tuples', 'literals', 'enums'] as const;

export interface CerialFile {
  /** The module the declarations were written in, which is their `origin.file`. */
  readonly from: string;
  /** Where the `.cerial` text goes: the module's path with its `.schema.ts` or `.ts` ending replaced. */
  readonly path: string;
  readonly text: string;
}

export function cerialPathOf(module: string): string {
  return `${module.replace(/(\.schema)?\.[cm]?tsx?$/, '')}.cerial`;
}

function originFiles(ast: SchemaAST): string[] {
  const files = new Set<string>();
  for (const list of LISTS) for (const item of ast[list]) files.add(item.origin.file);

  return [...files].sort();
}

function onlyFrom(ast: SchemaAST, file: string): SchemaAST {
  const keep = <T extends { readonly origin: { readonly file: string } }>(items: T[]): T[] =>
    items.filter((item) => item.origin.file === file);

  return {
    models: keep(ast.models),
    objects: keep(ast.objects),
    tuples: keep(ast.tuples),
    literals: keep(ast.literals),
    enums: keep(ast.enums),
    source: '',
  };
}

/** `models.User.fields[0]: ...` names list and declaration; a list-level difference names neither. */
function describe(ast: SchemaAST, difference: string): string {
  const match = /^\$?\.?(models|objects|tuples|literals|enums)\.([^.[:]+)/.exec(difference);
  const found = match && ast[match[1] as (typeof LISTS)[number]].find((item) => item.name === match[2]);
  if (!found) return difference;

  return `${match![1]!.slice(0, -1)} '${found.name}' (${found.origin.file}): ${difference}`;
}

/**
 * Parse the printed files together, each against the names of all of them as `generate` does, and refuse
 * unless the result has the structure of `ast`. A printer that writes text the parser reads differently
 * (a name with a space, say) would otherwise convert a schema into a different one without a sign.
 */
export function verifyCerial(ast: SchemaAST, files: readonly CerialFile[]): void {
  const sources: SchemaSource[] = files.map((file) => ({ path: file.path, content: file.text }));
  const { ast: reparsed, errors } = runPassThree(sources);
  if (errors.length) {
    throw new CerialGenerationError(
      `The printed .cerial does not parse, so nothing was converted:\n${errors.join('\n')}`,
    );
  }

  const found = compareStructure(ast, reparsed);
  if (found.length) {
    throw new CerialGenerationError(
      `The printed .cerial reparses to a different schema, so nothing was converted:\n${found
        .map((difference) => `  ${describe(ast, difference)}`)
        .join('\n')}`,
    );
  }
}

/**
 * Print one `.cerial` per module that declared something, from the AST as materialised (before
 * `resolveInheritance`, so `extends` survives), and gate the result by reparsing it.
 */
export function emitCerial(ast: SchemaAST): CerialFile[] {
  const files = originFiles(ast).map((from) => ({
    from,
    path: cerialPathOf(from),
    text: printSchema(onlyFrom(ast, from)),
  }));
  verifyCerial(ast, files);

  return files;
}
