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
