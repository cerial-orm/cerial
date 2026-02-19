/**
 * Config validator tests
 */

import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import type { CerialConfig, ResolvedSchemaEntry } from '../../../../src/cli/config';
import { detectConfigsInsideRootPaths, validateCombinedEntries, validateConfig } from '../../../../src/cli/config';

describe('validateConfig', () => {
  it('should accept valid single-schema config', () => {
    const config: CerialConfig = {
      schema: './schemas',
      output: './client',
    };

    const result = validateConfig(config);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept valid multi-schema config', () => {
    const config: CerialConfig = {
      schemas: {
        auth: { path: './schemas/auth.cerial', output: './client/auth' },
        posts: { path: './schemas/posts.cerial', output: './client/posts' },
      },
    };

    const result = validateConfig(config);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject schema names that are not valid JS identifiers', () => {
    const config: CerialConfig = {
      schemas: {
        'my-auth': { path: './schemas/auth.cerial', output: './client/auth' },
      },
    };

    const result = validateConfig(config);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.message).toContain('my-auth');
  });

  it('should reject schema names that are reserved', () => {
    const config: CerialConfig = {
      schemas: {
        default: { path: './schemas/default.cerial', output: './client/default' },
      },
    };

    const result = validateConfig(config);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should reject when path is missing in SchemaEntry', () => {
    const config: CerialConfig = {
      schemas: {
        // @ts-expect-error -- testing missing required 'path' field
        auth: { output: './client/auth' },
      },
    };

    const result = validateConfig(config);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should reject when output paths are not unique', () => {
    const config: CerialConfig = {
      schemas: {
        auth: { path: './schemas/auth.cerial', output: './client' },
        posts: { path: './schemas/posts.cerial', output: './client' },
      },
    };

    const result = validateConfig(config);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should reject when schema paths overlap', () => {
    const config: CerialConfig = {
      schemas: {
        auth: { path: './schemas', output: './client/auth' },
        posts: { path: './schemas/posts.cerial', output: './client/posts' },
      },
    };

    const result = validateConfig(config);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should warn on reserved schema names', () => {
    const config: CerialConfig = {
      schemas: {
        test: { path: './schemas/test.cerial', output: './client/test' },
      },
    };

    const result = validateConfig(config);

    expect(result.valid).toBe(true);
    expect(result.warnings?.length).toBeGreaterThan(0);
  });

  it('should accept schema names with underscores and numbers', () => {
    const config: CerialConfig = {
      schemas: {
        auth_v2: { path: './schemas/auth_v2.cerial', output: './client/auth_v2' },
        posts123: { path: './schemas/posts123.cerial', output: './client/posts123' },
      },
    };

    const result = validateConfig(config);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('detectConfigsInsideRootPaths', () => {
  it('should throw when config found in subdirectory of root path', async () => {
    const rootPaths = [resolve(__dirname, '../../../fixtures/config-merge/nested-config')];
    const cwd = resolve(__dirname, '../../../fixtures/config-merge');

    await expect(detectConfigsInsideRootPaths(rootPaths, cwd)).rejects.toThrow(
      /Found config file at.*inside schema path/,
    );
  });

  it('should not throw when config is at root path itself', async () => {
    const rootPaths = [resolve(__dirname, '../../../fixtures/config-merge/config-at-root')];
    const cwd = resolve(__dirname, '../../../fixtures/config-merge');

    await expect(detectConfigsInsideRootPaths(rootPaths, cwd)).resolves.toBeUndefined();
  });

  it('should detect configs at any depth inside root path', async () => {
    const rootPaths = [resolve(__dirname, '../../../fixtures/config-merge/deep-nested')];
    const cwd = resolve(__dirname, '../../../fixtures/config-merge');

    await expect(detectConfigsInsideRootPaths(rootPaths, cwd)).rejects.toThrow(
      /Found config file at.*inside schema path/,
    );
  });

  it('should pass when no configs in subdirectories', async () => {
    const rootPaths = [resolve(__dirname, '../../../fixtures/config-merge/clean')];
    const cwd = resolve(__dirname, '../../../fixtures/config-merge');

    await expect(detectConfigsInsideRootPaths(rootPaths, cwd)).resolves.toBeUndefined();
  });

  it('should handle multiple root paths', async () => {
    const rootPaths = [
      resolve(__dirname, '../../../fixtures/config-merge/clean'),
      resolve(__dirname, '../../../fixtures/config-merge/config-at-root'),
    ];
    const cwd = resolve(__dirname, '../../../fixtures/config-merge');

    await expect(detectConfigsInsideRootPaths(rootPaths, cwd)).resolves.toBeUndefined();
  });

  it('should throw on first nested config found among multiple root paths', async () => {
    const rootPaths = [
      resolve(__dirname, '../../../fixtures/config-merge/clean'),
      resolve(__dirname, '../../../fixtures/config-merge/nested-config'),
    ];
    const cwd = resolve(__dirname, '../../../fixtures/config-merge');

    await expect(detectConfigsInsideRootPaths(rootPaths, cwd)).rejects.toThrow(
      /Found config file at.*inside schema path/,
    );
  });
});

describe('validateCombinedEntries', () => {
  it('should throw on schema name collision', () => {
    const rootEntries: ResolvedSchemaEntry[] = [
      {
        name: 'auth',
        path: '/root/schemas/auth',
        output: '/root/client/auth',
        clientClassName: 'AuthClient',
      },
    ];

    const discoveredEntries: ResolvedSchemaEntry[] = [
      {
        name: 'auth',
        path: '/root/schemas/auth-discovered',
        output: '/root/client/auth-discovered',
        clientClassName: 'AuthDiscoveredClient',
      },
    ];

    expect(() => validateCombinedEntries(rootEntries, discoveredEntries)).toThrow(
      /Auto-discovered schema name 'auth' collides with root-defined schema/,
    );
  });

  it('should throw on output path collision', () => {
    const rootEntries: ResolvedSchemaEntry[] = [
      {
        name: 'auth',
        path: '/root/schemas/auth',
        output: '/root/client',
        clientClassName: 'AuthClient',
      },
    ];

    const discoveredEntries: ResolvedSchemaEntry[] = [
      {
        name: 'posts',
        path: '/root/schemas/posts',
        output: '/root/client',
        clientClassName: 'PostsClient',
      },
    ];

    expect(() => validateCombinedEntries(rootEntries, discoveredEntries)).toThrow(
      /Auto-discovered schema 'posts' output.*collides with root-defined schema/,
    );
  });

  it('should pass when no collisions', () => {
    const rootEntries: ResolvedSchemaEntry[] = [
      {
        name: 'auth',
        path: '/root/schemas/auth',
        output: '/root/client/auth',
        clientClassName: 'AuthClient',
      },
    ];

    const discoveredEntries: ResolvedSchemaEntry[] = [
      {
        name: 'posts',
        path: '/root/schemas/posts',
        output: '/root/client/posts',
        clientClassName: 'PostsClient',
      },
    ];

    expect(() => validateCombinedEntries(rootEntries, discoveredEntries)).not.toThrow();
  });

  it('should handle empty discovered entries', () => {
    const rootEntries: ResolvedSchemaEntry[] = [
      {
        name: 'auth',
        path: '/root/schemas/auth',
        output: '/root/client/auth',
        clientClassName: 'AuthClient',
      },
    ];

    const discoveredEntries: ResolvedSchemaEntry[] = [];

    expect(() => validateCombinedEntries(rootEntries, discoveredEntries)).not.toThrow();
  });

  it('should handle empty root entries', () => {
    const rootEntries: ResolvedSchemaEntry[] = [];

    const discoveredEntries: ResolvedSchemaEntry[] = [
      {
        name: 'posts',
        path: '/root/schemas/posts',
        output: '/root/client/posts',
        clientClassName: 'PostsClient',
      },
    ];

    expect(() => validateCombinedEntries(rootEntries, discoveredEntries)).not.toThrow();
  });

  it('should detect overlapping output paths (parent-child)', () => {
    const rootEntries: ResolvedSchemaEntry[] = [
      {
        name: 'auth',
        path: '/root/schemas/auth',
        output: '/root/client',
        clientClassName: 'AuthClient',
      },
    ];

    const discoveredEntries: ResolvedSchemaEntry[] = [
      {
        name: 'posts',
        path: '/root/schemas/posts',
        output: '/root/client/posts',
        clientClassName: 'PostsClient',
      },
    ];

    expect(() => validateCombinedEntries(rootEntries, discoveredEntries)).toThrow(
      /Auto-discovered schema 'posts' output.*collides with root-defined schema/,
    );
  });
});
