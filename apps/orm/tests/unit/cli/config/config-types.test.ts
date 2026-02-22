/**
 * Config types tests
 */

import { describe, expect, it } from 'bun:test';
import type { CerialConfig, ResolvedSchemaEntry, SchemaEntry } from '../../../../src/cli/config';

describe('CerialConfig', () => {
  it('should accept single-schema shorthand', () => {
    const config: CerialConfig = {
      schema: './schemas',
      output: './client',
    };

    expect(config.schema).toBe('./schemas');
    expect(config.output).toBe('./client');
    expect(config.schemas).toBeUndefined();
  });

  it('should accept multi-schema map', () => {
    const config: CerialConfig = {
      schemas: {
        auth: { path: './schemas/auth.cerial', output: './client/auth' },
        posts: { path: './schemas/posts.cerial', output: './client/posts' },
      },
    };

    expect(config.schemas).toBeDefined();
    expect(config.schemas?.auth?.path).toBe('./schemas/auth.cerial');
    expect(config.schemas?.posts?.path).toBe('./schemas/posts.cerial');
  });

  it('should allow optional output in SchemaEntry', () => {
    const entry: SchemaEntry = {
      path: './schemas/auth.cerial',
    };

    expect(entry.path).toBe('./schemas/auth.cerial');
    expect(entry.output).toBeUndefined();
  });

  it('should allow connection config in SchemaEntry', () => {
    const entry: SchemaEntry = {
      path: './schemas/auth.cerial',
      output: './client/auth',
      connection: {
        url: 'http://localhost:8000',
        namespace: 'main',
        database: 'main',
        auth: { username: 'root', password: 'root' },
      },
    };

    expect(entry.connection?.url).toBe('http://localhost:8000');
    expect(entry.connection?.auth?.username).toBe('root');
  });
});

describe('ResolvedSchemaEntry', () => {
  it('should have all required fields', () => {
    const resolved: ResolvedSchemaEntry = {
      name: 'auth',
      path: './schemas/auth.cerial',
      output: './client/auth',
      clientClassName: 'AuthCerialClient',
    };

    expect(resolved.name).toBe('auth');
    expect(resolved.path).toBe('./schemas/auth.cerial');
    expect(resolved.output).toBe('./client/auth');
    expect(resolved.clientClassName).toBe('AuthCerialClient');
  });
});
