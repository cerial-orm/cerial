import { validateDuplicateNames, validateExtends, validateSchema } from '../../../src/cli/validators';
import type { SchemaAST } from '../../../src/types';

/**
 * Every error `cerial generate` can raise for a parsed schema: the name and extends checks it runs on the
 * raw AST, plus the schema validator. Tests that call this exercise the live path rather than a lone helper.
 */
export function validateAll(ast: SchemaAST) {
  return [...validateDuplicateNames(ast), ...validateExtends(ast), ...validateSchema(ast).errors];
}
