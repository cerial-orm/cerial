/**
 * Config validator tests
 */

import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import type { CerialConfig, ResolvedSchemaEntry } from '../../../../src/cli/config';
import {
  detectConfigsInsideRootPaths,
  validateCombinedEntries,
  validateConfig,
  validateFolderConfig,
} from '../../../../src/cli/config';

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

  it('should throw when convention marker found inside root path subdirectory', async () => {
    const rootPaths = [resolve(__dirname, '../../../fixtures/config-merge/marker-nested')];
    const cwd = resolve(__dirname, '../../../fixtures/config-merge');

    await expect(detectConfigsInsideRootPaths(rootPaths, cwd)).rejects.toThrow(
      /Found convention marker at.*inside schema path/,
    );
  });

  it('should not throw when convention marker exists at root path itself', async () => {
    const rootPaths = [resolve(__dirname, '../../../fixtures/config-merge/marker-at-root')];
    const cwd = resolve(__dirname, '../../../fixtures/config-merge');

    await expect(detectConfigsInsideRootPaths(rootPaths, cwd)).resolves.toBeUndefined();
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

  it('should throw on discovered-vs-discovered name collision', () => {
    const rootEntries: ResolvedSchemaEntry[] = [];

    const discoveredEntries: ResolvedSchemaEntry[] = [
      {
        name: 'auth',
        path: '/root/schemas/auth',
        output: '/root/client/auth',
        clientClassName: 'AuthClient',
      },
      {
        name: 'auth',
        path: '/root/schemas/auth-v2',
        output: '/root/client/auth-v2',
        clientClassName: 'AuthV2Client',
      },
    ];

    expect(() => validateCombinedEntries(rootEntries, discoveredEntries)).toThrow(
      /Duplicate schema name 'auth' discovered at.*Add a 'name' field to the folder config/,
    );
  });

  it('should throw on discovered-vs-discovered output collision', () => {
    const rootEntries: ResolvedSchemaEntry[] = [];

    const discoveredEntries: ResolvedSchemaEntry[] = [
      {
        name: 'auth',
        path: '/root/schemas/auth',
        output: '/root/client',
        clientClassName: 'AuthClient',
      },
      {
        name: 'posts',
        path: '/root/schemas/posts',
        output: '/root/client',
        clientClassName: 'PostsClient',
      },
    ];

    expect(() => validateCombinedEntries(rootEntries, discoveredEntries)).toThrow(
      /Discovered schema 'auth' output.*collides with discovered schema 'posts'/,
    );
  });

  it('should pass when discovered entries have different names and outputs', () => {
    const rootEntries: ResolvedSchemaEntry[] = [];

    const discoveredEntries: ResolvedSchemaEntry[] = [
      {
        name: 'auth',
        path: '/root/schemas/auth',
        output: '/root/client/auth',
        clientClassName: 'AuthClient',
      },
      {
        name: 'posts',
        path: '/root/schemas/posts',
        output: '/root/client/posts',
        clientClassName: 'PostsClient',
      },
    ];

    expect(() => validateCombinedEntries(rootEntries, discoveredEntries)).not.toThrow();
  });

  it('should throw when three discovered entries have two with same name', () => {
    const rootEntries: ResolvedSchemaEntry[] = [];

    const discoveredEntries: ResolvedSchemaEntry[] = [
      {
        name: 'auth',
        path: '/root/schemas/auth',
        output: '/root/client/auth',
        clientClassName: 'AuthClient',
      },
      {
        name: 'posts',
        path: '/root/schemas/posts',
        output: '/root/client/posts',
        clientClassName: 'PostsClient',
      },
      {
        name: 'auth',
        path: '/root/schemas/auth-v2',
        output: '/root/client/auth-v2',
        clientClassName: 'AuthV2Client',
      },
    ];

    expect(() => validateCombinedEntries(rootEntries, discoveredEntries)).toThrow(
      /Duplicate schema name 'auth' discovered at.*Add a 'name' field to the folder config/,
    );
  });
});

describe('validateFolderConfig name validation', () => {
  it('should accept valid name: auth', () => {
    const result = validateFolderConfig({ name: 'auth' });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept valid name with underscore: auth_v2', () => {
    const result = validateFolderConfig({ name: 'auth_v2' });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept valid name with dollar: $schema', () => {
    const result = validateFolderConfig({ name: '$schema' });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject name starting with number: 123bad', () => {
    const result = validateFolderConfig({ name: '123bad' });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('valid JavaScript identifier');
  });

  it('should reject name with hyphen: my-auth', () => {
    const result = validateFolderConfig({ name: 'my-auth' });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('valid JavaScript identifier');
  });

  it('should reject reserved name: default', () => {
    const result = validateFolderConfig({ name: 'default' });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('reserved');
  });

  it('should reject reserved name: index', () => {
    const result = validateFolderConfig({ name: 'index' });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('reserved');
  });

  it('should accept config without name (optional)', () => {
    const result = validateFolderConfig({});

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept name with output', () => {
    const result = validateFolderConfig({ name: 'auth', output: './client' });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject non-string name: 123', () => {
    const result = validateFolderConfig({ name: 123 });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('must be a string');
  });
});

describe('detectNestedSchemaRoots', () => {
  it('should throw when folder-config parent contains folder-config child', () => {
    const roots = [
      { path: '/root/schemas', type: 'folder-config' as const },
      { path: '/root/schemas/auth', type: 'folder-config' as const },
    ];

    expect(() => {
      const { detectNestedSchemaRoots } = require('../../../../src/cli/config');
      detectNestedSchemaRoots(roots);
    }).toThrow(/Nested schema roots detected/);
  });

  it('should throw when convention-marker parent contains convention-marker child', () => {
    const roots = [
      { path: '/root/schemas', type: 'convention-marker' as const },
      { path: '/root/schemas/auth', type: 'convention-marker' as const },
    ];

    expect(() => {
      const { detectNestedSchemaRoots } = require('../../../../src/cli/config');
      detectNestedSchemaRoots(roots);
    }).toThrow(/Nested schema roots detected/);
  });

  it('should throw when folder-config parent contains convention-marker child', () => {
    const roots = [
      { path: '/root/schemas', type: 'folder-config' as const },
      { path: '/root/schemas/auth', type: 'convention-marker' as const },
    ];

    expect(() => {
      const { detectNestedSchemaRoots } = require('../../../../src/cli/config');
      detectNestedSchemaRoots(roots);
    }).toThrow(/Nested schema roots detected/);
  });

  it('should return parent in ignored set when convention-marker parent contains folder-config child', () => {
    const roots = [
      { path: '/root/schemas', type: 'convention-marker' as const },
      { path: '/root/schemas/auth', type: 'folder-config' as const },
    ];

    const { detectNestedSchemaRoots } = require('../../../../src/cli/config');
    const result = detectNestedSchemaRoots(roots);

    expect(result.ignored).toBeInstanceOf(Set);
    expect(result.ignored.has('/root/schemas')).toBe(true);
    expect(result.ignored.size).toBe(1);
  });

  it('should return empty ignored set when no nesting detected', () => {
    const roots = [
      { path: '/root/schemas/auth', type: 'folder-config' as const },
      { path: '/root/schemas/posts', type: 'folder-config' as const },
    ];

    const { detectNestedSchemaRoots } = require('../../../../src/cli/config');
    const result = detectNestedSchemaRoots(roots);

    expect(result.ignored).toBeInstanceOf(Set);
    expect(result.ignored.size).toBe(0);
  });

  it('should return empty ignored set for empty input', () => {
    const roots: Array<{ path: string; type: 'folder-config' | 'convention-marker' }> = [];

    const { detectNestedSchemaRoots } = require('../../../../src/cli/config');
    const result = detectNestedSchemaRoots(roots);

    expect(result.ignored).toBeInstanceOf(Set);
    expect(result.ignored.size).toBe(0);
  });

  it('should detect deep nesting (3 levels)', () => {
    const roots = [
      { path: '/root/schemas', type: 'folder-config' as const },
      { path: '/root/schemas/auth/v2', type: 'folder-config' as const },
    ];

    expect(() => {
      const { detectNestedSchemaRoots } = require('../../../../src/cli/config');
      detectNestedSchemaRoots(roots);
    }).toThrow(/Nested schema roots detected/);
  });

  it('should handle multiple roots with mixed nesting and return correct ignored set', () => {
    const roots = [
      { path: '/root/schemas', type: 'convention-marker' as const },
      { path: '/root/schemas/auth', type: 'folder-config' as const },
      { path: '/root/posts', type: 'folder-config' as const },
    ];

    const { detectNestedSchemaRoots } = require('../../../../src/cli/config');
    const result = detectNestedSchemaRoots(roots);

    expect(result.ignored).toBeInstanceOf(Set);
    expect(result.ignored.has('/root/schemas')).toBe(true);
    expect(result.ignored.size).toBe(1);
  });

  it('should normalize paths with trailing slashes', () => {
    const roots = [
      { path: '/root/schemas/', type: 'convention-marker' as const },
      { path: '/root/schemas/auth', type: 'folder-config' as const },
    ];

    const { detectNestedSchemaRoots } = require('../../../../src/cli/config');
    const result = detectNestedSchemaRoots(roots);

    expect(result.ignored).toBeInstanceOf(Set);
    expect(result.ignored.size).toBe(1);
  });
});
