import type { ParseError, SchemaAST, SourceRange } from '../../types';

const covers = (range: SourceRange, line: number): boolean => range.start.line <= line && line <= range.end.line;

function keep<T extends { name: string; extends?: string; range: SourceRange }>(
  items: readonly T[],
  lines: readonly number[],
): T[] {
  const dropped = new Set(items.filter((i) => lines.some((l) => covers(i.range, l))).map((i) => i.name));
  // A child of a dropped parent would list too few members, which turns a valid pick into a compile error
  let grew = true;
  while (grew) {
    grew = false;
    for (const item of items) {
      if (item.extends && dropped.has(item.extends) && !dropped.has(item.name)) {
        dropped.add(item.name);
        grew = true;
      }
    }
  }

  return items.filter((i) => !dropped.has(i.name));
}

/**
 * The part of a pass-1 AST that is whole. The parser drops a field it cannot type (a reference to a
 * TypeScript-declared type fails the DSL-only parse) yet still returns the declaration around it, so a
 * declaration covering an error line would list too few members. Those, and everything extending them, are left out
 * and the rest keep their handles.
 */
export function withoutErroredDeclarations(ast: SchemaAST, errors: readonly ParseError[]): SchemaAST {
  if (!errors.length) return ast;
  const lines = errors.map((e) => e.position.line);

  return {
    ...ast,
    models: keep(ast.models, lines),
    objects: keep(ast.objects, lines),
    tuples: keep(ast.tuples, lines),
    literals: keep(ast.literals, lines),
    enums: keep(ast.enums, lines),
  };
}
