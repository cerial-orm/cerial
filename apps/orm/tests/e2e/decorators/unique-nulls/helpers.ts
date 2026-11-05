import { expect } from 'bun:test';
import { CerialUniqueConstraintError } from 'cerial';

export const NN_TABLES = ['nn_user', 'nn_slot', 'nn_plain_slot'];

let counter = 0;

/** Distinct, valid email per call: `email` is itself @unique and must never be the reason a write fails. */
export function uniqueEmail(): string {
  counter += 1;

  return `nn-${counter}@example.com`;
}

export function user(
  extra: { nickname?: string | null; plainNick?: string | null; profile?: { handle?: string | null } } = {},
) {
  return { email: uniqueEmail(), ...extra };
}

/** Runs a write and returns what it threw, or undefined when it succeeded. */
export async function caught(run: () => PromiseLike<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }

  return undefined;
}

/** A unique-index refusal as Cerial surfaces it: its own class, the operation and model, and the index. */
export function expectUniqueViolation(
  error: unknown,
  expected: { model: string; operation: string; index: string; value?: string },
): void {
  expect(error).toBeInstanceOf(CerialUniqueConstraintError);
  const violation = error as CerialUniqueConstraintError;

  expect(violation.model).toBe(expected.model);
  expect(violation.operation).toBe(expected.operation);
  expect(violation.index).toBe(expected.index);
  if (expected.value !== undefined) expect(violation.value).toBe(expected.value);
}
