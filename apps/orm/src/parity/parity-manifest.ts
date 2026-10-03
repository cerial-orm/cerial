/**
 * Parity manifest: one entry per construct the `.cerial` DSL can express.
 *
 * It is the single place a new construct is declared. Three things read it:
 * - the coverage test (`tests/generators/parity-manifest.test.ts`) requires every `corpus` entry
 *   to be exercised by a schema under `tests/e2e/schemas/`;
 * - `ast-cross-check.ts` makes widening an AST union a compile error until an entry exists;
 * - a second schema frontend is measured against the same list.
 *
 * Seeded from a 123-item inventory of the schema language's constructs. `items` holds the inventory
 * numbers an entry covers; some inventory items split into several entries (one per scalar type, per
 * extends kind), and `critic` marks entries the inventory never had.
 *
 * Ids are permanent. Never rename or renumber one: add a new entry and retire the old one in place.
 */

export type ConstructFamily =
  | 'declaration'
  | 'ast-fidelity'
  | 'scalar-type'
  | 'complex-type'
  | 'record-id-type'
  | 'array-form'
  | 'decorator'
  | 'composite-directive'
  | 'modifier'
  | 'literal-variant'
  | 'tuple-element'
  | 'extends'
  | 'validation'
  | 'config';

/**
 * `corpus`: visible in a parsed schema, so the coverage test can require a schema to exercise it.
 * `frontend`: a rule a schema frontend must honour that no parsed schema can show (AST fidelity,
 * rejections, config handling). Tracked here so the checklist stays whole, never probed.
 */
export type ConstructScope = 'corpus' | 'frontend';

export interface ConstructEntry {
  readonly id: string;
  readonly family: ConstructFamily;
  readonly scope: ConstructScope;
  /** Checklist numbers (1 to 123) this entry covers. Empty for entries the checklist lacked. */
  readonly items: readonly number[];
  readonly title: string;
  /** Critic verdict finding that added this entry. */
  readonly critic?: number;
}

const row = <const I extends string, const F extends ConstructFamily, const S extends ConstructScope>(
  id: I,
  family: F,
  scope: S,
  items: readonly number[],
  title: string,
  critic?: number,
) => ({ id, family, scope, items, title, ...(critic === undefined ? {} : { critic }) }) as const;

export const PARITY_MANIFEST = [
  // Top-level declarations (1-7)
  row('decl.model', 'declaration', 'corpus', [1], 'model block'),
  row('decl.abstract-model', 'declaration', 'corpus', [2], 'abstract model block'),
  row('decl.object', 'declaration', 'corpus', [3], 'object block'),
  row('decl.tuple', 'declaration', 'corpus', [4], 'tuple block'),
  row('decl.enum', 'declaration', 'corpus', [5], 'enum block'),
  row('decl.literal', 'declaration', 'corpus', [6], 'literal block'),
  row('decl.ast-assembly', 'declaration', 'frontend', [7], 'combined SchemaAST assembly with source ""'),

  // AST fidelity rules (8-21), none visible in a parsed schema
  row('fidelity.range.model', 'ast-fidelity', 'frontend', [8], 'SourceRange synthesis for ASTModel'),
  row('fidelity.range.object', 'ast-fidelity', 'frontend', [9], 'SourceRange synthesis for ASTObject'),
  row('fidelity.range.tuple', 'ast-fidelity', 'frontend', [10], 'SourceRange synthesis for ASTTuple'),
  row('fidelity.range.enum', 'ast-fidelity', 'frontend', [11], 'SourceRange synthesis for ASTEnum'),
  row('fidelity.range.literal', 'ast-fidelity', 'frontend', [12], 'SourceRange synthesis for ASTLiteral'),
  row('fidelity.range.field', 'ast-fidelity', 'frontend', [13], 'SourceRange synthesis for ASTField'),
  row('fidelity.range.decorator', 'ast-fidelity', 'frontend', [14], 'SourceRange synthesis for ASTDecorator'),
  row('fidelity.range.directive', 'ast-fidelity', 'frontend', [15], 'SourceRange synthesis for ASTCompositeDirective'),
  row(
    'fidelity.omit-falsy',
    'ast-fidelity',
    'frontend',
    [16],
    'optional AST keys omitted when falsy, via the factories',
  ),
  row(
    'fidelity.nullable-flag.field',
    'ast-fidelity',
    'frontend',
    [17],
    'ASTField.isNullable paired with a nullable decorator',
  ),
  row(
    'fidelity.nullable-flag.element',
    'ast-fidelity',
    'frontend',
    [18],
    'ASTTupleElement.isNullable paired with a nullable decorator',
  ),
  row(
    'fidelity.model-directives-present',
    'ast-fidelity',
    'frontend',
    [19],
    'ASTModel.directives always present, [] when empty',
  ),
  row(
    'fidelity.field-decorators-present',
    'ast-fidelity',
    'frontend',
    [20],
    'ASTField.decorators always present, [] when empty',
  ),
  row(
    'fidelity.literal-variant-shape',
    'ast-fidelity',
    'frontend',
    [21],
    'ASTLiteralVariant matches the union shapes exactly',
  ),
  row(
    'fidelity.element-decorators-omitted',
    'ast-fidelity',
    'frontend',
    [],
    'ASTTupleElement.decorators omitted when empty, unlike ASTField.decorators',
    13,
  ),

  // Scalar field types (22-34)
  row('type.string', 'scalar-type', 'corpus', [22], 'String'),
  row('type.email', 'scalar-type', 'corpus', [23], 'Email'),
  row('type.int', 'scalar-type', 'corpus', [24], 'Int'),
  row('type.float', 'scalar-type', 'corpus', [25], 'Float'),
  row('type.number', 'scalar-type', 'corpus', [26], 'Number'),
  row('type.bool', 'scalar-type', 'corpus', [27], 'Bool'),
  row('type.date', 'scalar-type', 'corpus', [28], 'Date'),
  row('type.uuid', 'scalar-type', 'corpus', [29], 'Uuid'),
  row('type.duration', 'scalar-type', 'corpus', [30], 'Duration'),
  row('type.decimal', 'scalar-type', 'corpus', [31], 'Decimal'),
  row('type.bytes', 'scalar-type', 'corpus', [32], 'Bytes'),
  row('type.geometry', 'scalar-type', 'corpus', [33], 'Geometry'),
  row('type.any', 'scalar-type', 'corpus', [34], 'Any'),

  // Record id types (35-38)
  row('recordid.untyped', 'record-id-type', 'corpus', [35], 'Record untyped'),
  row('recordid.int', 'record-id-type', 'corpus', [36], 'Record(int)'),
  row('recordid.number', 'record-id-type', 'corpus', [36], 'Record(number)'),
  row('recordid.string', 'record-id-type', 'corpus', [36], 'Record(string)'),
  row('recordid.uuid', 'record-id-type', 'corpus', [36], 'Record(uuid)'),
  row('recordid.union', 'record-id-type', 'corpus', [37], 'Record(T, U) union id types'),
  row('recordid.tuple', 'record-id-type', 'corpus', [38], 'Record(TupleName)'),
  row('recordid.object', 'record-id-type', 'corpus', [38], 'Record(ObjectName)'),
  row(
    'recordid.invalid-primitive-rejected',
    'record-id-type',
    'frontend',
    [],
    'Record(float|bool|date|email|...) is rejected; only int, number, string and uuid are valid primitive ids',
  ),

  // Complex field types (39-45)
  row('complex.record-array', 'complex-type', 'corpus', [39], 'Record[]'),
  row('complex.relation', 'complex-type', 'corpus', [40], 'Relation'),
  row('complex.relation-array', 'complex-type', 'corpus', [41], 'Relation[]'),
  row('ref.object', 'complex-type', 'corpus', [42], 'object-typed field by reference'),
  row('ref.tuple', 'complex-type', 'corpus', [43], 'tuple-typed field by reference'),
  row('ref.literal', 'complex-type', 'corpus', [44], 'literal-typed field by reference'),
  row('ref.enum', 'complex-type', 'corpus', [45], 'enum-typed field by reference, type literal plus literalName'),

  // Array form for every type above (46-47)
  row('array.string', 'array-form', 'corpus', [46], 'String[]'),
  row('array.email', 'array-form', 'corpus', [46], 'Email[]'),
  row('array.int', 'array-form', 'corpus', [46], 'Int[]'),
  row('array.float', 'array-form', 'corpus', [46], 'Float[]'),
  row('array.number', 'array-form', 'corpus', [46], 'Number[]'),
  row('array.bool', 'array-form', 'corpus', [46], 'Bool[]'),
  row('array.date', 'array-form', 'corpus', [46], 'Date[]'),
  row('array.uuid', 'array-form', 'corpus', [46], 'Uuid[]'),
  row('array.duration', 'array-form', 'corpus', [46], 'Duration[]'),
  row('array.decimal', 'array-form', 'corpus', [46], 'Decimal[]'),
  row('array.bytes', 'array-form', 'corpus', [46], 'Bytes[]'),
  row('array.geometry', 'array-form', 'corpus', [46], 'Geometry[]'),
  row('array.any', 'array-form', 'corpus', [46], 'Any[]'),
  row('array.object', 'array-form', 'corpus', [46], 'Object[]'),
  row('array.tuple', 'array-form', 'corpus', [46], 'Tuple[]'),
  row('array.literal', 'array-form', 'corpus', [46], 'Literal[]'),
  row('array.enum', 'array-form', 'corpus', [46], 'Enum[]'),
  row('array.optional-rejected', 'array-form', 'frontend', [47], 'Type[]? is not expressible and must be rejected'),

  // Decorators (48-75)
  row('decorator.id', 'decorator', 'corpus', [48], '@id'),
  row('decorator.unique', 'decorator', 'corpus', [49], '@unique'),
  row('decorator.index', 'decorator', 'corpus', [50], '@index'),
  row('decorator.now', 'decorator', 'corpus', [51], '@now'),
  row('decorator.createdAt', 'decorator', 'corpus', [52], '@createdAt'),
  row('decorator.updatedAt', 'decorator', 'corpus', [53], '@updatedAt'),
  row('decorator.default', 'decorator', 'corpus', [54], '@default(value)'),
  row('decorator.defaultAlways', 'decorator', 'corpus', [55], '@defaultAlways(value)'),
  row('decorator.field', 'decorator', 'corpus', [56], '@field(recordFieldName)'),
  row('decorator.model', 'decorator', 'corpus', [57], '@model(ModelName)'),
  row('decorator.onDelete', 'decorator', 'corpus', [58], '@onDelete(action), any action'),
  row('decorator.onDelete.Cascade', 'decorator', 'corpus', [58], '@onDelete(Cascade)'),
  row('decorator.onDelete.SetNull', 'decorator', 'corpus', [58], '@onDelete(SetNull)'),
  row('decorator.onDelete.SetNone', 'decorator', 'corpus', [58], '@onDelete(SetNone)'),
  row('decorator.onDelete.Restrict', 'decorator', 'corpus', [58], '@onDelete(Restrict)'),
  row('decorator.onDelete.NoAction', 'decorator', 'corpus', [58], '@onDelete(NoAction)'),
  row('decorator.key', 'decorator', 'corpus', [59], '@key(name)'),
  row('decorator.distinct', 'decorator', 'corpus', [60], '@distinct'),
  row('decorator.sort', 'decorator', 'corpus', [61], '@sort and @sort(true)'),
  row('decorator.sort.false', 'decorator', 'corpus', [61], '@sort(false)'),
  row('decorator.set', 'decorator', 'corpus', [62], '@set'),
  row('decorator.flexible', 'decorator', 'corpus', [63], '@flexible'),
  row('decorator.readonly', 'decorator', 'corpus', [64], '@readonly'),
  row('decorator.nullable', 'decorator', 'corpus', [65], '@nullable'),
  row('decorator.uuid', 'decorator', 'corpus', [66], '@uuid'),
  row('decorator.uuid4', 'decorator', 'corpus', [67], '@uuid4'),
  row('decorator.uuid7', 'decorator', 'corpus', [68], '@uuid7'),
  row('decorator.point', 'decorator', 'corpus', [69], '@point'),
  row('decorator.line', 'decorator', 'corpus', [70], '@line'),
  row('decorator.polygon', 'decorator', 'corpus', [71], '@polygon'),
  row('decorator.multipoint', 'decorator', 'corpus', [72], '@multipoint'),
  row('decorator.multiline', 'decorator', 'corpus', [73], '@multiline'),
  row('decorator.multipolygon', 'decorator', 'corpus', [74], '@multipolygon'),
  row('decorator.geoCollection', 'decorator', 'corpus', [75], '@geoCollection (parser spelling, not @collection)'),

  // Model-level composite directives (76-78); the cross-kind rows split by the kinds of field named
  row('directive.index', 'composite-directive', 'corpus', [76], '@@index(name, [fields])'),
  row('directive.unique', 'composite-directive', 'corpus', [77], '@@unique(name, [fields])'),
  row('directive.dot-notation', 'composite-directive', 'corpus', [78], 'dot notation field reference in a directive'),
  row('directive.index.primitive', 'composite-directive', 'corpus', [76], '@@index over primitive fields only'),
  row('directive.index.object', 'composite-directive', 'corpus', [76], '@@index over object sub-fields only'),
  row('directive.index.record', 'composite-directive', 'corpus', [76], '@@index over record fields only'),
  row(
    'directive.index.primitive+object',
    'composite-directive',
    'corpus',
    [76],
    '@@index mixing primitive and object sub-fields',
  ),
  row(
    'directive.index.primitive+record',
    'composite-directive',
    'corpus',
    [76],
    '@@index mixing primitive and record fields',
  ),
  row(
    'directive.index.object+record',
    'composite-directive',
    'corpus',
    [76],
    '@@index mixing object sub-fields and record fields',
  ),
  row('directive.unique.primitive', 'composite-directive', 'corpus', [77], '@@unique over primitive fields only'),
  row('directive.unique.object', 'composite-directive', 'corpus', [77], '@@unique over object sub-fields only'),
  row('directive.unique.record', 'composite-directive', 'corpus', [77], '@@unique over record fields only'),
  row(
    'directive.unique.primitive+object',
    'composite-directive',
    'corpus',
    [77],
    '@@unique mixing primitive and object sub-fields',
  ),
  row(
    'directive.unique.primitive+record',
    'composite-directive',
    'corpus',
    [77],
    '@@unique mixing primitive and record fields',
  ),
  row(
    'directive.unique.object+record',
    'composite-directive',
    'corpus',
    [77],
    '@@unique mixing object sub-fields and record fields',
  ),

  // Modifiers (79-84)
  row('modifier.optional.model-field', 'modifier', 'corpus', [79], '? on a model field'),
  row('modifier.optional.object-field', 'modifier', 'corpus', [80], '? on an object field'),
  row('modifier.private.model-field', 'modifier', 'corpus', [81], '!!private on a model field'),
  row('modifier.private.object-field', 'modifier', 'corpus', [82], '!!private on an object field'),
  row('modifier.private.tuple-element', 'modifier', 'corpus', [83], '!!private on a tuple element'),
  row('modifier.array', 'modifier', 'corpus', [84], 'array marker on any field'),

  // Literal variants (85-92)
  row('literal.variant.string', 'literal-variant', 'corpus', [85], 'string variant'),
  row('literal.variant.int', 'literal-variant', 'corpus', [86], 'int variant'),
  row('literal.variant.float', 'literal-variant', 'corpus', [87], 'float variant'),
  row('literal.variant.bool', 'literal-variant', 'corpus', [88], 'bool variant'),
  row('literal.variant.broadType', 'literal-variant', 'corpus', [89], 'broad type variant, any'),
  row('literal.broad.String', 'literal-variant', 'corpus', [89], 'broad type variant String'),
  row('literal.broad.Int', 'literal-variant', 'corpus', [89], 'broad type variant Int'),
  row('literal.broad.Float', 'literal-variant', 'corpus', [89], 'broad type variant Float'),
  row('literal.broad.Bool', 'literal-variant', 'corpus', [89], 'broad type variant Bool'),
  row('literal.broad.Date', 'literal-variant', 'corpus', [89], 'broad type variant Date'),
  row('literal.variant.tupleRef', 'literal-variant', 'corpus', [90], 'tupleRef variant'),
  row('literal.variant.objectRef', 'literal-variant', 'corpus', [91], 'objectRef variant'),
  row('literal.variant.literalRef', 'literal-variant', 'corpus', [92], 'literalRef variant'),
  row('literal.variant.literalRef.enum', 'literal-variant', 'corpus', [92], 'literalRef variant naming an enum'),

  // Tuple elements, plus the `?` rejection the inventory lacked
  row('tuple.element.positional', 'tuple-element', 'corpus', [93], 'positional unnamed element'),
  row('tuple.element.named', 'tuple-element', 'corpus', [94], 'named element'),
  row('tuple.element.nullable', 'tuple-element', 'corpus', [95], 'element @nullable'),
  row('tuple.element.default', 'tuple-element', 'corpus', [96], 'element @default(v)'),
  row('tuple.element.defaultAlways', 'tuple-element', 'corpus', [97], 'element @defaultAlways(v)'),
  row('tuple.element.createdAt', 'tuple-element', 'corpus', [98], 'element @createdAt'),
  row('tuple.element.updatedAt', 'tuple-element', 'corpus', [99], 'element @updatedAt'),
  row('tuple.element.nested', 'tuple-element', 'corpus', [100], 'nested tuple element'),
  row('tuple.element.object', 'tuple-element', 'corpus', [101], 'object element'),
  row('tuple.element.literal', 'tuple-element', 'corpus', [102], 'literal element'),
  row(
    'tuple.element.optional-rejected',
    'tuple-element',
    'frontend',
    [],
    '? on a tuple element is rejected; @nullable is the only way to make an element nullable',
    6,
  ),

  // Extends (103-112)
  row('extends.model', 'extends', 'corpus', [103], 'extends Parent for model'),
  row('extends.object', 'extends', 'corpus', [104], 'extends Parent for object'),
  row('extends.tuple', 'extends', 'corpus', [105], 'extends Parent for tuple'),
  row('extends.enum', 'extends', 'corpus', [106], 'extends Parent for enum'),
  row('extends.literal', 'extends', 'corpus', [107], 'extends Parent for literal'),
  row('extends.pick.model', 'extends', 'corpus', [108], 'pick filter on a model'),
  row('extends.pick.object', 'extends', 'corpus', [108], 'pick filter on an object'),
  row('extends.pick.tuple', 'extends', 'corpus', [108], 'pick filter on a tuple'),
  row('extends.pick.enum', 'extends', 'corpus', [108], 'pick filter on an enum'),
  row('extends.pick.literal', 'extends', 'corpus', [108], 'pick filter on a literal'),
  row('extends.omit.model', 'extends', 'corpus', [109], 'omit filter on a model'),
  row('extends.omit.object', 'extends', 'corpus', [109], 'omit filter on an object'),
  row('extends.omit.tuple', 'extends', 'corpus', [109], 'omit filter on a tuple'),
  row('extends.omit.enum', 'extends', 'corpus', [109], 'omit filter on an enum'),
  row('extends.omit.literal', 'extends', 'corpus', [109], 'omit filter on a literal'),
  row('extends.tuple.pick-index', 'extends', 'corpus', [110], 'tuple pick by numeric index'),
  row('extends.tuple.omit-index', 'extends', 'corpus', [110], 'tuple omit by numeric index'),
  row('extends.tuple.pick-name', 'extends', 'corpus', [], 'tuple pick by element name', 5),
  row('extends.tuple.omit-name', 'extends', 'corpus', [], 'tuple omit by element name', 5),
  row(
    'extends.literal.identity-quoted',
    'extends',
    'corpus',
    [111],
    'literal filter naming a string variant by its quoted form',
  ),
  row(
    'extends.literal.identity-bare',
    'extends',
    'corpus',
    [111],
    'literal filter naming an int, bool, broad type or ref variant bare',
  ),
  row('extends.mixed-rejected', 'extends', 'frontend', [112], 'mixed pick and omit in one clause is rejected'),
  row(
    'extends.chain.pick-then-omit',
    'extends',
    'corpus',
    [108, 109],
    'omit applied to a parent that is itself a pick',
  ),
  row(
    'extends.chain.omit-then-pick',
    'extends',
    'corpus',
    [108, 109],
    'pick applied to a parent that is itself an omit',
  ),

  // Validation (113-117)
  row(
    'validation.type-constraints',
    'validation',
    'frontend',
    [113],
    'every section 6 rule marked T encoded as a type constraint',
  ),
  row('validation.extends-raw-ast', 'validation', 'frontend', [114], 'validateExtends run on the raw AST'),
  row(
    'validation.resolved-types',
    'validation',
    'frontend',
    [115],
    'validateResolvedTypes run after resolveInheritance',
  ),
  row('validation.schema-resolved', 'validation', 'frontend', [116], 'validateSchema run on the resolved concrete AST'),
  row('validation.parser-validate-schema', 'validation', 'frontend', [117], 'decision on wiring parser validateSchema'),

  // Multi-file and config (118-123)
  row('config.discovery', 'config', 'frontend', [118], 'TypeScript schema module discovery grouped into entries'),
  row(
    'config.config-fields',
    'config',
    'frontend',
    [119],
    'CerialConfig, SchemaEntry and FolderConfig fields honoured',
  ),
  row('config.client-class-name', 'config', 'frontend', [120], 'clientClassName derived from the entry name'),
  row(
    'config.forward-references',
    'config',
    'frontend',
    [121],
    'cross-file references in any order, forward and circular',
  ),
  row('config.entry-boundary', 'config', 'frontend', [122], 'hard boundary between schema entries'),
  row('config.combined-ast-seam', 'config', 'frontend', [123], 'hand-off at the combinedAST seam'),
] as const;

export type ParityEntry = (typeof PARITY_MANIFEST)[number];
export type ConstructId = ParityEntry['id'];
export type CorpusConstructId = Extract<ParityEntry, { scope: 'corpus' }>['id'];
