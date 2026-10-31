import { describe, expect, test } from 'bun:test';
import { CerialGenerationError } from '../../../../src/errors';
import { f, model, object } from '../../../../src/parser/builder';
import type { Handle } from '../../../../src/parser/builder';
import { defineSchema, isSchemaRegistration } from '../../../../src/parser/builder/define-schema';

const User = model('User', { id: f.record().id() });
const Post = model('Post', { id: f.record().id() });

function refusal(call: () => unknown): CerialGenerationError {
  try {
    call();
  } catch (error) {
    expect(error).toBeInstanceOf(CerialGenerationError);

    return error as CerialGenerationError;
  }
  throw new Error('defineSchema did not refuse');
}

describe('defineSchema', () => {
  test('returns a frozen registration listing the models in order', () => {
    const registration = defineSchema({ models: [User, Post] });

    expect(registration.models).toEqual([User, Post]);
    expect(Object.isFrozen(registration)).toBe(true);
    expect(Object.isFrozen(registration.models)).toBe(true);
  });

  test('copies the list, so editing the argument later changes nothing', () => {
    const models: Handle<string, unknown>[] = [User];
    const registration = defineSchema({ models });
    models.push(Post);

    expect(registration.models).toEqual([User]);
  });

  test('accepts an empty list', () => {
    expect(defineSchema({ models: [] }).models).toEqual([]);
  });

  test('the result is recognised, a lookalike object is not', () => {
    expect(isSchemaRegistration(defineSchema({ models: [User] }))).toBe(true);
    expect(isSchemaRegistration({ models: [User] })).toBe(false);
    expect(isSchemaRegistration(null)).toBe(false);
    expect(isSchemaRegistration('x')).toBe(false);
  });

  test('a second copy of the module recognises a registration the first made', async () => {
    const first = await import('../../../../src/parser/builder/define-schema');
    const copyPath: string = '../../../../src/parser/builder/define-schema.ts?second-copy';
    const second = (await import(copyPath)) as typeof first;

    expect(second.isSchemaRegistration).not.toBe(first.isSchemaRegistration);
    expect(second.isSchemaRegistration(first.defineSchema({ models: [User] }))).toBe(true);
  });

  describe('refuses', () => {
    test('a list that is not an array', () => {
      // @ts-expect-error -- models must be an array
      expect(refusal(() => defineSchema({ models: User })).message).toContain('"models" must be an array');
    });

    test('a missing models key', () => {
      // @ts-expect-error -- models is required
      expect(refusal(() => defineSchema({})).message).toContain('"models" must be an array');
    });

    test('no argument', () => {
      // @ts-expect-error -- the argument is required
      expect(refusal(() => defineSchema()).message).toContain('"models" must be an array');
    });

    test('an item that is not a model, naming its position and what it was', () => {
      // @ts-expect-error -- a string is not a model
      expect(refusal(() => defineSchema({ models: [User, 'Post'] })).message).toContain('models[1] is string');
      // @ts-expect-error -- undefined is not a model
      expect(refusal(() => defineSchema({ models: [undefined] })).message).toContain('models[0] is undefined');
      // @ts-expect-error -- null is not a model
      expect(refusal(() => defineSchema({ models: [null] })).message).toContain('models[0] is null');
      // @ts-expect-error -- a nested array is not a model
      expect(refusal(() => defineSchema({ models: [[User]] })).message).toContain('models[0] is an array');
    });

    test('an object, which is a declaration but not a model', () => {
      const Address = object('Address', { street: f.string() });

      // Typed as a handle too, so only the runtime check can tell it from a model
      expect(refusal(() => defineSchema({ models: [Address] })).message).toContain('models[0] is object');
    });

    test('a plain object shaped like a handle', () => {
      // Structurally a handle, so only the runtime check can tell it from a model
      expect(refusal(() => defineSchema({ models: [{ name: 'User' }] })).message).toContain('models[0] is object');
    });
  });
});
