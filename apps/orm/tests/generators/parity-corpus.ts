/**
 * Loads the e2e schema corpus and decides, per manifest entry, whether some schema exercises it.
 * A probe reads the parsed AST only, so it answers "does the corpus contain this construct".
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { CorpusConstructId, ParityEntry } from '../../src/parity';
import { PARITY_MANIFEST } from '../../src/parity';
import {
  collectEnumNames,
  collectLiteralNames,
  collectObjectNames,
  collectTupleNames,
  parse,
} from '../../src/parser/parser';
import type { ASTField, ASTModel, ASTTupleElement, SchemaAST } from '../../src/types';
import type { ASTCompositeDirective } from '../../src/types/parser.types';

export const SCHEMAS_DIR = join(import.meta.dir, '..', 'e2e', 'schemas');

export interface Corpus {
  readonly files: readonly string[];
  readonly errors: readonly string[];
  /** Each file's own parse, in `files` order; `ast` is these concatenated. */
  readonly parsed: readonly SchemaAST[];
  readonly ast: SchemaAST;
  readonly fields: readonly ASTField[];
  readonly elements: readonly ASTTupleElement[];
  readonly enumNames: ReadonlySet<string>;
  readonly literalNames: ReadonlySet<string>;
  readonly objectNames: ReadonlySet<string>;
  readonly tupleNames: ReadonlySet<string>;
}

/** Every file under `dir` ending in `suffix`, recursively, sorted; the one walk the corpus checks share. */
export function findSchemaFiles(dir: string, suffix: string = '.cerial'): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findSchemaFiles(path, suffix));
    else if (entry.name.endsWith(suffix)) found.push(path);
  }

  return found.sort();
}

/** Parses every schema the way `cli/generate.ts` does: names collected across all files first. */
export function loadCorpus(dir: string = SCHEMAS_DIR): Corpus {
  const paths = findSchemaFiles(dir);
  const sources = paths.map((path) => readFileSync(path, 'utf8'));
  const objectNames = new Set<string>();
  const tupleNames = new Set<string>();
  const literalNames = new Set<string>();
  const enumNames = new Set<string>();
  for (const source of sources) {
    for (const n of collectObjectNames(source)) objectNames.add(n);
    for (const n of collectTupleNames(source)) tupleNames.add(n);
    for (const n of collectLiteralNames(source)) literalNames.add(n);
    for (const n of collectEnumNames(source)) enumNames.add(n);
  }

  const ast: SchemaAST = { models: [], objects: [], tuples: [], literals: [], enums: [], source: '' };
  const errors: string[] = [];
  const parsed: SchemaAST[] = [];
  sources.forEach((source, i) => {
    const result = parse(source, objectNames, tupleNames, literalNames, enumNames);
    parsed.push(result.ast);
    for (const e of result.errors) errors.push(`${relative(dir, paths[i]!)}: ${e.message}`);
    ast.models.push(...result.ast.models);
    ast.objects.push(...result.ast.objects);
    ast.tuples.push(...result.ast.tuples);
    ast.literals.push(...result.ast.literals);
    ast.enums.push(...result.ast.enums);
  });

  return {
    files: paths.map((p) => relative(dir, p)),
    errors,
    parsed,
    ast,
    fields: [...ast.models.flatMap((m) => m.fields), ...ast.objects.flatMap((o) => o.fields)],
    elements: ast.tuples.flatMap((t) => t.elements),
    enumNames,
    literalNames,
    objectNames,
    tupleNames,
  };
}

type Probe = (c: Corpus) => boolean;

const hasType =
  (type: ASTField['type']): Probe =>
  (c) =>
    c.fields.some((f) => f.type === type && !f.isArray);

const hasArrayOf =
  (type: ASTField['type']): Probe =>
  (c) =>
    c.fields.some((f) => f.type === type && f.isArray);

const hasDecorator =
  (type: string, value?: unknown): Probe =>
  (c) => {
    const onFields = c.fields.some((f) =>
      f.decorators.some((d) => d.type === type && (value === undefined || d.value === value)),
    );
    const onElements = c.elements.some((e) =>
      e.decorators?.some((d) => d.type === type && (value === undefined || d.value === value)),
    );

    return onFields || onElements;
  };

const hasElementDecorator =
  (type: string): Probe =>
  (c) =>
    c.elements.some((e) => e.decorators?.some((d) => d.type === type));

const hasRecordId =
  (name: string): Probe =>
  (c) =>
    c.fields.some((f) => f.type === 'record' && f.recordIdTypes?.length === 1 && f.recordIdTypes[0] === name);

const hasVariant =
  (kind: string, extra?: (v: Record<string, unknown>) => boolean): Probe =>
  (c) =>
    c.ast.literals.some((l) =>
      l.variants.some((v) => v.kind === kind && (!extra || extra(v as Record<string, unknown>))),
    );

type ExtendsNode = { name: string; extends?: string; extendsFilter?: { mode: 'pick' | 'omit'; fields: string[] } };

const nodesOf = (c: Corpus, kind: 'model' | 'object' | 'tuple' | 'enum' | 'literal'): ExtendsNode[] =>
  kind === 'model'
    ? c.ast.models
    : kind === 'object'
      ? c.ast.objects
      : kind === 'tuple'
        ? c.ast.tuples
        : kind === 'enum'
          ? c.ast.enums
          : c.ast.literals;

const extendsKind =
  (kind: 'model' | 'object' | 'tuple' | 'enum' | 'literal'): Probe =>
  (c) =>
    nodesOf(c, kind).some((n) => n.extends !== undefined);

const filterKind =
  (kind: 'model' | 'object' | 'tuple' | 'enum' | 'literal', mode: 'pick' | 'omit'): Probe =>
  (c) =>
    nodesOf(c, kind).some((n) => n.extendsFilter?.mode === mode);

/** A child filtering `mode` whose parent is itself filtered with the opposite mode. */
const hasChain =
  (childMode: 'pick' | 'omit'): Probe =>
  (c) =>
    (['model', 'object', 'tuple', 'enum', 'literal'] as const).some((kind) => {
      const nodes = nodesOf(c, kind);

      return nodes.some((child) => {
        if (child.extendsFilter?.mode !== childMode) return false;
        const parent = nodes.find((n) => n.name === child.extends);

        return !!parent?.extendsFilter && parent.extendsFilter.mode !== childMode;
      });
    });

const tupleFilter =
  (mode: 'pick' | 'omit', byIndex: boolean): Probe =>
  (c) =>
    c.ast.tuples.some(
      (t) => t.extendsFilter?.mode === mode && t.extendsFilter.fields.some((f) => /^\d+$/.test(f) === byIndex),
    );

const literalFilter =
  (quoted: boolean): Probe =>
  (c) =>
    c.ast.literals.some((l) => l.extendsFilter?.fields.some((f) => /^["']/.test(f) === quoted));

type FieldKind = 'primitive' | 'object' | 'record';

/** Classifies each field a directive names, walking `extends` for inherited fields. */
function directiveKinds(c: Corpus, model: ASTModel, directive: ASTCompositeDirective): Set<FieldKind> {
  const kinds = new Set<FieldKind>();
  for (const ref of directive.fields) {
    let owner: ASTModel | undefined = model;
    let field: ASTField | undefined;
    while (owner && !field) {
      field = owner.fields.find((f) => f.name === ref.split('.')[0]);
      const parentName: string | undefined = owner.extends;
      owner = parentName ? c.ast.models.find((m) => m.name === parentName) : undefined;
    }

    if (ref.includes('.') || field?.type === 'object') kinds.add('object');
    else if (field?.type === 'record') kinds.add('record');
    else if (field) kinds.add('primitive');
  }

  return kinds;
}

const directive =
  (kind: 'index' | 'unique', shape?: readonly FieldKind[]): Probe =>
  (c) =>
    c.ast.models.some((m) =>
      (m.directives ?? []).some((d) => {
        if (d.kind !== kind) return false;
        if (!shape) return true;
        const kinds = directiveKinds(c, m, d);

        return kinds.size === shape.length && shape.every((k) => kinds.has(k));
      }),
    );

const isEnumRef = (c: Corpus, f: ASTField): boolean =>
  f.type === 'literal' && !!f.literalName && c.enumNames.has(f.literalName);

const PROBES = {
  'decl.model': (c) => c.ast.models.some((m) => !m.abstract),
  'decl.abstract-model': (c) => c.ast.models.some((m) => m.abstract),
  'decl.object': (c) => c.ast.objects.length > 0,
  'decl.tuple': (c) => c.ast.tuples.length > 0,
  'decl.enum': (c) => c.ast.enums.length > 0,
  'decl.literal': (c) => c.ast.literals.length > 0,

  'type.string': hasType('string'),
  'type.email': hasType('email'),
  'type.int': hasType('int'),
  'type.float': hasType('float'),
  'type.number': hasType('number'),
  'type.bool': hasType('bool'),
  'type.date': hasType('date'),
  'type.uuid': hasType('uuid'),
  'type.duration': hasType('duration'),
  'type.decimal': hasType('decimal'),
  'type.bytes': hasType('bytes'),
  'type.geometry': hasType('geometry'),
  'type.any': hasType('any'),
  'type.int8': hasType('int8'),
  'type.uint8': hasType('uint8'),
  'type.int16': hasType('int16'),
  'type.uint16': hasType('uint16'),
  'type.int32': hasType('int32'),
  'type.uint32': hasType('uint32'),
  'type.uint64': hasType('uint64'),
  'type.float16': hasType('float16'),
  'type.float32': hasType('float32'),

  'recordid.untyped': (c) => c.fields.some((f) => f.type === 'record' && !f.isArray && !f.recordIdTypes),
  'recordid.int': hasRecordId('int'),
  'recordid.number': hasRecordId('number'),
  'recordid.string': hasRecordId('string'),
  'recordid.uuid': hasRecordId('uuid'),
  'recordid.union': (c) => c.fields.some((f) => f.type === 'record' && (f.recordIdTypes?.length ?? 0) > 1),
  'recordid.tuple': (c) =>
    c.fields.some((f) => f.type === 'record' && f.recordIdTypes?.some((t) => c.tupleNames.has(t))),
  'recordid.object': (c) =>
    c.fields.some((f) => f.type === 'record' && f.recordIdTypes?.some((t) => c.objectNames.has(t))),

  'complex.record-array': hasArrayOf('record'),
  'complex.relation': hasType('relation'),
  'complex.relation-array': hasArrayOf('relation'),
  'ref.object': hasType('object'),
  'ref.tuple': hasType('tuple'),
  'ref.literal': (c) => c.fields.some((f) => f.type === 'literal' && !f.isArray && !isEnumRef(c, f)),
  'ref.enum': (c) => c.fields.some((f) => !f.isArray && isEnumRef(c, f)),

  'array.string': hasArrayOf('string'),
  'array.email': hasArrayOf('email'),
  'array.int': hasArrayOf('int'),
  'array.float': hasArrayOf('float'),
  'array.number': hasArrayOf('number'),
  'array.bool': hasArrayOf('bool'),
  'array.date': hasArrayOf('date'),
  'array.uuid': hasArrayOf('uuid'),
  'array.duration': hasArrayOf('duration'),
  'array.decimal': hasArrayOf('decimal'),
  'array.bytes': hasArrayOf('bytes'),
  'array.geometry': hasArrayOf('geometry'),
  'array.any': hasArrayOf('any'),
  'array.object': hasArrayOf('object'),
  'array.tuple': hasArrayOf('tuple'),
  'array.literal': (c) => c.fields.some((f) => f.isArray && f.type === 'literal' && !isEnumRef(c, f)),
  'array.enum': (c) => c.fields.some((f) => f.isArray && isEnumRef(c, f)),

  'decorator.id': hasDecorator('id'),
  'decorator.unique': hasDecorator('unique'),
  'decorator.index': hasDecorator('index'),
  'decorator.now': hasDecorator('now'),
  'decorator.createdAt': hasDecorator('createdAt'),
  'decorator.updatedAt': hasDecorator('updatedAt'),
  'decorator.default': hasDecorator('default'),
  'decorator.defaultAlways': hasDecorator('defaultAlways'),
  'decorator.field': hasDecorator('field'),
  'decorator.model': hasDecorator('model'),
  'decorator.onDelete': hasDecorator('onDelete'),
  'decorator.onDelete.Cascade': hasDecorator('onDelete', 'Cascade'),
  'decorator.onDelete.SetNull': hasDecorator('onDelete', 'SetNull'),
  'decorator.onDelete.SetNone': hasDecorator('onDelete', 'SetNone'),
  'decorator.onDelete.Restrict': hasDecorator('onDelete', 'Restrict'),
  'decorator.onDelete.NoAction': hasDecorator('onDelete', 'NoAction'),
  'decorator.key': hasDecorator('key'),
  'decorator.distinct': hasDecorator('distinct'),
  'decorator.sort': hasDecorator('sort', true),
  'decorator.sort.false': hasDecorator('sort', false),
  'decorator.set': hasDecorator('set'),
  'decorator.flexible': hasDecorator('flexible'),
  'decorator.readonly': hasDecorator('readonly'),
  'decorator.nullable': hasDecorator('nullable'),
  'decorator.uuid': hasDecorator('uuid'),
  'decorator.uuid4': hasDecorator('uuid4'),
  'decorator.uuid7': hasDecorator('uuid7'),
  'decorator.point': hasDecorator('point'),
  'decorator.line': hasDecorator('line'),
  'decorator.polygon': hasDecorator('polygon'),
  'decorator.multipoint': hasDecorator('multipoint'),
  'decorator.multiline': hasDecorator('multiline'),
  'decorator.multipolygon': hasDecorator('multipolygon'),
  'decorator.geoCollection': hasDecorator('geoCollection'),

  'directive.index': directive('index'),
  'directive.unique': directive('unique'),
  'directive.dot-notation': (c) =>
    c.ast.models.some((m) => m.directives?.some((d) => d.fields.some((f) => f.includes('.')))),
  'directive.index.primitive': directive('index', ['primitive']),
  'directive.index.object': directive('index', ['object']),
  'directive.index.record': directive('index', ['record']),
  'directive.index.primitive+object': directive('index', ['primitive', 'object']),
  'directive.index.primitive+record': directive('index', ['primitive', 'record']),
  'directive.index.object+record': directive('index', ['object', 'record']),
  'directive.unique.primitive': directive('unique', ['primitive']),
  'directive.unique.object': directive('unique', ['object']),
  'directive.unique.record': directive('unique', ['record']),
  'directive.unique.primitive+object': directive('unique', ['primitive', 'object']),
  'directive.unique.primitive+record': directive('unique', ['primitive', 'record']),
  'directive.unique.object+record': directive('unique', ['object', 'record']),

  'modifier.optional.model-field': (c) => c.ast.models.some((m) => m.fields.some((f) => f.isOptional)),
  'modifier.optional.object-field': (c) => c.ast.objects.some((o) => o.fields.some((f) => f.isOptional)),
  'modifier.private.model-field': (c) => c.ast.models.some((m) => m.fields.some((f) => f.isPrivate)),
  'modifier.private.object-field': (c) => c.ast.objects.some((o) => o.fields.some((f) => f.isPrivate)),
  'modifier.private.tuple-element': (c) => c.elements.some((e) => e.isPrivate),
  'modifier.array': (c) => c.fields.some((f) => f.isArray),

  'literal.variant.string': hasVariant('string'),
  'literal.variant.int': hasVariant('int'),
  'literal.variant.float': hasVariant('float'),
  'literal.variant.bool': hasVariant('bool'),
  'literal.variant.broadType': hasVariant('broadType'),
  'literal.broad.String': hasVariant('broadType', (v) => v.typeName === 'String'),
  'literal.broad.Int': hasVariant('broadType', (v) => v.typeName === 'Int'),
  'literal.broad.Float': hasVariant('broadType', (v) => v.typeName === 'Float'),
  'literal.broad.Bool': hasVariant('broadType', (v) => v.typeName === 'Bool'),
  'literal.broad.Date': hasVariant('broadType', (v) => v.typeName === 'Date'),
  'literal.variant.tupleRef': hasVariant('tupleRef'),
  'literal.variant.objectRef': hasVariant('objectRef'),
  'literal.variant.literalRef': hasVariant('literalRef'),
  'literal.variant.literalRef.enum': (c) =>
    c.ast.literals.some((l) => l.variants.some((v) => v.kind === 'literalRef' && c.enumNames.has(v.literalName))),

  'tuple.element.positional': (c) => c.elements.some((e) => !e.name),
  'tuple.element.named': (c) => c.elements.some((e) => !!e.name),
  'tuple.element.nullable': (c) => c.elements.some((e) => e.isNullable),
  'tuple.element.default': hasElementDecorator('default'),
  'tuple.element.defaultAlways': hasElementDecorator('defaultAlways'),
  'tuple.element.createdAt': hasElementDecorator('createdAt'),
  'tuple.element.updatedAt': hasElementDecorator('updatedAt'),
  'tuple.element.nested': (c) => c.elements.some((e) => e.type === 'tuple'),
  'tuple.element.object': (c) => c.elements.some((e) => e.type === 'object'),
  'tuple.element.literal': (c) => c.elements.some((e) => e.type === 'literal'),

  'extends.model': extendsKind('model'),
  'extends.object': extendsKind('object'),
  'extends.tuple': extendsKind('tuple'),
  'extends.enum': extendsKind('enum'),
  'extends.literal': extendsKind('literal'),
  'extends.pick.model': filterKind('model', 'pick'),
  'extends.pick.object': filterKind('object', 'pick'),
  'extends.pick.tuple': filterKind('tuple', 'pick'),
  'extends.pick.enum': filterKind('enum', 'pick'),
  'extends.pick.literal': filterKind('literal', 'pick'),
  'extends.omit.model': filterKind('model', 'omit'),
  'extends.omit.object': filterKind('object', 'omit'),
  'extends.omit.tuple': filterKind('tuple', 'omit'),
  'extends.omit.enum': filterKind('enum', 'omit'),
  'extends.omit.literal': filterKind('literal', 'omit'),
  'extends.tuple.pick-index': tupleFilter('pick', true),
  'extends.tuple.omit-index': tupleFilter('omit', true),
  'extends.tuple.pick-name': tupleFilter('pick', false),
  'extends.tuple.omit-name': tupleFilter('omit', false),
  'extends.literal.identity-quoted': literalFilter(true),
  'extends.literal.identity-bare': literalFilter(false),
  'extends.chain.pick-then-omit': hasChain('omit'),
  'extends.chain.omit-then-pick': hasChain('pick'),
} as const satisfies Record<CorpusConstructId, Probe>;

export interface Gap {
  readonly id: ParityEntry['id'];
  readonly family: ParityEntry['family'];
  readonly title: string;
  readonly items: readonly number[];
}

/** Every corpus-scoped manifest entry that no schema in the corpus exercises, in manifest order. */
export function computeGaps(corpus: Corpus): Gap[] {
  return PARITY_MANIFEST.filter((e) => e.scope === 'corpus')
    .filter((e) => !PROBES[e.id as CorpusConstructId](corpus))
    .map((e) => ({ id: e.id, family: e.family, title: e.title, items: e.items }));
}

/** Multi-line, grouped by family, for failure messages and the run log. */
export function formatGaps(gaps: readonly Gap[]): string {
  const byFamily = new Map<string, Gap[]>();
  for (const g of gaps) byFamily.set(g.family, [...(byFamily.get(g.family) ?? []), g]);

  return [...byFamily]
    .map(([family, list]) => `  ${family}\n${list.map((g) => `    ${g.id}  (${g.title})`).join('\n')}`)
    .join('\n');
}
