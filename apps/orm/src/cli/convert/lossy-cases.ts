export type LossyAction = 'refuse' | 'expand';
export type LossyDirection = 'to-cerial' | 'to-ts' | 'both';

export interface LossyCase {
  readonly id: string;
  readonly construct: string;
  readonly direction: LossyDirection;
  /** `refuse` stops the conversion for the construct; `expand` converts it and loses only what the target cannot say. */
  readonly action: LossyAction;
  readonly reason: string;
  /** The comment written above the converted output, or null when the output carries none. */
  readonly comment: string | null;
  /** A sentence `--help` carries for a case that writes no comment, so the loss is stated where a user looks first. */
  readonly notice?: string;
}

/** The comment `--to cerial` writes above a key the TypeScript side derived; `--to ts` reads it back as the marker. */
export function derivedKeyComment(relationName: string): string {
  return `// derived by cerial convert from the TypeScript relation '${relationName}': the key was not declared there`;
}

/** Every construct whose conversion is not a plain copy. Refusal messages, `--help` and the docs check read this table. */
export const LOSSY_CASES: readonly LossyCase[] = [
  {
    id: 'loop-built-model',
    construct:
      'Models built in a loop: `export const [A, B, C] = names.map((n) => model(n, ...))` or a `for` filling exported bindings',
    direction: 'to-cerial',
    action: 'expand',
    reason:
      'The schema holds every model and the DSL can say all of them; only the loop is gone, so the output is longer than the input.',
    comment: '// expanded by cerial convert: built by a loop in TypeScript; this copy no longer follows it',
  },
  {
    id: 'helper-built-declaration',
    construct:
      "A declaration bound to a call of a function that is not the builder: `export const User = makeModel('User')`, in the same file or another project file",
    direction: 'to-cerial',
    action: 'expand',
    reason:
      'Structure produced by a project function is in the schema; the function and its parameters have no DSL form, and its body is scanned by the value rules.',
    comment:
      "// expanded by cerial convert: built by the function '<callee>' in TypeScript; this copy no longer follows it",
  },
  {
    id: 'shared-field-set',
    construct:
      "Fields reused inside the project: `{ ...timestamps, name: f.string() }`, a field builder held in a variable, a partial chain such as `const base = f.string().default('x')` then `base.optional()`, a computed key `{ [k]: ... }`",
    direction: 'to-cerial',
    action: 'expand',
    reason:
      'The schema holds each field; the sharing is lost and the DSL repeats the fields, which is harmless once the shared source is itself a literal builder chain, checked by following the binding.',
    comment: "// expanded by cerial convert: fields shared in TypeScript ('<name>'); this copy no longer follows them",
  },
  {
    id: 'npm-field-set',
    construct:
      'A field set, field builder or declaration helper imported from an installed package and spread or called in a model',
    direction: 'to-cerial',
    action: 'refuse',
    reason:
      'The scan skips node_modules, so it cannot prove the package holds no computed value, and an expansion would freeze it and silently end the sharing. Inline the fields or use --partial.',
    comment: null,
  },
  {
    id: 'conditional-structure',
    construct:
      'A choice made at conversion time: `cond ? model(...) : model(...)`, `a && f.string()`, `a ?? b`, an `if` or `switch` inside a helper that adds or drops a field',
    direction: 'to-cerial',
    action: 'refuse',
    reason:
      'The schema holds only the branch taken in this environment and the other branch is lost, so the output depends on state at conversion time; a loop keeps every member, a branch does not.',
    comment: null,
  },
  {
    id: 'computed-value',
    construct:
      'A non-literal argument in a value position: `.default(compute())`, `.default(CONFIG.x)`, `.default(Date.now())`, a template string with a substitution, `.defaultAlways`, a tuple element default, `variant.*(x)`, `.sort(x)`, `.onDelete(x)`, in any module of the graph including loop and helper bodies',
    direction: 'to-cerial',
    action: 'refuse',
    reason:
      'The schema holds only the value it evaluated to, so expansion would hand the user a frozen literal that looks hand-written. There is no override flag and --force does not bypass it.',
    comment: null,
  },
  {
    id: 'literal-constant-argument',
    construct:
      "A value position given an identifier bound, in the same file, to a `const` whose initialiser is only literals (`.default(LIMIT)`, `enum('Role', ROLES)` with `const ROLES = ['a', 'b'] as const`)",
    direction: 'to-cerial',
    action: 'expand',
    reason:
      'Nothing is derived: the constant is a named literal and the schema value equals it, so only the constant name is lost; an imported or non-literal constant stays under computed-value.',
    comment: null,
  },
  {
    id: 'derived-foreign-key',
    construct:
      "The key of a forward `f.relation(...)` declared only as a relation, including an array relation (`tagIds`), `onDelete('SetNull')` (nullable key), `onDelete('SetNone')` (optional key) and `.field('name')` naming a new key",
    direction: 'to-cerial',
    action: 'expand',
    reason:
      'Always expanded, never refused: the TypeScript side declares one field and the DSL needs two (`Record` plus `Relation @field(...)`). The `Record` field is already in the schema, so the output is complete; what is lost is the fact that the key was derived.',
    comment: derivedKeyComment('<name>'),
  },
  {
    id: 'inherited-derived-key',
    construct: 'A derived key on a parent model that a child reaches through `extends`',
    direction: 'to-cerial',
    action: 'expand',
    reason:
      "The parent derived the key, so the parent's `.cerial` carries it; the child prints only `extends` and no key.",
    comment: 'The derived-foreign-key comment, on the parent key only; none on the child.',
  },
  {
    id: 'bound-or-reverse-relation',
    construct: "`.field('declared')` binding to a field the model declares or inherits, and `f.reverse(...)`",
    direction: 'to-cerial',
    action: 'expand',
    reason: 'No loss: a bound key is the declared field and a reverse side stores nothing, so nothing is synthesised.',
    comment: null,
  },
  {
    id: 'typescript-comments',
    construct: 'Comments in a TypeScript module',
    direction: 'to-cerial',
    action: 'expand',
    reason:
      'The builder supplies no attachments and the schema has no comment text, so the comments are dropped; --help and the run summary say so rather than leaving a user to find out.',
    comment: null,
  },
  {
    id: 'cerial-comments',
    construct: 'Comments in a `.cerial` file',
    direction: 'to-ts',
    action: 'expand',
    reason:
      'Comments in `#`, `//` and `/* */` form are carried through the emitter and print as `//`, with U+2028 and U+2029 split so a comment cannot end early and run as code.',
    comment: null,
  },
  {
    id: 'layout-not-preserved',
    construct: 'Blank lines, alignment and comment style of the source',
    direction: 'both',
    action: 'expand',
    reason:
      'The first pass compares schemas and the second compares bytes against the first, so layout may differ legitimately from the source.',
    comment: null,
  },
  {
    id: 'export-name-differs',
    construct:
      "`export const UserModel = model('User')`: the `.cerial` keeps `User`; the binding `UserModel`, which importers use, has no DSL form",
    direction: 'to-cerial',
    action: 'expand',
    reason:
      'The DSL names declarations, not bindings, so importers of `UserModel` break once the source is removed; conversion never edits them. The run report lists each rename.',
    comment: null,
    notice:
      'A binding whose name differs from its declaration (`UserModel` for `User`, `default`, an alias) has no .cerial form: the run warns with each `binding -> declaration`, and importers of the binding break once the TypeScript module is removed.',
  },
  {
    id: 'default-export',
    construct: "`export default model('User', ...)`, exported as `default`",
    direction: 'to-cerial',
    action: 'expand',
    reason:
      "The declaration's name is the first argument, so `default` is only a binding and is dropped as in export-name-differs. The run report lists the rename.",
    comment: null,
  },
  {
    id: 'multi-name-export',
    construct: 'One handle exported under several names, or re-exported under an alias',
    direction: 'to-cerial',
    action: 'expand',
    reason:
      'It is treated as one declaration at the smallest (module, export) place; the extra bindings are dropped and the run report lists them.',
    comment: null,
  },
  {
    id: 'barrel-reexport',
    construct: 'A declaration re-exported through a barrel module',
    direction: 'to-cerial',
    action: 'expand',
    reason:
      'It lands in the module that declared it; `.cerial` references are by name within the entry, so only the layout differs.',
    comment: null,
  },
  {
    id: 'schema-import-alias',
    construct:
      "The builder reached through an alias or a project re-export: `import { f as fields }`, `import * as s from 'cerial/schema'`, `export { model } from 'cerial/schema'` in a project barrel",
    direction: 'to-cerial',
    action: 'expand',
    reason:
      'No loss: the scan follows aliases and project re-exports of `cerial/schema` names to the same builder, and a wrapper around them falls under helper-built-declaration.',
    comment: null,
  },
  {
    id: 'reference-form',
    construct: 'A reference written as a handle, a thunk, a bare string or a handle from `cerial/handles.ts`',
    direction: 'to-cerial',
    action: 'expand',
    reason:
      "All four reduce to the declaration's name and the DSL has one form; the bare string and the handle stay available for the other direction.",
    comment: null,
  },
  {
    id: 'pick-omit-extends',
    construct: '`Parent.pick(...)` and `Parent.omit(...)` in `extends`, chained',
    direction: 'to-cerial',
    action: 'expand',
    reason:
      'No loss: they print as `extends Parent[a, b]` and `extends Parent[!a]`, the form the DSL has, read before inheritance resolves.',
    comment: null,
  },
  {
    id: 'define-schema-registration',
    construct: '`defineSchema({ models: [...] })`, its list, and a model exported but not listed',
    direction: 'to-cerial',
    action: 'expand',
    reason:
      'Registration is not schema content: harvesting follows exports, so a listed and an unlisted export both convert, and a `.cerial` entry is registered by the config path instead. The report prints the line to change.',
    comment: null,
  },
  {
    id: 'non-schema-code',
    construct: 'Anything else in a module: helpers, a controller, other exports, `console.log`, side effects',
    direction: 'to-cerial',
    action: 'expand',
    reason:
      'The schema holds no trace of it; only the declarations convert, and --remove-source keeps such a module. --help and the report say it is not converted.',
    comment: null,
    notice:
      'Only declarations are converted: other exports, helpers and code in a module are not, and the report names each module that holds any.',
  },
  {
    id: 'module-fails-to-load',
    construct:
      'A module that throws on import, or a handle from `cerial/handles.ts` naming a declaration the `.cerial` no longer has',
    direction: 'to-cerial',
    action: 'refuse',
    reason:
      'Importing executes user code as `generate` does; a failure leaves no schema for that module, so it is reported with its path and nothing is written.',
    comment: null,
  },
  {
    id: 'reassigned-export',
    construct: '`export let X; X = model(...)`, or any export bound without a single initialiser',
    direction: 'to-cerial',
    action: 'refuse',
    reason:
      "The allowlist reads an export's initialiser and a reassigned binding has none to read, so the declaration cannot be classified.",
    comment: null,
  },
  {
    id: 'unexported-declaration',
    construct: 'A declaration that is not exported but is referenced by an exported one, by handle or by `extends`',
    direction: 'to-cerial',
    action: 'refuse',
    reason:
      'It is never harvested, so the schema lacks it; the pipeline validators refuse the reference (`references non-existent model`) and the run reports it.',
    comment: null,
  },
  {
    id: 'duplicate-declaration-name',
    construct: "Two declarations with one name, in one form or across a mixed entry's `.cerial` and TypeScript",
    direction: 'both',
    action: 'refuse',
    reason: 'Both are kept on purpose and validation reports `Duplicate model name`; --force does not get past it.',
    comment: null,
  },
  {
    id: 'non-identifier-name',
    construct:
      "A declaration, field, foreign key, element or enum value that is not an identifier, such as `model('a b')`",
    direction: 'to-cerial',
    action: 'refuse',
    reason:
      'The builder refuses these at declaration, so the module fails to load and is reported under module-fails-to-load with the builder message. A schema that still carries one is refused here by name, because it would print as a different schema.',
    comment: null,
  },
  {
    id: 'non-identifier-id-type',
    construct: "A bare id type name that is not an identifier: `f.record('a b')`",
    direction: 'to-cerial',
    action: 'refuse',
    reason:
      'It prints as `Record(a b)` with no parse error and reparses as `ab`, a silent wrong schema; it is refused by name before the print-and-reparse gate would.',
    comment: null,
  },
  {
    id: 'reserved-keyword-name',
    construct:
      "A declaration, field or element name in the SurrealDB reserved keyword set, such as `model('select')` or a field `value`",
    direction: 'to-cerial',
    action: 'refuse',
    reason:
      'The builder accepts it and it round-trips, but schema validation refuses it (`Reserved keyword`) and `generate` would refuse the output. Checked through the validator set, never a copy.',
    comment: null,
  },
  {
    id: 'string-with-both-quotes',
    construct: 'A string holding both quote kinds, as a default: `it\'s "x"`',
    direction: 'to-cerial',
    action: 'expand',
    reason:
      'Measured: it prints as `"it\'s "x""` and the parse reads back an equal schema, as do the other quote placements tried; nothing is lost.',
    comment: null,
  },
  {
    id: 'unprintable-default-string',
    construct:
      'A `@default` or `@defaultAlways` string that does not reparse equal; measured: any `)`, any `//`, U+2028, and a leading quote with trailing whitespace. A newline is already refused by the builder',
    direction: 'to-cerial',
    action: 'refuse',
    reason:
      'The DSL has no escape, so no spelling exists: `a ) b` reparses as `a` and `a // b` loses its value. Every string value is printed and reparsed rather than matched against this class list.',
    comment: null,
  },
  {
    id: 'unprintable-variant-string',
    construct:
      'A `variant.string` value that does not reparse equal; measured: a comma, CR or LF, and a quote followed by `#`',
    direction: 'to-cerial',
    action: 'refuse',
    reason:
      'A comma splits into two variants and a line break becomes a space; the builder accepts both and the DSL has no escape.',
    comment: null,
  },
  {
    id: 'ast-mismatch',
    construct: 'Anything not listed whose output reparses to a different schema',
    direction: 'both',
    action: 'refuse',
    reason:
      'The print-and-reparse gate is the backstop: a shape nobody listed still fails and is named by declaration and path instead of being written.',
    comment: null,
  },
  {
    id: 'invalid-source',
    construct: 'A `.cerial` that fails to parse or whose `extends` does not resolve',
    direction: 'to-ts',
    action: 'refuse',
    reason: 'Parse errors and extends errors refuse before any conversion, so there is no schema to convert.',
    comment: null,
  },
  {
    id: 'unknown-construct',
    construct: 'A parsed construct with no builder method',
    direction: 'to-ts',
    action: 'refuse',
    reason:
      'The builder method table is meant to be exhaustive, so a gap is a defect that fails loudly by name instead of emitting a guess.',
    comment: null,
  },
  {
    id: 'declared-foreign-key-to-ts',
    construct:
      "A `.cerial` key without convert's own derived comment, including one the builder could derive from its relation",
    direction: 'to-ts',
    action: 'expand',
    reason:
      'The key is emitted as a declared field and `.field(name)` binds to it, which keeps the schema equal. The derived form is used only for a key carrying the derived comment that `--to cerial` writes, so a second pass in either direction is byte-identical; the comment itself is not kept in the TypeScript.',
    comment: null,
  },
  {
    id: 'extends-parent-after-child',
    construct: 'A `.cerial` parent declared after its child, in one file',
    direction: 'to-ts',
    action: 'expand',
    reason:
      '`extends` takes a handle eagerly, so the parent is hoisted above the child, and verification tolerates that order for those names alone. The report names the hoisted declarations.',
    comment: null,
  },
  {
    id: 'extends-cross-file-cycle',
    construct: 'A cycle made purely of `extends` across files',
    direction: 'to-ts',
    action: 'refuse',
    reason:
      'No order of eager `const`s loads and no thunk form exists; refused by name, one record per child declaration.',
    comment: null,
  },
  {
    id: 'extends-thunk-back-edge',
    construct: 'A cycle of one `extends` and a relation or reference back to the child',
    direction: 'to-ts',
    action: 'expand',
    reason:
      'The back-edge is emitted as a bare string, a form the builder keeps for cyclic graphs, which breaks the import cycle.',
    comment: null,
  },
  {
    id: 'alternating-directives',
    construct: '`@@index` and `@@unique` interleaved on one model, which a builder option object cannot order',
    direction: 'to-ts',
    action: 'expand',
    reason:
      'Grouped by kind with a warning naming the model; only the order of that model index statements changes. The opposite direction has no loss.',
    comment: null,
  },
  {
    id: 'reserved-word-binding',
    construct:
      'A declaration named like a builder import (`f`, `model`). A reserved word such as `class` is refused by the generated-name rule',
    direction: 'to-ts',
    action: 'expand',
    reason:
      'A safe binding is emitted with an aliased export and the real name in the first argument, so the `.cerial` name survives.',
    comment: null,
  },
  {
    id: 'proto-field-key',
    construct:
      'A field or tuple element named like an `Object.prototype` member (`__proto__`, `constructor`, `toString`, `valueOf`) or `prototype`',
    direction: 'to-ts',
    action: 'refuse',
    reason:
      'The generated-name rule refuses these names for every kind of name, so the emitted module fails to load and nothing is written.',
    comment: null,
  },
];

const BY_ID: ReadonlyMap<string, LossyCase> = new Map(LOSSY_CASES.map((entry) => [entry.id, entry]));

export function lossyCase(id: string): LossyCase {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown lossy case '${id}'`);

  return found;
}
