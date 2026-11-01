import { dirname, relative, sep } from 'node:path';
import type { CommentMap } from '../../../formatter';
import type { ASTEnum, ASTLiteral, ASTModel, ASTObject, ASTTuple, SchemaAST } from '../../../types';
import { declarationComments, fileComments } from './comments';
import { emitEnum, emitLiteral, emitModel, emitObject, emitTuple } from './declaration';
import type { DeclarationContext, EmittedDeclaration } from './declaration';
import type { ReferenceKind } from './field';
import { printImport } from './layout';
import { assignBindings, bindingFor } from './names';
import { quote } from './strings';

type Kind = 'enum' | 'literal' | 'object' | 'tuple' | 'model';
type Node = ASTEnum | ASTLiteral | ASTObject | ASTTuple | ASTModel;

const LISTS = [
  ['enums', 'enum'],
  ['literals', 'literal'],
  ['objects', 'object'],
  ['tuples', 'tuple'],
  ['models', 'model'],
] as const;

export interface EmitTypescriptOptions {
  /** What the modules import the builder from. */
  readonly schemaImport?: string;
  /** Each `.cerial` file's comments, keyed by its path as the declarations' `origin.file` has it. */
  readonly comments?: ReadonlyMap<string, CommentMap>;
}

export interface EmittedModule {
  /** The `.cerial` file the declarations came from. */
  readonly file: string;
  /** Where the module goes. */
  readonly path: string;
  readonly text: string;
  /** Parents written above the child that extends them, which the verification must tolerate by name. */
  readonly hoisted: readonly string[];
  /** Models whose directives were regrouped by kind, which the verification must tolerate by name. */
  readonly directiveKindOrder: readonly string[];
  readonly warnings: readonly string[];
}

export interface ExtendsRefusal {
  readonly caseId: 'extends-cross-file-cycle';
  /** The child declaration whose `extends` closes the cycle. */
  readonly declaration: string;
  /** The module the child would have been written to. */
  readonly module: string;
  readonly reason: string;
}

export interface EmitTypescriptResult {
  /** A module of a refused declaration is not written, because no order of its imports loads. */
  readonly modules: readonly EmittedModule[];
  readonly refusals: readonly ExtendsRefusal[];
}

interface Declaration {
  readonly kind: Kind;
  readonly node: Node;
  readonly name: string;
  readonly file: string;
  /** Written by this run; false for a declaration a TypeScript module already exports. */
  readonly written: boolean;
  /** The name it is exported under from its module. */
  readonly exportName: string;
}

/** The module a `.cerial` file becomes. */
export function moduleFileOf(file: string): string {
  return `${file.replace(/\.cerial$/, '')}.schema.ts`;
}

function collect(ast: SchemaAST): Declaration[] {
  const found: { declaration: Declaration; line: number; column: number; order: number }[] = [];
  for (const [list, kind] of LISTS) {
    for (const node of ast[list] as Node[]) {
      const { origin } = node;
      const written = origin.kind === 'dsl';
      found.push({
        declaration: {
          kind,
          node,
          name: node.name,
          file: origin.file,
          written,
          exportName: origin.kind === 'ts' ? origin.export : node.name,
        },
        line: node.range.start.line,
        column: node.range.start.column,
        order: found.length,
      });
    }
  }

  return found
    .sort((a, b) => a.line - b.line || a.column - b.column || a.order - b.order)
    .map(({ declaration }) => declaration);
}

function emitDeclaration(declaration: Declaration, context: DeclarationContext): EmittedDeclaration {
  const { node } = declaration;
  switch (declaration.kind) {
    case 'enum':
      return emitEnum(node as ASTEnum, context);
    case 'literal':
      return emitLiteral(node as ASTLiteral, context);
    case 'object':
      return emitObject(node as ASTObject, context);
    case 'tuple':
      return emitTuple(node as ASTTuple, context);
    case 'model':
      return emitModel(node as ASTModel, context);
  }
}

/** Strongly connected components, numbered; two nodes share a number only when each reaches the other. */
function components<T>(nodes: readonly T[], next: (node: T) => readonly T[]): Map<T, number> {
  const index = new Map<T, number>();
  const low = new Map<T, number>();
  const onStack = new Set<T>();
  const stack: T[] = [];
  const result = new Map<T, number>();
  let counter = 0;
  let count = 0;

  function visit(node: T): void {
    index.set(node, counter);
    low.set(node, counter++);
    stack.push(node);
    onStack.add(node);
    for (const other of next(node)) {
      if (!index.has(other)) {
        visit(other);
        low.set(node, Math.min(low.get(node)!, low.get(other)!));
      } else if (onStack.has(other)) low.set(node, Math.min(low.get(node)!, index.get(other)!));
    }
    if (low.get(node) !== index.get(node)) return;
    let member: T;
    do {
      member = stack.pop()!;
      onStack.delete(member);
      result.set(member, count);
    } while (member !== node);
    count++;
  }

  for (const node of nodes) if (!index.has(node)) visit(node);

  return result;
}

function sizes<T>(numbered: ReadonlyMap<T, number>): Map<number, number> {
  const counts = new Map<number, number>();
  for (const id of numbered.values()) counts.set(id, (counts.get(id) ?? 0) + 1);

  return counts;
}

interface Edge {
  readonly from: Declaration;
  readonly to: Declaration;
  /** An `extends`, which is evaluated while the module loads; any other edge is read later, or not at all. */
  readonly eager: boolean;
}

/** How a reference to a declaration in another module is written once the module graph is known. */
interface Plan {
  readonly byName: ReadonlyMap<string, Declaration>;
  /** Edges written as a bare name: on a cycle of declarations, or on a cycle of modules that has an `extends`. */
  readonly bare: ReadonlySet<Edge>;
  /** Edges across a cycle of modules with no `extends`, which a thunk keeps from reading too early. */
  readonly thunk: ReadonlySet<Edge>;
  readonly edges: ReadonlyMap<Declaration, readonly Edge[]>;
  readonly refused: ReadonlyMap<Declaration, ExtendsRefusal>;
  readonly refusedFiles: ReadonlySet<string>;
}

function planGraph(declarations: readonly Declaration[], emit: (d: Declaration) => string[]): Plan {
  const byName = new Map<string, Declaration>();
  for (const declaration of declarations) if (!byName.has(declaration.name)) byName.set(declaration.name, declaration);

  const edges = new Map<Declaration, Edge[]>();
  for (const from of declarations.filter((d) => d.written)) {
    const list: Edge[] = [];
    const parent = (from.node as { extends?: string }).extends;
    const parentDeclaration = parent === undefined ? undefined : byName.get(parent);
    if (parentDeclaration) list.push({ from, to: parentDeclaration, eager: true });
    for (const name of emit(from)) {
      const to = byName.get(name);
      if (to && to !== parentDeclaration && !list.some((edge) => edge.to === to)) list.push({ from, to, eager: false });
    }
    edges.set(from, list);
  }

  const bare = new Set<Edge>();
  const thunk = new Set<Edge>();
  const all = [...edges.values()].flat();
  const targets = (declaration: Declaration) => (edges.get(declaration) ?? []).map((edge) => edge.to);
  const inCycle = components(declarations, targets);
  for (const edge of all) {
    if (!edge.eager && inCycle.get(edge.from) === inCycle.get(edge.to)) bare.add(edge);
  }

  const crossing = all.filter((edge) => edge.to.written && edge.from.file !== edge.to.file && !bare.has(edge));
  const files = [...new Set(declarations.filter((d) => d.written).map((d) => d.file))];
  const along = (list: readonly Edge[]) => (file: string) => [
    ...new Set(list.filter((edge) => edge.from.file === file).map((edge) => edge.to.file)),
  ];
  const moduleCycle = components(files, along(crossing));
  const moduleCycleSizes = sizes(moduleCycle);
  const inside = (edge: Edge, list: ReadonlyMap<string, number>) => list.get(edge.from.file) === list.get(edge.to.file);
  const cyclic = (edge: Edge) =>
    moduleCycleSizes.get(moduleCycle.get(edge.from.file)!)! > 1 && inside(edge, moduleCycle);

  const eagerCycles = new Set<number>();
  for (const edge of crossing) if (edge.eager && cyclic(edge)) eagerCycles.add(moduleCycle.get(edge.from.file)!);
  for (const edge of crossing) {
    if (edge.eager || !cyclic(edge)) continue;
    (eagerCycles.has(moduleCycle.get(edge.from.file)!) ? bare : thunk).add(edge);
  }

  const refused = new Map<Declaration, ExtendsRefusal>();
  const refusedFiles = new Set<string>();
  const eagerOnly = crossing.filter((edge) => edge.eager);
  const eagerCycle = components(files, along(eagerOnly));
  const eagerSizes = sizes(eagerCycle);
  for (const edge of eagerOnly) {
    if (eagerSizes.get(eagerCycle.get(edge.from.file)!)! < 2 || !inside(edge, eagerCycle)) continue;
    refusedFiles.add(edge.from.file);
    refused.set(edge.from, {
      caseId: 'extends-cross-file-cycle',
      declaration: edge.from.name,
      module: moduleFileOf(edge.from.file),
      reason: `${edge.from.name} extends ${edge.to.name} from ${moduleFileOf(edge.to.file)}, and the modules that extend one another form a cycle: no order of their imports loads`,
    });
  }

  return { byName, bare, thunk, edges, refused, refusedFiles };
}

/** Source order, except that a parent declared later in the same file is placed above its child. */
function orderFile(declarations: readonly Declaration[], plan: Plan): { order: Declaration[]; hoisted: string[] } {
  const order: Declaration[] = [];
  const hoisted: string[] = [];
  const placing = new Set<Declaration>();
  const placed = new Set<Declaration>();

  function place(declaration: Declaration, byChild: boolean): void {
    if (placed.has(declaration) || placing.has(declaration)) return;
    placing.add(declaration);
    const parent = plan.edges.get(declaration)?.find((edge) => edge.eager)?.to;
    if (parent?.written && parent.file === declaration.file) place(parent, true);
    placing.delete(declaration);
    placed.add(declaration);
    order.push(declaration);
    if (byChild) hoisted.push(declaration.name);
  }

  for (const declaration of declarations) place(declaration, false);

  return { order, hoisted };
}

function specifierBetween(fromModule: string, target: string): string {
  const path = relative(dirname(fromModule), target.replace(/\.[cm]?tsx?$/, ''))
    .split(sep)
    .join('/');

  return path.startsWith('.') ? path : `./${path}`;
}

function emitFile(
  file: string,
  declarations: readonly Declaration[],
  plan: Plan,
  options: Required<Pick<EmitTypescriptOptions, 'schemaImport'>> & Pick<EmitTypescriptOptions, 'comments'>,
): EmittedModule {
  const path = moduleFileOf(file);
  const { order, hoisted } = orderFile(declarations, plan);
  const position = new Map(order.map((declaration, i) => [declaration, i]));
  const bindings = assignBindings(order.map((d) => d.name));
  const taken = new Set(bindings.values());
  const imports = new Map<string, Map<string, string>>();

  function importOf(target: Declaration): string {
    const specifier = specifierBetween(path, target.written ? moduleFileOf(target.file) : target.file);
    const names = imports.get(specifier) ?? new Map<string, string>();
    imports.set(specifier, names);
    let local = names.get(target.exportName);
    if (!local) {
      local = bindingFor(target.exportName, taken);
      taken.add(local);
      names.set(target.exportName, local);
    }

    return local;
  }

  const handleOf = (name: string): string => {
    const target = plan.byName.get(name);
    if (!target || target.file === file) return bindings.get(name) ?? bindingFor(name);

    return importOf(target);
  };

  const commentMap = options.comments?.get(file);
  const claimed = new Set<string>();
  const emitted = order.map((declaration) => {
    const edgeTo = (name: string) => plan.edges.get(declaration)?.find((edge) => edge.to.name === name);
    const reference = (_kind: ReferenceKind, name: string): string => {
      const target = plan.byName.get(name);
      const edge = edgeTo(name);
      if (!target || !edge || target === declaration || plan.bare.has(edge)) return quote(name);
      if (target.file === file) {
        const handle = bindings.get(name) ?? bindingFor(name);

        return position.get(target)! < position.get(declaration)! ? handle : `() => ${handle}`;
      }
      const local = importOf(target);

      return plan.thunk.has(edge) ? `() => ${local}` : local;
    };
    const node = declaration.node as ASTModel | ASTObject;
    const comments = declarationComments(
      commentMap,
      {
        kind: declaration.kind,
        name: declaration.name,
        fields: 'fields' in node ? node.fields.map((field) => field.name) : [],
        directives: 'directives' in node ? (node.directives ?? []).map((directive) => directive.name) : [],
      },
      claimed,
    );
    const result = emitDeclaration(declaration, { reference, binding: handleOf, comments });

    return { declaration, result, text: result.text };
  });

  const { top, bottom } = fileComments(commentMap, claimed);
  const uses = [...new Set(emitted.flatMap(({ result }) => result.uses))].sort();
  const builder = uses.map((name) => (name === 'enumeration' ? 'enum as enumeration' : name));
  const importLines = [
    ...(builder.length ? [printImport(builder, quote(options.schemaImport))] : []),
    ...[...imports]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([specifier, names]) => {
        const parts = [...names].map(([exported, local]) => (exported === local ? local : `${exported} as ${local}`));

        return printImport(parts, quote(specifier));
      }),
  ];
  const text = [
    top.join('\n'),
    importLines.join('\n'),
    emitted.map(({ text: body }) => body).join('\n\n'),
    bottom.join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    file,
    path,
    text: `${text}\n`,
    hoisted,
    directiveKindOrder: emitted
      .filter(({ result }) => result.directiveKindOrder)
      .map(({ declaration }) => declaration.name),
    warnings: [
      ...hoisted.map((name) => `${name} is written above the declaration that extends it`),
      ...emitted.flatMap(({ result }) => result.warnings),
    ],
  };
}

/**
 * Every `.cerial` file of the AST as a `<basename>.schema.ts` module. A cycle of `extends` across modules
 * loads in no order, so it comes back as refusals and its modules are left out, never as an exception.
 */
export function emitTypescript(ast: SchemaAST, options: EmitTypescriptOptions = {}): EmitTypescriptResult {
  const { schemaImport = 'cerial/schema', comments } = options;
  const declarations = collect(ast);
  const recorded = (declaration: Declaration): string[] => {
    const names: string[] = [];
    emitDeclaration(declaration, {
      reference: (_kind, name) => {
        names.push(name);

        return quote(name);
      },
    });

    return names;
  };
  const plan = planGraph(declarations, recorded);

  const byFile = new Map<string, Declaration[]>();
  for (const declaration of declarations.filter((d) => d.written)) {
    byFile.set(declaration.file, [...(byFile.get(declaration.file) ?? []), declaration]);
  }
  for (const [file, map] of comments ?? []) if (map.size && !byFile.has(file)) byFile.set(file, []);

  const modules = [...byFile]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .filter(([file]) => !plan.refusedFiles.has(file))
    .map(([file, list]) => emitFile(file, list, plan, { schemaImport, comments }));

  return { modules, refusals: [...plan.refused.values()] };
}
