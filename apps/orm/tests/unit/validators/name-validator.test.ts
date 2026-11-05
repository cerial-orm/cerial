/**
 * Unit Tests: Duplicate Name Validator
 *
 * Duplicate declarations are only visible before inheritance resolution, which keys
 * types by name. These tests pin both halves: the validator sees the duplicates in a
 * merged AST, and the resolver would have hidden them.
 */

import { describe, expect, test } from 'bun:test';
import { validateDuplicateNames } from '../../../src/cli/validators';
import { validateAll } from './helpers';
import { parse } from '../../../src/parser/parser';
import { resolveInheritance } from '../../../src/resolver';
import type { SchemaAST } from '../../../src/types';

/** Merge several files the way generate does */
function merge(...sources: string[]): SchemaAST {
  const asts = sources.map((s) => parse(s).ast);

  return {
    source: '',
    models: asts.flatMap((a) => a.models),
    objects: asts.flatMap((a) => a.objects),
    tuples: asts.flatMap((a) => a.tuples),
    literals: asts.flatMap((a) => a.literals),
    enums: asts.flatMap((a) => a.enums),
  };
}

const messages = (ast: SchemaAST) => validateDuplicateNames(ast).map((e) => e.message);
// The part naming the kind and the name, without the origins that follow it
const heads = (ast: SchemaAST) => messages(ast).map((m) => m.replace(/ \(declared in .*\)$/, ''));

describe('Duplicate Name Validator', () => {
  const user = 'model User {\n  id Record @id\n}';

  test('reports a model declared in two files', () => {
    expect(heads(merge(user, user))).toEqual(['Duplicate model name: User']);
  });

  test('the resolver collapses that duplicate, which is why the check runs first', () => {
    const merged = merge(user, user);

    expect(merged.models).toHaveLength(2);
    expect(resolveInheritance(merged).models).toHaveLength(1);
  });

  test('reports a duplicate of every kind', () => {
    const found = heads(
      merge(
        'object Geo {\n  lat Float\n}\ntuple Pair {\n  Int,\n  Int\n}\nliteral Lv { "a", "b" }\nenum Role { A }',
        'object Geo {\n  lng Float\n}\ntuple Pair {\n  Float,\n  Float\n}\nliteral Lv { "c" }\nenum Role { B }',
      ),
    );

    expect(found).toEqual([
      'Duplicate object name: Geo',
      'Duplicate tuple name: Pair',
      'Duplicate literal name: Lv',
      'Duplicate enum name: Role',
    ]);
  });

  test('names where both declarations are, whether they come from DSL or TypeScript', () => {
    const [dsl] = merge(user).models;
    const ts = { ...dsl!, origin: { kind: 'ts' as const, file: '/app/user.ts', export: 'User' } };
    const [message] = messages({ ...merge(user), models: [dsl!, ts] });

    expect(message).toContain('Duplicate model name: User');
    expect(message).toContain(`${dsl!.origin.file}:`);
    expect(message).toContain('/app/user.ts (export User)');
  });

  test('accepts distinct names across files', () => {
    expect(messages(merge(user, 'model Guest {\n  id Record @id\n}'))).toEqual([]);
  });

  describe('origins of every kind', () => {
    const sources: Record<'models' | 'objects' | 'tuples' | 'literals' | 'enums', string> = {
      models: 'model Dup {\n  id Record @id\n}',
      objects: 'object Dup {\n  x Int\n}',
      tuples: 'tuple Dup {\n  Int,\n  Int\n}',
      literals: 'literal Dup { "a" }',
      enums: 'enum Dup { A }',
    };

    for (const [key, source] of Object.entries(sources) as Array<[keyof typeof sources, string]>) {
      const fromTs = (file: string, name: string) => {
        const [node] = merge(source)[key];

        return { ...node!, origin: { kind: 'ts' as const, file, export: name } };
      };

      test(`${key}: two TypeScript declarations name both exports`, () => {
        const ast: SchemaAST = { ...merge(), [key]: [fromTs('/app/a.ts', 'DupA'), fromTs('/app/b.ts', 'DupB')] };
        const [message] = messages(ast);

        expect(message).toContain('/app/a.ts (export DupA) and in /app/b.ts (export DupB)');
      });

      test(`${key}: a .cerial and a TypeScript declaration name a line and an export`, () => {
        const [dsl] = merge(source)[key];
        const ast: SchemaAST = { ...merge(), [key]: [dsl!, fromTs('/app/b.ts', 'Dup')] };
        const [message] = messages(ast);

        expect(message).toMatch(/declared in .+:\d+ and in \/app\/b\.ts \(export Dup\)/);
      });

      test(`${key}: a repeated source is still a duplicate here, so deduplication must happen before the merge`, () => {
        expect(messages(merge(source, source))).toHaveLength(1);
      });
    }
  });

  describe('a name shared by two kinds', () => {
    const sources = {
      model: 'model Dup {\n  id Record @id\n}',
      object: 'object Dup {\n  x Int\n}',
      tuple: 'tuple Dup {\n  Int,\n  Int\n}',
      literal: "literal Dup { 'a' }",
      enum: 'enum Dup { A }',
    } as const;
    type Kind = keyof typeof sources;
    const kinds = Object.keys(sources) as Kind[];
    // Models come first, then objects, tuples, literals and enums: the later kind is the one reported
    const pairs = kinds.flatMap((a, i) => kinds.slice(i + 1).map((b): [Kind, Kind] => [a, b]));

    test('there are ten forbidden pairs, one for every two kinds', () => {
      expect(pairs).toHaveLength(10);
    });

    for (const [first, second] of pairs) {
      test(`${first} and ${second}: one error naming both kinds and both origins`, () => {
        const found = validateAll(merge(sources[first], sources[second]));
        const expected = `Duplicate name: Dup (declared as ${first} in <input>:1 and as ${second} in <input>:1)`;

        expect(found.map((e) => e.message)).toEqual([expected]);
      });

      test(`${second} and ${first}: the same single error whichever file comes first`, () => {
        const found = validateAll(merge(sources[second], sources[first]));

        expect(found.map((e) => e.message)).toEqual([
          `Duplicate name: Dup (declared as ${first} in <input>:1 and as ${second} in <input>:1)`,
        ]);
      });
    }

    test('names a TypeScript origin by file and export', () => {
      const [dsl] = merge(sources.model).models;
      const ts = {
        ...merge(sources.object).objects[0]!,
        origin: { kind: 'ts' as const, file: '/app/o.ts', export: 'Dup' },
      };
      const ast: SchemaAST = { ...merge(), models: [dsl!], objects: [ts] };

      expect(messages(ast)).toEqual([
        'Duplicate name: Dup (declared as model in <input>:1 and as object in /app/o.ts (export Dup))',
      ]);
    });

    test('each later declaration is one error against the first', () => {
      expect(messages(merge(sources.model, sources.object, sources.tuple))).toHaveLength(2);
    });

    test('distinct names across all five kinds raise nothing', () => {
      const ast = merge(
        'model Alpha {\n  id Record @id\n}',
        'object B {\n  x Int\n}',
        'tuple C {\n  Int,\n  Int\n}',
        "literal D { 'a' }",
        'enum E { A }',
      );

      expect(validateAll(ast)).toEqual([]);
    });

    test('an abstract model leaves no type behind, so an object may reuse its name and still resolves', () => {
      const ast = merge('abstract model Dup {\n  id Record @id\n}', sources.object);

      expect(validateAll(ast)).toEqual([]);
      expect(resolveInheritance(ast).objects).toHaveLength(1);
    });
  });
});

describe('Case-only name collisions', () => {
  const m = (n: string) => `model ${n} {\n  id Record @id\n}`;
  const o = (n: string) => `object ${n} {\n  a String\n}`;
  const caseMsgs = (...src: string[]) =>
    messages(merge(...src)).filter((x) => x.startsWith('Names differ only in case'));

  test('refuses Post and POST, naming both and their origins', () => {
    const [msg = '', ...rest] = caseMsgs(m('Post'), m('POST'));

    expect(rest).toEqual([]);
    expect(msg).toContain('Post');
    expect(msg).toContain('POST');
    expect(msg.match(/declared in/g)).toHaveLength(2);
  });

  test('refuses across kinds: model Box and object BOX', () => {
    expect(caseMsgs(m('Box'), o('BOX'))).toHaveLength(1);
  });

  test('refuses literal Lvl and enum LVL', () => {
    expect(caseMsgs("literal Lvl {\n  'a'\n}", 'enum LVL {\n  A\n}')).toHaveLength(1);
  });

  test('allows distinct names', () => {
    expect(caseMsgs(m('Post'), m('Comment'), o('PostTag'))).toEqual([]);
  });

  test('an exact repeat is reported as a duplicate, not a case collision', () => {
    expect(caseMsgs(m('Post'), m('Post'))).toEqual([]);
  });
});

describe('Reserved and derived names', () => {
  const m = (n: string) => `model ${n} {\n  id Record @id\n}`;
  const o = (n: string) => `object ${n} {\n  a String\n}`;
  const lit = (n: string) => `literal ${n} {\n  'a'\n}`;
  const msgs = (...src: string[]) => messages(merge(...src));
  const collisions = (...src: string[]) => msgs(...src).filter((x) => x.startsWith('Name collision'));

  test('refuses index in any casing for a literal', () => {
    expect(msgs(lit('Index')).filter((x) => x.startsWith('Reserved literal name'))).toHaveLength(1);
    expect(msgs(lit('INDEX')).filter((x) => x.startsWith('Reserved literal name'))).toHaveLength(1);
  });

  test('refuses a model named like another model derived type, naming both', () => {
    const [msg = ''] = collisions(m('Post'), m('PostWhere'));

    expect(msg).toContain('model Post');
    expect(msg).toContain('model PostWhere');
  });

  test('refuses an object named PostCreate next to model Post', () => {
    expect(collisions(m('Post'), o('PostCreate'))).not.toEqual([]);
  });

  test('refuses case-variant derived names', () => {
    expect(collisions(m('Post'), o('POSTWHERE'))).not.toEqual([]);
  });

  test('refuses names whose own derived types meet: PostNested, PostGroupBy, PostFindUnique', () => {
    for (const other of [m('PostNested'), m('PostGroupBy'), o('PostFindUnique')]) {
      expect(collisions(m('Post'), other)).not.toEqual([]);
    }
  });

  test('refuses a declaration named like a fixed client export', () => {
    for (const name of [
      'CerialClient',
      'ClientOptions',
      'IncludeArg',
      'TypedDb',
      'CerialTransaction',
      'CerialId',
      'SqlFragment',
    ]) {
      const [msg = ''] = collisions(m(name));

      expect(msg).toContain('the generated client');
      expect(msg).toContain(name);
    }
  });

  test('allows Post with PostTag and with Comment', () => {
    expect(msgs(m('Post'), m('PostTag'))).toEqual([]);
    expect(msgs(m('Post'), m('Comment'))).toEqual([]);
  });
});
