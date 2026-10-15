/**
 * Minimal LSP Connection stub for provider unit tests.
 *
 * Captures the handler a provider registers so a test can invoke it directly.
 */

import type { Connection } from 'vscode-languageserver';

type Handler = (...args: never[]) => unknown;

export interface ConnectionStub {
  readonly connection: Connection;
  /** Handlers registered per Connection method name, in registration order. */
  readonly handlers: Record<string, Handler[]>;
}

/**
 * Build a Connection whose `on*` methods record their handler.
 * Only the named methods exist; calling any other one throws, which keeps a
 * provider from silently registering something a test does not know about.
 */
export function createConnectionStub(methods: readonly string[]): ConnectionStub {
  const handlers: Record<string, Handler[]> = {};
  const stub: Record<string, (handler: Handler) => void> = {};

  for (const method of methods) {
    handlers[method] = [];
    stub[method] = (handler) => {
      handlers[method]!.push(handler);
    };
  }

  // The stub implements only the registration methods a provider touches.
  return { connection: stub as unknown as Connection, handlers };
}
