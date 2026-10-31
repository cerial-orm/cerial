import { describe, expect, it } from 'bun:test';
import { mergeDeclarations } from '../../../../src/cli/passes';
import {
  e,
  enum as enumeration,
  f,
  handle,
  literal,
  model,
  object,
  tuple,
  variant,
} from '../../../../src/parser/builder';
import { materialise } from '../../../../src/parser/builder/materialise';
import { parse } from '../../../../src/parser/parser';
import { resolveInheritance } from '../../../../src/resolver';
import type { Origin, SchemaAST } from '../../../../src/types';

const DSL_FILE = '/p/shapes.cerial';
const TS_FILE = '/p/shapes.schema.ts';

const SOURCE = `model DBase {
  id Record @id
  name String
  tag String
}
object DObj {
  street String
  city String
}
tuple DTup {
  x Float,
  y Float
}
enum DRole { Admin Guest }
literal DLevel { 1, 'high' }
`;

function dslHalf(source = SOURCE): SchemaAST {
  const { ast, errors } = parse(source, undefined, undefined, undefined, undefined, DSL_FILE);
  expect(errors.map((x) => x.message)).toEqual([]);

  return ast;
}

function tsHalf(...handles: Array<[object, string]>): SchemaAST {
  return materialise(handles.map(([h, exportName]) => ({ handle: h, module: TS_FILE, exportName })));
}

const isDsl = (origin: Origin): boolean => origin.kind === 'dsl';
const isTs = (origin: Origin): boolean => origin.kind === 'ts';

/** Every origin a declaration holds: its own, then each field, element, directive and decorator. */
function originsOf(node: SchemaAST[keyof Omit<SchemaAST, 'source'>][number]): Origin[] {
  const out: Origin[] = [node.origin];
  const members = 'fields' in node ? node.fields : 'elements' in node ? node.elements : [];
  for (const member of members) {
    out.push(member.origin, ...(member.decorators ?? []).map((d) => d.origin));
  }
  if ('directives' in node) out.push(...(node.directives ?? []).map((d) => d.origin));

  return out;
}

const TsUser = model(
  'TsUser',
  { id: f.record().id(), name: f.string().unique() },
  { index: { name: 'byName', fields: ['name'] } },
);
const TsObj = object('TsObj', { a: f.string() });
const TsTup = tuple('TsTup', { x: e.float().nullable(), y: e.float() });
const TsLevel = literal('TsLevel', [variant.int(1)]);
const TsRole = enumeration('TsRole', ['A']);

function allTs(): SchemaAST {
  return tsHalf([TsUser, 'TsUser'], [TsObj, 'TsObj'], [TsTup, 'TsTup'], [TsLevel, 'TsLevel'], [TsRole, 'TsRole']);
}

describe('mergeDeclarations keeps each node origin', () => {
  const merged = mergeDeclarations(dslHalf(), allTs());

  it.each([
    ['models', 'TsUser', 'DBase'],
    ['objects', 'TsObj', 'DObj'],
    ['tuples', 'TsTup', 'DTup'],
    ['literals', 'TsLevel', 'DLevel'],
    ['enums', 'TsRole', 'DRole'],
  ] as const)('%s: every node, field, element, directive and decorator keeps its kind', (key, tsName, dslName) => {
    const list = merged[key] as Array<{ name: string } & SchemaAST[typeof key][number]>;
    const fromTs = list.find((n) => n.name === tsName)!;
    const fromDsl = list.find((n) => n.name === dslName)!;

    expect(originsOf(fromTs).every(isTs)).toBe(true);
    expect(originsOf(fromDsl).every(isDsl)).toBe(true);
  });

  it('keeps the file and export a ts node had, and the file a dsl node had', () => {
    expect(merged.models.find((m) => m.name === 'TsUser')!.origin).toEqual({
      kind: 'ts',
      file: TS_FILE,
      export: 'TsUser',
    });
    expect(merged.models.find((m) => m.name === 'DBase')!.origin).toMatchObject({ kind: 'dsl', file: DSL_FILE });
  });

  it('gives no node a missing origin, and counts every node it was handed', () => {
    const count = (ast: SchemaAST): number =>
      [ast.models, ast.objects, ast.tuples, ast.literals, ast.enums].flat().length;

    expect(count(merged)).toBe(count(dslHalf()) + count(allTs()));
    for (const node of [merged.models, merged.objects, merged.tuples, merged.literals, merged.enums].flat()) {
      expect(originsOf(node).every((origin) => !!origin)).toBe(true);
    }
  });
});

describe('a child inheriting across the syntax boundary keeps the parent origin, where the field was written', () => {
  const DBase = handle.model('DBase', { members: ['id', 'name', 'tag'] });
  const DObj = handle.object('DObj', { members: ['street', 'city'] });
  const DTup = handle.tuple('DTup', { members: ['x', 'y'], size: 2 });

  function resolvedTsChildren(): SchemaAST {
    const children = tsHalf(
      [model('TsAll', { own: f.string() }, { extends: DBase }), 'TsAll'],
      [model('TsPick', { own: f.string() }, { extends: DBase.pick('id', 'name') }), 'TsPick'],
      [model('TsOmit', { own: f.string() }, { extends: DBase.omit('tag') }), 'TsOmit'],
      [object('TsObjAll', { own: f.string() }, { extends: DObj }), 'TsObjAll'],
      [object('TsObjPick', {}, { extends: DObj.pick('city') }), 'TsObjPick'],
      [object('TsObjOmit', {}, { extends: DObj.omit('city') }), 'TsObjOmit'],
      [tuple('TsTupAll', { z: e.float() }, { extends: DTup }), 'TsTupAll'],
      [tuple('TsTupPick', {}, { extends: DTup.pick('y') }), 'TsTupPick'],
      [tuple('TsTupOmit', {}, { extends: DTup.omit('y') }), 'TsTupOmit'],
    );

    return resolveInheritance(mergeDeclarations(dslHalf(), children));
  }

  const inherited = (list: ReadonlyArray<{ name: string; fields?: unknown; elements?: unknown }>, name: string) => {
    const node = list.find((n) => n.name === name)!;

    return (node.fields ?? node.elements) as Array<{ name?: string; origin: Origin }>;
  };

  it.each([
    ['models', 'TsAll', ['id', 'name', 'tag']],
    ['models', 'TsPick', ['id', 'name']],
    ['models', 'TsOmit', ['id', 'name']],
    ['objects', 'TsObjAll', ['street', 'city']],
    ['objects', 'TsObjPick', ['city']],
    ['objects', 'TsObjOmit', ['street']],
  ] as const)('ts child, dsl parent, %s %s: the inherited %j keep the dsl origin', (key, child, names) => {
    const members = inherited(resolveTs()[key], child);

    for (const name of names) expect(members.find((m) => m.name === name)!.origin.kind).toBe('dsl');
    expect(members.filter((m) => !names.includes(m.name as never)).every((m) => isTs(m.origin))).toBe(true);
    expect(members.map((m) => m.name).filter((n) => names.includes(n as never))).toEqual([...names]);
  });

  function resolveTs(): SchemaAST {
    return resolvedTsChildren();
  }

  it.each([
    ['TsTupAll', 2],
    ['TsTupPick', 1],
    ['TsTupOmit', 1],
  ] as const)('ts tuple %s, dsl parent: the %i inherited elements keep the dsl origin', (child, count) => {
    const elements = inherited(resolveTs().tuples, child);
    const fromParent = elements.filter((el) => isDsl(el.origin));

    expect(fromParent).toHaveLength(count);
    expect(elements.filter((el) => isTs(el.origin))).toHaveLength(elements.length - count);
  });

  it('keeps the child own origin on the child declaration itself', () => {
    const child = resolveTs().models.find((m) => m.name === 'TsAll')!;

    expect(child.origin).toEqual({ kind: 'ts', file: TS_FILE, export: 'TsAll' });
  });
});

describe('a dsl child inheriting from a ts parent keeps the ts parent origin, where the field was written', () => {
  const resolved = resolveInheritance(
    mergeDeclarations(
      dslHalf(`model DAll extends TsUser {
  own String
}
model DPick extends TsUser[id] {
  own String
}
model DOmit extends TsUser[!name] {
  own String
}
object DObjAll extends TsObj {
  own String
}
object DObjPick extends TsObj[a] {
  own String
}
object DObjOmit extends TsObj[!a] {
  own String
}
tuple DTupAll extends TsTup {
  z Float
}
tuple DTupPick extends TsTup[y] { }
tuple DTupOmit extends TsTup[!y] { }
`),
      allTs(),
    ),
  );
  const members = (node: { fields?: unknown; elements?: unknown }): Array<{ name?: string; origin: Origin }> =>
    (node.fields ?? node.elements) as Array<{ name?: string; origin: Origin }>;

  it.each([
    ['models', 'DAll', 2],
    ['models', 'DPick', 1],
    ['models', 'DOmit', 1],
    ['objects', 'DObjAll', 1],
    ['objects', 'DObjPick', 1],
    ['objects', 'DObjOmit', 0],
    ['tuples', 'DTupAll', 2],
    ['tuples', 'DTupPick', 1],
    ['tuples', 'DTupOmit', 1],
  ] as const)('%s %s: %i inherited members keep the ts origin and the rest stay dsl', (key, child, count) => {
    const list = resolved[key] as Array<{ name: string; fields?: unknown; elements?: unknown }>;
    const all = members(list.find((n) => n.name === child)!);

    expect(all.filter((m) => isTs(m.origin))).toHaveLength(count);
    expect(all.filter((m) => isDsl(m.origin))).toHaveLength(all.length - count);
  });
});
