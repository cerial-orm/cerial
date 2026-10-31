import {
  collectEnumNames,
  collectLiteralNames,
  collectObjectNames,
  collectTupleNames,
  parse,
} from '../../../../src/parser/parser';
import type { SchemaAST } from '../../../../src/types';

/** The pass-1 AST of one `.cerial` source, parsed the way generation parses it */
export function parseSchema(source: string): SchemaAST {
  const result = parse(
    source,
    new Set(collectObjectNames(source)),
    new Set(collectTupleNames(source)),
    new Set(collectLiteralNames(source)),
    new Set(collectEnumNames(source)),
    'handles.cerial',
  );
  if (result.errors.length) throw new Error(result.errors.map((e) => e.message).join('; '));

  return result.ast;
}

/** The export line for `name`, so a test asserts on one declaration rather than the whole module */
export function lineOf(text: string, name: string): string {
  const line = text.split('\n').find((l) => l.startsWith(`export const ${name} = `));
  if (!line) throw new Error(`No export named ${name} in:\n${text}`);

  return line;
}
