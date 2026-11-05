import { spyOn, expect } from 'bun:test';
import { CerialValidationError } from 'cerial';
import type { CerialClient } from '../../test-helper';

export const userData = { name: 'n', email: 'n@x.io', isActive: true };

/** The error a call rejects with; a call that resolves is a failed assertion, not a null. */
export async function rejection(call: () => PromiseLike<unknown>): Promise<unknown> {
  try {
    await call();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to reject');
}

export interface ExpectedRefusal {
  model: string;
  field: string;
  operation: string;
  /** The exact message today's code gives */
  message: string;
}

/** Asserts the class, the exact message and the structured fields of a refused nested write. */
export async function expectRefused(call: () => PromiseLike<unknown>, expected: ExpectedRefusal): Promise<void> {
  const error = await rejection(call);

  expect(error).toBeInstanceOf(CerialValidationError);
  expect((error as CerialValidationError).message).toBe(expected.message);
  expect(error).toMatchObject({ model: expected.model, field: expected.field, operation: expected.operation });
}

/** The message a refused connect or set carries. */
export const missingMessage = (
  model: string,
  field: string,
  verb: 'connect' | 'set',
  target: string,
  id: string,
): string => `Field "${field}" on model "${model}": cannot ${verb} ${target} record "${id}" because it does not exist`;

/** How many `query` calls the client's database connection receives while `call` runs. */
export async function queryCalls(client: CerialClient, call: () => PromiseLike<unknown>): Promise<number> {
  const surreal = client.getTransactionSurreal();
  if (!surreal) throw new Error('client is not connected');

  const spy = spyOn(surreal, 'query');
  try {
    await call();
  } catch {
    // A refused write still counts its round trips
  }
  const count = spy.mock.calls.length;
  spy.mockRestore();

  return count;
}

export const seedUser = (client: CerialClient, id = 'u1') =>
  client.db.BasicsUser.create({ data: { ...userData, id, email: `${id}@x.io` } });

export const seedTag = (client: CerialClient, id: string) =>
  client.db.BasicsTag.create({ data: { id, name: `name-${id}` } });

export const seedPost = (client: CerialClient, id: string, authorId: string) =>
  client.db.BasicsPost.create({ data: { id, title: 't', author: { connect: authorId } } });

export async function linkedTags(client: CerialClient, id = 'u1'): Promise<string[] | undefined> {
  return (await client.db.BasicsUser.findOne({ where: { id } }))?.tagIds.map(String).sort();
}

export async function authorOf(client: CerialClient, postId: string): Promise<string | undefined> {
  return (await client.db.BasicsPost.findOne({ where: { id: postId } }))?.authorId.toString();
}

export async function profileOf(client: CerialClient, id = 'u1'): Promise<string | null> {
  return (await client.db.BasicsUser.findOne({ where: { id } }))?.profileId?.toString() ?? null;
}

export async function userName(client: CerialClient, id = 'u1'): Promise<string | undefined> {
  return (await client.db.BasicsUser.findOne({ where: { id } }))?.name;
}
