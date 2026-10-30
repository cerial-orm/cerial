import { readFile } from 'node:fs/promises';
import {
  collectEnumNames,
  collectLiteralNames,
  collectObjectNames,
  collectTupleNames,
  parse,
} from '../../parser/parser';
import { resolveInheritance } from '../../resolver';
import type { SchemaAST } from '../../types';
import type { PathFilter } from '../filters';
import { logger } from '../utils';
import type { SchemaValidationError } from '../validators';
import { validateDuplicateNames, validateExtends } from '../validators';
import { isTypescriptSchemaFile, resolveSchemas, resolveSinglePath } from './schema-resolver';

export interface SchemaAstOptions {
  schemaPath?: string;
  filter?: PathFilter;
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

/** Resolve an entry's schema files, parse them with cross-file name context, validate extends and resolve inheritance */
export async function buildResolvedSchemaAst(options: SchemaAstOptions): Promise<SchemaAstResult> {
  logger.progress('Finding schema files...');

  const resolvedFiles: string[] = options.schemaPath
    ? await resolveSinglePath(options.schemaPath, process.cwd(), options.filter)
    : await resolveSchemas({ filter: options.filter });

  const schemaFiles = resolvedFiles.filter((f) => !isTypescriptSchemaFile(f));
  const typescriptFiles = resolvedFiles.filter(isTypescriptSchemaFile);

  const combinedAST: SchemaAST = { models: [], objects: [], tuples: [], literals: [], enums: [], source: '' };
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

  if (!schemaFiles.length) return result;

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

  // Validate extends and name uniqueness on the RAW AST: resolution keys types by name, so a duplicate
  // declaration (including one in another file) would be silently dropped before any later check saw it
  result.extendsErrors = [...validateDuplicateNames(combinedAST), ...validateExtends(combinedAST)];
  if (result.extendsErrors.length) return result;

  // Resolve inheritance — flatten extends chains, apply pick/omit, strip private markers
  result.resolvedAST = resolveInheritance(combinedAST);

  return result;
}
