import { CerialGenerationError } from '../../errors';
import { printSchema } from '../../formatter/formatter';
import { runPassThree } from '../passes/pass-three';
import type { SchemaSource } from '../passes/types';
import type { CerialToken, SchemaAST } from '../../types';
import type { CommentMap } from '../../formatter';
import { derivedForeignKeys, modelNode } from '../../parser/builder/model';
import type { ExportedDeclaration } from '../../parser/builder';
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

function commentToken(text: string): CerialToken {
  return { type: 'comment', value: text, position: { line: 0, column: 0, offset: 0 } };
}

/**
 * A comment above each key a model derived from its relation, since the AST cannot say the key was not
 * declared. The key and its relation are paired by the relation's `@field`.
 */
function derivedKeyComments(ast: SchemaAST, declarations: readonly ExportedDeclaration[]): CommentMap {
  const comments: CommentMap = new Map();
  for (const { handle } of declarations) {
    const keys = derivedForeignKeys(handle);
    if (!keys.length) continue;
    const model = ast.models.find((candidate) => candidate.name === modelNode(handle).name);
    for (const key of keys) {
      const relation = model?.fields.find(
        (field) => field.type === 'relation' && field.decorators.some((d) => d.type === 'field' && d.value === key),
      );
      if (!model || !relation) continue;
      comments.set(`field:${model.name}.${key}`, {
        leading: [
          commentToken(
            `// derived by cerial convert from the TypeScript relation '${relation.name}': the key was not declared there`,
          ),
        ],
        trailing: [],
      });
    }
  }

  return comments;
}

/**
 * Print one `.cerial` per module that declared something, from the AST as materialised (before
 * `resolveInheritance`, so `extends` survives), and gate the result by reparsing it. `declarations` are the
 * handles the AST came from; with them, a foreign key the TypeScript side derived is marked by a comment.
 */
export function emitCerial(ast: SchemaAST, declarations: readonly ExportedDeclaration[] = []): CerialFile[] {
  const comments = derivedKeyComments(ast, declarations);
  const files = originFiles(ast).map((from) => ({
    from,
    path: cerialPathOf(from),
    text: printSchema(onlyFrom(ast, from), { comments }),
  }));
  verifyCerial(ast, files);

  return files;
}
