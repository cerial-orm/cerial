import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { CerialError, CerialUnknownModelError } from 'cerial';
import { type CerialClient, createTestClient, testConfig } from '../test-helper';

/** Reads a property the type checker would reject, as a JavaScript consumer or a dynamic access can. */
const readUntyped = (client: CerialClient, name: string): unknown =>
  (client as unknown as Record<string, unknown>)[name];

// The classes come from 'cerial', the same built entry the generated client uses, so instanceof
// holds across the boundary. Importing them from src/ instead would compare against a second class.
const messageOf = (read: () => unknown): string => {
  try {
    read();
  } catch (error) {
    expect(error).toBeInstanceOf(CerialUnknownModelError);
    expect(error).toBeInstanceOf(CerialError);
    const named = error as CerialUnknownModelError;
    expect(named.code).toBe('C2000');

    return named.message;
  }

  throw new Error('expected the read to throw');
};

describe('E2E Unknown model on the generated client', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  test('client.Uesr throws the same message as client.db.Uesr', () => {
    const direct = messageOf(() => readUntyped(client, 'Uesr'));
    const viaDb = messageOf(() => readUntyped(client.db as unknown as CerialClient, 'Uesr'));

    expect(direct).toBe(viaDb);
    expect(direct).toStartWith('Unknown model "Uesr". Valid models: ');
  });

  test('client.Uesr throws before it is connected too', () => {
    const fresh = createTestClient();

    expect(messageOf(() => readUntyped(fresh, 'Uesr'))).toStartWith('Unknown model "Uesr"');
  });

  test('a known model is still returned', () => {
    expect(client.User.getName()).toBe('User');
  });

  test('every real class member passes through', () => {
    for (const member of [
      'connect',
      'disconnect',
      'migrate',
      'query',
      '$transaction',
      'getSurreal',
      'resetMigrationState',
      'isModelMigrated',
    ]) {
      expect(typeof readUntyped(client, member)).toBe('function');
    }
    expect(readUntyped(client, 'db')).toBeDefined();
    expect(client.isConnected).toBe(true);
    expect(typeof client.isMigrated).toBe('boolean');
  });

  test('client.query and client.$transaction still run through the proxy', async () => {
    expect(await client.query('RETURN 1')).toEqual([1]);
    expect(await client.$transaction(async () => 'ok')).toBe('ok');
  });

  test('awaiting the client resolves to the client', async () => {
    expect(await client).toBe(client);
  });

  test('symbols, in checks and spreading keep working', () => {
    expect(readUntyped(client, 'then')).toBeUndefined();
    expect(Symbol.toPrimitive in client).toBe(false);
    expect('User' in client).toBe(true);
    expect('Uesr' in client).toBe(false);
    expect(() => ({ ...client })).not.toThrow();
    expect(() => JSON.stringify(client)).not.toThrow();
  });
});
