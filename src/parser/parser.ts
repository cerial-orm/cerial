/**
 * Main schema parser
 * Parses schema files into AST
 */

import type {
  SchemaAST,
  ASTModel,
  ASTObject,
  ASTField,
  ASTCompositeDirective,
  ParseResult,
  ParseError,
} from '../types';
import { tokenize } from './tokenizer';
import { lex, type LexerResult } from './lexer';
import {
  createSchemaAST,
  createModel,
  createCompositeDirective,
  createObject,
  createRange,
  createPosition,
  parseFieldDeclaration,
  modelNameToTableName,
} from './types';
import { removeComments } from '../utils/string-utils';

/** Parser state */
interface ParserState {
  lines: string[];
  currentLine: number;
  models: ASTModel[];
  objects: ASTObject[];
  errors: ParseError[];
  /** Known object names for type resolution (populated in two-pass parsing) */
  objectNames: Set<string>;
}

/** Create initial parser state */
function createState(source: string, objectNames?: Set<string>): ParserState {
  return {
    lines: source.split('\n'),
    currentLine: 0,
    models: [],
    objects: [],
    errors: [],
    objectNames: objectNames ?? new Set(),
  };
}

/** Get current line */
function currentLine(state: ParserState): string | undefined {
  return state.lines[state.currentLine];
}

/** Advance to next line */
function advance(state: ParserState): void {
  state.currentLine++;
}

/** Check if at end */
function isEnd(state: ParserState): boolean {
  return state.currentLine >= state.lines.length;
}

/** Add error */
function addError(state: ParserState, message: string): void {
  state.errors.push({
    message,
    position: createPosition(state.currentLine + 1, 0, 0),
  });
}

/** Check if line is a model declaration */
function isModelLine(line: string): boolean {
  const trimmed = removeComments(line).trim();
  return trimmed.startsWith('model ');
}

/** Check if line is an object declaration */
function isObjectLine(line: string): boolean {
  const trimmed = removeComments(line).trim();
  return trimmed.startsWith('object ');
}

/** Extract object name from line */
function extractObjectNameFromLine(line: string): string | null {
  const trimmed = removeComments(line).trim();
  const match = trimmed.match(/^object\s+(\w+)/);
  return match ? match[1]! : null;
}

/** Check if line is block start */
function isBlockStart(line: string): boolean {
  return removeComments(line).trim().endsWith('{') || removeComments(line).trim() === '{';
}

/** Check if line is block end */
function isBlockEnd(line: string): boolean {
  return removeComments(line).trim() === '}';
}

/** Check if line is empty or comment only */
function isEmptyOrComment(line: string): boolean {
  const trimmed = removeComments(line).trim();
  return trimmed === '';
}

/** Check if line is a composite directive (@@index or @@unique) */
function isCompositeDirectiveLine(line: string): boolean {
  const trimmed = removeComments(line).trim();

  return trimmed.startsWith('@@index') || trimmed.startsWith('@@unique');
}

/**
 * Parse a composite directive line.
 * Syntax: @@index(name, [field1, field2, ...]) or @@unique(name, [field1, field2, ...])
 * Fields support dot notation: address.city
 */
function parseCompositeDirective(
  line: string,
  lineNumber: number,
): { directive: ASTCompositeDirective | null; error: string | null } {
  const trimmed = removeComments(line).trim();

  // Match: @@index(name, [field1, field2]) or @@unique(name, [field1, field2])
  const match = trimmed.match(/^@@(index|unique)\(\s*(\w+)\s*,\s*\[([^\]]+)\]\s*\)$/);
  if (!match) {
    return {
      directive: null,
      error: `Invalid composite directive syntax: ${trimmed}. Expected @@index(name, [field1, field2, ...]) or @@unique(name, [field1, field2, ...])`,
    };
  }

  const kind = match[1] as 'index' | 'unique';
  const name = match[2]!;
  const fieldsStr = match[3]!;

  // Parse field list (comma-separated, supports dot notation like address.city)
  const fields = fieldsStr
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  if (!fields.length) {
    return { directive: null, error: `Composite directive @@${kind}("${name}") must specify at least one field` };
  }

  const range = createRange(createPosition(lineNumber, 0, 0), createPosition(lineNumber, trimmed.length, 0));

  return { directive: createCompositeDirective(kind, name, fields, range), error: null };
}

/** Extract model name from line */
function extractModelName(line: string): string | null {
  const trimmed = removeComments(line).trim();
  const match = trimmed.match(/^model\s+(\w+)/);
  return match ? match[1]! : null;
}

/** Parse a model block */
function parseModel(state: ParserState): ASTModel | null {
  const line = currentLine(state);
  if (line === undefined) return null;

  // Extract model name
  const modelName = extractModelName(line);
  if (!modelName) {
    addError(state, `Invalid model declaration: ${line}`);
    advance(state);
    return null;
  }

  const startLine = state.currentLine;
  advance(state);

  // Find the opening brace (might be on same line or next line)
  if (!isBlockStart(line)) {
    // Look for { on next line
    while (!isEnd(state)) {
      const nextLine = currentLine(state);
      if (nextLine === undefined) break;
      if (isEmptyOrComment(nextLine)) {
        advance(state);
        continue;
      }
      if (isBlockStart(nextLine)) {
        advance(state);
        break;
      }
      addError(state, `Expected '{' for model ${modelName}`);
      return null;
    }
  }

  // Parse fields and composite directives until closing brace
  const fields: ASTField[] = [];
  const directives: ASTCompositeDirective[] = [];

  while (!isEnd(state)) {
    const fieldLine = currentLine(state);
    if (fieldLine === undefined) break;

    // Skip empty lines and comments
    if (isEmptyOrComment(fieldLine)) {
      advance(state);
      continue;
    }

    // Check for end of model
    if (isBlockEnd(fieldLine)) {
      advance(state);
      break;
    }

    // Check for composite directive (@@index or @@unique)
    if (isCompositeDirectiveLine(fieldLine)) {
      const result = parseCompositeDirective(fieldLine, state.currentLine + 1);
      if (result.error) {
        addError(state, result.error);
      } else if (result.directive) {
        directives.push(result.directive);
      }
      advance(state);
      continue;
    }

    // Parse field (pass objectNames for type resolution)
    const result = parseFieldDeclaration(fieldLine, state.currentLine + 1, state.objectNames);
    if (result.error) {
      addError(state, result.error);
    } else if (result.field) {
      fields.push(result.field);
    }
    advance(state);
  }

  // Create model
  const range = createRange(createPosition(startLine + 1, 0, 0), createPosition(state.currentLine, 0, 0));

  return createModel(modelName, fields, range, directives);
}

/** Parse an object block */
function parseObject(state: ParserState): ASTObject | null {
  const line = currentLine(state);
  if (line === undefined) return null;

  // Extract object name
  const objectName = extractObjectNameFromLine(line);
  if (!objectName) {
    addError(state, `Invalid object declaration: ${line}`);
    advance(state);
    return null;
  }

  const startLine = state.currentLine;
  advance(state);

  // Find the opening brace (might be on same line or next line)
  if (!isBlockStart(line)) {
    while (!isEnd(state)) {
      const nextLine = currentLine(state);
      if (nextLine === undefined) break;
      if (isEmptyOrComment(nextLine)) {
        advance(state);
        continue;
      }
      if (isBlockStart(nextLine)) {
        advance(state);
        break;
      }
      addError(state, `Expected '{' for object ${objectName}`);
      return null;
    }
  }

  // Parse fields until closing brace
  const fields: ASTField[] = [];

  while (!isEnd(state)) {
    const fieldLine = currentLine(state);
    if (fieldLine === undefined) break;

    // Skip empty lines and comments
    if (isEmptyOrComment(fieldLine)) {
      advance(state);
      continue;
    }

    // Check for end of object
    if (isBlockEnd(fieldLine)) {
      advance(state);
      break;
    }

    // Parse field (pass objectNames for type resolution)
    const result = parseFieldDeclaration(fieldLine, state.currentLine + 1, state.objectNames);
    if (result.error) {
      addError(state, result.error);
    } else if (result.field) {
      fields.push(result.field);
    }
    advance(state);
  }

  // Create object
  const range = createRange(createPosition(startLine + 1, 0, 0), createPosition(state.currentLine, 0, 0));

  return createObject(objectName, fields, range);
}

/**
 * First pass: collect all object and model names without parsing fields.
 * This enables forward references (objects/models defined after usage).
 */
function collectNames(source: string): { objectNames: Set<string>; modelNames: Set<string> } {
  const objectNames = new Set<string>();
  const modelNames = new Set<string>();
  const lines = source.split('\n');

  for (const line of lines) {
    const trimmed = removeComments(line).trim();
    if (trimmed.startsWith('object ')) {
      const match = trimmed.match(/^object\s+(\w+)/);
      if (match) objectNames.add(match[1]!);
    } else if (trimmed.startsWith('model ')) {
      const match = trimmed.match(/^model\s+(\w+)/);
      if (match) modelNames.add(match[1]!);
    }
  }

  return { objectNames, modelNames };
}

/** Parse schema source (supports object {} blocks with two-pass name resolution) */
export function parse(source: string, externalObjectNames?: Set<string>): ParseResult {
  // First pass: collect all object names for forward reference resolution
  const { objectNames: localObjectNames } = collectNames(source);

  // Merge with any external object names (from other schema files)
  const allObjectNames = new Set<string>([...localObjectNames, ...(externalObjectNames ?? [])]);

  // Second pass: full parse with object names context
  const state = createState(source, allObjectNames);

  while (!isEnd(state)) {
    const line = currentLine(state);
    if (line === undefined) break;

    // Skip empty lines and comments
    if (isEmptyOrComment(line)) {
      advance(state);
      continue;
    }

    // Parse object
    if (isObjectLine(line)) {
      const object = parseObject(state);
      if (object) {
        state.objects.push(object);
      }
      continue;
    }

    // Parse model
    if (isModelLine(line)) {
      const model = parseModel(state);
      if (model) {
        state.models.push(model);
      }
      continue;
    }

    // Unknown line
    advance(state);
  }

  return {
    ast: createSchemaAST(state.models, source, state.objects),
    errors: state.errors,
  };
}

/** Parse using tokenizer and lexer (alternative method) */
export function parseWithLexer(source: string): ParseResult {
  const tokens = tokenize(source);
  const lexerResult = lex(tokens);

  if (lexerResult.errors.length > 0) {
    return {
      ast: createSchemaAST([], source),
      errors: lexerResult.errors,
    };
  }

  // Convert lexemes to AST
  const models: ASTModel[] = [];
  const errors: ParseError[] = [];

  let i = 0;
  while (i < lexerResult.lexemes.length) {
    const lexeme = lexerResult.lexemes[i];
    if (!lexeme) break;

    if (lexeme.type === 'model_keyword') {
      // Next lexeme should be model name
      const nameLexeme = lexerResult.lexemes[++i];
      if (!nameLexeme || nameLexeme.type !== 'model_name') {
        errors.push({ message: 'Expected model name', position: lexeme.position });
        i++;
        continue;
      }

      const modelName = nameLexeme.value;
      const fields: ASTField[] = [];

      // Skip to block start
      while (i < lexerResult.lexemes.length) {
        const l = lexerResult.lexemes[++i];
        if (!l) break;
        if (l.type === 'block_start') break;
      }

      // Parse fields until block end
      while (i < lexerResult.lexemes.length) {
        const l = lexerResult.lexemes[++i];
        if (!l) break;
        if (l.type === 'block_end') break;

        if (l.type === 'field_name') {
          // Parse field
          const fieldName = l.value;
          let isOptional = false;
          let fieldType: string | null = null;

          // Look for optional marker and type
          let j = i + 1;
          while (j < lexerResult.lexemes.length) {
            const fl = lexerResult.lexemes[j];
            if (!fl) break;

            if (fl.type === 'optional_marker') {
              isOptional = true;
            } else if (fl.type === 'field_type') {
              fieldType = fl.value;
              i = j;
              break;
            } else if (fl.type === 'field_name' || fl.type === 'block_end') {
              break;
            }
            j++;
          }

          if (fieldType) {
            const { parseFieldType } = require('./types/field-types');
            const schemaType = parseFieldType(fieldType);
            if (schemaType) {
              const { createField, createRange, createPosition } = require('./types/ast');
              fields.push(
                createField(
                  fieldName,
                  schemaType,
                  isOptional,
                  [],
                  createRange(
                    createPosition(l.position.line, l.position.column, l.position.offset),
                    createPosition(l.position.line, l.position.column + fieldName.length, l.position.offset),
                  ),
                ),
              );
            }
          }
        }
      }

      // Create model
      const range = createRange(
        createPosition(lexeme.position.line, lexeme.position.column, lexeme.position.offset),
        createPosition(lexeme.position.line, lexeme.position.column, lexeme.position.offset),
      );

      models.push(createModel(modelName, fields, range));
    }

    i++;
  }

  return {
    ast: createSchemaAST(models, source),
    errors,
  };
}

/**
 * Resolve a dot-notation field reference against a model and its object definitions.
 * Returns the field type if valid, or null if invalid.
 * Examples: "email" → resolves to email field; "address.city" → resolves to city subfield of Address object
 */
function resolveCompositeField(
  fieldRef: string,
  model: ASTModel,
  ast: SchemaAST,
): {
  valid: boolean;
  isOptional: boolean;
  isRelation: boolean;
  isArray: boolean;
  isId: boolean;
  parentOverlap?: string;
} {
  const parts = fieldRef.split('.');

  // Top-level field lookup
  const topField = model.fields.find((f) => f.name === parts[0]);
  if (!topField) return { valid: false, isOptional: false, isRelation: false, isArray: false, isId: false };

  // Single-part reference (e.g., "email", "authorId")
  if (parts.length === 1) {
    return {
      valid: true,
      isOptional: topField.isOptional,
      isRelation: topField.type === 'relation',
      isArray: !!topField.isArray,
      isId: topField.decorators.some((d) => d.type === 'id'),
    };
  }

  // Dot-notation: must be an object type field
  if (topField.type !== 'object' || !topField.objectName) {
    return { valid: false, isOptional: false, isRelation: false, isArray: false, isId: false };
  }

  // Walk the dot-notation path through nested objects
  let currentObjectName = topField.objectName;
  for (let i = 1; i < parts.length; i++) {
    const objectDef = ast.objects.find((o) => o.name === currentObjectName);
    if (!objectDef) return { valid: false, isOptional: false, isRelation: false, isArray: false, isId: false };

    const subField = objectDef.fields.find((f) => f.name === parts[i]);
    if (!subField) return { valid: false, isOptional: false, isRelation: false, isArray: false, isId: false };

    // If there are more parts, this must also be an object type
    if (i < parts.length - 1) {
      if (subField.type !== 'object' || !subField.objectName) {
        return { valid: false, isOptional: false, isRelation: false, isArray: false, isId: false };
      }
      currentObjectName = subField.objectName;
    } else {
      // Final field in the dot path
      return {
        valid: true,
        isOptional: topField.isOptional || subField.isOptional,
        isRelation: false,
        isArray: !!subField.isArray,
        isId: false,
      };
    }
  }

  return { valid: false, isOptional: false, isRelation: false, isArray: false, isId: false };
}

/** Validate composite directives on a model */
function validateCompositeDirectives(
  model: ASTModel,
  ast: SchemaAST,
  errors: ParseError[],
  globalNames: Map<string, string>,
): void {
  for (const directive of model.directives ?? []) {
    // 1. Global name uniqueness
    const existingModel = globalNames.get(directive.name);
    if (existingModel) {
      errors.push({
        message: `Composite directive name '${directive.name}' is already used in model ${existingModel}. Names must be unique across all models.`,
        position: directive.range.start,
      });
    } else {
      globalNames.set(directive.name, model.name);
    }

    // 2. Minimum 2 fields
    if (directive.fields.length < 2) {
      errors.push({
        message: `Composite @@${directive.kind}("${directive.name}") must have at least 2 fields. Use field-level @${directive.kind} for single fields.`,
        position: directive.range.start,
      });
    }

    // 3. Check for duplicate fields within directive
    const seenFields = new Set<string>();
    for (const fieldRef of directive.fields) {
      if (seenFields.has(fieldRef)) {
        errors.push({
          message: `Duplicate field '${fieldRef}' in composite @@${directive.kind}("${directive.name}")`,
          position: directive.range.start,
        });
      }
      seenFields.add(fieldRef);
    }

    // 4. Validate each field reference
    const topLevelObjectFields = new Set<string>(); // track whole-object fields for overlap check
    const dotNotationRoots = new Set<string>(); // track dot-notation root fields for overlap check

    for (const fieldRef of directive.fields) {
      const resolved = resolveCompositeField(fieldRef, model, ast);

      if (!resolved.valid) {
        errors.push({
          message: `Field '${fieldRef}' in composite @@${directive.kind}("${directive.name}") does not exist in model ${model.name}`,
          position: directive.range.start,
        });
        continue;
      }

      // Check: @id fields disallowed
      if (resolved.isId) {
        errors.push({
          message: `Field '${fieldRef}' in composite @@${directive.kind}("${directive.name}") has @id and cannot be part of a composite. @id fields are already unique.`,
          position: directive.range.start,
        });
      }

      // Check: relation fields disallowed
      if (resolved.isRelation) {
        errors.push({
          message: `Field '${fieldRef}' in composite @@${directive.kind}("${directive.name}") is a Relation (virtual field) and cannot be indexed. Use the Record field instead.`,
          position: directive.range.start,
        });
      }

      // Check: array fields disallowed
      if (resolved.isArray) {
        errors.push({
          message: `Field '${fieldRef}' in composite @@${directive.kind}("${directive.name}") is an array field and cannot be part of a composite index.`,
          position: directive.range.start,
        });
      }

      // Track for overlap check
      const parts = fieldRef.split('.');
      if (parts.length === 1) {
        // Check if it's an object-type field (whole object reference)
        const topField = model.fields.find((f) => f.name === fieldRef);
        if (topField?.type === 'object') {
          topLevelObjectFields.add(fieldRef);
        }
      } else {
        dotNotationRoots.add(parts[0]!);
      }
    }

    // 5. Check for object + own subfield overlap (redundant)
    for (const objField of topLevelObjectFields) {
      if (dotNotationRoots.has(objField)) {
        errors.push({
          message: `Composite @@${directive.kind}("${directive.name}") references both '${objField}' (whole object) and its subfield(s). This is redundant — use either the whole object or specific subfields.`,
          position: directive.range.start,
        });
      }
    }

    // 6. Warn about optional fields in @@unique composites
    if (directive.kind === 'unique') {
      const optionalFields: string[] = [];
      for (const fieldRef of directive.fields) {
        const resolved = resolveCompositeField(fieldRef, model, ast);
        if (resolved.valid && resolved.isOptional) {
          optionalFields.push(fieldRef);
        }
      }

      if (optionalFields.length) {
        // This is a warning, not an error — we still allow it
        // The warning is logged during generation, not added to parse errors
        // Store the info on the directive for later use (via the AST)
      }
    }
  }
}

/** Validate parsed schema */
export function validateSchema(ast: SchemaAST): ParseError[] {
  const errors: ParseError[] = [];

  // Global composite directive name uniqueness
  const globalCompositeNames = new Map<string, string>(); // name -> modelName

  // Check for duplicate model names
  const modelNames = new Set<string>();
  for (const model of ast.models) {
    if (modelNames.has(model.name)) {
      errors.push({
        message: `Duplicate model name: ${model.name}`,
        position: model.range.start,
      });
    }
    modelNames.add(model.name);

    // Check for duplicate field names within model
    const fieldNames = new Set<string>();
    let idFieldCount = 0;

    for (const field of model.fields) {
      if (fieldNames.has(field.name)) {
        errors.push({
          message: `Duplicate field name '${field.name}' in model ${model.name}`,
          position: field.range.start,
        });
      }
      fieldNames.add(field.name);

      // Check for @id decorator (only one allowed per model)
      const hasIdDecorator = field.decorators.some((d) => d.type === 'id');
      if (hasIdDecorator) {
        idFieldCount++;
        if (idFieldCount > 1) {
          errors.push({
            message: `Multiple @id decorators in model ${model.name}. Only one @id field is allowed per model.`,
            position: field.range.start,
          });
        }
      }

      // Check @index and @unique mutual exclusivity
      const hasIndex = field.decorators.some((d) => d.type === 'index');
      const hasUnique = field.decorators.some((d) => d.type === 'unique');
      if (hasIndex && hasUnique) {
        errors.push({
          message: `Field '${field.name}' in model ${model.name} cannot have both @index and @unique. Use one or the other.`,
          position: field.range.start,
        });
      }

      // Check @unique on array fields — SurrealDB indexes array elements individually,
      // so UNIQUE means "no two records can share any element", not whole-array uniqueness.
      if (hasUnique && field.isArray) {
        errors.push({
          message: `Field '${field.name}' in model ${model.name} is an array field and cannot have @unique. SurrealDB enforces uniqueness per element, not per array — use @index for per-element lookups instead.`,
          position: field.range.start,
        });
      }
    }

    // Validate composite directives
    validateCompositeDirectives(model, ast, errors, globalCompositeNames);
  }

  // Check for duplicate object names
  const objectNames = new Set<string>();
  for (const object of ast.objects) {
    if (objectNames.has(object.name)) {
      errors.push({
        message: `Duplicate object name: ${object.name}`,
        position: object.range.start,
      });
    }
    // Check for name collision with model names
    if (modelNames.has(object.name)) {
      errors.push({
        message: `Object name '${object.name}' conflicts with model name`,
        position: object.range.start,
      });
    }
    objectNames.add(object.name);

    // Check for duplicate field names within object
    const fieldNames = new Set<string>();
    for (const field of object.fields) {
      if (fieldNames.has(field.name)) {
        errors.push({
          message: `Duplicate field name '${field.name}' in object ${object.name}`,
          position: field.range.start,
        });
      }
      fieldNames.add(field.name);

      // Objects cannot have 'id' field
      if (field.name === 'id') {
        errors.push({
          message: `Objects cannot have an 'id' field`,
          position: field.range.start,
        });
      }

      // Objects cannot have Relation fields
      if (field.type === 'relation') {
        errors.push({
          message: `Objects cannot have Relation fields`,
          position: field.range.start,
        });
      }

      // Validate decorators on object fields — only specific decorators are allowed
      const ALLOWED_OBJECT_DECORATORS = new Set([
        'default',
        'createdAt',
        'updatedAt',
        'index',
        'unique',
        'distinct',
        'sort',
        'readonly',
      ]);
      for (const dec of field.decorators) {
        if (!ALLOWED_OBJECT_DECORATORS.has(dec.type)) {
          if (dec.type === 'now') {
            errors.push({
              message: `@now is not allowed on object fields. SurrealDB requires COMPUTED fields to be top-level. Use @createdAt or @updatedAt instead.`,
              position: field.range.start,
            });
          } else {
            errors.push({
              message: `Decorator @${dec.type} is not allowed on object fields. Allowed: @default, @createdAt, @updatedAt, @index, @unique, @distinct, @sort, @readonly.`,
              position: field.range.start,
            });
          }
        }
      }

      // Validate @index and @unique mutual exclusivity on object fields
      const hasObjIndex = field.decorators.some((d) => d.type === 'index');
      const hasObjUnique = field.decorators.some((d) => d.type === 'unique');
      if (hasObjIndex && hasObjUnique) {
        errors.push({
          message: `Field '${field.name}' in object ${object.name} cannot have both @index and @unique. Use one or the other.`,
          position: field.range.start,
        });
      }

      // Validate @unique on array object fields — per-element semantics are surprising
      if (hasObjUnique && field.isArray) {
        errors.push({
          message: `Field '${field.name}' in object ${object.name} is an array field and cannot have @unique. SurrealDB enforces uniqueness per element, not per array — use @index for per-element lookups instead.`,
          position: field.range.start,
        });
      }

      // Validate @distinct and @sort are only on array fields within objects
      const hasDistinct = field.decorators.some((d) => d.type === 'distinct');
      const hasSort = field.decorators.some((d) => d.type === 'sort');
      if ((hasDistinct || hasSort) && !field.isArray) {
        errors.push({
          message: `Decorator @${hasDistinct ? 'distinct' : 'sort'} on field '${field.name}' in object ${object.name} is only allowed on array fields.`,
          position: field.range.start,
        });
      }

      // Self-referencing object fields must be optional or array
      if (field.type === 'object' && field.objectName === object.name) {
        if (!field.isOptional && !field.isArray) {
          errors.push({
            message: `Self-referencing object fields must be optional or array`,
            position: field.range.start,
          });
        }
      }
    }
  }

  return errors;
}

/** Collect all object names from a source (first-pass only, for external use) */
export function collectObjectNames(source: string): Set<string> {
  return collectNames(source).objectNames;
}
