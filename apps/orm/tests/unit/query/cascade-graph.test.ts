import { describe, expect, test } from 'bun:test';
import { walkCascade } from '../../../src/query/builders';
import { parseModelRegistry } from '../../test-helpers';

const chain = parseModelRegistry(`
model Top {
  id Record @id
  middles Relation[] @model(Middle)
  nones Relation[] @model(NoneChild)
  nulls Relation[] @model(NullChild)
  restricts Relation[] @model(RestrictChild)
  ignored Relation[] @model(IgnoredChild)
}

model Middle {
  id Record @id
  topId Record
  top Relation @field(topId) @model(Top)
  bottoms Relation[] @model(Bottom)
}

model Bottom {
  id Record @id
  middleId Record
  middle Relation @field(middleId) @model(Middle)
}

model NoneChild {
  id Record @id
  topId Record?
  top Relation? @field(topId) @model(Top) @onDelete(SetNone)
  below Relation[] @model(BelowNone)
}

model BelowNone {
  id Record @id
  noneId Record
  none Relation @field(noneId) @model(NoneChild)
}

model NullChild {
  id Record @id
  topId Record? @nullable
  top Relation? @field(topId) @model(Top) @onDelete(SetNull)
  below Relation[] @model(BelowNull)
}

model BelowNull {
  id Record @id
  nullId Record
  null Relation @field(nullId) @model(NullChild)
}

model RestrictChild {
  id Record @id
  topId Record?
  top Relation? @field(topId) @model(Top) @onDelete(Restrict)
  below Relation[] @model(BelowRestrict)
}

model BelowRestrict {
  id Record @id
  restrictId Record
  restrict Relation @field(restrictId) @model(RestrictChild)
}

model IgnoredChild {
  id Record @id
  topId Record?
  top Relation? @field(topId) @model(Top) @onDelete(NoAction)
  below Relation[] @model(BelowIgnored)
}

model BelowIgnored {
  id Record @id
  ignoredId Record
  ignored Relation @field(ignoredId) @model(IgnoredChild)
}
`);

const edgeNames = (graph: ReturnType<typeof walkCascade>): string[] =>
  graph.edges.map((e) => `${e.parent}>${e.model.name}:${e.onDelete}`).sort();

describe('walkCascade', () => {
  test('returns both levels of a Cascade chain with depth and path', () => {
    const graph = walkCascade(chain.Top!, chain);
    const middle = graph.edges.find((e) => e.model.name === 'Middle')!;
    const bottom = graph.edges.find((e) => e.model.name === 'Bottom')!;

    expect(graph.root).toBe('Top');
    expect(middle).toMatchObject({ parent: 'Top', depth: 1, path: ['Top'], cyclic: false, onDelete: 'Cascade' });
    expect(bottom).toMatchObject({
      parent: 'Middle',
      depth: 2,
      path: ['Top', 'Middle'],
      cyclic: false,
      onDelete: 'Cascade',
    });
    expect(graph.cyclicModels.size).toBe(0);
  });

  test('reports SetNone, SetNull and Restrict and stops there', () => {
    expect(edgeNames(walkCascade(chain.Top!, chain))).toEqual([
      'Middle>Bottom:Cascade',
      'Top>Middle:Cascade',
      'Top>NoneChild:SetNone',
      'Top>NullChild:SetNull',
      'Top>RestrictChild:Restrict',
    ]);
  });

  test('leaves out NoAction and everything below it', () => {
    const names = walkCascade(chain.Top!, chain).edges.map((e) => e.model.name);

    expect(names).not.toContain('IgnoredChild');
    expect(names).not.toContain('BelowIgnored');
  });

  test('a model with no dependents has no edges', () => {
    expect(walkCascade(chain.Bottom!, chain).edges).toEqual([]);
  });

  test('walks from a mid-chain root', () => {
    expect(edgeNames(walkCascade(chain.Middle!, chain))).toEqual(['Middle>Bottom:Cascade']);
  });
});

describe('walkCascade cycles', () => {
  test('a Cascade self-reference terminates and is marked cyclic', () => {
    const tree = parseModelRegistry(`
model Node {
  id Record @id
  parentId Record?
  parent Relation? @field(parentId) @model(Node) @onDelete(Cascade)
  children Relation[] @model(Node)
}
`);
    const graph = walkCascade(tree.Node!, tree);

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({ parent: 'Node', depth: 1, cyclic: true });
    expect([...graph.cyclicModels]).toEqual(['Node']);
  });

  test('a mutual Cascade cycle terminates, with both models marked', () => {
    const mutual = parseModelRegistry(`
model Alpha {
  id Record @id
  betaId Record?
  beta Relation? @field(betaId) @model(Beta) @onDelete(Cascade)
  betas Relation[] @model(Beta)
}

model Beta {
  id Record @id
  alphaId Record?
  alpha Relation? @field(alphaId) @model(Alpha) @onDelete(Cascade)
  alphas Relation[] @model(Alpha)
}
`);
    const graph = walkCascade(mutual.Alpha!, mutual);

    expect(graph.edges.map((e) => `${e.parent}>${e.model.name}:${e.cyclic}`)).toEqual([
      'Alpha>Beta:false',
      'Beta>Alpha:true',
    ]);
    expect(new Set(graph.cyclicModels)).toEqual(new Set(['Alpha', 'Beta']));
  });

  test('a cycle below the root marks only the models on the cycle', () => {
    const below = parseModelRegistry(`
model Root {
  id Record @id
  leaves Relation[] @model(Leaf)
}

model Leaf {
  id Record @id
  rootId Record
  root Relation @field(rootId) @model(Root)
  parentId Record?
  parent Relation? @field(parentId) @model(Leaf) @onDelete(Cascade)
  children Relation[] @model(Leaf)
}
`);
    const graph = walkCascade(below.Root!, below);

    expect(new Set(graph.cyclicModels)).toEqual(new Set(['Leaf']));
    expect(graph.edges.find((e) => e.model.name === 'Leaf' && e.parent === 'Root')?.cyclic).toBe(false);
  });

  test('a SetNull self-reference is not a cascade cycle', () => {
    const category = parseModelRegistry(`
model CategoryTree {
  id Record @id
  parentId Record? @nullable
  parent Relation? @field(parentId) @model(CategoryTree) @onDelete(SetNull)
  children Relation[] @model(CategoryTree)
}
`);
    const graph = walkCascade(category.CategoryTree!, category);

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({ onDelete: 'SetNull', cyclic: false });
    expect(graph.cyclicModels.size).toBe(0);
  });
});
