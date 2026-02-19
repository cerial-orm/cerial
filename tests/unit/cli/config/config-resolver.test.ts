/**
 * Config resolver tests
 */

import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import type { CerialConfig } from '../../../../src/cli/config';
import { resolveConfig } from '../../../../src/cli/config';

describe('resolveConfig', () => {
  describe('single-schema shorthand', () => {
    it('should resolve single schema with output', () => {
      const config: CerialConfig = {
        schema: './schemas/main.cerial',
        output: './generated',
      };
      const cwd = '/project';
      const resolved = resolveConfig(config, cwd);

      expect(resolved).toHaveLength(1);
      expect(resolved[0]!.name).toBe('default');
      expect(resolved[0]!.path).toBe(resolve(cwd, './schemas/main.cerial'));
      expect(resolved[0]!.output).toBe(resolve(cwd, './generated'));
      expect(resolved[0]!.clientClassName).toBe('CerialClient');
    });

    it('should apply default output when not specified', () => {
      const config: CerialConfig = {
        schema: './schemas/main.cerial',
      };
      const cwd = '/project';
      const resolved = resolveConfig(config, cwd);

      expect(resolved).toHaveLength(1);
      expect(resolved[0]!.output).toBe(resolve(cwd, './schemas/client'));
    });

    it('should resolve relative paths to absolute', () => {
      const config: CerialConfig = {
        schema: './schemas',
        output: './out',
      };
      const cwd = '/home/user/project';
      const resolved = resolveConfig(config, cwd);

      expect(resolved[0]!.path).toBe('/home/user/project/schemas');
      expect(resolved[0]!.output).toBe('/home/user/project/out');
    });

    it('should handle absolute paths', () => {
      const config: CerialConfig = {
        schema: '/absolute/path/schema.cerial',
        output: '/absolute/path/out',
      };
      const cwd = '/project';
      const resolved = resolveConfig(config, cwd);

      expect(resolved[0]!.path).toBe('/absolute/path/schema.cerial');
      expect(resolved[0]!.output).toBe('/absolute/path/out');
    });
  });

  describe('multi-schema', () => {
    it('should resolve multiple schemas', () => {
      const config: CerialConfig = {
        schemas: {
          auth: {
            path: './schemas/auth.cerial',
            output: './generated/auth',
          },
          posts: {
            path: './schemas/posts.cerial',
            output: './generated/posts',
          },
        },
      };
      const cwd = '/project';
      const resolved = resolveConfig(config, cwd);

      expect(resolved).toHaveLength(2);
      expect(resolved[0]!.name).toBe('auth');
      expect(resolved[0]!.clientClassName).toBe('AuthCerialClient');
      expect(resolved[1]!.name).toBe('posts');
      expect(resolved[1]!.clientClassName).toBe('PostsCerialClient');
    });

    it('should use root output as fallback', () => {
      const config: CerialConfig = {
        output: './generated',
        schemas: {
          auth: {
            path: './schemas/auth.cerial',
          },
          posts: {
            path: './schemas/posts.cerial',
            output: './generated/posts',
          },
        },
      };
      const cwd = '/project';
      const resolved = resolveConfig(config, cwd);

      expect(resolved[0]!.output).toBe(resolve(cwd, './generated'));
      expect(resolved[1]!.output).toBe(resolve(cwd, './generated/posts'));
    });

    it('should convert schema names to client class names', () => {
      const config: CerialConfig = {
        output: './generated',
        schemas: {
          'my-auth': {
            path: './schemas/auth.cerial',
          },
          user_service: {
            path: './schemas/users.cerial',
          },
        },
      };
      const cwd = '/project';
      const resolved = resolveConfig(config, cwd);

      expect(resolved[0]!.clientClassName).toBe('MyAuthCerialClient');
      expect(resolved[1]!.clientClassName).toBe('UserServiceCerialClient');
    });

    it('should resolve all paths to absolute', () => {
      const config: CerialConfig = {
        output: './generated',
        schemas: {
          auth: {
            path: './schemas/auth.cerial',
            output: './out/auth',
          },
        },
      };
      const cwd = '/home/user/project';
      const resolved = resolveConfig(config, cwd);

      expect(resolved[0]!.path).toBe('/home/user/project/schemas/auth.cerial');
      expect(resolved[0]!.output).toBe('/home/user/project/out/auth');
    });
  });

  describe('default output calculation', () => {
    it('should use schema directory + /client for single schema', () => {
      const config: CerialConfig = {
        schema: './schemas/main.cerial',
      };
      const cwd = '/project';
      const resolved = resolveConfig(config, cwd);

      expect(resolved[0]!.output).toBe(resolve(cwd, './schemas/client'));
    });

    it('should use schema directory + /client for directory schema', () => {
      const config: CerialConfig = {
        schema: './schemas',
      };
      const cwd = '/project';
      const resolved = resolveConfig(config, cwd);

      expect(resolved[0]!.output).toBe(resolve(cwd, './schemas/client'));
    });
  });

  describe('cwd handling', () => {
    it('should use process.cwd() as default', () => {
      const config: CerialConfig = {
        schema: './schemas/main.cerial',
        output: './generated',
      };
      const resolved = resolveConfig(config);

      expect(resolved[0]!.path).toContain('schemas/main.cerial');
      expect(resolved[0]!.output).toContain('generated');
    });

    it('should respect provided cwd', () => {
      const config: CerialConfig = {
        schema: './schemas/main.cerial',
        output: './generated',
      };
      const cwd = '/custom/path';
      const resolved = resolveConfig(config, cwd);

      expect(resolved[0]!.path).toBe('/custom/path/schemas/main.cerial');
      expect(resolved[0]!.output).toBe('/custom/path/generated');
    });
  });

  describe('connection threading', () => {
    it('should thread root connection in single schema', () => {
      const config: CerialConfig = {
        schema: './schemas/main.cerial',
        output: './generated',
        connection: {
          url: 'http://localhost:8000',
          namespace: 'main',
          database: 'main',
        },
      };
      const cwd = '/project';
      const resolved = resolveConfig(config, cwd);

      expect(resolved[0]!.connection).toEqual({
        url: 'http://localhost:8000',
        namespace: 'main',
        database: 'main',
      });
    });

    it('should not include connection when not specified in single schema', () => {
      const config: CerialConfig = {
        schema: './schemas/main.cerial',
        output: './generated',
      };
      const cwd = '/project';
      const resolved = resolveConfig(config, cwd);

      expect(resolved[0]!.connection).toBeUndefined();
    });

    it('should use per-schema connection in multi-schema', () => {
      const config: CerialConfig = {
        output: './generated',
        schemas: {
          auth: {
            path: './schemas/auth.cerial',
            connection: {
              url: 'http://localhost:8001',
              namespace: 'auth',
              database: 'auth',
            },
          },
          posts: {
            path: './schemas/posts.cerial',
          },
        },
      };
      const cwd = '/project';
      const resolved = resolveConfig(config, cwd);

      expect(resolved[0]!.connection).toEqual({
        url: 'http://localhost:8001',
        namespace: 'auth',
        database: 'auth',
      });
      expect(resolved[1]!.connection).toBeUndefined();
    });

    it('should fallback to root connection in multi-schema when per-schema not specified', () => {
      const config: CerialConfig = {
        output: './generated',
        connection: {
          url: 'http://localhost:8000',
          namespace: 'main',
          database: 'main',
        },
        schemas: {
          auth: {
            path: './schemas/auth.cerial',
          },
          posts: {
            path: './schemas/posts.cerial',
            connection: {
              url: 'http://localhost:8002',
              namespace: 'posts',
              database: 'posts',
            },
          },
        },
      };
      const cwd = '/project';
      const resolved = resolveConfig(config, cwd);

      expect(resolved[0]!.connection).toEqual({
        url: 'http://localhost:8000',
        namespace: 'main',
        database: 'main',
      });
      expect(resolved[1]!.connection).toEqual({
        url: 'http://localhost:8002',
        namespace: 'posts',
        database: 'posts',
      });
    });

    it('should have undefined connection when neither root nor per-schema specified', () => {
      const config: CerialConfig = {
        output: './generated',
        schemas: {
          auth: {
            path: './schemas/auth.cerial',
          },
          posts: {
            path: './schemas/posts.cerial',
          },
        },
      };
      const cwd = '/project';
      const resolved = resolveConfig(config, cwd);

      expect(resolved[0]!.connection).toBeUndefined();
      expect(resolved[1]!.connection).toBeUndefined();
    });
  });
});
