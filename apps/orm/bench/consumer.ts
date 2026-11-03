/** Where in a generated tree the fixed consumer queries aim, so one set of queries covers any schema */
export interface ConsumerSpec {
  readonly model: string;
  /** Source of a `select` that reaches a field of a nested object */
  readonly nestedSelect: string;
  /** Source of an `include` that nests a second `include` */
  readonly nestedInclude: string;
  /** Source of a `where` that matches one row */
  readonly where: string;
  /** Source of a `data` that changes a field of every matched row */
  readonly updateData: string;
  /** Source of a `data` holding every required field */
  readonly createData: string;
}

const VALUE_BY_TYPE: Record<string, string> = {
  String: `'x'`,
  Int: '1',
  Float: '1.5',
  Bool: 'true',
  Date: 'new Date(0)',
};

/** Queries over the ring models `syntheticSchema` writes; `createData` follows the field types its seed drew */
export function syntheticConsumerSpec(schema: string): ConsumerSpec {
  const block = /model BenchModel0 \{\n([\s\S]*?)\n\}/.exec(schema);
  if (!block) throw new Error('synthetic schema has no BenchModel0');

  const scalars = [...block[1]!.matchAll(/^ {2}(field\d+) (\w+)$/gm)].map(([, name, type]) => {
    const value = VALUE_BY_TYPE[type!];
    if (!value) throw new Error(`no value for field type ${type}`);

    return `${name}: ${value}`;
  });

  return {
    model: 'BenchModel0',
    nestedSelect: `{ field0: true, profile: { label: true, detail: { note: true } } }`,
    nestedInclude: `{ next: { include: { next: true } } }`,
    where: `{ profile: { rank: 1 } }`,
    updateData: `{ profile: { label: 'y' } }`,
    createData: `{ ${[
      ...scalars,
      `profile: { label: 'x', rank: 1, detail: { note: 'x', weight: 1 } }`,
      `nextId: 'BenchModel1:one'`,
    ].join(', ')} }`,
  };
}

/** Queries over the e2e corpus: a model with an object field and a relation that points back */
export const CORPUS_CONSUMER_SPEC: ConsumerSpec = {
  model: 'RelObjCompany',
  nestedSelect: `{ name: true, headquarters: { city: true } }`,
  nestedInclude: `{ employees: { include: { company: true } } }`,
  where: `{ name: 'x' }`,
  updateData: `{ name: 'y' }`,
  createData: `{ name: 'x', headquarters: { street: 'a', city: 'b', state: 'c' } }`,
};

/** The consumer file: select with a nested object, include in include, findOne, updateMany and create */
export function consumerSource(spec: ConsumerSpec): string {
  const model = `client.db.${spec.model}`;

  return `import type { CerialClient } from './gen';

declare const client: CerialClient;

export const nestedSelect = ${model}.findMany({ select: ${spec.nestedSelect} });
export const nestedInclude = ${model}.findMany({ include: ${spec.nestedInclude} });
export const one = ${model}.findOne({ where: ${spec.where} });
export const updated = ${model}.updateMany({ where: ${spec.where}, data: ${spec.updateData} });
export const created = ${model}.create({ data: ${spec.createData} });
`;
}

/** Every field of `UnsetTest`, composites included, down its deepest nesting (model, object, object, object) and five levels of its self-referencing tree */
const HEAVY_SELECT = (() => {
  const mid = `{ label: true, score: true, deep: { code: true, note: true } }`;
  const outer = `{ title: true, mid: ${mid}, desc: true }`;
  const address = `{ street: true, city: true, zip: true }`;
  const tree = `{ payload: true, extra: true, child: { payload: true, extra: true, child: { payload: true, extra: true, child: { payload: true } } } }`;

  return `{ id: true, name: true, bio: true, age: true, address: ${address}, shipping: ${address}, pos: true, backup: true, opt: true, tagged: { 1: { payload: true, extra: true } }, nested: ${outer}, optNested: ${outer}, deepTuple: { 1: ${mid} }, tree: ${tree}, recursive: true }`;
})();

/**
 * Reads of the result that reach the deepest object of each selected composite. A type is resolved when it is read, so a
 * query nobody reads costs the `select` check but never the return type.
 */
const HEAVY_READS = [
  'r.address.zip',
  'r.shipping?.city',
  'r.tagged?.[1].payload',
  'r.nested.mid.deep.code',
  'r.optNested?.mid.deep.note',
  'r.deepTuple?.[1].deep.code',
  'r.tree?.child?.child?.child?.payload',
].join(', ');

/** The consumer of the `heavy-select` cases: `count` queries that each select every field of one model, then read the result */
export function heavySelectConsumer(count: number): string {
  const queries = Array.from(
    { length: count },
    (_, i) => `export const q${i} = client.db.UnsetTest.findMany({ select: ${HEAVY_SELECT} });
export const r${i} = async () => {
  const r = (await q${i})[0]!;

  return [${HEAVY_READS}];
};`,
  );

  return `import type { CerialClient } from './gen';

declare const client: CerialClient;

${queries.join('\n')}
`;
}
