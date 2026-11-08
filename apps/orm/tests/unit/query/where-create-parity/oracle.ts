/**
 * The oracle: create decides what a value is; where must agree. For one slot, operator and path it asks
 * both, compares the verdicts, and compares the bound value with what create converted.
 */

import { Decimal, Duration, Geometry, RecordId, StringRecordId, Uuid } from 'surrealdb';
import { CerialValidationError } from '../../../../src/errors';
import { buildFindManyQuery } from '../../../../src/query/builders';
import { createCompileContext } from '../../../../src/query/compile/var-allocator';
import { buildConditions } from '../../../../src/query/filters/condition-builder';
import { transformData } from '../../../../src/query/transformers';
import { validateCreateData, validateWhere } from '../../../../src/query/validators';
import type { WhereClause } from '../../../../src/types';
import { model, registry } from './schema';
import { createData, type Quantifier, type Slot, unitIn, whereAt } from './slots';

/** The shape each registered operator takes its operand in: the harness's own table, checked for exhaustiveness */
export type Shape = 'value' | 'valueList' | 'element' | 'elementList' | 'pair' | 'text' | 'flag';

export const OPERATOR_SHAPES: Record<string, Shape> = {
  eq: 'value',
  neq: 'value',
  not: 'value',
  gt: 'value',
  gte: 'value',
  lt: 'value',
  lte: 'value',
  contains: 'text',
  startsWith: 'text',
  endsWith: 'text',
  in: 'valueList',
  notIn: 'valueList',
  has: 'element',
  hasAll: 'elementList',
  hasAny: 'elementList',
  isEmpty: 'flag',
  isNull: 'flag',
  isDefined: 'flag',
  between: 'pair',
  isNone: 'flag',
};

/** The shorthand (no operator at all) is a form of eq every field takes */
export const BARE = '$bare';
const ORDERING = ['gt', 'gte', 'lt', 'lte', 'between'];

/** Whether the field's generated Where type takes the operator with this unit as its operand */
export function applies(op: string, slot: Slot): boolean {
  if (slot.whole) return op === BARE;
  if (slot.scalarArray) return ['eq', 'neq', 'has', 'hasAll', 'hasAny', BARE].includes(op);
  if (op === 'eq' || op === 'neq' || op === BARE) return true;
  if (op === 'not') return slot.absentOrNull;
  if (op === 'in' || op === 'notIn') return slot.type !== 'bool';
  // The generated type gives a uuid the ordering operators but no between
  if (op === 'between' && slot.type === 'uuid') return false;
  if (ORDERING.includes(op)) return slot.ordered;

  return false;
}

/** The operand for one unit, by the operator's shape */
export function operandFor(op: string, slot: Slot, unit: unknown): unknown {
  if (op === BARE) return slot.scalarArray ? [unit] : unit;
  switch (OPERATOR_SHAPES[op]) {
    case 'value':
      return slot.scalarArray ? [unit] : unit;
    case 'valueList':
      return slot.scalarArray ? [[unit]] : [unit];
    case 'element':
      return unit;
    case 'elementList':
      return [unit];
    case 'pair':
      return [unit, unit];
    default:
      throw new Error(`no unit operand for ${op}`);
  }
}

export const filterFor = (op: string, operand: unknown): unknown => (op === BARE ? operand : { [op]: operand });

export type PathName = 'top' | 'not' | 'and' | 'or' | 'fwd' | 'rev' | 'incFwd' | 'incRev';

export function pathsOf(slot: Slot): PathName[] {
  switch (slot.family) {
    case 'host':
      return ['top', 'not', 'and', 'or', 'fwd', 'rev', 'incFwd', 'incRev'];
    case 'id':
      return ['top', 'not', 'and', 'or', 'fwd', 'incFwd'];
    case 'fk':
      return ['top', 'not', 'and', 'or', 'rev', 'incRev'];
    default:
      return ['top', 'not', 'and', 'or'];
  }
}

type Built =
  | { readonly kind: 'where'; readonly model: string; readonly where: unknown }
  | { readonly kind: 'include'; readonly model: string; readonly include: unknown };

function build(slot: Slot, path: PathName, filter: unknown, quantifier: Quantifier): Built {
  const w = whereAt(slot, filter, quantifier);
  const key = slot.idKey;
  switch (path) {
    case 'top':
      return { kind: 'where', model: slot.modelName, where: w };
    case 'not':
      return { kind: 'where', model: slot.modelName, where: { NOT: w } };
    case 'and':
      return { kind: 'where', model: slot.modelName, where: { AND: [w] } };
    case 'or':
      return { kind: 'where', model: slot.modelName, where: { OR: [w] } };
    case 'fwd':
      return slot.family === 'id'
        ? { kind: 'where', model: `Fk${key}`, where: { t: w } }
        : { kind: 'where', model: 'Kid', where: { host: w } };
    case 'rev':
      return slot.family === 'fk'
        ? { kind: 'where', model: `Id${key}`, where: { fks: { some: w } } }
        : { kind: 'where', model: 'Host', where: { kids: { some: w } } };
    case 'incFwd':
      return slot.family === 'id'
        ? { kind: 'include', model: `Fk${key}`, include: { t: { where: w } } }
        : { kind: 'include', model: 'Kid', include: { host: { where: w } } };
    case 'incRev':
      return slot.family === 'fk'
        ? { kind: 'include', model: `Id${key}`, include: { fks: { where: w } } }
        : { kind: 'include', model: 'Host', include: { kids: { where: w } } };
  }
}

export interface Verdict {
  readonly ok: boolean;
  readonly message: string;
  /** A refusal that is not a validation message: a TypeError out of a builder */
  readonly crash: boolean;
}

const refusal = (error: unknown): Verdict => ({
  ok: false,
  message: error instanceof Error ? error.message : String(error),
  crash: !(error instanceof CerialValidationError) && !(error instanceof Error && error.name.startsWith('Cerial')),
});

export interface CreateResult extends Verdict {
  readonly unit: unknown;
}

export function runCreate(slot: Slot, unit: unknown): CreateResult {
  const m = model(slot.modelName);
  const data = createData(slot, unit);
  const own = (field: string): boolean => field === slot.top || /^[^.[]+/.exec(field)?.[0] === slot.top;
  try {
    const errors = validateCreateData(data, m).errors.filter((e) => own(e.field));
    if (errors.length)
      return { ok: false, message: errors.map((e) => e.message).join('; '), crash: false, unit: undefined };
    const converted = transformData(data, m);

    return { ok: true, message: '', crash: false, unit: unitIn(slot, converted) };
  } catch (error) {
    return { ...refusal(error), unit: undefined };
  }
}

export interface WhereResult extends Verdict {
  readonly vars: Record<string, unknown>;
  readonly text: string;
}

export function runWhere(slot: Slot, path: PathName, filter: unknown, quantifier: Quantifier = 'some'): WhereResult {
  const built = build(slot, path, filter, quantifier);
  const m = model(built.model);
  try {
    if (built.kind === 'include') {
      const { text, vars } = buildFindManyQuery(m, { include: built.include } as never, registry) as {
        text: string;
        vars: Record<string, unknown>;
      };

      return { ok: true, message: '', crash: false, vars, text };
    }
    const where = built.where as WhereClause;
    const errors = validateWhere(where, m, registry).errors;
    if (errors.length)
      return {
        ok: false,
        message: errors.map((e) => `${e.path} ${e.message}`).join('; '),
        crash: false,
        vars: {},
        text: '',
      };
    const { text, vars } = buildConditions(createCompileContext(), where, m, registry);

    return { ok: true, message: '', crash: false, vars, text };
  } catch (error) {
    return { ...refusal(error), vars: {}, text: '' };
  }
}

/** Constructor name without the numeric suffix a bundler adds when two copies of a class meet */
const nameOf = (value: unknown): string => (value as object).constructor.name.replace(/\$\d+$/, '');

/** A stable text for a bound value: constructor and string form, so two classes with equal text differ */
export function canon(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return `s:${JSON.stringify(value)}`;
    case 'number':
      return `n:${Object.is(value, -0) ? '-0' : String(value)}`;
    case 'bigint':
      return `big:${value}`;
    case 'boolean':
      return `b:${value}`;
  }
  if (value instanceof Date) return `Date:${Number.isNaN(value.getTime()) ? 'invalid' : value.toISOString()}`;
  if (value instanceof Uint8Array) return `Bytes:${Buffer.from(value).toString('hex')}`;
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;
  if (value instanceof RecordId) return `RecordId:${value.table.name}:${canon(value.id)}`;
  if (value instanceof StringRecordId) return `StringRecordId:${String(value)}`;
  if (value instanceof Geometry) return `${nameOf(value)}:${JSON.stringify(value.toJSON())}`;
  if (value instanceof Uuid || value instanceof Decimal || value instanceof Duration)
    return `${nameOf(value)}:${value.toString()}`;
  const proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype || proto === null) {
    const entries = Object.entries(value as object).sort(([a], [b]) => (a < b ? -1 : 1));

    return `{${entries.map(([k, v]) => `${k}=${canon(v)}`).join(',')}}`;
  }

  return `${nameOf(value)}:${String(value)}`;
}

/** Every value in the bound variables, however deeply a list or object nests it */
export function boundForms(vars: Record<string, unknown>): Set<string> {
  const forms = new Set<string>();
  const add = (v: unknown): void => {
    forms.add(canon(v));
    if (Array.isArray(v)) v.forEach(add);
    else if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) Object.values(v).forEach(add);
  };
  Object.values(vars).forEach(add);

  return forms;
}

/** Readable, unique-enough name of a unit for the gap list */
export function label(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'number') return Object.is(value, -0) ? '-0' : String(value);
  if (value instanceof Date) return `Date(${Number.isNaN(value.getTime()) ? 'invalid' : value.toISOString()})`;
  if (value instanceof Uint8Array) return `${nameOf(value)}(${Buffer.from(value).toString('hex')})`;
  if (
    value !== null &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    !Array.isArray(value)
  )
    return `${nameOf(value)}(${canon(value)})`.replace(/^([^(]+)\(\1:/, '$1(');

  return (
    JSON.stringify(value, (_k, v) =>
      typeof v === 'bigint' ? `${v}n` : Number.isNaN(v) ? 'NaN' : v === Infinity ? 'Infinity' : v,
    ) ?? String(value)
  );
}

export type GapClass =
  | 'where-accepts-refused'
  | 'where-refuses-accepted'
  | 'value-differs'
  | 'refusal-unnamed'
  | 'crash';

export interface Finding {
  readonly gap: GapClass;
  readonly key: string;
  readonly at: string;
}

/** Names the field: the message holds the top-level name or the last segment of the slot path */
const names = (message: string, slot: Slot): boolean => {
  const leaf =
    slot.id
      .split(/[.[\]=]+/)
      .filter(Boolean)
      .pop() ?? slot.top;

  return message.includes(slot.top) || message.includes(leaf);
};

const isPlain = (v: unknown): boolean =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

const REPRESENTATIVE = ['eq', 'in', 'has', 'hasAll', 'between', BARE];

export function operatorsAt(slot: Slot, path: PathName): string[] {
  const all = [...Object.keys(OPERATOR_SHAPES), BARE].filter(
    (op) => !['text', 'flag'].includes(OPERATOR_SHAPES[op] ?? '') && applies(op, slot),
  );

  return path === 'top' ? all : all.filter((op) => REPRESENTATIVE.includes(op));
}

/** Runs every unit of the slot over every applicable operator and path; returns what disagrees with create */
export function findings(slot: Slot): Finding[] {
  const out: Finding[] = [];
  const created = slot.corpus.map((unit) => runCreate(slot, unit));
  const quantifiers: Quantifier[] = slot.hasQuantifier ? ['some', 'every', 'none'] : ['some'];

  for (const path of pathsOf(slot)) {
    for (const quantifier of quantifiers) {
      for (const op of operatorsAt(slot, path)) {
        slot.corpus.forEach((unit, i) => {
          // A plain object in the shorthand position is a sub-filter, not a value
          if (op === BARE && isPlain(unit)) return;
          const c = created[i]!;
          const w = runWhere(slot, path, filterFor(op, operandFor(op, slot, unit)), quantifier);
          const at = `${path}${slot.hasQuantifier ? `/${quantifier}` : ''}:${op}`;
          const record = (gap: GapClass): void => {
            out.push({ gap, key: `${gap}|${slot.id}|${label(unit)}`, at });
          };
          if (w.crash) return record('crash');
          if (c.ok && !w.ok) return record('where-refuses-accepted');
          if (!c.ok && w.ok) return record('where-accepts-refused');
          if (!c.ok && !w.ok) {
            if (!names(w.message, slot)) record('refusal-unnamed');

            return;
          }
          if (c.unit === undefined || c.unit === null || OPERATOR_SHAPES[op] === 'pair') return;
          if (!boundForms(w.vars).has(canon(c.unit))) record('value-differs');
        });
      }
    }
  }

  return out;
}

/** Findings grouped by key, each with its sorted list of `path:operator` places */
export function groupFindings(list: readonly Finding[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const f of list) (grouped[f.key] ??= []).push(f.at);
  for (const key of Object.keys(grouped)) grouped[key] = [...new Set(grouped[key])].sort();

  return grouped;
}

interface ShapeCase {
  readonly slot: string;
  readonly op: string;
  readonly operand: unknown;
  readonly valid: boolean;
}

/** Operands whose shape is wrong for the operator, and the right shapes beside them */
const SHAPE_CASES: ShapeCase[] = [
  ...['contains', 'startsWith', 'endsWith'].flatMap((op) =>
    ['rStr', 'rMail'].flatMap((slot) => [
      { slot, op, operand: 'a', valid: true },
      ...[1, true, null, ['a'], { a: 1 }].map((operand) => ({ slot, op, operand, valid: false })),
    ]),
  ),
  ...[
    ['oInt', 'isNone'],
    ['nInt', 'isNull'],
    ['oInt', 'isDefined'],
    ['aInt', 'isEmpty'],
  ].flatMap(([slot, op]) => [
    { slot: slot!, op: op!, operand: true, valid: true },
    { slot: slot!, op: op!, operand: false, valid: true },
    ...[1, 'true', null, {}, []].map((operand) => ({ slot: slot!, op: op!, operand, valid: false })),
  ]),
  ...['in', 'notIn'].flatMap((op) =>
    [1, 'a', null, {}].map((operand) => ({ slot: 'rInt', op, operand, valid: false })),
  ),
  ...['hasAll', 'hasAny'].flatMap((op) =>
    [1, 'a', null, {}].map((operand) => ({ slot: 'aInt', op, operand, valid: false })),
  ),
  ...[1, 'a', null, {}, [1], [1, 2, 3]].map((operand) => ({ slot: 'rInt', op: 'between', operand, valid: false })),
  { slot: 'rInt', op: 'between', operand: [1, 2], valid: true },
];

export function shapeFindings(slotOf: (id: string) => Slot): Finding[] {
  const out: Finding[] = [];
  for (const { slot: id, op, operand, valid } of SHAPE_CASES) {
    const slot = slotOf(id);
    const w = runWhere(slot, 'top', { [op]: operand });
    const key = (gap: GapClass): string => `${gap}|shape:${op}|${id}|${label(operand)}`;
    if (w.crash) out.push({ gap: 'crash', key: key('crash'), at: 'top' });
    else if (valid && !w.ok) out.push({ gap: 'where-refuses-accepted', key: key('where-refuses-accepted'), at: 'top' });
    else if (!valid && w.ok) out.push({ gap: 'where-accepts-refused', key: key('where-accepts-refused'), at: 'top' });
    else if (!valid && !names(w.message, slot))
      out.push({ gap: 'refusal-unnamed', key: key('refusal-unnamed'), at: 'top' });
  }

  return out;
}
