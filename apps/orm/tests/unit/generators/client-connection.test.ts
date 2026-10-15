import { describe, expect, test } from 'bun:test';

import { generateClientTemplate } from '../../../src/generators/client/template';
import type { ConnectionConfig, ModelMetadata } from '../../../src/types';

const model: ModelMetadata = { name: 'User', tableName: 'user', fields: [] };
const full: ConnectionConfig = {
  url: 'http://127.0.0.1:8000',
  namespace: 'main',
  database: 'main',
  auth: { username: 'sekret-user', password: 'sekret-pass' },
};

const emit = (conn?: ConnectionConfig): string => generateClientTemplate([model], 'CerialClient', conn);

describe('embedded connection', () => {
  test('embeds url, namespace and database', () => {
    expect(emit(full)).toContain(
      "const EMBEDDED_CONNECTION: ConnectionConfig | undefined = { url: 'http://127.0.0.1:8000', namespace: 'main', database: 'main' };",
    );
  });

  test('never emits the configured credentials', () => {
    const src = emit(full);
    const embedded = src.split('\n').find((l) => l.startsWith('const EMBEDDED_CONNECTION')) ?? '';

    expect(src).not.toContain('sekret-user');
    expect(src).not.toContain('sekret-pass');
    expect(embedded).not.toMatch(/auth|username|password/);
  });

  test('credentials are read from the environment at connect time', () => {
    const src = emit(full);

    expect(src).toContain('env?.CERIAL_DB_USER');
    expect(src).toContain('env?.CERIAL_DB_PASS');
  });

  test('an explicit config replaces the embedded one without merging', () => {
    const src = emit(full);

    expect(src).toContain('async connect(config?: CerialClientConnectConfig)');
    expect(src).toContain('if (config) {\n      resolved = config;');
    expect(src).toContain('this.connectionManager.connect(resolved)');
  });

  test('with no resolved connection the constant is undefined and no-arg connect throws', () => {
    const src = emit();

    expect(src).toContain('const EMBEDDED_CONNECTION: ConnectionConfig | undefined = undefined;');
    expect(src).toContain("if (!EMBEDDED_CONNECTION) throw new CerialNotConnectedError('No connection was configured");
    expect(src).not.toContain('localhost');
    expect(src).not.toContain('127.0.0.1');
  });

  test('quotes and backslashes in values are escaped', () => {
    const src = emit({ url: 'ws://h', namespace: "n's", database: "d'b\\x" });

    expect(src).toContain("namespace: 'n\\'s'");
    expect(src).toContain("database: 'd\\'b\\\\x'");
  });

  test('omits namespace and database when the connection has none', () => {
    expect(emit({ url: 'ws://h' })).toContain("= { url: 'ws://h' };");
  });
});
