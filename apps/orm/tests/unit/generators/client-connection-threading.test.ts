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
  test('a supplied connection leaves client.ts byte-identical to none', async () => {
    const without = await emit();
    const withConn = await emit(connection);

    expect(withConn).toBe(without);
  });
});
