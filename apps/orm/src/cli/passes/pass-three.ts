import { parse } from '../../parser/parser';
import type { SchemaAST } from '../../types';
import { collectDslNames, NO_NAMES, unionNames } from './names';
import type { NameSets, SchemaSource } from './types';
import { emptyAst } from './types';

export interface PassThreeResult {
  /** The declarations of every file that parsed without error */
  readonly ast: SchemaAST;
  /** `path:line: message` per parse error */
  readonly errors: string[];
}

/**
 * Parse the `.cerial` sources against the union of their own names and `declared`, the names TypeScript
 * modules declare. A file with an error contributes nothing to the AST.
 */
export function runPassThree(sources: readonly SchemaSource[], declared: NameSets = NO_NAMES): PassThreeResult {
  const names = unionNames(collectDslNames(sources), declared);
  const ast = emptyAst();
  const errors: string[] = [];

  for (const { path, content } of sources) {
    const parsed = parse(
      content,
      new Set(names.objects),
      new Set(names.tuples),
      new Set(names.literals),
      new Set(names.enums),
      path,
    );

    if (parsed.errors.length) {
      for (const error of parsed.errors) errors.push(`${path}:${error.position.line}: ${error.message}`);
      continue;
    }

    ast.models.push(...parsed.ast.models);
    ast.objects.push(...parsed.ast.objects);
    ast.tuples.push(...parsed.ast.tuples);
    ast.literals.push(...parsed.ast.literals);
    ast.enums.push(...parsed.ast.enums);
  }

  return { ast, errors };
}
