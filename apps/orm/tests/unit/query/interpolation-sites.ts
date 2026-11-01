/**
 * Finds every place the query-text sources put a computed value into a string, as a stable list of site keys.
 *
 * The scan reads the syntax tree, so comments and string contents are never mistaken for code. A site is
 * the expression inside a template placeholder, or an operand of a `+` chain that also holds a string
 * literal. Placeholders inside error construction, `throw` and console calls build messages, not query
 * text, and are skipped.
 *
 * A key is `file::enclosing function::kind::expression`, never a line number. It survives code moving,
 * reformatting and unrelated edits; it changes when the interpolated expression, the function that holds
 * it or the file does, which is when a person should look at it again.
 */

import ts from 'typescript';

export type SiteKind = 'template' | 'concat';

export interface Site {
  readonly key: string;
  readonly line: number;
}

const MESSAGE_CONSTRUCTOR = /Error$/;
const CONSOLE_CALL = /^console\./;

function functionName(node: ts.Node): string | undefined {
  if (ts.isFunctionDeclaration(node)) return node.name?.text;
  if (ts.isMethodDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node)) {
    const owner = ts.isClassLike(node.parent) ? (node.parent.name?.text ?? '') : '';

    return `${owner ? `${owner}.` : ''}${node.name.getText()}`;
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const parent = node.parent;
    if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) return parent.name.getText();
  }

  return undefined;
}

function enclosingFunction(node: ts.Node): string {
  for (let current = node.parent; current; current = current.parent) {
    const name = functionName(current);
    if (name) return name;
  }

  return '<module>';
}

/** True for a node that builds a message or a log line instead of query text. */
function buildsMessage(node: ts.Node): boolean {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isThrowStatement(current)) return true;
    if (ts.isNewExpression(current) && MESSAGE_CONSTRUCTOR.test(current.expression.getText())) return true;
    if (ts.isCallExpression(current) && CONSOLE_CALL.test(current.expression.getText())) return true;
  }

  return false;
}

const isStringPart = (node: ts.Node): boolean =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node);

const isPlus = (node: ts.Node): node is ts.BinaryExpression =>
  ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken;

function operands(node: ts.Expression): ts.Expression[] {
  const inner = ts.isParenthesizedExpression(node) ? node.expression : node;
  if (!isPlus(inner)) return [node];

  return [...operands(inner.left), ...operands(inner.right)];
}

/** Every interpolation site in one file, in source order. */
export function findSites(path: string, source: string): Site[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const sites: Site[] = [];
  const add = (kind: SiteKind, expression: ts.Node): void => {
    const text = expression.getText(file).replace(/\s+/g, ' ');
    const key = `${path}::${enclosingFunction(expression)}::${kind}::${text}`;
    sites.push({ key, line: file.getLineAndCharacterOfPosition(expression.getStart(file)).line + 1 });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isTemplateExpression(node) && !buildsMessage(node)) {
      for (const span of node.templateSpans) add('template', span.expression);
    }
    // Only the root of a chain: its parts are flattened, so the inner nodes must not report again
    if (isPlus(node) && !(isPlus(node.parent) || ts.isParenthesizedExpression(node.parent))) {
      const parts = operands(node);
      if (parts.some(isStringPart) && !buildsMessage(node)) {
        for (const part of parts) if (!isStringPart(part)) add('concat', part);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  return sites;
}

/** Site key to how many times it occurs in the given files. */
export function countSites(files: ReadonlyArray<{ path: string; source: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of files) {
    for (const site of findSites(file.path, file.source)) counts[site.key] = (counts[site.key] ?? 0) + 1;
  }

  return counts;
}

/** Keys that occur more often than the allowlist records, with the lines of the surplus. */
export function unlistedSites(
  files: ReadonlyArray<{ path: string; source: string }>,
  allowed: Readonly<Record<string, number>>,
): string[] {
  const seen: Record<string, number> = {};
  const unlisted: string[] = [];
  for (const file of files) {
    for (const site of findSites(file.path, file.source)) {
      seen[site.key] = (seen[site.key] ?? 0) + 1;
      if (seen[site.key]! > (allowed[site.key] ?? 0)) unlisted.push(`${file.path}:${site.line}  ${site.key}`);
    }
  }

  return unlisted;
}

/** Whether a path is one the ratchet reads. Matches the scope of the interpolation inventory. */
export function inScope(path: string): boolean {
  if (!path.endsWith('.ts') || path.endsWith('.d.ts')) return false;

  // Validators and the data transformer interpolate only into error messages
  if (path.startsWith('src/query/validators/') || path === 'src/query/transformers/data-transformer.ts') return false;

  return (
    path.startsWith('src/query/') ||
    path.startsWith('src/generators/migrations/') ||
    path.startsWith('src/migrations/') ||
    path.startsWith('src/cli/migrate/') ||
    path === 'src/generators/client/template.ts'
  );
}
