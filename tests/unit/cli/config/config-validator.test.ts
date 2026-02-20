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

describe('filter field validation', () => {
  describe('validateConfig root-level filter fields', () => {
    it('should accept valid exclude array', () => {
      const config: CerialConfig = {
        schema: '.',
        exclude: ['**/*.cerial'],
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept valid include array', () => {
      const config: CerialConfig = {
        schema: '.',
        include: ['keep.cerial'],
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept valid ignore array', () => {
      const config: CerialConfig = {
        schema: '.',
        ignore: ['secrets/**'],
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept all three filter fields as empty arrays', () => {
      const config: CerialConfig = {
        schema: '.',
        ignore: [],
        exclude: [],
        include: [],
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept undefined filter fields (not provided)', () => {
      const config: CerialConfig = {
        schema: '.',
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject exclude when not an array', () => {
      const config: CerialConfig = {
        schema: '.',
        // @ts-expect-error -- testing non-array type
        exclude: 'not-array',
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.message).toContain('must be an array');
    });

    it('should reject exclude with non-string items', () => {
      const config: CerialConfig = {
        schema: '.',
        // @ts-expect-error -- testing non-string item
        exclude: [123],
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.message).toContain('must be strings');
    });

    it('should reject exclude with empty string', () => {
      const config: CerialConfig = {
        schema: '.',
        exclude: [''],
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.message).toContain('empty strings');
    });

    it('should reject exclude with path escape', () => {
      const config: CerialConfig = {
        schema: '.',
        exclude: ['../escape'],
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.message).toContain('path escapes');
    });

    it('should reject include with path escape in middle', () => {
      const config: CerialConfig = {
        schema: '.',
        include: ['foo/../escape'],
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.message).toContain('path escapes');
    });

    it('should reject ignore when not an array', () => {
      const config: CerialConfig = {
        schema: '.',
        // @ts-expect-error -- testing non-array type
        ignore: { pattern: 'test' },
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.message).toContain('must be an array');
    });
  });

  describe('validateConfig per-schema filter fields', () => {
    it('should accept valid exclude in SchemaEntry', () => {
      const config: CerialConfig = {
        schemas: {
          auth: {
            path: '.',
            output: './client',
            exclude: ['drafts/**'],
          },
        },
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept valid include in SchemaEntry', () => {
      const config: CerialConfig = {
        schemas: {
          auth: {
            path: '.',
            output: './client',
            include: ['models/**'],
          },
        },
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept valid ignore in SchemaEntry', () => {
      const config: CerialConfig = {
        schemas: {
          auth: {
            path: '.',
            output: './client',
            ignore: ['temp/**'],
          },
        },
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject SchemaEntry exclude with empty string', () => {
      const config: CerialConfig = {
        schemas: {
          auth: {
            path: '.',
            output: './client',
            exclude: [''],
          },
        },
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.field).toContain('schemas.auth.exclude');
    });

    it('should reject SchemaEntry include with path escape', () => {
      const config: CerialConfig = {
        schemas: {
          auth: {
            path: '.',
            output: './client',
            include: ['../escape'],
          },
        },
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.field).toContain('schemas.auth.include');
    });

    it('should reject SchemaEntry ignore when not an array', () => {
      const config: CerialConfig = {
        schemas: {
          auth: {
            path: '.',
            output: './client',
            // @ts-expect-error -- testing non-array type
            ignore: 'string',
          },
        },
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.field).toContain('schemas.auth.ignore');
    });
  });

  describe('validateFolderConfig filter fields', () => {
    it('should accept valid ignore array', () => {
      const result = validateFolderConfig({ ignore: ['tmp/**'] });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept valid exclude array', () => {
      const result = validateFolderConfig({ exclude: ['drafts/**'] });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept valid include array', () => {
      const result = validateFolderConfig({ include: ['keep/**'] });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept all three filter fields', () => {
      const result = validateFolderConfig({
        ignore: ['a/**'],
        exclude: ['b/**'],
        include: ['c/**'],
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject exclude when not an array', () => {
      const result = validateFolderConfig({
        exclude: 'string',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.message).toContain('must be an array');
    });

    it('should reject include with empty string', () => {
      const result = validateFolderConfig({
        include: [''],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.message).toContain('empty strings');
    });

    it('should reject ignore with path escape', () => {
      const result = validateFolderConfig({
        ignore: ['../escape'],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.message).toContain('path escapes');
    });

    it('should reject ignore with non-string items', () => {
      const result = validateFolderConfig({
        ignore: [null],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.message).toContain('must be strings');
    });
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
