/**
 * Unknown-model guard tests
 * The get trap must name an unknown model without breaking `await`, serialisation or real members
 */

import { describe, expect, test } from 'bun:test';
import { guardUnknownModels } from '../../src/client/unknown-model-guard';
import { CerialUnknownModelError } from '../../src/errors';
import { parseModelRegistry } from '../test-helpers';

const registry = parseModelRegistry(`
model User {
  id Record @id
  name String
}

model Post {
  id Record @id
  title String
}
`);

class FakeClient {
  readonly label = 'fake';
  optionalField?: string = undefined;

  get User(): string {
    return 'user-model';
  }

  get isConnected(): boolean {
    return this.label === 'fake';
  }

  connect(): string {
    return `connected:${this.label}`;
  }
}

const createGuarded = (): FakeClient => guardUnknownModels(new FakeClient(), registry);
const asRecord = (client: FakeClient): Record<string, unknown> => client as unknown as Record<string, unknown>;

describe('guardUnknownModels', () => {
  test('throws an unknown-model error naming the model and the valid ones', () => {
    const client = asRecord(createGuarded());

    let caught: unknown;
    try {
      client.Uesr;
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CerialUnknownModelError);
    const error = caught as CerialUnknownModelError;
    expect(error.code).toBe('C2000');
    expect(error.model).toBe('Uesr');
    expect(error.message).toBe('Unknown model "Uesr". Valid models: User, Post.');
  });

  test('a typo throws before any method is reached', () => {
    const client = createGuarded() as unknown as Record<string, { findMany(): unknown }>;

    expect(() => client.Uesr?.findMany()).toThrow(CerialUnknownModelError);
  });

  test('passes getters, methods and fields through with the instance as this', () => {
    const client = createGuarded();

    expect(client.User).toBe('user-model');
    expect(client.isConnected).toBe(true);
    expect(client.connect()).toBe('connected:fake');
    expect(client.label).toBe('fake');
  });

  test('a field declared but undefined is not an unknown name', () => {
    expect(createGuarded().optionalField).toBeUndefined();
  });

  test('symbol access passes through', () => {
    const client = createGuarded() as unknown as Record<symbol, unknown>;

    expect(client[Symbol.toPrimitive]).toBeUndefined();
    expect(client[Symbol.iterator]).toBeUndefined();
    expect(client[Symbol.toStringTag]).toBeUndefined();
  });

  test('awaiting the client resolves to the client', async () => {
    const client = createGuarded();

    expect(await client).toBe(client);
  });

  test('promise-protocol and serialisation probes return undefined', () => {
    const client = asRecord(createGuarded());

    for (const name of ['then', 'catch', 'finally', 'toJSON', '$$typeof', 'asymmetricMatch', 'nodeType']) {
      expect(client[name]).toBeUndefined();
    }
    expect(typeof client.toString).toBe('function');
    expect(typeof client.valueOf).toBe('function');
    expect(client.constructor).toBe(FakeClient);
  });

  test('JSON.stringify, spreading, in and Object.keys keep working', () => {
    const client = createGuarded();

    expect(JSON.parse(JSON.stringify(client))).toEqual({ label: 'fake' });
    expect({ ...client }).toEqual({ label: 'fake', optionalField: undefined });
    expect('User' in client).toBe(true);
    expect('Uesr' in client).toBe(false);
    expect(Object.keys(client)).toEqual(['label', 'optionalField']);
  });
});
