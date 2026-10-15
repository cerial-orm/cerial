import { mock } from 'bun:test';
import type { Surreal } from 'surrealdb';

/**
 * The one Surreal double for the client tests. It implements only `query().collect()`, the chain every
 * Model query runs through, so the single cast lives here instead of at each call site.
 */
export const createMockSurreal = (): Surreal =>
  ({
    query: mock(() => ({
      collect: () => Promise.resolve([[]]),
    })),
  }) as unknown as Surreal;
