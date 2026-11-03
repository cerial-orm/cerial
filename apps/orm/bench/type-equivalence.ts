/**
 * Before-and-after type identity over two generated trees.
 *
 * Mutual assignability cannot prove a type did not move: `{ a?: string }` and `{ a?: string; b?: number }` pass it, and
 * so does `any`. Every exported type is therefore compared with the identity check
 * `(<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)`, with an explicit refusal of `any` on either
 * side. Generics are enumerated from the tree and instantiated with fixed samples; each sample is appended to its
 * declaring file in a temp copy, so the constraints and defaults it names resolve in that file's own scope.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { type Compiler, compilerBin, DEFAULT_MAX_OLD_SPACE_MB, parseTscErrors } from './compilers';
import { linkDependencies } from './curve';

export interface TypeParam {
  readonly name: string;
  readonly constraint: string | null;
  readonly fallback: string | null;
}

export interface Declaration {
  readonly name: string;
  readonly kind: 'type' | 'interface';
  readonly params: readonly TypeParam[];
}

/** One instantiation of a declaration, written into its declaring file under the name `alias` */
export interface Sample {
  /** `Name#index`, or `Name.method#index` for a member of an interface that has generic methods */
  readonly id: string;
  readonly alias: string;
  readonly source: string;
  /** Set for an interface of bare references, which is compared as text; `source` is then empty */
  readonly text?: string;
}

export interface TreeDeclaration extends Declaration {
  /** Path of the declaring file relative to the tree root, with its extension */
  readonly file: string;
  readonly samples: readonly Sample[];
}

export interface Failure {
  readonly compiler: Compiler | 'text';
  readonly sample: string;
  readonly reason: string;
}

export interface EquivalenceReport {
  readonly ok: boolean;
  readonly compilers: readonly Compiler[];
  /** Exported types and interfaces present in both trees */
  readonly declarations: number;
  /** Of those, the ones with type parameters */
  readonly generics: number;
  /** Instantiations compared per compiler */
  readonly samples: number;
  readonly failures: readonly Failure[];
  /** Samples compared through `Flat` because their forms are equal but not identical */
  readonly flatFallbacks: readonly string[];
  /** Exported in `before` and missing in `after` */
  readonly removed: readonly string[];
  /** Exported in `after` and missing in `before` */
  readonly added: readonly string[];
}

export interface EquivalenceOptions {
  readonly compilers?: readonly Compiler[];
  /** Sample ids (`Name#index`, as listed in a failure) to compare through `Flat`; each is reported */
  readonly flatFallback?: readonly string[];
  readonly maxOldSpaceMb?: number;
}

const OPEN = '<([{';
const CLOSE = '>)]}';

/** Index of the bracket closing the one at `start`, skipping strings and the `>` of `=>` */
function closingIndex(text: string, start: number): number {
  let depth = 0;

  for (let i = start; i < text.length; i++) {
    const char = text[i]!;
    if (char === "'" || char === '"' || char === '`') {
      i = text.indexOf(char, i + 1);
      if (i < 0) break;
      continue;
    }
    if (char === '>' && text[i - 1] === '=') continue;
    if (OPEN.includes(char)) depth++;
    else if (CLOSE.includes(char) && --depth === 0) return i;
  }
  throw new Error(`unbalanced brackets in "${text.slice(start, start + 60)}"`);
}

/** Splits at the top-level `separator`, so a `,` inside `Record<a, b>` stays in its part */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === "'" || char === '"' || char === '`') {
      i = text.indexOf(char, i + 1);
      if (i < 0) break;
      continue;
    }
    if (char === '>' && text[i - 1] === '=') continue;
    if (OPEN.includes(char)) depth++;
    else if (CLOSE.includes(char)) depth--;
    else if (char === separator && !depth) {
      parts.push(text.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(text.slice(from));

  return parts;
}

/** Index of the first top-level `=` that is not part of `=>`, `==` or a comparison */
function topLevelEquals(text: string): number {
  let depth = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === "'" || char === '"' || char === '`') {
      i = text.indexOf(char, i + 1);
      if (i < 0) break;
      continue;
    }
    if (char === '>' && text[i - 1] === '=') continue;
    if (OPEN.includes(char)) depth++;
    else if (CLOSE.includes(char)) depth--;
    else if (char === '=' && !depth && text[i + 1] !== '>' && text[i + 1] !== '=') return i;
  }

  return -1;
}

function parseParams(list: string): TypeParam[] {
  return splitTopLevel(list, ',')
    .filter((part) => part.trim())
    .map(parseParam);
}

function parseParam(text: string): TypeParam {
  const equals = topLevelEquals(text);
  const head = (equals < 0 ? text : text.slice(0, equals)).trim();
  const fallback = equals < 0 ? null : text.slice(equals + 1).trim();
  const match = /^(\w+)(?:\s+extends\s+([\s\S]+))?$/.exec(head);
  if (!match) throw new Error(`cannot read type parameter "${text.trim().slice(0, 80)}"`);

  return { name: match[1]!, constraint: match[2]?.trim() ?? null, fallback };
}

/** Exported `type` and `interface` declarations at the start of a line, with their type parameters */
export function parseDeclarations(text: string): Declaration[] {
  const found: Declaration[] = [];

  for (const match of text.matchAll(/^export (type|interface) ([\w$]+)/gm)) {
    const at = match.index + match[0].length;
    const kind = match[1] as Declaration['kind'];
    const params = text[at] === '<' ? parseParams(text.slice(at + 1, closingIndex(text, at))) : [];
    found.push({ name: match[2]!, kind, params });
  }

  return found;
}

function interfaceBody(text: string, name: string): string | null {
  const start = new RegExp(`^export interface ${name}(?:<[^\\n]*>)? \\{`, 'm').exec(text);
  if (!start) return null;

  const open = start.index + start[0].length - 1;

  return text.slice(open + 1, closingIndex(text, open));
}

/** Top-level keys of `export interface <name> { ... }`, read from its two-space-indented lines */
function interfaceKeys(text: string, name: string): string[] {
  const body = interfaceBody(text, name);

  return body === null ? [] : [...body.matchAll(/^ {2}(\w+)\??:/gm)].map((key) => key[1]!);
}

interface Method {
  readonly name: string;
  readonly params: readonly TypeParam[];
}

/** Methods of an interface, one per name; overloads share the type parameters of the first */
function interfaceMethods(text: string, name: string): Method[] {
  const body = interfaceBody(text, name);
  if (body === null) return [];

  const methods = new Map<string, Method>();
  for (const match of body.matchAll(/^ {2}(\w+)(?=[<(])/gm)) {
    if (methods.has(match[1]!)) continue;

    const at = match.index + match[0].length;
    const params = body[at] === '<' ? parseParams(body.slice(at + 1, closingIndex(body, at))) : [];
    methods.set(match[1]!, { name: match[1]!, params });
  }

  return [...methods.values()];
}

/** Members of a literal-only union alias, so `R extends UpsertReturn` is tried with each return option */
function literalMembers(text: string, name: string): string[] {
  const match = new RegExp(`^export type ${name} =\\s*([^;]+);`, 'm').exec(text);
  if (!match) return [];

  const members = match[1]!.split('|').map((member) => member.trim());

  return members.every((member) => /^('[^']*'|true|false|null|undefined)$/.test(member)) ? members : [];
}

const UNCONSTRAINED_POOL = [
  'unknown',
  'string',
  '{ a: string; b?: number }',
  '{ a: string }[]',
  '[string, { x: number }]',
  '{ a: string } | null | undefined',
  'true',
  '{ a: true }',
  '{ 1: { x: true } }',
];
const RECORD_POOL = ['{ a: true }', '{ a: { x: true } }', '{ 1: { x: true } }'];
const ARRAY_POOL = ['string[]', '[string, { x: number }]'];
const MAX_SAMPLES_PER_DECLARATION = 400;

/** Replaces earlier parameters named in `text` by the arguments chosen for them */
function substitute(text: string, chosen: ReadonlyMap<string, string>): string {
  let next = text;
  for (const [name, arg] of chosen) next = next.replace(new RegExp(`\\b${name}\\b`, 'g'), `(${arg})`);

  return next;
}

interface Scope {
  readonly text: string;
  /** The declaration takes a select or an include, so unconstrained parameters keep their default */
  readonly selective: boolean;
  /** Skips the one-key selects; members of an interface are many, and the payload types carry those */
  readonly lean: boolean;
}

/** Candidate type arguments for one parameter, in the scope of the declaring file; the first is the base value */
function candidates(param: TypeParam, scope: Scope, chosen: ReadonlyMap<string, string>): string[] {
  const constraint = param.constraint === null ? null : substitute(param.constraint, chosen);
  const fallback = param.fallback === null ? null : substitute(param.fallback, chosen);
  const out = new Set<string>();
  if (fallback !== null) out.add(fallback);

  if (constraint === null) {
    if (!scope.selective) for (const sample of UNCONSTRAINED_POOL) out.add(sample);
    if (!out.size) out.add('unknown');

    return [...out];
  }

  out.add(constraint);
  const named = /^(\w+?)(Select|Include)(?:\s*\|\s*undefined)?$/.exec(constraint);
  if (named) {
    out.add('undefined');
    const keys = interfaceKeys(scope.text, named[2] === 'Select' ? named[1]! : `${named[1]}Include`);
    if (!scope.lean) for (const key of keys) out.add(`{ ${key}: true }`);
    if (keys.length) out.add(`{ ${keys.map((key) => `${key}: true`).join('; ')} }`);

    return [...out];
  }

  if (/^Record<[^,]+, any>$/.test(constraint)) for (const sample of RECORD_POOL) out.add(sample);
  else if (constraint === 'any[]') for (const sample of ARRAY_POOL) out.add(sample);
  else if (constraint === 'object') out.add('{ a: string }');
  else if (/^\w+$/.test(constraint)) for (const member of literalMembers(scope.text, constraint)) out.add(member);

  return [...out];
}

/**
 * Argument lists for a parameter list. Without a select or include every combination is tried, capped. With one, the
 * base value of each parameter, then each alternative of one parameter at a time, then every parameter at its last
 * alternative, since the product of one-key selects and includes is not worth compiling.
 */
function argumentLists(params: readonly TypeParam[], scope: Scope, oneAtATime: boolean): string[][] {
  if (!oneAtATime) {
    let lists: { args: string[]; chosen: Map<string, string> }[] = [{ args: [], chosen: new Map() }];

    for (const param of params) {
      const next: typeof lists = [];

      for (const list of lists) {
        for (const arg of candidates(param, scope, list.chosen)) {
          next.push({ args: [...list.args, arg], chosen: new Map(list.chosen).set(param.name, arg) });
        }
      }
      lists = next.slice(0, MAX_SAMPLES_PER_DECLARATION);
    }

    return lists.map((list) => list.args);
  }

  const base: string[] = [];
  const baseChosen = new Map<string, string>();
  const alternatives: string[][] = [];
  for (const param of params) {
    const options = candidates(param, scope, baseChosen);
    base.push(options[0]!);
    baseChosen.set(param.name, options[0]!);
    alternatives.push(options);
  }

  const lists = [base];
  alternatives.forEach((options, index) => {
    for (const option of options.slice(1)) lists.push(base.map((arg, at) => (at === index ? option : arg)));
  });
  lists.push(alternatives.map((options) => options[options.length - 1]!));

  return [...new Map(lists.map((list) => [list.join('\0'), list])).values()];
}

function scopeOf(params: readonly TypeParam[], text: string, lean: boolean): Scope {
  const selective = params.some((param) => /(Select|Include)(?:\s*\|\s*undefined)?$/.test(param.constraint ?? ''));

  return { text, selective, lean };
}

function alias(declaration: Declaration, member: string | null, index: number): string {
  return `__Eq_${declaration.name}_${member ? `${member}_` : ''}${index}`;
}

/**
 * The member lines of an interface that holds nothing but references to other types, such as the map from model name to
 * model interface. Those interfaces own generic methods, which are never identical across two declarations, so the
 * reference is compared by its text and the referenced interface by its own samples.
 */
function referenceMembers(text: string, name: string, withGenericMethods: ReadonlySet<string>): string[] | null {
  const body = interfaceBody(text, name)?.trim();
  if (!body) return null;

  const lines = body.split('\n').map((line) => line.trim());

  const isReference = (line: string): boolean => {
    const target = /^(?:readonly )?[\w$]+\??: ([\w$]+);$/.exec(line)?.[1];

    return target !== undefined && withGenericMethods.has(target);
  };

  return lines.every(isReference) ? lines : null;
}

/**
 * The instantiations of a declaration. An interface with generic methods cannot be compared as a whole, since its
 * method type parameters belong to one declaration each and are never identical across two; each member is compared
 * through an instantiation expression on a value of the interface instead.
 */
function samplesOf(declaration: Declaration, text: string, withGenericMethods: ReadonlySet<string>): Sample[] {
  const references =
    declaration.kind === 'interface' ? referenceMembers(text, declaration.name, withGenericMethods) : null;
  if (references) {
    return [{ id: `${declaration.name}#references`, alias: '', source: '', text: references.join('\n') }];
  }

  const methods = declaration.kind === 'interface' ? interfaceMethods(text, declaration.name) : [];

  if (methods.some((method) => method.params.length)) {
    const value = `__m_${declaration.name}`;
    const samples: Sample[] = [];

    for (const method of methods) {
      const access = `${value}.${method.name}`;
      const lists = method.params.length
        ? argumentLists(method.params, scopeOf(method.params, text, true), true).map((args) => `<${args.join(', ')}>`)
        : [''];

      lists.forEach((args, index) => {
        const name = alias(declaration, method.name, index);
        const prelude = samples.length ? '' : `declare const ${value}: ${declaration.name};\n`;
        samples.push({
          id: `${declaration.name}.${method.name}#${index}`,
          alias: name,
          source: `${prelude}export type ${name} = typeof ${access}${args};`,
        });
      });
    }

    return samples;
  }

  const scope = scopeOf(declaration.params, text, false);
  const lists = declaration.params.length
    ? argumentLists(declaration.params, scope, scope.selective).map((args) => `<${args.join(', ')}>`)
    : [''];

  return lists.map((args, index) => ({
    id: `${declaration.name}#${index}`,
    alias: alias(declaration, null, index),
    source: `export type ${alias(declaration, null, index)} = ${declaration.name}${args};`,
  }));
}

export function readTypeTree(dir: string): Map<string, string> {
  const tree = new Map<string, string>();
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.ts')) tree.set(relative(dir, path), readFileSync(path, 'utf8'));
    }
  };
  walk(dir);

  return tree;
}

/** Every exported declaration of a tree with its samples; a name declared twice is an error, so a name maps to one place */
export function enumerateTree(tree: ReadonlyMap<string, string>): Map<string, TreeDeclaration> {
  const out = new Map<string, TreeDeclaration>();
  const withGenericMethods = new Set<string>();

  for (const text of tree.values()) {
    for (const declaration of parseDeclarations(text)) {
      if (declaration.kind === 'interface' && interfaceMethods(text, declaration.name).some((m) => m.params.length)) {
        withGenericMethods.add(declaration.name);
      }
    }
  }

  for (const [file, text] of tree) {
    for (const declaration of parseDeclarations(text)) {
      const previous = out.get(declaration.name);
      if (previous) throw new Error(`${declaration.name} is declared in both ${previous.file} and ${file}`);
      out.set(declaration.name, { ...declaration, file, samples: samplesOf(declaration, text, withGenericMethods) });
    }
  }

  return out;
}

const FLAT_HELPER = `import type { CerialId } from 'cerial';

type Flat<T> = T extends CerialId<infer _V>
  ? T
  : T extends Date
    ? T
    : T extends readonly (infer U)[]
      ? Flat<U>[]
      : T extends object
        ? { [K in keyof T]: Flat<T[K]> }
        : T;
`;

const IDENTITY_HELPERS = `type IsAny<T> = 0 extends 1 & T ? true : false;
type Same<B, A> =
  IsAny<B> extends true
    ? 'before is any'
    : IsAny<A> extends true
      ? 'after is any'
      : (<T>() => T extends B ? 1 : 2) extends (<T>() => T extends A ? 1 : 2)
        ? true
        : 'not identical';
`;

interface CheckFile {
  readonly text: string;
  /** Line number in the check file to the sample id on it */
  readonly sampleAt: ReadonlyMap<number, string>;
  /** Samples one side has and the other lacks, as ids */
  readonly unpaired: { readonly removed: readonly string[]; readonly added: readonly string[] };
  /** Reference-only interfaces whose text differs */
  readonly textDiffers: readonly string[];
}

function withoutExtension(file: string): string {
  return file.replace(/\.d\.ts$|\.ts$/, '');
}

/** The check file over the paired declarations, importing each side's declaring file under `before/` and `after/` */
export function emitCheck(
  before: ReadonlyMap<string, TreeDeclaration>,
  after: ReadonlyMap<string, TreeDeclaration>,
  flatFallback: ReadonlySet<string>,
): CheckFile {
  const imports: string[] = [];
  const lines: string[] = [];
  const sampleAt = new Map<number, string>();
  const modules = new Map<string, string>();
  const removed: string[] = [];
  const added: string[] = [];
  const textDiffers: string[] = [];

  const moduleAlias = (side: 'before' | 'after', file: string): string => {
    const specifier = `./${side}/${withoutExtension(file)}`;
    let name = modules.get(specifier);
    if (!name) {
      name = `M${modules.size}`;
      modules.set(specifier, name);
      imports.push(`import type * as ${name} from '${specifier}';`);
    }

    return name;
  };

  for (const [name, left] of before) {
    const right = after.get(name);
    if (!right) continue;

    const b = moduleAlias('before', left.file);
    const a = moduleAlias('after', right.file);
    const rightById = new Map(right.samples.map((sample) => [sample.id, sample]));
    const leftIds = new Set(left.samples.map((sample) => sample.id));
    added.push(...right.samples.filter((sample) => !leftIds.has(sample.id)).map((sample) => sample.id));

    for (const sample of left.samples) {
      const other = rightById.get(sample.id);
      if (!other) {
        removed.push(sample.id);
        continue;
      }

      if (sample.text !== undefined) {
        if (sample.text !== other.text) textDiffers.push(sample.id);
        continue;
      }

      const [lhs, rhs] = [`${b}.${sample.alias}`, `${a}.${other.alias}`];
      const pair = flatFallback.has(sample.id) ? `Flat<${lhs}>, Flat<${rhs}>` : `${lhs}, ${rhs}`;
      lines.push(`export const c${lines.length}: Same<${pair}> = true;`);
      sampleAt.set(lines.length, sample.id);
    }
  }

  const header = [flatFallback.size ? FLAT_HELPER : '', ...imports, '', IDENTITY_HELPERS].join('\n');
  const headerLines = header.split('\n').length;
  const shifted = new Map([...sampleAt].map(([line, id]) => [line + headerLines, id]));

  return { text: `${header}\n${lines.join('\n')}\n`, sampleAt: shifted, unpaired: { removed, added }, textDiffers };
}

function writeSide(
  root: string,
  side: 'before' | 'after',
  tree: ReadonlyMap<string, string>,
  declarations: ReadonlyMap<string, TreeDeclaration>,
): void {
  const appended = new Map<string, string[]>();
  for (const declaration of declarations.values()) {
    appended.set(declaration.file, [
      ...(appended.get(declaration.file) ?? []),
      ...declaration.samples.map((sample) => sample.source),
    ]);
  }

  for (const [file, text] of tree) {
    const path = join(root, side, file);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, `${text}\n${(appended.get(file) ?? []).join('\n')}\n`);
  }
}

function runCompiler(
  compiler: Compiler,
  root: string,
  heapMb: number,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const heapFlag = compiler === '5.9' ? [`--max-old-space-size=${heapMb}`] : [];

  return new Promise((resolve, reject) => {
    const child = spawn('node', [...heapFlag, compilerBin(compiler), '-p', root], { cwd: root });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code }));
  });
}

const REASONS = ['before is any', 'after is any', 'not identical'];

function failuresOf(compiler: Compiler, output: string, root: string, check: CheckFile): Failure[] {
  const failures: Failure[] = [];

  for (const error of parseTscErrors(output, root)) {
    const at = /\((\d+),\d+\)/.exec(error.message);
    const sample = error.file === join(root, 'check.ts') && at ? check.sampleAt.get(Number(at[1])) : undefined;
    const reason = REASONS.find((candidate) => error.message.includes(`"${candidate}"`));
    failures.push({
      compiler,
      sample: sample ?? relative(root, error.file),
      reason: reason ?? error.message.replace(/^.*?error /, ''),
    });
  }

  return failures;
}

/** Compiles the check over two generated directories under each compiler and reports every sample that is not identical */
export async function compareTrees(
  beforeDir: string,
  afterDir: string,
  options: EquivalenceOptions = {},
): Promise<EquivalenceReport> {
  const compilers = options.compilers ?? ['5.9', '7'];
  const flatFallback = new Set(options.flatFallback ?? []);
  const beforeTree = readTypeTree(beforeDir);
  const afterTree = readTypeTree(afterDir);
  const before = enumerateTree(beforeTree);
  const after = enumerateTree(afterTree);
  const removed = [...before.keys()].filter((name) => !after.has(name));
  const added = [...after.keys()].filter((name) => !before.has(name));
  const paired = new Map([...before].filter(([name]) => after.has(name)));
  const pairedAfter = new Map([...after].filter(([name]) => before.has(name)));
  const check = emitCheck(paired, pairedAfter, flatFallback);

  const root = mkdtempSync(join(tmpdir(), 'cerial-type-equivalence-'));
  try {
    writeSide(root, 'before', beforeTree, paired);
    writeSide(root, 'after', afterTree, pairedAfter);
    writeFileSync(join(root, 'check.ts'), check.text);
    linkDependencies(root);
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          target: 'ESNext',
          module: 'preserve',
          moduleResolution: 'bundler',
          lib: ['ESNext', 'DOM'],
          types: ['node'],
          typeRoots: ['./node_modules/@types'],
          noUncheckedIndexedAccess: true,
        },
        include: ['check.ts'],
      }),
    );

    const failures: Failure[] = check.textDiffers.map((sample) => ({
      compiler: 'text',
      sample,
      reason: 'member lines differ',
    }));
    for (const compiler of compilers) {
      const result = await runCompiler(compiler, root, options.maxOldSpaceMb ?? DEFAULT_MAX_OLD_SPACE_MB);
      const found = failuresOf(compiler, result.stdout, root, check);
      if (!found.length && result.code !== 0) {
        throw new Error(
          `tsc ${compiler} exited ${result.code} with no diagnostics: ${(result.stderr || result.stdout).slice(0, 500)}`,
        );
      }
      failures.push(...found);
    }

    return {
      ok: !failures.length && !removed.length && !added.length,
      compilers,
      declarations: paired.size,
      generics: [...paired.values()].filter(isGeneric).length,
      samples: check.sampleAt.size,
      failures,
      flatFallbacks: [...flatFallback],
      removed: [...removed, ...check.unpaired.removed],
      added: [...added, ...check.unpaired.added],
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Declares type parameters itself, or is an interface whose methods do */
function isGeneric(declaration: TreeDeclaration): boolean {
  return declaration.params.length > 0 || declaration.samples.some((sample) => sample.id.includes('.'));
}

export function formatReport(report: EquivalenceReport): string {
  const lines = [
    `${report.ok ? 'IDENTICAL' : 'NOT IDENTICAL'}: ${report.declarations} exported types (${report.generics} generic), ${report.samples} instantiations, compilers ${report.compilers.join(' and ')}`,
  ];
  if (report.flatFallbacks.length) lines.push(`compared through Flat: ${report.flatFallbacks.join(', ')}`);
  else lines.push('compared through Flat: none');
  if (report.removed.length) lines.push(`removed: ${report.removed.join(', ')}`);
  if (report.added.length) lines.push(`added: ${report.added.join(', ')}`);
  for (const failure of report.failures.slice(0, 50))
    lines.push(`  ${failure.compiler} ${failure.sample}: ${failure.reason}`);
  if (report.failures.length > 50) lines.push(`  ... and ${report.failures.length - 50} more`);

  return lines.join('\n');
}

/** `bun bench/type-equivalence.ts <before> <after> [--compiler 5.9|7] [--flat Name#0,...]` */
async function main(argv: readonly string[]): Promise<void> {
  const positional = argv.filter((arg, index) => !arg.startsWith('--') && !argv[index - 1]?.startsWith('--'));
  const flag = (name: string): string | undefined => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const [before, after] = positional;
  if (!before || !after)
    throw new Error('usage: bun bench/type-equivalence.ts <before> <after> [--compiler 5.9|7] [--flat Name#0,...]');

  const compiler = argv.includes('--compiler') ? flag('--compiler') : undefined;
  if (compiler !== undefined && compiler !== '5.9' && compiler !== '7')
    throw new Error(`--compiler takes 5.9 or 7, got "${compiler}"`);

  const report = await compareTrees(before, after, {
    ...(compiler ? { compilers: [compiler] } : {}),
    flatFallback: flag('--flat')?.split(',') ?? [],
  });
  console.log(formatReport(report));
  process.exitCode = report.ok ? 0 : 1;
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
