import { existsSync, statSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { CerialGenerationError } from '../../errors';
import { materialise } from '../../parser/builder';
import type { ExportedDeclaration } from '../../parser/builder';
import { handlesPath, syncHandles } from '../../generators/handles';
import { resolveInheritance } from '../../resolver';
import type { SchemaAST } from '../../types';
import type { PathFilter } from '../filters';
import { toFilterPath } from '../filters/path-utils';
import type { NameSets } from '../passes';
import {
  collectDslNames,
  emptyAst,
  mergeDeclarations,
  NO_NAMES,
  runPassOne,
  runPassThree,
  runPassTwo,
} from '../passes';
import { logger } from '../utils';
import type { SchemaValidationError } from '../validators';
import { validateDuplicateNames, validateExtends, validateGeneratedNames } from '../validators';
import { isTypescriptSchemaFile, resolveSchemas, resolveSinglePath } from './schema-resolver';

const HANDLES_MODULE = /(^|\/)cerial\/handles\.ts$/;

export interface SchemaAstOptions {
  /** The client class this schema generates; a declaration named like it is refused */
  clientClassName?: string;
  schemaPath?: string;
  /** Absolute path of a module exporting `defineSchema()`; with no `schemaPath`, nothing else is searched */
  entry?: string;
  /** Absolute paths of the config's listed `files`; each is a schema source, and the filter applies to each */
  files?: readonly string[];
  filter?: PathFilter;
  /** The scope directory (or a file in it) filter patterns are relative to; defaults to `schemaPath` */
  filterBase?: string;
  /** Where a file outside the scope is matched from instead: the config's directory, else the cwd */
  filterRoot?: string;
  verbose?: boolean;
  /**
   * Leave the generated handles module as it was found. A mixed entry still needs it on disk while its
   * TypeScript modules are imported, so it is written for that moment and put back before this returns.
   * For read-only callers; `generate` leaves it unset and keeps the file.
   */
  preserveHandles?: boolean;
}

export interface SchemaAstResult {
  /** `.cerial` files only; these are the ones read and parsed */
  schemaFiles: string[];
  /** TypeScript schema modules found for the entry; with `.cerial` files beside them they are merged in */
  typescriptFiles: string[];
  schemaContents: Array<{ path: string; content: string }>;
  /** `path:line: message` per parse error; when non-empty the AST fields below are empty */
  parseErrors: string[];
  /** Merged AST of every file, before inheritance resolution */
  combinedAST: SchemaAST;
  /** Duplicate-name and extends errors found on the raw AST; when non-empty `resolvedAST` is null */
  extendsErrors: SchemaValidationError[];
  /** Inheritance-resolved AST, or null when parsing or extends validation failed */
  resolvedAST: SchemaAST | null;
  /** The TypeScript declarations as loaded, with their handles, which the AST does not keep; empty without a TypeScript module */
  declarations: ExportedDeclaration[];
}

/**
 * The path the filter sees for `file`: relative to the scope directory, as discovered files are, so one file
 * matches one pattern however it was reached. A file outside the scope is matched from `root` instead, because
 * a `../` path never matches a pattern and would silently escape every one. Outside both it is undefined, and
 * such a file is kept: patterns cannot escape their scope.
 */
function filterPathOf(file: string, bases: readonly string[]): string | undefined {
  for (const base of bases) {
    const path = toFilterPath(file, base);
    if (path && path !== '..' && !path.startsWith('../') && !isAbsolute(path)) return path;
  }

  return undefined;
}

/** The directory `cerial/handles.ts` lives under: the scope when one is given, else what every source shares */
function handlesRoot(scopeDir: string | undefined, sources: readonly string[]): string {
  if (scopeDir) return scopeDir;
  const parts = sources.map((file) => dirname(resolve(file)).split(sep));
  const first = parts[0] ?? [];
  let shared = first.length;
  for (const other of parts) {
    shared = Math.min(shared, other.length);
    for (let i = 0; i < shared; i++) {
      if (other[i] !== first[i]) shared = i;
    }
  }

  return first.slice(0, shared).join(sep) || sep;
}

/** Resolve an entry's schema files, parse them with cross-file name context, validate extends and resolve inheritance */
export async function buildResolvedSchemaAst(options: SchemaAstOptions): Promise<SchemaAstResult> {
  logger.progress('Finding schema files...');

  const declaredEntry = options.entry;
  if (declaredEntry && !existsSync(declaredEntry)) {
    throw new CerialGenerationError(`Schema entry ${declaredEntry} does not exist. Check 'entry' in the config.`);
  }

  // The cascade is the one place a file is kept out, for discovered, listed and imported sources alike
  const scopeInput = options.filterBase ?? options.schemaPath;
  const scope = scopeInput && resolve(scopeInput);
  const scopeDir = scope && (existsSync(scope) && statSync(scope).isFile() ? dirname(scope) : scope);
  const bases = [...(scopeDir ? [scopeDir] : []), resolve(options.filterRoot ?? process.cwd())];
  const { filter } = options;
  const isExcluded = (file: string): boolean => {
    if (!filter) return false;
    const path = filterPathOf(file, bases);

    return path !== undefined && !filter.shouldInclude(path);
  };

  // The generated handles are output, never a schema module, so listing them contributes nothing
  const allListed = (options.files ?? []).filter((file) => !HANDLES_MODULE.test(file.replace(/\\/g, '/')));
  for (const file of allListed) {
    if (!existsSync(file)) {
      throw new CerialGenerationError(`Schema file ${file} does not exist. Check 'files' in the config.`);
    }
    if (!file.endsWith('.cerial') && !file.endsWith('.ts')) {
      throw new CerialGenerationError(
        `Schema file ${file} is neither a .cerial file nor a .ts module. Check 'files' in the config.`,
      );
    }
  }

  const listed = allListed.filter((file) => !isExcluded(file));
  const entry = declaredEntry && !isExcluded(declaredEntry) ? declaredEntry : undefined;
  const excludedSources = [...(declaredEntry && !entry ? [declaredEntry] : []), ...allListed.filter(isExcluded)];

  // An entry or a file list with no path owns the schema, so there is no root for convention to search
  const explicit = !!declaredEntry || !!options.files?.length;
  const resolvedFiles: string[] = options.schemaPath
    ? await resolveSinglePath(options.schemaPath, process.cwd(), options.filter)
    : explicit
      ? []
      : await resolveSchemas({ filter: options.filter });

  // Each source counts once however many modes found it
  const schemaFiles = [
    ...new Set([
      ...resolvedFiles.filter((f) => !isTypescriptSchemaFile(f)),
      ...listed.filter((f) => f.endsWith('.cerial')),
    ]),
  ];
  const listedTypescript = listed.filter((f) => f.endsWith('.ts'));
  const typescriptFiles = [...new Set([...resolvedFiles.filter(isTypescriptSchemaFile), ...listedTypescript])];
  if (entry && !typescriptFiles.includes(entry)) typescriptFiles.push(entry);

  if (excludedSources.length && !schemaFiles.length && !typescriptFiles.length) {
    throw new CerialGenerationError(
      `Every schema source is excluded by the ignore, exclude and .cerialignore patterns: ${excludedSources.join(', ')}. Remove the matching pattern, or add an include pattern for it (an ignore pattern cannot be overridden).`,
    );
  }

  // Handles exist only while the entry mixes both forms; any other entry drops a stale one this generator wrote
  const mixing = !!schemaFiles.length && !!typescriptFiles.length;
  const root = handlesRoot(scopeDir, [...schemaFiles, ...typescriptFiles]);
  if (!mixing && !options.preserveHandles) await syncHandles(root, null);

  let combinedAST: SchemaAST = emptyAst();
  const result: SchemaAstResult = {
    schemaFiles,
    typescriptFiles,
    schemaContents: [],
    parseErrors: [],
    combinedAST,
    extendsErrors: [],
    resolvedAST: null,
    declarations: [],
  };

  if (typescriptFiles.length) {
    logger.info(`Found ${typescriptFiles.length} TypeScript schema module(s)`);
    if (options.verbose) typescriptFiles.forEach((f) => logger.debug(`  - ${f}`));
  }

  if (!schemaFiles.length) {
    if (!typescriptFiles.length) return result;

    // A TypeScript-only entry becomes the same AST the parser yields, so everything below runs unchanged
    logger.progress('Loading TypeScript schema modules...');
    result.declarations = await runPassTwo(typescriptFiles, {
      entries: entry ? [entry] : [],
      excludes: filter ? isExcluded : undefined,
    });
    combinedAST = materialise(result.declarations);
    result.combinedAST = combinedAST;

    if (!hasDeclarations(combinedAST)) {
      result.parseErrors.push(
        `Found ${typescriptFiles.length} TypeScript schema module(s), but none exports a model, object, tuple, literal or enum declared with cerial/schema`,
      );

      return result;
    }

    return validateAndResolve(result, combinedAST, options.clientClassName);
  }

  logger.info(`Found ${schemaFiles.length} schema file(s)`);
  if (options.verbose) {
    schemaFiles.forEach((f) => logger.debug(`  - ${f}`));
  }

  // Load and parse schemas
  logger.progress('Parsing schemas...');

  const schemaContents = await Promise.all(
    schemaFiles.map(async (path) => {
      const content = await readFile(path, 'utf-8');

      return { path, content };
    }),
  );
  result.schemaContents = schemaContents;

  // Pass 1 writes the handles the TypeScript modules may import, so it runs before they are imported
  const handlesFile = handlesPath(root);
  // Kept for every mixed entry: a refused schema must leave handles.ts as it was found, never newly written
  const priorHandles = mixing && existsSync(handlesFile) ? await readFile(handlesFile) : undefined;
  const restoreHandles = async (): Promise<void> => {
    if (priorHandles) await writeFile(handlesFile, priorHandles);
    else await syncHandles(root, null);
  };
  let declared: NameSets = NO_NAMES;
  let typescriptAST = emptyAst();
  try {
    const handlesAst = mixing ? await runPassOne(schemaContents, root) : emptyAst();

    if (mixing) {
      logger.progress('Loading TypeScript schema modules...');
      const dsl = collectDslNames(schemaContents);
      result.declarations = await runPassTwo(typescriptFiles, {
        entries: entry ? [entry] : [],
        excludes: filter ? isExcluded : undefined,
        handles: { root, ast: handlesAst },
      });
      typescriptAST = materialise(result.declarations, {
        object: dsl.objects,
        tuple: dsl.tuples,
        literal: [...dsl.literals, ...dsl.enums],
      });
      declared = {
        objects: new Set(typescriptAST.objects.map((o) => o.name)),
        tuples: new Set(typescriptAST.tuples.map((t) => t.name)),
        literals: new Set(typescriptAST.literals.map((l) => l.name)),
        enums: new Set(typescriptAST.enums.map((e) => e.name)),
      };
    }
  } catch (error) {
    if (mixing) await restoreHandles();
    throw error;
  }
  // `generate` keeps the file it wrote for a schema that loads, and restores it for one that is refused
  if (options.preserveHandles && mixing) await restoreHandles();

  const parsed = runPassThree(schemaContents, declared);
  result.parseErrors.push(...parsed.errors);
  result.combinedAST = parsed.ast;

  // An ordinary parse error keeps the handles: the TypeScript modules need them while the typo is fixed
  if (result.parseErrors.length) return result;

  result.combinedAST = mixing ? mergeDeclarations(parsed.ast, typescriptAST) : parsed.ast;
  validateAndResolve(result, result.combinedAST, options.clientClassName);
  if (mixing && result.extendsErrors.length) await restoreHandles();

  return result;
}

function hasDeclarations(ast: SchemaAST): boolean {
  return Boolean(
    ast.models.length || ast.objects.length || ast.tuples.length || ast.literals.length || ast.enums.length,
  );
}

function validateAndResolve(
  result: SchemaAstResult,
  combinedAST: SchemaAST,
  clientClassName?: string,
): SchemaAstResult {
  // Validate extends and name uniqueness on the RAW AST: resolution keys types by name, so a duplicate
  // declaration (including one in another file) would be silently dropped before any later check saw it
  // Names are checked here, on every declaration including abstract models, so the CLI and the editor agree
  result.extendsErrors = [
    ...validateGeneratedNames(combinedAST),
    ...validateDuplicateNames(combinedAST, clientClassName),
    ...validateExtends(combinedAST),
  ];
  if (result.extendsErrors.length) return result;

  // Resolve inheritance — flatten extends chains, apply pick/omit, strip private markers
  result.resolvedAST = resolveInheritance(combinedAST);

  return result;
}
