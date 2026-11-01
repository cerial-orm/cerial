import { printSchema } from '../../formatter/formatter';
import { IDENTIFIER_PATTERN } from '../../parser/tokenizer';
import { createDecorator, createField, createModel, createPosition, createRange } from '../../parser/types/ast';
import type { ASTDecorator, ASTField, SchemaAST } from '../../types';
import { runPassThree } from '../passes/pass-three';
import { isReservedKeyword } from '../validators/reserved-keyword-validator';
import { lossyCase } from './lossy-cases';

export interface PrintFinding {
  /** The `LOSSY_CASES` id. */
  readonly id: string;
  readonly kind: 'model' | 'object' | 'tuple' | 'literal' | 'enum';
  readonly declaration: string;
  readonly module: string;
  /** The field, element or value the finding is about, when it is not the declaration itself. */
  readonly member?: string;
  readonly message: string;
}

const PROBE_FILE = 'probe.cerial';
const RANGE = createRange(createPosition(0, 0, 0), createPosition(0, 0, 0));
const STRING_DEFAULTS: ReadonlySet<string> = new Set(['default', 'defaultAlways']);
/** Field types whose string default is printed as a quoted string. */
const QUOTED_TYPES: ReadonlySet<string> = new Set(['string', 'literal']);

function reparse(text: string): SchemaAST | null {
  const { ast, errors } = runPassThree([{ path: PROBE_FILE, content: text }]);

  return errors.length ? null : ast;
}

/** Print one string as a `@default` on a lone field and read it back; the printer and parser decide, not a character list. */
function defaultSurvives(decorator: ASTDecorator): boolean {
  const field = createField('probe', 'string', false, [createDecorator(decorator.type, RANGE, decorator.value)], RANGE);
  const id = createField('id', 'record', false, [createDecorator('id', RANGE)], RANGE);
  const text = printSchema({
    models: [createModel('Probe', [id, field], RANGE)],
    objects: [],
    tuples: [],
    literals: [],
    enums: [],
    source: '',
  });
  const back = reparse(text)?.models[0]?.fields[1]?.decorators.find((d) => d.type === decorator.type);

  return back?.value === decorator.value;
}

function variantSurvives(value: string): boolean {
  const text = printSchema({
    models: [],
    objects: [],
    tuples: [],
    literals: [
      {
        name: 'Probe',
        variants: [{ kind: 'string', value }],
        range: RANGE,
        origin: { kind: 'dsl', file: PROBE_FILE, range: RANGE },
      },
    ],
    enums: [],
    source: '',
  });
  const back = reparse(text)?.literals[0]?.variants;

  return back?.length === 1 && back[0]!.kind === 'string' && back[0]!.value === value;
}

export function checkPrintable(ast: SchemaAST): PrintFinding[] {
  const findings: PrintFinding[] = [];
  const defaults = new Map<string, boolean>();
  const variants = new Map<string, boolean>();

  const report = (
    id: string,
    kind: PrintFinding['kind'],
    declaration: string,
    module: string,
    detail: string,
    member?: string,
  ): void => {
    const entry = lossyCase(id);
    const where = member === undefined ? declaration : `${declaration}.${member}`;
    findings.push({
      id,
      kind,
      declaration,
      module,
      ...(member === undefined ? {} : { member }),
      message: `${entry.construct}: ${kind} '${where}' (${module}) ${detail}. ${entry.reason}`,
    });
  };

  const checkName = (
    kind: PrintFinding['kind'],
    declaration: string,
    module: string,
    name: string,
    member?: string,
    reserved = true,
  ): void => {
    if (!IDENTIFIER_PATTERN.test(name)) {
      report(
        'non-identifier-name',
        kind,
        declaration,
        module,
        `has the name ${JSON.stringify(name)}, which is not an identifier`,
        member,
      );

      return;
    }
    if (reserved && isReservedKeyword(name)) {
      report(
        'reserved-keyword-name',
        kind,
        declaration,
        module,
        `has the name '${name}', a SurrealDB reserved word`,
        member,
      );
    }
  };

  const checkDefault = (
    kind: PrintFinding['kind'],
    declaration: string,
    module: string,
    type: string,
    decorators: readonly ASTDecorator[] | undefined,
    member: string,
  ): void => {
    if (!QUOTED_TYPES.has(type)) return;
    for (const decorator of decorators ?? []) {
      if (!STRING_DEFAULTS.has(decorator.type) || typeof decorator.value !== 'string') continue;
      const key = `${decorator.type}\0${decorator.value}`;
      if (!defaults.has(key)) defaults.set(key, defaultSurvives(decorator));
      if (!defaults.get(key)) {
        report(
          'unprintable-default-string',
          kind,
          declaration,
          module,
          `has @${decorator.type}(${JSON.stringify(decorator.value)}), which the printer cannot spell`,
          member,
        );
      }
    }
  };

  const checkFields = (
    kind: 'model' | 'object',
    declaration: string,
    module: string,
    fields: readonly ASTField[],
  ): void => {
    for (const field of fields) {
      checkName(kind, declaration, module, field.name, field.name);
      for (const idType of field.recordIdTypes ?? []) {
        if (IDENTIFIER_PATTERN.test(idType)) continue;
        report(
          'non-identifier-id-type',
          kind,
          declaration,
          module,
          `has the id type ${JSON.stringify(idType)}, which is not an identifier`,
          field.name,
        );
      }
      checkDefault(kind, declaration, module, field.type, field.decorators, field.name);
    }
  };

  for (const model of ast.models) {
    checkName('model', model.name, model.origin.file, model.name);
    checkFields('model', model.name, model.origin.file, model.fields);
  }
  for (const object of ast.objects) {
    checkName('object', object.name, object.origin.file, object.name);
    checkFields('object', object.name, object.origin.file, object.fields);
  }
  for (const tuple of ast.tuples) {
    const module = tuple.origin.file;
    checkName('tuple', tuple.name, module, tuple.name);
    tuple.elements.forEach((element, index) => {
      const member = element.name ?? String(index);
      if (element.name !== undefined) checkName('tuple', tuple.name, module, element.name, member);
      checkDefault('tuple', tuple.name, module, element.type, element.decorators, member);
    });
  }
  for (const literal of ast.literals) {
    const module = literal.origin.file;
    checkName('literal', literal.name, module, literal.name, undefined, false);
    for (const variant of literal.variants) {
      if (variant.kind !== 'string') continue;
      if (!variants.has(variant.value)) variants.set(variant.value, variantSurvives(variant.value));
      if (!variants.get(variant.value)) {
        report(
          'unprintable-variant-string',
          'literal',
          literal.name,
          module,
          `has the variant ${JSON.stringify(variant.value)}, which the printer cannot spell`,
        );
      }
    }
  }
  for (const enumeration of ast.enums) {
    const module = enumeration.origin.file;
    checkName('enum', enumeration.name, module, enumeration.name);
    for (const value of enumeration.values) checkName('enum', enumeration.name, module, value, value, false);
  }

  return findings;
}
