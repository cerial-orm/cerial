import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve as resolvePath, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleGraph } from '../../parser/builder/load';
import type { ImportReader } from '../../parser/builder/load';
import { lossyCase } from './lossy-cases';

type TypeScript = typeof import('typescript-5.9');
type Node = import('typescript-5.9').Node;
type Expression = import('typescript-5.9').Expression;
type SourceFile = import('typescript-5.9').SourceFile;

/** One construct the AST cannot show, found by reading the source of a module the entry reaches. */
export interface ScanHit {
  /** The `LOSSY_CASES` id; its `action` says whether the construct stops the conversion. */
  readonly id: string;
  /** The declaration whose initialiser holds it, or null in a helper body no single declaration owns. */
  readonly declaration: string | null;
  /** The field the construct is written in, when it is inside a field map. */
  readonly field: string | null;
  readonly file: string;
  /** 1-based. */
  readonly line: number;
  /** 1-based. */
  readonly column: number;
  /** What the row's comment names: the helper called, or the shared field set. */
  readonly subject: string | null;
  readonly message: string;
}

export interface ScanOptions {
  /** Replaces the reader of a module's imports, as `moduleGraph` takes it. */
  readonly readImports?: ImportReader;
  /** True when `specifier`, written in `from`, names the schema builder. Defaults to `cerial/schema` or the source `schema` folder. */
  readonly isBuilderSpecifier?: (specifier: string, from: string) => boolean;
  /** Resolves a project import to a file, or undefined. Defaults to the runtime's own resolution. */
  readonly resolve?: (specifier: string, from: string) => string | undefined;
}

const DECLARATION_BUILDERS = new Set(['model', 'object', 'tuple', 'enum', 'literal', 'handle']);
const FIELD_BUILDERS = new Set(['f', 'e', 'variant']);
const BUILDERS = new Set([...DECLARATION_BUILDERS, ...FIELD_BUILDERS, 'defineSchema']);
/** Methods whose argument becomes a stored value; a loop or helper body may vary everything else. */
const VALUE_METHODS = new Set(['default', 'defaultAlways', 'sort', 'onDelete']);
const ITERATION_METHODS = new Set(['map', 'flatMap', 'forEach', 'reduce', 'from', 'fromEntries']);

type BindingKind = 'declaration' | 'field' | 'fieldset' | 'literal' | 'function' | 'registration' | 'other';

interface Binding {
  readonly init: Expression | undefined;
  readonly functionLike: boolean;
}

interface FileInfo {
  readonly file: string;
  readonly source: SourceFile;
  readonly bindings: Map<string, Binding>;
  readonly imports: Map<string, { readonly specifier: string; readonly name: string }>;
  /** exported name -> local name */
  readonly exports: Map<string, string>;
  readonly reexports: Map<string, { readonly specifier: string; readonly name: string }>;
  readonly stars: string[];
  readonly kinds: Map<string, BindingKind | undefined>;
}

type Resolution =
  | { readonly t: 'builder'; readonly name: string }
  | { readonly t: 'namespace' }
  | { readonly t: 'package' }
  | { readonly t: 'bound'; readonly info: FileInfo; readonly name: string; readonly local: boolean }
  | { readonly t: 'none' };

interface Step {
  readonly name: string | null;
  readonly args: readonly Expression[] | null;
}

interface Chain {
  readonly rootName: string;
  readonly steps: readonly Step[];
}

interface Context {
  readonly info: FileInfo;
  readonly declaration: string | null;
  readonly field: string | null;
  /** True where the initialiser itself is being read; a function body or a loop is read loosely. */
  readonly strict: boolean;
  readonly loop: boolean;
  /** Inside a branch already reported as a choice. */
  readonly branch: boolean;
}

/** A linked install resolves `cerial/schema` into this package, whose sources are the library, not a schema. */
function ownSources(): string[] {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, 'package.json')) && dirname(dir) !== dir) dir = dirname(dir);

  return [join(dir, 'src') + sep, join(dir, 'dist') + sep];
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'] as const;

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** A relative specifier as the TypeScript compiler reads it: a source extension, a `.js` spelling of one, or an index. */
function resolveRelative(specifier: string, from: string): string | undefined {
  const base = resolvePath(dirname(from), specifier);
  const stem = base.replace(/\.[cm]?jsx?$/, '');
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((ext) => base + ext),
    ...SOURCE_EXTENSIONS.map((ext) => stem + ext),
    ...SOURCE_EXTENSIONS.map((ext) => join(base, `index${ext}`)),
  ];

  return candidates.find(isFile);
}

/**
 * Node's own resolution, for a runtime without `Bun.resolveSync`. A package resolves to a path under
 * `node_modules`; a specifier it cannot resolve, such as a tsconfig path alias, is undefined and is then
 * treated as a package, which refuses rather than guesses.
 */
export function nodeResolve(specifier: string, from: string): string | undefined {
  if (specifier.startsWith('.')) return resolveRelative(specifier, from);
  try {
    return createRequire(from).resolve(specifier);
  } catch {
    return undefined;
  }
}

function defaultResolve(specifier: string, from: string): string | undefined {
  if (!process.versions.bun) return nodeResolve(specifier, from);
  try {
    return Bun.resolveSync(specifier, dirname(from));
  } catch {
    return undefined;
  }
}

/**
 * Reads every module reachable from `roots` for what the materialised AST cannot show: values computed at load
 * time, structure chosen or built by code, and field sets shared or imported. It is an allowlist: a declaration's
 * initialiser, and each field value in it, must be a builder chain whose arguments are literals, handle
 * references or same-file constants of only literals, so a shape nobody listed is reported too.
 */
export async function scanModules(roots: readonly string[], options: ScanOptions = {}): Promise<ScanHit[]> {
  const own = ownSources();
  const graph = await moduleGraph(roots, {
    ...(options.readImports ? { readImports: options.readImports } : {}),
    excludes: (path) => own.some((root) => path.startsWith(root)),
  });
  if (!graph.length) return [];
  const imported = (await import('typescript-5.9')) as TypeScript & { default?: TypeScript };
  const ts = imported.default ?? imported;
  const resolveSpecifier = options.resolve ?? defaultResolve;
  const ownSchema = own.map((root) => join(root, 'schema'));
  // A linked checkout or a relative path to the library's own builder is the builder too
  const isBuilder =
    options.isBuilderSpecifier ??
    ((specifier: string, from: string) => {
      if (specifier === 'cerial/schema') return true;
      const resolved = resolveSpecifier(specifier, from);

      return !!resolved && ownSchema.some((root) => resolved === root || resolved.startsWith(root + sep));
    });

  const infos = new Map<string, FileInfo>();
  const hits: ScanHit[] = [];
  const seenHits = new Set<string>();

  function unwrap(node: Expression): Expression {
    let current = node;
    while (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isTypeAssertionExpression(current)
    ) {
      current = current.expression;
    }

    return current;
  }

  function hasExport(node: Node): boolean {
    return (
      ts.canHaveModifiers(node) &&
      !!ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    );
  }

  function isFunctionLike(node: Node): boolean {
    return ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node);
  }

  function loadInfo(file: string): FileInfo | undefined {
    const cached = infos.get(file);
    if (cached) return cached;
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      return undefined;
    }
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const info: FileInfo = {
      file,
      source,
      bindings: new Map(),
      imports: new Map(),
      exports: new Map(),
      reexports: new Map(),
      stars: [],
      kinds: new Map(),
    };
    infos.set(file, info);

    for (const statement of source.statements) {
      if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
        const clause = statement.importClause;
        if (!clause || clause.isTypeOnly) continue;
        const specifier = statement.moduleSpecifier.text;
        if (clause.name) info.imports.set(clause.name.text, { specifier, name: 'default' });
        const named = clause.namedBindings;
        if (named && ts.isNamespaceImport(named)) info.imports.set(named.name.text, { specifier, name: '*' });
        else if (named) {
          for (const element of named.elements) {
            if (element.isTypeOnly) continue;
            info.imports.set(element.name.text, { specifier, name: (element.propertyName ?? element.name).text });
          }
        }
      } else if (ts.isExportDeclaration(statement)) {
        if (statement.isTypeOnly) continue;
        const clause = statement.exportClause;
        if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
          const specifier = statement.moduleSpecifier.text;
          if (!clause) info.stars.push(specifier);
          else if (ts.isNamedExports(clause)) {
            for (const element of clause.elements) {
              info.reexports.set(element.name.text, { specifier, name: (element.propertyName ?? element.name).text });
            }
          }
        } else if (clause && ts.isNamedExports(clause)) {
          for (const element of clause.elements) {
            info.exports.set(element.name.text, (element.propertyName ?? element.name).text);
          }
        }
      } else if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name)) continue;
          const name = declaration.name.text;
          const init = declaration.initializer;
          info.bindings.set(name, { init, functionLike: !!init && isFunctionLike(unwrap(init)) });
          if (hasExport(statement)) info.exports.set(name, name);
        }
      } else if (ts.isFunctionDeclaration(statement) && statement.name) {
        info.bindings.set(statement.name.text, { init: undefined, functionLike: true });
        if (hasExport(statement)) {
          info.exports.set(statement.name.text, statement.name.text);
          if (statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
            info.exports.set('default', statement.name.text);
          }
        }
      } else if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
        info.bindings.set('*default*', { init: statement.expression, functionLike: false });
        info.exports.set('default', '*default*');
      }
    }

    return info;
  }

  function exportBinding(file: string, exportName: string, seen = new Set<string>()): Resolution {
    const key = `${file}\0${exportName}`;
    if (seen.has(key)) return { t: 'none' };
    seen.add(key);
    const info = loadInfo(file);
    if (!info) return { t: 'none' };
    const local = info.exports.get(exportName);
    if (local !== undefined) return resolveName(info, local, seen);
    const re = info.reexports.get(exportName);
    if (re) return viaSpecifier(info, re.specifier, re.name, seen);
    if (exportName !== 'default') {
      for (const star of info.stars) {
        const found = viaSpecifier(info, star, exportName, seen);
        if (found.t !== 'none') return found;
      }
    }

    return { t: 'none' };
  }

  function viaSpecifier(info: FileInfo, specifier: string, name: string, seen: Set<string>): Resolution {
    if (isBuilder(specifier, info.file)) return name === '*' ? { t: 'namespace' } : { t: 'builder', name };
    const resolved = resolveSpecifier(specifier, info.file);
    if (resolved && !resolved.replace(/\\/g, '/').includes('/node_modules/')) {
      return name === '*' ? { t: 'none' } : exportBinding(resolved, name, seen);
    }
    if (resolved || !specifier.startsWith('.')) return { t: 'package' };

    return { t: 'none' };
  }

  function resolveName(info: FileInfo, name: string, seen = new Set<string>()): Resolution {
    const imp = info.imports.get(name);
    if (imp) return viaSpecifier(info, imp.specifier, imp.name, seen);
    if (info.bindings.has(name)) return { t: 'bound', info, name, local: true };

    return { t: 'none' };
  }

  function flatten(expression: Expression): Chain | undefined {
    let current = unwrap(expression);
    const steps: Step[] = [];
    for (;;) {
      if (ts.isCallExpression(current)) {
        const callee = unwrap(current.expression);
        if (ts.isPropertyAccessExpression(callee)) {
          steps.push({ name: callee.name.text, args: [...current.arguments] });
          current = unwrap(callee.expression);
          continue;
        }
        if (!ts.isIdentifier(callee)) return undefined;
        steps.push({ name: null, args: [...current.arguments] });

        return { rootName: callee.text, steps: steps.reverse() };
      }
      if (ts.isPropertyAccessExpression(current)) {
        steps.push({ name: current.name.text, args: null });
        current = unwrap(current.expression);
        continue;
      }
      if (ts.isIdentifier(current)) return { rootName: current.text, steps: steps.reverse() };

      return undefined;
    }
  }

  /** The builder export a chain is rooted in, or undefined; a namespace import is read through its first property. */
  function builderOf(info: FileInfo, chain: Chain): { name: string; steps: readonly Step[] } | undefined {
    const root = resolveName(info, chain.rootName);
    if (root.t === 'builder' && BUILDERS.has(root.name)) return { name: root.name, steps: chain.steps };
    if (root.t === 'namespace' && chain.steps[0]?.name && BUILDERS.has(chain.steps[0].name)) {
      const first = chain.steps[0];

      return { name: first.name!, steps: [{ name: null, args: first.args }, ...chain.steps.slice(1)] };
    }

    return undefined;
  }

  function chainOf(info: FileInfo, expression: Expression): { name: string; steps: readonly Step[] } | undefined {
    const chain = flatten(expression);

    return chain ? builderOf(info, chain) : undefined;
  }

  function isLiteralOnly(expression: Expression): boolean {
    const e = unwrap(expression);
    if (
      ts.isStringLiteral(e) ||
      ts.isNoSubstitutionTemplateLiteral(e) ||
      ts.isNumericLiteral(e) ||
      ts.isBigIntLiteral(e) ||
      e.kind === ts.SyntaxKind.TrueKeyword ||
      e.kind === ts.SyntaxKind.FalseKeyword ||
      e.kind === ts.SyntaxKind.NullKeyword
    ) {
      return true;
    }
    if (ts.isPrefixUnaryExpression(e)) {
      const sign = e.operator === ts.SyntaxKind.MinusToken || e.operator === ts.SyntaxKind.PlusToken;

      return sign && (ts.isNumericLiteral(e.operand) || ts.isBigIntLiteral(e.operand));
    }
    if (ts.isArrayLiteralExpression(e)) return e.elements.every((element) => isLiteralOnly(element));
    if (ts.isObjectLiteralExpression(e)) {
      return e.properties.every(
        (property) =>
          ts.isPropertyAssignment(property) &&
          !ts.isComputedPropertyName(property.name) &&
          isLiteralOnly(property.initializer),
      );
    }

    return false;
  }

  function containsChain(info: FileInfo, node: Node): boolean {
    if (ts.isCallExpression(node) && chainOf(info, node)) return true;

    return !!ts.forEachChild(node, (child) => (containsChain(info, child) ? true : undefined));
  }

  function kindOf(info: FileInfo, name: string): BindingKind | undefined {
    if (info.kinds.has(name)) return info.kinds.get(name);
    info.kinds.set(name, undefined);
    const binding = info.bindings.get(name);
    let kind: BindingKind = 'other';
    if (binding?.functionLike) kind = 'function';
    else if (binding?.init) {
      const init = unwrap(binding.init);
      const chain = flatten(init);
      const built = chain ? builderOf(info, chain) : undefined;
      if (built) {
        kind = DECLARATION_BUILDERS.has(built.name)
          ? 'declaration'
          : built.name === 'defineSchema'
            ? 'registration'
            : 'field';
      } else if (chain && chain.steps.length) {
        const root = resolveName(info, chain.rootName);
        const rootKind = root.t === 'bound' ? kindOf(root.info, root.name) : undefined;
        if (rootKind === 'declaration' || rootKind === 'field') kind = rootKind;
      } else if (isLiteralOnly(init)) kind = 'literal';
      else if (ts.isObjectLiteralExpression(init) && containsChain(info, init)) kind = 'fieldset';
    }
    info.kinds.set(name, kind);

    return kind;
  }

  function hasChainBody(info: FileInfo, name: string): boolean {
    const binding = info.bindings.get(name);
    if (!binding?.functionLike) return false;
    const node = binding.init
      ? unwrap(binding.init)
      : info.source.statements.find(
          (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name,
        );

    return !!node && containsChain(info, node);
  }

  function place(node: Node, info: FileInfo): { line: number; column: number } {
    const position = info.source.getLineAndCharacterOfPosition(node.getStart(info.source));

    return { line: position.line + 1, column: position.character + 1 };
  }

  function hit(
    context: Context,
    id: string,
    node: Node,
    detail: string,
    field = context.field,
    subject: string | null = null,
  ): void {
    const { line, column } = place(node, context.info);
    const key = `${id}\0${context.info.file}\0${line}:${column}`;
    if (seenHits.has(key)) return;
    seenHits.add(key);
    const where = context.declaration ? ` in '${context.declaration}'` : '';
    hits.push({
      id,
      declaration: context.declaration,
      field,
      file: context.info.file,
      line,
      column,
      subject,
      message: `${lossyCase(id).construct.split(':')[0]} (${detail})${where}${field ? `, field '${field}'` : ''}`,
    });
  }

  const snippet = (node: Node, info: FileInfo): string => node.getText(info.source).replace(/\s+/g, ' ').slice(0, 60);

  function reference(context: Context, node: Expression, name: string): void {
    const found = resolveName(context.info, name);
    if (found.t === 'package') return hit(context, 'npm-field-set', node, `imported from a package: ${name}`);
    const kind = found.t === 'bound' ? kindOf(found.info, found.name) : undefined;
    if (kind === 'declaration') return;
    if (kind === 'literal' && found.t === 'bound' && found.info === context.info) return;
    if (kind === 'field' || kind === 'fieldset') {
      return hit(context, 'shared-field-set', node, `shared: ${name}`, context.field, name);
    }
    hit(context, 'computed-value', node, snippet(node, context.info));
  }

  function conditional(context: Context, node: Node): void {
    if (!context.branch) hit(context, 'conditional-structure', node, snippet(node, context.info));
  }

  function checkValue(context: Context, expression: Expression): void {
    const e = unwrap(expression);
    if (isLiteralOnly(e) && !ts.isArrayLiteralExpression(e) && !ts.isObjectLiteralExpression(e)) return;
    if (ts.isIdentifier(e)) {
      if (e.text === 'undefined') return;

      return reference(context, e, e.text);
    }
    if (ts.isArrayLiteralExpression(e)) {
      for (const element of e.elements) {
        if (ts.isOmittedExpression(element)) continue;
        if (ts.isSpreadElement(element)) hit(context, 'computed-value', element, snippet(element, context.info));
        else checkValue(context, element);
      }

      return;
    }
    if (ts.isObjectLiteralExpression(e)) {
      for (const property of e.properties) {
        if (ts.isPropertyAssignment(property) && !ts.isComputedPropertyName(property.name)) {
          checkValue(context, property.initializer);
        } else if (ts.isShorthandPropertyAssignment(property)) reference(context, property.name, property.name.text);
        else hit(context, 'computed-value', property, snippet(property, context.info));
      }

      return;
    }
    if (ts.isArrowFunction(e) && !ts.isBlock(e.body) && ts.isIdentifier(unwrap(e.body))) {
      return reference(context, e, (unwrap(e.body) as import('typescript-5.9').Identifier).text);
    }
    if (ts.isConditionalExpression(e) || (ts.isBinaryExpression(e) && isLogical(e))) {
      conditional(context, e);

      return;
    }
    if (ts.isCallExpression(e)) {
      const chain = flatten(e);
      const built = chain ? builderOf(context.info, chain) : undefined;
      if (built) return checkChain(context, built.name, built.steps, e);
      if (chain && chain.steps.length === 1 && ['pick', 'omit'].includes(chain.steps[0]!.name ?? '')) {
        const root = resolveName(context.info, chain.rootName);
        if (root.t === 'bound' && kindOf(root.info, root.name) === 'declaration') {
          return void chain.steps[0]!.args?.forEach((arg) => checkValue(context, arg));
        }
      }
    }
    hit(context, 'computed-value', e, snippet(e, context.info));
  }

  function isLogical(e: import('typescript-5.9').BinaryExpression): boolean {
    return [
      ts.SyntaxKind.AmpersandAmpersandToken,
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.QuestionQuestionToken,
    ].includes(e.operatorToken.kind);
  }

  function checkFieldMap(context: Context, map: import('typescript-5.9').ObjectLiteralExpression): void {
    for (const property of map.properties) {
      if (ts.isSpreadAssignment(property)) {
        const target = unwrap(property.expression);
        const callee = ts.isCallExpression(target) ? unwrap(target.expression) : target;
        const name = ts.isIdentifier(callee) ? callee.text : undefined;
        const found = name ? resolveName(context.info, name) : { t: 'none' as const };
        const kind = found.t === 'bound' ? kindOf(found.info, found.name) : undefined;
        if (found.t === 'package') hit(context, 'npm-field-set', property, `spread from a package: ${name}`, null);
        else if (kind === 'fieldset' || (ts.isCallExpression(target) && kind === 'function')) {
          hit(context, 'shared-field-set', property, `spread: ${name}`, null, name);
        } else hit(context, 'computed-value', property, snippet(property, context.info), null);
        continue;
      }
      let key: string;
      let value: Expression;
      if (ts.isPropertyAssignment(property) && !ts.isComputedPropertyName(property.name)) {
        key = property.name.getText(context.info.source).replace(/^['"]|['"]$/g, '');
        value = property.initializer;
      } else if (ts.isShorthandPropertyAssignment(property)) {
        key = property.name.text;
        value = property.name;
      } else if (ts.isPropertyAssignment(property)) {
        hit(context, 'shared-field-set', property, 'computed key', null, 'computed key');
        key = property.name.getText(context.info.source);
        value = property.initializer;
      } else {
        hit(context, 'computed-value', property, snippet(property, context.info), null);
        continue;
      }
      checkFieldValue({ ...context, field: key }, value);
    }
  }

  function checkFieldValue(context: Context, expression: Expression): void {
    const e = unwrap(expression);
    if (ts.isConditionalExpression(e) || (ts.isBinaryExpression(e) && isLogical(e))) {
      conditional(context, e);
      scan(e, { ...context, branch: true });

      return;
    }
    const chain = flatten(e);
    if (chain) {
      const built = builderOf(context.info, chain);
      if (built) return checkChain(context, built.name, built.steps, e);
      const found = resolveName(context.info, chain.rootName);
      if (found.t === 'package') return hit(context, 'npm-field-set', e, `from a package: ${chain.rootName}`);
      const kind = found.t === 'bound' ? kindOf(found.info, found.name) : undefined;
      if (kind === 'field')
        return hit(context, 'shared-field-set', e, `shared: ${chain.rootName}`, context.field, chain.rootName);
    }
    hit(context, 'computed-value', e, snippet(e, context.info));
  }

  function checkChain(context: Context, builder: string, steps: readonly Step[], node: Node): void {
    if (context.loop && DECLARATION_BUILDERS.has(builder) && builder !== 'handle') {
      hit(context, 'loop-built-model', node, snippet(node, context.info));
    }
    const rootArgs = steps[0]?.name === null ? (steps[0].args ?? []) : [];
    const strict = context.strict;
    if (DECLARATION_BUILDERS.has(builder) && builder !== 'handle') {
      const [name, second, ...rest] = rootArgs;
      if (name && strict) checkValue(context, name);
      if (second) {
        const fields = unwrap(second);
        if ((builder === 'model' || builder === 'object') && ts.isObjectLiteralExpression(fields)) {
          if (strict) checkFieldMap(context, fields);
          else scan(fields, context);
        } else if (builder === 'enum' || builder === 'literal' || builder === 'tuple') {
          if (builder === 'tuple' && !strict) scan(second, context);
          else checkValue(context, second);
        } else if (strict) checkValue(context, second);
        else scan(second, context);
      }
      for (const arg of rest) {
        if (strict) checkValue(context, arg);
        else scan(arg, context);
      }
    } else if (builder === 'defineSchema' || builder === 'handle') {
      for (const arg of rootArgs) {
        if (strict) checkValue(context, arg);
        else scan(arg, context);
      }
    }
    for (const step of steps) {
      if (!step.name || !step.args) continue;
      const valueStep = VALUE_METHODS.has(step.name) || builder === 'variant';
      for (const arg of step.args) {
        if (strict || valueStep) checkValue(context, arg);
        else scan(arg, context);
      }
    }
  }

  /** Reads `node` for builder chains and the code that builds them, wherever they sit. */
  function scan(node: Node, context: Context): void {
    if (ts.isCallExpression(node) || ts.isPropertyAccessExpression(node)) {
      const chain = flatten(node as Expression);
      const built = chain ? builderOf(context.info, chain) : undefined;
      if (built) return checkChain(context, built.name, built.steps, node);
    }
    if (
      ts.isObjectLiteralExpression(node) &&
      context.strict &&
      node.properties.some(
        (property) =>
          ts.isSpreadAssignment(property) ||
          (ts.isPropertyAssignment(property) && containsChain(context.info, property.initializer)),
      )
    ) {
      return checkFieldMap(context, node);
    }
    if (isFunctionLike(node)) {
      return void ts.forEachChild(node, (child) => scan(child, { ...context, strict: false }));
    }
    if (
      ts.isForStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node)
    ) {
      return void ts.forEachChild(node, (child) => scan(child, { ...context, strict: false, loop: true }));
    }
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      const iterates = ts.isPropertyAccessExpression(callee) && ITERATION_METHODS.has(callee.name.text);
      ts.forEachChild(node, (child) => scan(child, iterates ? { ...context, loop: true } : context));

      return;
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = unwrap(node.left);
      const declaration = ts.isIdentifier(left) ? left.text : context.declaration;
      scan(node.right, { ...context, declaration });

      return;
    }
    if (
      (ts.isConditionalExpression(node) ||
        ts.isIfStatement(node) ||
        ts.isSwitchStatement(node) ||
        (ts.isBinaryExpression(node) && isLogical(node))) &&
      containsChain(context.info, node)
    ) {
      conditional(context, node);
      ts.forEachChild(node, (child) => scan(child, { ...context, branch: true }));

      return;
    }
    ts.forEachChild(node, (child) => scan(child, context));
  }

  function bindingNames(name: import('typescript-5.9').BindingName): string[] {
    if (ts.isIdentifier(name)) return [name.text];

    return name.elements.flatMap((element) => (ts.isOmittedExpression(element) ? [] : bindingNames(element.name)));
  }

  function assignedNames(node: Node, into: Set<string>): void {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      const left = unwrap(node.left);
      if (ts.isIdentifier(left)) into.add(left.text);
      else if (ts.isArrayLiteralExpression(left)) {
        for (const element of left.elements) if (ts.isIdentifier(element)) into.add(element.text);
      }
    }
    ts.forEachChild(node, (child) => assignedNames(child, into));
  }

  function initialiser(info: FileInfo, name: string, init: Expression): void {
    const context: Context = { info, declaration: name, field: null, strict: true, loop: false, branch: false };
    const e = unwrap(init);
    if (ts.isCallExpression(e) && !chainOf(info, e)) {
      const chain = flatten(e);
      const callee = unwrap(e.expression);
      const iterates = ts.isPropertyAccessExpression(callee) && ITERATION_METHODS.has(callee.name.text);
      const root = chain ? resolveName(info, chain.rootName) : { t: 'none' as const };
      const rootKind = root.t === 'bound' ? kindOf(root.info, root.name) : undefined;
      const helper =
        root.t === 'bound' &&
        rootKind === 'function' &&
        chain?.steps.length === 1 &&
        hasChainBody(root.info, root.name);
      const inline = isFunctionLike(callee) && containsChain(info, callee);
      if (!iterates && (helper || inline))
        hit(
          context,
          'helper-built-declaration',
          e,
          snippet(e, info),
          context.field,
          chain?.rootName ?? 'an inline function',
        );
    }
    scan(e, context);
  }

  for (const file of graph) {
    const info = loadInfo(file);
    if (!info) continue;
    const exported = new Set<string>(info.exports.values());
    const assigned = new Set<string>();
    assignedNames(info.source, assigned);

    for (const statement of info.source.statements) {
      if (ts.isVariableStatement(statement)) {
        const isLet = !(statement.declarationList.flags & ts.NodeFlags.Const);
        for (const declaration of statement.declarationList.declarations) {
          const names = bindingNames(declaration.name);
          const label = names.join(', ');
          const context: Context = { info, declaration: label, field: null, strict: true, loop: false, branch: false };
          const exportedNames = names.filter((name) => exported.has(name));
          if (isLet && exportedNames.some((name) => !declaration.initializer || assigned.has(name))) {
            hit(
              context,
              'reassigned-export',
              declaration,
              `export '${exportedNames.join(', ')}' has no single initialiser`,
            );
          }
          if (declaration.initializer) {
            initialiser(info, label, declaration.initializer);
          }
        }
      } else if (ts.isExportAssignment(statement)) {
        initialiser(info, 'default', statement.expression);
      } else if (
        ts.isImportDeclaration(statement) ||
        ts.isExportDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement)
      ) {
        continue;
      } else {
        scan(statement, { info, declaration: null, field: null, strict: false, loop: false, branch: false });
      }
    }
  }

  return hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
}
