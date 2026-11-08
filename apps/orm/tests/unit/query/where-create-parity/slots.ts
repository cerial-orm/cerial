/**
 * Slots: every place a value can sit in the schema. A slot knows how to put one unit into create's data, how
 * to wrap a filter for the same place, and how to read the unit back out of what create converted.
 */

import type { FieldMetadata, ModelMetadata, SchemaFieldType } from '../../../../src/types';
import { validateFieldValue } from '../../../../src/query/validators/data-validator';
import { CORPUS, idCorpus, LITERAL_CORPUS, NESTED_WHOLE, WHOLE_OBJECT, WHOLE_TUPLE } from './corpus';
import { FK_ARRAY_KEYS, ID_MODELS, LITERALS, model, SCALARS, SET_KEYS } from './schema';

export type Step =
  | { readonly t: 'key'; readonly k: string; readonly fill?: Readonly<Record<string, unknown>> }
  | { readonly t: 'idx'; readonly i: number; readonly fill: readonly unknown[] }
  | { readonly t: 'arr' };

export type Quantifier = 'some' | 'every' | 'none';

export interface Slot {
  /** Unique, stable: used in the known-gap list */
  readonly id: string;
  /** Model whose create takes the data and whose where holds the filter */
  readonly modelName: string;
  /** Top-level field the create errors are looked up under */
  readonly top: string;
  readonly type: SchemaFieldType;
  readonly corpus: readonly unknown[];
  readonly steps: readonly Step[];
  /** The unit is one element of a scalar array or set field */
  readonly scalarArray: boolean;
  readonly isSet: boolean;
  /** An object or tuple compared whole */
  readonly whole: boolean;
  readonly ordered: boolean;
  /** Takes `not`: the field may be absent or null */
  readonly absentOrNull: boolean;
  /** Which relation paths reach the slot */
  readonly family: 'host' | 'id' | 'fk' | 'fkArray';
  /** Id slots carry the id key and a table, for the relation paths */
  readonly idKey?: string;
  readonly hasQuantifier: boolean;
}

/**
 * A value create accepts for a field, so the slot under test is the only thing that varies. A value bound
 * whole (a tuple element, an array element) needs every required sub-field written, as the database
 * fills nothing there.
 */
function fillValue(
  field: Pick<FieldMetadata, 'type' | 'isArray' | 'objectInfo' | 'tupleInfo'> & Partial<FieldMetadata>,
): unknown {
  if (field.isArray) return [];
  if (field.type === 'object' && field.objectInfo) return fillObject(field.objectInfo.fields);
  if (field.type === 'tuple' && field.tupleInfo) return field.tupleInfo.elements.map((e) => fillValue(e));

  return (CORPUS[field.type] ?? []).find(
    (v) => !validateFieldValue('x', v, { ...(field as FieldMetadata), isRequired: false }),
  );
}

/** Every required sub-field of an object, filled */
function fillObject(fields: readonly FieldMetadata[]): Record<string, unknown> {
  return Object.fromEntries(fields.filter((f) => f.isRequired).map((f) => [f.name, fillValue(f)]));
}

export function createData(slot: Slot, unit: unknown): Record<string, unknown> {
  let inner: unknown = slot.scalarArray ? [unit] : unit;
  for (let n = slot.steps.length - 1; n >= 0; n--) {
    const step = slot.steps[n]!;
    if (step.t === 'key') inner = { ...step.fill, [step.k]: inner };
    else if (step.t === 'idx') {
      const tuple = [...step.fill];
      tuple[step.i] = inner;
      inner = tuple;
    } else inner = [inner];
  }

  return inner as Record<string, unknown>;
}

/** The filter at the slot's place, wrapped the way the schema nests it */
export function whereAt(slot: Slot, filter: unknown, quantifier: Quantifier = 'some'): Record<string, unknown> {
  let inner: unknown = filter;
  for (let n = slot.steps.length - 1; n >= 0; n--) {
    const step = slot.steps[n]!;
    if (step.t === 'key') inner = { [step.k]: inner };
    else if (step.t === 'idx') inner = { [String(step.i)]: inner };
    else inner = { [quantifier]: inner };
  }

  return inner as Record<string, unknown>;
}

/** The unit as create stored it, read out of the converted data */
export function unitIn(slot: Slot, converted: Record<string, unknown>): unknown {
  let node: unknown = converted;
  const walk = (key: string | number): void => {
    node = node === null || node === undefined ? undefined : (node as Record<string | number, unknown>)[key];
  };
  for (const step of slot.steps) {
    if (step.t === 'key') walk(step.k);
    else if (step.t === 'idx') walk(step.i);
    else walk(0);
  }
  if (slot.scalarArray) walk(0);

  return node;
}

interface Meta {
  readonly type: SchemaFieldType;
  readonly objectInfo?: FieldMetadata['objectInfo'];
  readonly tupleInfo?: FieldMetadata['tupleInfo'];
  readonly isArray?: boolean;
}

const slots: Slot[] = [];

function push(slot: Omit<Slot, 'family' | 'hasQuantifier'> & { family?: Slot['family'] }): void {
  slots.push({
    family: 'host',
    ...slot,
    hasQuantifier: slot.steps.some((s) => s.t === 'arr'),
  });
}

const MAX_OBJECT_DEPTH = 3;

const label = (s: Step[]): string =>
  s
    .map((x) => (x.t === 'key' ? `.${x.k}` : x.t === 'idx' ? `[${x.i}]` : '[]'))
    .join('')
    .replace(/^\./, '');

/** An object or tuple that sits inside another one, given a value of the wrong shape or a whole well formed one */
function pushWhole(meta: Meta, steps: Step[], top: string): void {
  push({
    id: `${label(steps)}=whole`,
    modelName: 'Host',
    top,
    type: meta.tupleInfo ? 'tuple' : 'object',
    corpus: meta.tupleInfo ? WHOLE_TUPLE : WHOLE_OBJECT,
    steps,
    scalarArray: false,
    isSet: false,
    whole: true,
    ordered: false,
    absentOrNull: false,
  });
}

function walk(meta: Meta, steps: Step[], top: string, depth: number, defs: Map<string, FieldMetadata[]>): void {
  const base = { modelName: 'Host', top, scalarArray: false, isSet: false, whole: false, ordered: false };
  const here = (s: Step[]): string =>
    s.map((x) => (x.t === 'key' ? `.${x.k}` : x.t === 'idx' ? `[${x.i}]` : '[]')).join('');
  const withArr = meta.isArray ? [...steps, { t: 'arr' } as Step] : steps;

  if (meta.objectInfo) {
    const { objectName } = meta.objectInfo;
    const fields = meta.objectInfo.fields.length ? meta.objectInfo.fields : (defs.get(objectName) ?? []);
    const known = new Map(defs).set(objectName, fields);
    for (const f of fields) {
      const next: Step[] = [
        ...withArr,
        { t: 'key', k: f.name, fill: fillObject(fields.filter((sibling) => sibling.name !== f.name)) },
      ];
      if (f.objectInfo || f.tupleInfo) {
        pushWhole(f, next, top);
        if (depth < MAX_OBJECT_DEPTH) walk(f, next, top, depth + 1, known);
        continue;
      }
      push({
        ...base,
        id: `${here(next)}`.replace(/^\./, ''),
        type: f.type,
        corpus: CORPUS[f.type] ?? [],
        scalarArray: !!f.isArray,
        steps: next,
        absentOrNull: false,
        ordered: SCALARS.find((s) => s.type === f.type)?.ordered ?? false,
      });
    }

    return;
  }

  if (meta.tupleInfo) {
    const { elements } = meta.tupleInfo;
    const fill = elements.map((e) => fillValue(e));
    for (const e of elements) {
      const next: Step[] = [...withArr, { t: 'idx', i: e.index, fill }];
      if (e.objectInfo || e.tupleInfo) {
        pushWhole(e as Meta, next, top);
        if (depth < MAX_OBJECT_DEPTH) walk(e as Meta, next, top, depth + 1, defs);
        continue;
      }
      push({
        ...base,
        id: here(next).replace(/^\./, ''),
        type: e.type as SchemaFieldType,
        corpus: CORPUS[e.type] ?? [],
        steps: next,
        absentOrNull: false,
        ordered: SCALARS.find((s) => s.type === e.type)?.ordered ?? false,
      });
    }
  }
}

function build(): void {
  const host = model('Host');
  const field = (name: string): FieldMetadata => {
    const found = host.fields.find((f) => f.name === name);
    if (!found) throw new Error(`no Host.${name}`);

    return found;
  };

  const scalar = (name: string, type: SchemaFieldType, corpus: unknown[], extra: Partial<Slot>): void => {
    push({
      id: name,
      modelName: 'Host',
      top: name,
      type,
      corpus,
      steps: [{ t: 'key', k: name }],
      scalarArray: false,
      isSet: false,
      whole: false,
      ordered: false,
      absentOrNull: false,
      ...extra,
    });
  };

  for (const s of SCALARS) {
    const values = CORPUS[s.type]!;
    const nullable = s.key !== 'Any';
    scalar(`r${s.key}`, s.type, [...values, null], { ordered: s.ordered });
    scalar(`o${s.key}`, s.type, values, { ordered: s.ordered, absentOrNull: true });
    if (nullable) scalar(`n${s.key}`, s.type, [...values, null], { ordered: s.ordered, absentOrNull: true });
    if (s.shapes === 'all') scalar(`a${s.key}`, s.type, values, { scalarArray: true });
    if (SET_KEYS.includes(s.key)) scalar(`s${s.key}`, s.type, values, { scalarArray: true, isSet: true });
  }
  for (const l of LITERALS) {
    const values = LITERAL_CORPUS[l.key]!;
    scalar(`r${l.key}`, 'literal', [...values, null], {});
    scalar(`o${l.key}`, 'literal', values, { absentOrNull: true });
    scalar(`n${l.key}`, 'literal', [...values, null], { absentOrNull: true });
    scalar(`a${l.key}`, 'literal', values, { scalarArray: true });
  }

  // Objects and tuples: leaves to depth 3, then the value compared whole
  for (const name of ['oneLeaf', 'optLeaf', 'leaves', 'flexLeaf', 'deep', 'selfRef', 'recBox']) {
    const f = field(name);
    walk(f, [{ t: 'key', k: name }], name, 1, new Map());
    scalar(name, f.type, WHOLE_OBJECT, { id: `${name}=whole`, whole: true, scalarArray: !!f.isArray });
  }
  for (const name of ['pairT', 'pairs', 'optPair', 'boxT', 'deepT', 'objTup']) {
    const f = field(name);
    walk(f, [{ t: 'key', k: name }], name, 1, new Map());
    scalar(name, f.type, [...WHOLE_TUPLE, ...(NESTED_WHOLE[name] ?? [])], {
      id: `${name}=whole`,
      whole: true,
      scalarArray: !!f.isArray,
    });
  }
  // A key no object declares: a strict object refuses it, a flexible one reads it as an arbitrary value
  for (const name of ['oneLeaf', 'flexLeaf']) {
    push({
      id: `${name}.undeclared`,
      modelName: 'Host',
      top: name,
      type: 'any',
      corpus: CORPUS.any!,
      steps: [
        { t: 'key', k: name },
        { t: 'key', k: 'undeclared' },
      ],
      scalarArray: false,
      isSet: false,
      whole: false,
      ordered: false,
      absentOrNull: false,
    });
  }

  for (const { key } of ID_MODELS) {
    const idModel = model(`Id${key}`);
    const table = idModel.tableName;
    push({
      id: `Id${key}.id`,
      modelName: `Id${key}`,
      top: 'id',
      type: 'record',
      corpus: idCorpus(key, table),
      steps: [{ t: 'key', k: 'id' }],
      scalarArray: false,
      isSet: false,
      whole: false,
      ordered: false,
      absentOrNull: false,
      family: 'id',
      idKey: key,
    });
    for (const name of ['tId', 'optId']) {
      push({
        id: `Fk${key}.${name}`,
        modelName: `Fk${key}`,
        top: name,
        type: 'record',
        corpus: idCorpus(key, table),
        steps: [{ t: 'key', k: name }],
        scalarArray: false,
        isSet: false,
        whole: false,
        ordered: false,
        absentOrNull: name === 'optId',
        family: 'fk',
        idKey: key,
      });
    }
    if (FK_ARRAY_KEYS.includes(key)) {
      push({
        id: `FkArr${key}.tIds`,
        modelName: `FkArr${key}`,
        top: 'tIds',
        type: 'record',
        corpus: idCorpus(key, table),
        steps: [{ t: 'key', k: 'tIds' }],
        scalarArray: true,
        isSet: false,
        whole: false,
        ordered: false,
        absentOrNull: false,
        family: 'fkArray',
        idKey: key,
      });
    }
  }
}

build();

export const SLOTS: readonly Slot[] = slots;
export type { ModelMetadata };
