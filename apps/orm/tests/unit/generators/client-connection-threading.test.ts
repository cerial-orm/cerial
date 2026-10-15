import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeClient } from '../../../src/generators/client/writer';
import type { ConnectionConfig, ModelMetadata } from '../../../src/types';

const model: ModelMetadata = { name: 'User', tableName: 'user', fields: [] };
const connection: ConnectionConfig = { url: 'http://127.0.0.1:8000', namespace: 'main', database: 'main' };

let dir: string | undefined;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

async function emit(conn?: ConnectionConfig): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), 'cerial-conn-'));
  await writeClient(dir, [model], [], [], [], undefined, undefined, undefined, [], 'CerialClient', conn);

  return readFile(join(dir, 'client.ts'), 'utf-8');
}

describe('writeClient connection threading', () => {
  // Until the connection was emitted these two were byte-identical, which is what this test used to
  // assert. Now a supplied connection reaches the template, so the right property is that it reaches
  // it in full and that no connection still emits nothing.
  test('a supplied connection reaches the emitted client', async () => {
    const withConn = await emit(connection);

    expect(withConn).toContain('EMBEDDED_CONNECTION');
    expect(withConn).toContain(connection.url);
    expect(withConn).toContain(`namespace: '${connection.namespace}'`);
    expect(withConn).toContain(`database: '${connection.database}'`);
  });

  test('no connection emits an undefined embedded constant', async () => {
    const without = await emit();

    expect(without).toContain('EMBEDDED_CONNECTION');
    expect(without).not.toContain(connection.url);
  });
});
