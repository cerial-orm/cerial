import { readFile } from 'node:fs/promises';
import type { ASTEnum, ASTLiteral, ASTModel, ASTObject, ASTTuple, SchemaAST } from '../../types';

export type Item = ASTEnum | ASTLiteral | ASTObject | ASTTuple | ASTModel;

const LISTS = ['models', 'objects', 'tuples', 'literals', 'enums'] as const;

/** A declaration the conversion refused, as the emitters and scanners report it. */
export interface PartialRefusal {
  readonly declaration: string;
  readonly module: string;
  readonly reason: string;
}

/** A declaration that converts on its own but reaches a refused one, so writing it would leave a dangling reference. */
export interface HeldBack {
  readonly name: string;
  /** From the held declaration to the refused one it reaches: `Post -> User`. */
  readonly chain: readonly string[];
  readonly module: string;
}

export interface PartialPlan {
  readonly refused: readonly PartialRefusal[];
  readonly held: readonly HeldBack[];
  /** `ast` without the refused and held-back declarations. */
  readonly kept: SchemaAST;
  readonly excluded: ReadonlySet<string>;
}

function itemsOf(ast: SchemaAST): Item[] {
  return LISTS.flatMap((list) => ast[list] as Item[]);
}

/** Every declaration name `item` needs to exist: `extends`, relation targets, and object, tuple, literal and enum references. */
export function referencesOf(item: Item): Set<string> {
  const names = new Set<string>();
  const add = (name: string | undefined): void => {
    if (name) names.add(name);
  };
  if ('extends' in item) add(item.extends);
  if ('fields' in item) {
    for (const field of item.fields) {
      add(field.objectName);
      add(field.tupleName);
      add(field.literalName);
      for (const decorator of field.decorators)
        if (decorator.type === 'model' && typeof decorator.value === 'string') add(decorator.value);
    }
  }
  if ('elements' in item) {
    for (const element of item.elements) {
      add(element.objectName);
      add(element.tupleName);
      add(element.literalName);
    }
  }
  if ('variants' in item) {
    for (const variant of item.variants) {
      if (variant.kind === 'objectRef') add(variant.objectName);
      else if (variant.kind === 'tupleRef') add(variant.tupleName);
      else if (variant.kind === 'literalRef') add(variant.literalName);
    }
  }

  return names;
}

/** `ast` without the named declarations. */
export function withoutNames(ast: SchemaAST, names: ReadonlySet<string>): SchemaAST {
  const keep = <T extends { name: string }>(items: T[]): T[] => items.filter((item) => !names.has(item.name));

  return {
    ...ast,
    models: keep(ast.models),
    objects: keep(ast.objects),
    tuples: keep(ast.tuples),
    literals: keep(ast.literals),
    enums: keep(ast.enums),
  };
}

/**
 * Splits `ast` into what can be written and what cannot. A declaration reaching a refused one, directly or
 * through others, is held back with the chain that holds it, so the written subset has no dangling reference.
 * Sources are never edited, which is why a held-back declaration is left out instead of being rewritten.
 */
export function planPartial(ast: SchemaAST, refusals: readonly PartialRefusal[]): PartialPlan {
  const items = itemsOf(ast);
  const known = new Map(items.map((item) => [item.name, item]));
  const dependents = new Map<string, string[]>();
  for (const item of items) {
    for (const target of referencesOf(item)) {
      if (target === item.name || !known.has(target)) continue;
      dependents.set(target, [...(dependents.get(target) ?? []), item.name]);
    }
  }

  const roots = new Set(refusals.map((r) => r.declaration).filter((name) => known.has(name)));
  // Each held declaration remembers the neighbour it was reached through, so the chain can be read back
  const through = new Map<string, string>();
  const queue = [...roots].sort();
  const seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]!;
    for (const next of [...(dependents.get(current) ?? [])].sort()) {
      if (seen.has(next)) continue;
      seen.add(next);
      through.set(next, current);
      queue.push(next);
    }
  }

  const held: HeldBack[] = [];
  for (const name of [...through.keys()].sort()) {
    const chain = [name];
    for (let hop = through.get(name); hop !== undefined; hop = through.get(hop)) chain.push(hop);
    held.push({ name, chain, module: known.get(name)!.origin.file });
  }

  return { refused: refusals, held, kept: withoutNames(ast, seen), excluded: seen };
}

export interface ConvertedDeclaration {
  readonly name: string;
  /** The source file that still holds it. */
  readonly source: string;
}

export interface UnresolvedReport {
  readonly refused: readonly PartialRefusal[];
  readonly held: readonly HeldBack[];
  /** Converted declarations whose source stays beside the output, which `generate` reads as a duplicate. */
  readonly duplicated: readonly ConvertedDeclaration[];
}

/** Whether the project generates as it stands: it does unless a converted name now exists in a source and in the output. */
export function generatesAsItStands(report: UnresolvedReport): boolean {
  return !report.duplicated.length;
}

/** The closing section of a `--partial` run: what is unresolved, then whether the project generates and what must change. */
export function renderUnresolved(report: UnresolvedReport): string[] {
  const lines: string[] = [];
  if (!report.refused.length && !report.held.length && !report.duplicated.length) lines.push('Unresolved: nothing.');
  else {
    lines.push('Unresolved:');
    for (const r of report.refused) lines.push(`  refused: ${r.declaration} (${r.module}): ${r.reason}`);
    for (const h of report.held)
      lines.push(`  held back: ${h.chain.join(' -> ')} (${h.module}): it reaches a refused declaration`);
    for (const d of report.duplicated)
      lines.push(`  in both a source and the output: ${d.name}; remove it from ${d.source}`);
  }

  lines.push(
    generatesAsItStands(report)
      ? 'The project generates as it stands.'
      : 'The project does not generate as it stands: each converted declaration listed above is in its source and in the output. Remove those declarations from their sources, or rerun with -o outside the entry.',
  );

  return lines;
}

/**
 * The exports of `file` among `names` whose initialiser is not a literal builder chain: anything that calls a
 * function other than the builder, spreads, branches or computes. A helper in another file can change what
 * such an initialiser builds, so it is the fail-closed set when a computed value has no single owner.
 */
export async function nonLiteralExports(file: string, names: readonly string[]): Promise<string[]> {
  const imported = (await import('typescript-5.9')) as typeof import('typescript-5.9') & {
    default?: typeof import('typescript-5.9');
  };
  const ts = imported.default ?? imported;
  const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);

  const builders = new Set<string>();
  const initialisers = new Map<string, import('typescript-5.9').Expression>();
  const exported = new Map<string, string>();
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      if (!/(^|\/)schema$/.test(statement.moduleSpecifier.text)) continue;
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const el of bindings.elements) builders.add(el.name.text);
      if (bindings && ts.isNamespaceImport(bindings)) builders.add(bindings.name.text);
    } else if (ts.isVariableStatement(statement)) {
      const isExport = !!ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        initialisers.set(declaration.name.text, declaration.initializer);
        if (isExport) exported.set(declaration.name.text, declaration.name.text);
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      !statement.moduleSpecifier &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const el of statement.exportClause.elements) exported.set(el.name.text, (el.propertyName ?? el.name).text);
    }
  }

  const rootOf = (node: import('typescript-5.9').Expression): string | undefined => {
    let current: import('typescript-5.9').Expression = node;
    while (
      ts.isCallExpression(current) ||
      ts.isPropertyAccessExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isParenthesizedExpression(current)
    )
      current = current.expression;

    return ts.isIdentifier(current) ? current.text : undefined;
  };
  const computes = (node: import('typescript-5.9').Node): boolean => {
    if (ts.isCallExpression(node)) {
      const root = rootOf(node.expression);
      if (root === undefined || !builders.has(root)) return true;
    }
    if (
      ts.isSpreadElement(node) ||
      ts.isSpreadAssignment(node) ||
      ts.isConditionalExpression(node) ||
      ts.isTemplateExpression(node) ||
      ts.isElementAccessExpression(node) ||
      ts.isBinaryExpression(node) ||
      ts.isNewExpression(node) ||
      ts.isAwaitExpression(node)
    )
      return true;

    return ts.forEachChild(node, computes) ?? false;
  };

  return names.filter((name) => {
    const local = exported.get(name);
    const initialiser = local === undefined ? undefined : initialisers.get(local);

    return initialiser === undefined || computes(initialiser);
  });
}
