import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { CerialGenerationError } from '../../errors';
import {
  collectEnumNames,
  collectLiteralNames,
  collectObjectNames,
  collectTupleNames,
  parse,
} from '../../parser/parser';
import { loadDeclarations, materialise } from '../../parser/builder';
import { resolveInheritance } from '../../resolver';
import type { SchemaAST } from '../../types';
import type { PathFilter } from '../filters';
import { toFilterPath } from '../filters/path-utils';
import { logger } from '../utils';
import type { SchemaValidationError } from '../validators';
import { validateDuplicateNames, validateExtends } from '../validators';
import { isTypescriptSchemaFile, resolveSchemas, resolveSinglePath } from './schema-resolver';

const HANDLES_MODULE = /(^|\/)cerial\/handles\.ts$/;

export interface SchemaAstOptions {
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
}

export interface SchemaAstResult {
  /** `.cerial` files only; these are the ones read and parsed */
  schemaFiles: string[];
  /** `*.schema.ts` modules found for the entry; never read, imported or parsed here */
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

  const explicitTypescript = [...(entry ? [entry] : []), ...listedTypescript];
  if (explicitTypescript.length && schemaFiles.length) {
    throw new CerialGenerationError(
      `Schema module ${explicitTypescript[0]} is set in the config, but the schema also holds ${schemaFiles.length} .cerial file(s). Combining the two forms is not supported yet: use only .cerial files or only TypeScript modules.`,
    );
  }

  let combinedAST: SchemaAST = { models: [], objects: [], tuples: [], literals: [], enums: [], source: '' };
  const result: SchemaAstResult = {
    schemaFiles,
    typescriptFiles,
    schemaContents: [],
    parseErrors: [],
    combinedAST,
    extendsErrors: [],
    resolvedAST: null,
  };

  if (typescriptFiles.length) {
    logger.info(`Found ${typescriptFiles.length} TypeScript schema module(s)`);
    if (options.verbose) typescriptFiles.forEach((f) => logger.debug(`  - ${f}`));
  }

  if (!schemaFiles.length) {
    if (!typescriptFiles.length) return result;

    // A TypeScript-only entry becomes the same AST the parser yields, so everything below runs unchanged
    logger.progress('Loading TypeScript schema modules...');
    combinedAST = materialise(
      await loadDeclarations(typescriptFiles, {
        entries: entry ? [entry] : [],
        excludes: filter ? isExcluded : undefined,
      }),
    );
    result.combinedAST = combinedAST;

    if (!hasDeclarations(combinedAST)) {
      result.parseErrors.push(
        `Found ${typescriptFiles.length} TypeScript schema module(s), but none exports a model, object, tuple, literal or enum declared with cerial/schema`,
      );

      return result;
    }

    return validateAndResolve(result, combinedAST);
  }

  if (typescriptFiles.length) {
    // Merging the two forms is not done here, and a `user.schema.ts` beside `.cerial` files may not be a Cerial schema
    logger.info('The entry also holds .cerial files, so its TypeScript schema modules are not imported');
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

  // Two-pass parsing: first collect all object, tuple, literal, and enum names across all files
  const allObjectNames = new Set<string>();
  const allTupleNames = new Set<string>();
  const allLiteralNames = new Set<string>();
  const allEnumNames = new Set<string>();
  for (const { content } of schemaContents) {
    for (const name of collectObjectNames(content)) allObjectNames.add(name);
    for (const name of collectTupleNames(content)) allTupleNames.add(name);
    for (const name of collectLiteralNames(content)) allLiteralNames.add(name);
    for (const name of collectEnumNames(content)) allEnumNames.add(name);
  }

  // Second pass: parse each schema with full object, tuple, literal, and enum name context
  for (const { path, content } of schemaContents) {
    const parseResult = parse(content, allObjectNames, allTupleNames, allLiteralNames, allEnumNames, path);

    if (parseResult.errors.length) {
      for (const error of parseResult.errors) {
        result.parseErrors.push(`${path}:${error.position.line}: ${error.message}`);
      }
      continue;
    }

    combinedAST.models.push(...parseResult.ast.models);
    combinedAST.objects.push(...parseResult.ast.objects);
    combinedAST.tuples.push(...parseResult.ast.tuples);
    combinedAST.literals.push(...parseResult.ast.literals);
    combinedAST.enums.push(...parseResult.ast.enums);
  }

  if (result.parseErrors.length) return result;

  return validateAndResolve(result, combinedAST);
}

function hasDeclarations(ast: SchemaAST): boolean {
  return Boolean(
    ast.models.length || ast.objects.length || ast.tuples.length || ast.literals.length || ast.enums.length,
  );
}

function validateAndResolve(result: SchemaAstResult, combinedAST: SchemaAST): SchemaAstResult {
  // Validate extends and name uniqueness on the RAW AST: resolution keys types by name, so a duplicate
  // declaration (including one in another file) would be silently dropped before any later check saw it
  result.extendsErrors = [...validateDuplicateNames(combinedAST), ...validateExtends(combinedAST)];
  if (result.extendsErrors.length) return result;

  // Resolve inheritance — flatten extends chains, apply pick/omit, strip private markers
  result.resolvedAST = resolveInheritance(combinedAST);

  return result;
}
