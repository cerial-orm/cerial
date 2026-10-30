import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { validateOnDeletePlacement, validateCardinalityMatch } from '../../../../src/cli/validators/relation-validator';
import { f, model, modelNode } from '../../../../src/parser/builder';
import type { Handle, RelationBuilder } from '../../../../src/parser/builder';
import { parse } from '../../../../src/parser/parser';
import type { ASTField, ASTModel, SchemaAST } from '../../../../src/types';
import { withoutPosition } from './helpers';

const schema = (path: string): string => readFileSync(new URL(`../../../e2e/schemas/${path}`, import.meta.url), 'utf8');

function parsedModel(source: string, name: string): ASTModel {
  const { ast, errors } = parse(source);
  expect(errors).toHaveLength(0);
  const found = ast.models.find((m) => m.name === name);
  if (!found) throw new Error(`No model ${name}`);

  return found;
}

function fieldOf(m: ASTModel, name: string): ASTField {
  const found = m.fields.find((x) => x.name === name);
  if (!found) throw new Error(`No field ${name} on ${m.name}`);

  return found;
}

const Target = model('Target', { id: f.record().id() });

const onDeleteSource = schema('decorators/on-delete.cerial');

function astOf(...models: ASTModel[]): SchemaAST {
  return { models, objects: [], tuples: [], literals: [], enums: [], source: '' };
}

describe('.array() carries across both halves', () => {
  test('the key becomes Record[] with an Ids suffix and the relation Relation[]', () => {
    const [key, rel] = modelNode(model('Post', { tags: f.relation(() => Target).array() })).fields;

    expect([key?.name, key?.type, key?.isArray]).toEqual(['tagIds', 'record', true]);
    expect([rel?.name, rel?.type, rel?.isArray]).toEqual(['tags', 'relation', true]);
    expect(rel?.decorators.map((d) => [d.type, d.value])).toEqual([
      ['field', 'tagIds'],
      ['model', 'Target'],
    ]);
  });

  test('matches the corpus twin for a many-to-many side', () => {
    const Course: Handle<'Course', string> = model('Course', { id: f.record().id() });
    const built = model('Student', {
      id: f.record().id(),
      name: f.string(),
      email: f.email().unique(),
      courses: f.relation(() => Course).array(),
    });
    const parsed = parsedModel(schema('relations/many-to-many.cerial'), 'Student');

    expect(withoutPosition(modelNode(built).fields)).toEqual(withoutPosition(parsed.fields));
  });

  test('matches the corpus twin for a self-referential array', () => {
    const Friend: Handle<'Friend', string> = model('Friend', {
      id: f.record().id(),
      name: f.string(),
      friends: f.relation((): Handle<'Friend', string> => Friend).array(),
    });
    const parsed = parsedModel(schema('relations/self-referential.cerial'), 'Friend');

    expect(withoutPosition(modelNode(Friend).fields)).toEqual(withoutPosition(parsed.fields));
  });

  test.each([
    ['tags', 'tagIds'],
    ['courses', 'courseIds'],
    ['friends', 'friendIds'],
    ['following', 'followingIds'],
    ['status', 'statuIds'],
  ])('the relation %s is keyed by %s', (name, key) => {
    const [derived] = modelNode(model('M', { [name]: f.relation(() => Target).array() })).fields;

    expect(derived?.name).toBe(key);
  });

  test('a name the rule misses is keyed through .field()', () => {
    const [key, rel] = modelNode(
      model('M', {
        status: f
          .relation(() => Target)
          .array()
          .field('statusIds'),
      }),
    ).fields;

    expect([key?.name, rel?.decorators[0]?.value]).toEqual(['statusIds', 'statusIds']);
  });

  test('every forward relation in the corpus is keyed by the default except the one with an override', () => {
    const misses: string[] = [];
    for (const path of ['features/extends-relations', 'relations/many-to-many', 'relations/self-referential']) {
      for (const m of parse(schema(`${path}.cerial`)).ast.models) {
        for (const field of m.fields) {
          const key = field.decorators.find((d) => d.type === 'field')?.value;
          if (field.type !== 'relation' || typeof key !== 'string') continue;
          const base = field.isArray && field.name.endsWith('s') ? field.name.slice(0, -1) : field.name;
          if (key !== `${base}${field.isArray ? 'Ids' : 'Id'}`) misses.push(`${m.name}.${field.name}`);
        }
      }
    }

    expect(misses).toEqual(['ExtRelCommentModerated.approver']);
  });
});

describe('.optional() carries across both halves', () => {
  test('both nodes are optional and nothing else changes', () => {
    const [key, rel] = modelNode(model('Post', { author: f.relation(() => Target).optional() })).fields;

    expect([key?.isOptional, rel?.isOptional]).toEqual([true, true]);
    expect(key?.decorators).toEqual([]);
  });

  test('a required relation leaves both halves required', () => {
    const [key, rel] = modelNode(model('Post', { author: f.relation(() => Target) })).fields;

    expect([key?.isOptional, rel?.isOptional]).toEqual([false, false]);
  });

  test('matches the parsed twin for an optional relation', () => {
    const built = model('Doc', { owner: f.relation(() => Target).optional() });
    const parsed = parsedModel(
      'model Doc {\n  ownerId Record?\n  owner Relation? @field(ownerId) @model(Target)\n}',
      'Doc',
    );

    expect(withoutPosition(modelNode(built).fields)).toEqual(withoutPosition(parsed.fields));
  });
});

describe('.private()', () => {
  test('marks the relation and not its key, as a !!private on the relation line does', () => {
    const built = modelNode(model('M', { owner: f.relation(() => Target).private() }));
    const parsed = parsedModel(
      'model M {\n  ownerId Record\n  owner Relation @field(ownerId) @model(Target) !!private\n}',
      'M',
    );

    expect(withoutPosition(built.fields)).toEqual(withoutPosition(parsed.fields));
    expect(fieldOf(built, 'owner').isPrivate).toBe(true);
    expect(fieldOf(built, 'ownerId')).not.toHaveProperty('isPrivate');
  });
});

describe('.onDelete() derives the key', () => {
  test('SetNull makes the key nullable', () => {
    const [key, rel] = modelNode(
      model('M', {
        a: f
          .relation(() => Target)
          .optional()
          .onDelete('SetNull'),
      }),
    ).fields;

    expect([key?.isNullable, key?.isOptional]).toEqual([true, true]);
    expect(key?.decorators.map((d) => d.type)).toEqual(['nullable']);
    expect(rel?.decorators.map((d) => [d.type, d.value])).toEqual([
      ['field', 'aId'],
      ['model', 'Target'],
      ['onDelete', 'SetNull'],
    ]);
  });

  test('SetNone makes the key optional and not nullable', () => {
    const [key] = modelNode(
      model('M', {
        a: f
          .relation(() => Target)
          .optional()
          .onDelete('SetNone'),
      }),
    ).fields;

    expect([key?.isOptional, key?.isNullable]).toEqual([true, undefined]);
  });

  test.each(['Cascade', 'Restrict', 'NoAction'] as const)('%s leaves the key a plain optional Record', (action) => {
    const [key] = modelNode(
      model('M', {
        a: f
          .relation(() => Target)
          .optional()
          .onDelete(action),
      }),
    ).fields;

    expect([key?.isOptional, key?.isNullable, key?.decorators]).toEqual([true, undefined, []]);
  });

  test('every argument the registry accepts is on the chain and reaches the node', () => {
    for (const action of ['Cascade', 'SetNull', 'SetNone', 'Restrict', 'NoAction'] as const) {
      const rel = modelNode(
        model('M', {
          a: f
            .relation(() => Target)
            .optional()
            .onDelete(action),
        }),
      ).fields[1];

      expect(rel?.decorators.find((d) => d.type === 'onDelete')?.value).toBe(action);
    }
  });

  test('an argument outside the set is refused at runtime', () => {
    const rel = f.relation(() => Target).optional() as unknown as { onDelete(v: string): unknown };

    expect(() => rel.onDelete('Nope')).toThrow('takes one of');
  });

  test('either order of .optional() and .key() reaches the same pair', () => {
    const one = f
      .relation(() => Target)
      .optional()
      .key('k')
      .onDelete('SetNull');
    const two = f
      .relation(() => Target)
      .key('k')
      .optional()
      .onDelete('SetNull');

    expect(withoutPosition(modelNode(model('M', { a: one })).fields)).toEqual(
      withoutPosition(modelNode(model('M', { a: two })).fields),
    );
  });

  test('a nullable relation also offers it, as the validator accepts nullable', () => {
    const rel = f
      .relation(() => Target)
      .nullable()
      .onDelete('Cascade');

    expect(modelNode(model('M', { a: rel })).fields[1]?.decorators.map((d) => d.type)).toContain('onDelete');
  });

  // Cascade, Restrict and NoAction twins write the key as `Record? @nullable`, which no chain call derives,
  // so those are compared on the relation line only (see the each-table below).
  test('MemberSetNull matches its twin, key and relation', () => {
    const TeamSetNull = model('TeamSetNull', { id: f.record().id() });
    const built = model('MemberSetNull', {
      id: f.record().id(),
      name: f.string(),
      team: f
        .relation(() => TeamSetNull)
        .optional()
        .onDelete('SetNull'),
    });
    const parsed = parsedModel(onDeleteSource, 'MemberSetNull');

    expect(withoutPosition(modelNode(built).fields)).toEqual(
      withoutPosition([
        fieldOf(parsed, 'id'),
        fieldOf(parsed, 'name'),
        fieldOf(parsed, 'teamId'),
        fieldOf(parsed, 'team'),
      ]),
    );
  });

  test('ProfileSetNone matches its twin, key and relation', () => {
    const UserSetNone = model('UserSetNone', { id: f.record().id() });
    const built = model('ProfileSetNone', {
      id: f.record().id(),
      bio: f.string().optional(),
      user: f
        .relation(() => UserSetNone)
        .optional()
        .onDelete('SetNone'),
    });
    const parsed = parsedModel(onDeleteSource, 'ProfileSetNone');

    expect(withoutPosition(modelNode(built).fields)).toEqual(withoutPosition(parsed.fields));
  });

  test('OdFolder.parent matches its twin, key and relation', () => {
    const OdFolder: Handle<'OdFolder', string> = model('OdFolder', {
      id: f.record().id(),
      name: f.string(),
      parent: f
        .relation((): Handle<'OdFolder', string> => OdFolder)
        .optional()
        .onDelete('SetNull')
        .key('tree'),
    });
    const parsed = parsedModel(onDeleteSource, 'OdFolder');

    expect(withoutPosition(modelNode(OdFolder).fields)).toEqual(
      withoutPosition([
        fieldOf(parsed, 'id'),
        fieldOf(parsed, 'name'),
        fieldOf(parsed, 'parentId'),
        fieldOf(parsed, 'parent'),
      ]),
    );
  });

  test.each([
    ['Member', 'team', 'Team', 'Cascade'],
    ['Employee', 'department', 'Department', 'Restrict'],
    ['MemberNoAction', 'team', 'TeamNoAction', 'NoAction'],
    ['OdParent', 'grandparent', 'OdGrandparent', 'Cascade'],
    ['OdChild', 'parent', 'OdParent', 'Cascade'],
  ] as const)(
    '%s.%s matches the twin relation line and differs from its key only by @nullable',
    (owner, name, target, action) => {
      const Peer = model(target, { id: f.record().id() });
      const built = modelNode(
        model(owner, {
          [name]: f
            .relation(() => Peer)
            .optional()
            .onDelete(action),
        }),
      );
      const parsed = parsedModel(onDeleteSource, owner);
      const keyName = `${name}Id`;

      expect(withoutPosition([fieldOf(built, name)])).toEqual(withoutPosition([fieldOf(parsed, name)]));
      expect(fieldOf(parsed, keyName).isNullable).toBe(true);
      expect(fieldOf(built, keyName).isNullable).toBeUndefined();
      expect(fieldOf(built, keyName).isOptional).toBe(fieldOf(parsed, keyName).isOptional);
    },
  );
});

describe('the validators agree with what the builder emits', () => {
  test('SetNull and SetNone pairs pass the on-delete placement rule', () => {
    const nullable = modelNode(
      model('A', {
        id: f.record().id(),
        t: f
          .relation(() => Target)
          .optional()
          .onDelete('SetNull'),
      }),
    );
    const none = modelNode(
      model('B', {
        id: f.record().id(),
        t: f
          .relation(() => Target)
          .optional()
          .onDelete('SetNone'),
      }),
    );

    expect(validateOnDeletePlacement(astOf(nullable, none))).toEqual([]);
  });

  test('a required relation forced through a cast gets the DSL refusal', () => {
    const rel = f.relation(() => Target) as unknown as { onDelete(v: string): unknown };
    const built = modelNode(model('A', { id: f.record().id(), t: rel.onDelete('Cascade') as RelationBuilder }));

    expect(validateOnDeletePlacement(astOf(built)).map((e) => e.message)).toEqual([
      expect.stringContaining('@onDelete is only allowed on optional or nullable relations'),
    ]);
  });

  test('an array relation forced through a cast gets the DSL refusal', () => {
    const rel = f.relation(() => Target).array() as unknown as { onDelete(v: string): unknown };
    const built = modelNode(model('A', { id: f.record().id(), t: rel.onDelete('Cascade') as RelationBuilder }));

    expect(validateOnDeletePlacement(astOf(built)).map((e) => e.message)).toContainEqual(
      expect.stringContaining('@onDelete is not allowed on array relations'),
    );
  });

  test('a built forward pair passes the key/relation consistency rules', () => {
    const built = modelNode(model('A', { id: f.record().id(), t: f.relation(() => Target).optional() }));

    expect(validateCardinalityMatch(astOf(built))).toEqual([]);
  });
});
