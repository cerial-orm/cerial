import { syncHandles, withoutErroredDeclarations } from '../../generators/handles';
import { parseForHandles } from '../../parser/parser';
import type { SchemaAST } from '../../types';
import { collectDslNames } from './names';
import type { SchemaSource } from './types';
import { emptyAst } from './types';

/**
 * Parse the `.cerial` sources against `.cerial` names only, and write `<root>/cerial/handles.ts` from what
 * parsed whole. A field typed by a name TypeScript declares is kept as a member of unresolved type, so its
 * declaration still gets a complete handle; pass 3 resolves the type. A declaration with any other parse error
 * is left out of the handles. Parse errors are not reported: pass 3 owns them. Returns the AST the
 * handles were emitted from.
 */
export async function runPassOne(sources: readonly SchemaSource[], root: string): Promise<SchemaAST> {
  const names = collectDslNames(sources);
  const handlesAst = emptyAst();

  for (const { path, content } of sources) {
    const { ast, errors } = parseForHandles(
      content,
      new Set(names.objects),
      new Set(names.tuples),
      new Set(names.literals),
      new Set(names.enums),
      path,
    );
    const whole = withoutErroredDeclarations(ast, errors);
    handlesAst.models.push(...whole.models);
    handlesAst.objects.push(...whole.objects);
    handlesAst.tuples.push(...whole.tuples);
    handlesAst.literals.push(...whole.literals);
    handlesAst.enums.push(...whole.enums);
  }

  // Before any TypeScript module is imported, so the modules can import it
  await syncHandles(root, handlesAst);

  return handlesAst;
}
