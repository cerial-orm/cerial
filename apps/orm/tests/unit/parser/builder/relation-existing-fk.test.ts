import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { validateCardinalityMatch, validatePKStructure } from '../../../../src/cli/validators/relation-validator';
import { f, model, modelNode } from '../../../../src/parser/builder';
import type { Handle } from '../../../../src/parser/builder';
import { parse } from '../../../../src/parser/parser';
import type { ASTModel, SchemaAST } from '../../../../src/types';
import { withoutPosition } from './helpers';

const schema = (path: string): string => readFileSync(new URL(`../../../e2e/schemas/${path}`, import.meta.url), 'utf8');

function parsedModel(source: string, name: string): ASTModel {
  const { ast, errors } = parse(source);
  expect(errors).toHaveLength(0);
  const found = ast.models.find((m) => m.name === name);
  if (!found) throw new Error(`No model ${name}`);

  return found;
}

/** The whole built model against the whole parsed one, positions aside. */
function expectTwin(built: object, source: string, name: string): void {
  expect(withoutPosition(modelNode(built))).toEqual(withoutPosition(parsedModel(source, name)));
}

function astOf(...models: ASTModel[]): SchemaAST {
  return { models, objects: [], tuples: [], literals: [], enums: [], source: '' };
}

const onDelete = schema('decorators/on-delete.cerial');
const composite = schema('decorators/composite-unique-records.cerial');
const selfRef = schema('relations/self-referential.cerial');
const Target = model('Target', { id: f.record().id() });

describe('.field(name) binds to a field the model declares', () => {
  const Attendee = model('Attendee', { id: f.record().id() });
  const Workshop = model('Workshop', { id: f.record().id() });

  test('Registration matches its twin, the keys sitting before the relations', () => {
    const Registration = model(
      'Registration',
      {
        id: f.record().id(),
        attendeeId: f.record(),
        workshopId: f.record(),
        attendee: f.relation(() => Attendee).field('attendeeId'),
        workshop: f.relation(() => Workshop).field('workshopId'),
        role: f.string().optional(),
      },
      { unique: { name: 'attendeeWorkshop', fields: ['attendeeId', 'workshopId'] } },
    );

    expectTwin(Registration, composite, 'Registration');
  });

  test('Ticket matches its twin, with the index and unique directives', () => {
    const Ticket = model(
      'Ticket',
      {
        id: f.record().id(),
        attendeeId: f.record(),
        workshopId: f.record(),
        attendee: f.relation(() => Attendee).field('attendeeId'),
        workshop: f.relation(() => Workshop).field('workshopId'),
        seat: f.string(),
      },
      {
        index: [
          { name: 'ticketAttendeeWorkshop', fields: ['attendeeId', 'workshopId'] },
          { name: 'ticketAttendeeSeat', fields: ['attendeeId', 'seat'] },
        ],
        unique: { name: 'ticketWorkshopSeat', fields: ['workshopId', 'seat'] },
      },
    );

    expectTwin(Ticket, composite, 'Ticket');
  });

  test('the relation is emitted alone, and a key written after it still binds', () => {
    const [rel, key, ...rest] = modelNode(
      model('M', { author: f.relation(() => Target).field('writerId'), writerId: f.record() }),
    ).fields;

    expect([rel?.name, key?.name, rest.length]).toEqual(['author', 'writerId', 0]);
  });

  test.each([
    ['Member', 'team', 'Team', 'Cascade'],
    ['Employee', 'department', 'Department', 'Restrict'],
    ['MemberNoAction', 'team', 'TeamNoAction', 'NoAction'],
    ['MemberSetNull', 'team', 'TeamSetNull', 'SetNull'],
  ] as const)('%s.%s matches its twin with a Record? @nullable key', (owner, name, target, action) => {
    const Peer = model(target, { id: f.record().id() });
    const built = model(owner, {
      id: f.record().id(),
      name: f.string(),
      [`${name}Id`]: f.record().optional().nullable(),
      [name]: f
        .relation(() => Peer)
        .field(`${name}Id`)
        .optional()
        .onDelete(action),
    });

    expectTwin(built, onDelete, owner);
  });

  test('OdParent and OdChild match their twins, the reverse side included', () => {
    const OdGrandparent = model('OdGrandparent', { id: f.record().id() });
    const OdChild = model('OdChild', {
      id: f.record().id(),
      name: f.string(),
      parentId: f.record().optional().nullable(),
      parent: f
        .relation((): Handle<'OdParent', string> => OdParent)
        .field('parentId')
        .optional()
        .onDelete('Cascade'),
    });
    const OdParent = model('OdParent', {
      id: f.record().id(),
      name: f.string(),
      grandparentId: f.record().optional().nullable(),
      grandparent: f
        .relation(() => OdGrandparent)
        .field('grandparentId')
        .optional()
        .onDelete('Cascade'),
      children: f.reverse(() => OdChild).array(),
    });

    expectTwin(OdParent, onDelete, 'OdParent');
    expectTwin(OdChild, onDelete, 'OdChild');
  });

  test('OdFolder still matches with the key declared, not derived', () => {
    const OdFolder: Handle<'OdFolder', string> = model('OdFolder', {
      id: f.record().id(),
      name: f.string(),
      parentId: f.record().optional().nullable(),
      parent: f
        .relation((): Handle<'OdFolder', string> => OdFolder)
        .field('parentId')
        .optional()
        .onDelete('SetNull')
        .key('tree'),
      children: f
        .reverse((): Handle<'OdFolder', string> => OdFolder)
        .array()
        .key('tree'),
    });

    expectTwin(OdFolder, onDelete, 'OdFolder');
  });

  test('the Record? @nullable keys in relations/ match their twins', () => {
    const Writer = model('Writer', { id: f.record().id() });
    const Document = model('Document', {
      id: f.record().id(),
      title: f.string(),
      authorId: f.record(),
      author: f
        .relation(() => Writer)
        .field('authorId')
        .key('author'),
      reviewerId: f.record().optional().nullable(),
      reviewer: f
        .relation(() => Writer)
        .field('reviewerId')
        .optional()
        .key('reviewer'),
    });
    const Person: Handle<'Person', string> = model('Person', {
      id: f.record().id(),
      name: f.string(),
      mentorId: f.record().optional().nullable(),
      mentor: f
        .relation((): Handle<'Person', string> => Person)
        .field('mentorId')
        .optional(),
    });
    const Assistant: Handle<'Assistant', string> = model('Assistant', {
      id: f.record().id(),
      name: f.string(),
      assistsId: f.record().optional().nullable(),
      assists: f
        .relation((): Handle<'Assistant', string> => Assistant)
        .field('assistsId')
        .optional()
        .key('assist'),
      assistedBy: f
        .reverse((): Handle<'Assistant', string> => Assistant)
        .optional()
        .key('assist'),
    });
    const Single: Handle<'EmployeeSingleSided', string> = model('EmployeeSingleSided', {
      id: f.record().id(),
      name: f.string(),
      managerId: f.record().optional().nullable(),
      manager: f
        .relation((): Handle<'EmployeeSingleSided', string> => Single)
        .field('managerId')
        .optional(),
    });
    const Reports: Handle<'EmployeeWithReports', string> = model('EmployeeWithReports', {
      id: f.record().id(),
      name: f.string(),
      managerId: f.record().optional().nullable(),
      manager: f
        .relation((): Handle<'EmployeeWithReports', string> => Reports)
        .field('managerId')
        .optional()
        .key('manages'),
      directReports: f
        .reverse((): Handle<'EmployeeWithReports', string> => Reports)
        .array()
        .key('manages'),
    });
    const Tree: Handle<'CategoryTree', string> = model('CategoryTree', {
      id: f.record().id(),
      name: f.string(),
      parentId: f.record().optional().nullable(),
      parent: f
        .relation((): Handle<'CategoryTree', string> => Tree)
        .field('parentId')
        .optional()
        .key('hierarchy'),
      children: f
        .reverse((): Handle<'CategoryTree', string> => Tree)
        .array()
        .key('hierarchy'),
    });
    const multi = schema('relations/multi-relation.cerial');

    expectTwin(Document, multi, 'Document');
    expectTwin(Person, selfRef, 'Person');
    expectTwin(Assistant, selfRef, 'Assistant');
    expectTwin(Single, selfRef, 'EmployeeSingleSided');
    expectTwin(Reports, selfRef, 'EmployeeWithReports');
    expectTwin(Tree, selfRef, 'CategoryTree');
  });

  test('the bound key keeps the shape its own declaration gave it', () => {
    const declared = f.record().optional().nullable();
    const built = modelNode(
      model('M', {
        ownerId: declared,
        owner: f
          .relation(() => Target)
          .field('ownerId')
          .optional(),
      }),
    );
    const alone = modelNode(model('N', { ownerId: declared }));

    expect(withoutPosition(built.fields[0])).toEqual(withoutPosition(alone.fields[0]));
    expect([built.fields[0]?.isOptional, built.fields[0]?.isNullable, built.fields[0]?.isArray]).toEqual([
      true,
      true,
      undefined,
    ]);
  });

  test('an array relation binds to a Record[] it declares', () => {
    const built = model('M', {
      tagIds: f.record().array(),
      tags: f
        .relation(() => Target)
        .field('tagIds')
        .array(),
    });
    const parsed = parsedModel('model M {\n  tagIds Record[]\n  tags Relation[] @field(tagIds) @model(Target)\n}', 'M');

    expect(withoutPosition(modelNode(built))).toEqual(withoutPosition(parsed));
  });
});

describe('.field(name) binds to a field inherited through extends', () => {
  const Profile = model(
    'OnDeleteProfile',
    {
      id: f.record().id().private(),
      bio: f.string().optional(),
      userId: f.record().optional().nullable(),
    },
    { abstract: true },
  );

  test.each([
    ['ProfileCascade', 'UserCascade', 'Cascade'],
    ['ProfileNoAction', 'UserNoAction', 'NoAction'],
    ['ProfileRestrict', 'UserRestrict', 'Restrict'],
    ['ProfileSetNull', 'UserSetNull', 'SetNull'],
  ] as const)('%s matches its twin and emits no key of its own', (owner, target, action) => {
    const User = model(target, { id: f.record().id() });
    const built = model(
      owner,
      {
        user: f
          .relation(() => User)
          .field('userId')
          .optional()
          .onDelete(action),
      },
      { extends: Profile },
    );

    expectTwin(built, onDelete, owner);
    expect(modelNode(built).fields.map((x) => x.name)).toEqual(['user']);
  });

  test('a field two levels up is inherited too', () => {
    const Middle = model('Middle', { note: f.string() }, { abstract: true, extends: Profile });
    const built = model(
      'Leaf',
      {
        user: f
          .relation(() => Target)
          .field('userId')
          .optional(),
      },
      { extends: Middle },
    );

    expect(modelNode(built).fields.map((x) => x.name)).toEqual(['user']);
  });

  test('a pick that keeps the field still binds', () => {
    const built = model(
      'C',
      {
        user: f
          .relation(() => Target)
          .field('userId')
          .optional(),
      },
      { extends: Profile.pick('userId') },
    );

    expect(modelNode(built).fields.map((x) => x.name)).toEqual(['user']);
  });

  test('an omit that drops the field derives it, as the DSL would', () => {
    const built = model(
      'C',
      {
        user: f
          .relation(() => Target)
          .field('userId')
          .optional(),
      },
      { extends: Profile.omit('userId') },
    );
    const parsed = parsedModel(
      [
        'abstract model OnDeleteProfile {\n  id Record @id !!private\n  bio String?\n  userId Record? @nullable\n}',
        'model C extends OnDeleteProfile[!userId] {\n  userId Record?\n  user Relation? @field(userId) @model(Target)\n}',
      ].join('\n'),
      'C',
    );

    expect(withoutPosition(modelNode(built))).toEqual(withoutPosition(parsed));
  });

  test('a pick that leaves the field out derives it', () => {
    const built = modelNode(
      model(
        'C',
        {
          user: f
            .relation(() => Target)
            .field('userId')
            .optional(),
        },
        { extends: Profile.pick('bio') },
      ),
    );

    expect(built.fields.map((x) => x.name)).toEqual(['userId', 'user']);
  });

  test('a field of a model that is not an ancestor derives', () => {
    const Other = model('Other', { userId: f.record() });
    const built = modelNode(model('C', { user: f.relation(() => Target).field('userId') }));

    expect(Other).toBeDefined();
    expect(built.fields.map((x) => x.name)).toEqual(['userId', 'user']);
  });

  test('binding is decided when the model is built, so a parent thunk is never called at construction', () => {
    let calls = 0;
    const Parent = model('P', { ownerId: f.record() }, { abstract: true });
    const Child = model(
      'C',
      {
        owner: f
          .relation(() => {
            calls += 1;

            return Target;
          })
          .field('ownerId'),
      },
      { extends: Parent },
    );

    expect(calls).toBe(0);
    expect(modelNode(Child).fields.map((x) => x.name)).toEqual(['owner']);
  });
});

describe('.field(name) found nowhere derives under that name', () => {
  test('approver reproduces features/extends-relations.cerial', () => {
    const Moderated = model('ExtRelBlogAuthor', { id: f.record().id() });
    const built = model('ExtRelCommentModerated', {
      approver: f
        .relation(() => Moderated)
        .field('approvedBy')
        .optional(),
    });
    const parsed = parsedModel(
      'model ExtRelCommentModerated {\n  approvedBy Record?\n  approver Relation? @field(approvedBy) @model(ExtRelBlogAuthor)\n}',
      'ExtRelCommentModerated',
    );

    expect(withoutPosition(modelNode(built))).toEqual(withoutPosition(parsed));
  });

  test('a derived name that collides with a declared field, with no .field(), still throws', () => {
    const built = model('M', { authorId: f.record(), author: f.relation(() => Target) });

    expect(() => modelNode(built)).toThrow('declares field authorId twice');
  });

  test('the same name given to .field() binds instead of throwing', () => {
    const built = model('M', { authorId: f.record(), author: f.relation(() => Target).field('authorId') });

    expect(modelNode(built).fields.map((x) => x.name)).toEqual(['authorId', 'author']);
  });
});

describe('a bound key that disagrees gets the DSL refusal', () => {
  test('a key that is not a Record is refused as a missing Record field', () => {
    const built = modelNode(
      model('M', { id: f.record().id(), code: f.string(), owner: f.relation(() => Target).field('code') }),
    );
    const twin = parsedModel(
      'model M {\n  id Record @id\n  code String\n  owner Relation @field(code) @model(Target)\n}',
      'M',
    );
    const messages = validatePKStructure(astOf(built)).map((e) => e.message);

    expect(messages).toEqual([expect.stringContaining('references non-existent Record field "code"')]);
    expect(messages).toEqual(validatePKStructure(astOf(twin)).map((e) => e.message));
  });

  test('an optional relation on a required key is refused', () => {
    const built = modelNode(
      model('M', {
        ownerId: f.record(),
        owner: f
          .relation(() => Target)
          .field('ownerId')
          .optional(),
      }),
    );

    expect(validateCardinalityMatch(astOf(built)).map((e) => e.message)).toEqual([
      expect.stringContaining('Optionality mismatch'),
    ]);
  });

  test('an array relation on a single key is refused', () => {
    const built = modelNode(
      model('M', {
        ownerId: f.record(),
        owner: f
          .relation(() => Target)
          .field('ownerId')
          .array(),
      }),
    );

    expect(validateCardinalityMatch(astOf(built)).map((e) => e.message)).toEqual([
      expect.stringContaining('Cardinality mismatch'),
    ]);
  });

  test('a single relation on a Record[] key is refused', () => {
    const built = modelNode(
      model('M', { ownerIds: f.record().array(), owner: f.relation(() => Target).field('ownerIds') }),
    );

    expect(validateCardinalityMatch(astOf(built)).map((e) => e.message)).toEqual([
      expect.stringContaining('Cardinality mismatch'),
    ]);
  });

  test('a matching bound key passes both rules', () => {
    const built = modelNode(model('M', { ownerId: f.record(), owner: f.relation(() => Target).field('ownerId') }));

    expect([...validatePKStructure(astOf(built)), ...validateCardinalityMatch(astOf(built))]).toEqual([]);
  });
});

describe('a relation line carries nothing the validators refuse', () => {
  test.each(['nullable', 'readonly', 'distinct', 'sort'])('no .%s() method', (method) => {
    const rel = f.relation(() => Target) as unknown as Record<string, unknown>;

    expect(rel[method]).toBeUndefined();
  });

  test('.key, .onDelete and .private remain', () => {
    const rel = f.relation(() => Target).optional() as unknown as Record<string, unknown>;

    expect(['key', 'onDelete', 'private', 'field'].map((m) => typeof rel[m])).toEqual(Array(4).fill('function'));
  });
});
