/**
 * Format config tests
 */

import { describe, expect, it } from 'bun:test';
import type { CerialConfig } from '../../../../src/cli/config';
import { resolveConfig, validateConfig } from '../../../../src/cli/config';

describe('format config', () => {
  describe('validateConfig with format', () => {
    it('should accept valid format config in root', () => {
      const config: CerialConfig = {
        schema: './schemas',
        output: './client',
        format: {
          alignmentScope: 'block',
          indentSize: 4,
          trailingComma: true,
        },
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept valid format config in schema entry', () => {
      const config: CerialConfig = {
        schemas: {
          auth: {
            path: './schemas/auth.cerial',
            output: './client/auth',
            format: {
              indentSize: 2,
              blockSeparation: 1,
            },
          },
        },
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should emit warning for invalid alignmentScope value', () => {
      const config: CerialConfig = {
        schema: './schemas',
        output: './client',
        format: {
          // @ts-expect-error -- testing invalid value
          alignmentScope: 'invalid',
        },
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
      expect(result.warnings![0]?.message).toContain('Invalid value');
      expect(result.warnings![0]?.message).toContain('alignmentScope');
    });

    it('should emit warning for invalid fieldGroupBlankLines value', () => {
      const config: CerialConfig = {
        schema: './schemas',
        output: './client',
        format: {
          // @ts-expect-error -- testing invalid value
          fieldGroupBlankLines: 'double',
        },
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]?.message).toContain('fieldGroupBlankLines');
    });

    it('should emit warning for invalid blockSeparation value', () => {
      const config: CerialConfig = {
        schema: './schemas',
        output: './client',
        format: {
          // @ts-expect-error -- testing invalid value
          blockSeparation: 3,
        },
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]?.message).toContain('blockSeparation');
    });

    it('should emit warning for invalid indentSize value', () => {
      const config: CerialConfig = {
        schema: './schemas',
        output: './client',
        format: {
          // @ts-expect-error -- testing invalid value
          indentSize: 3,
        },
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]?.message).toContain('indentSize');
    });

    it('should emit warning for invalid inlineConstructStyle value', () => {
      const config: CerialConfig = {
        schema: './schemas',
        output: './client',
        format: {
          // @ts-expect-error -- testing invalid value
          inlineConstructStyle: 'compact',
        },
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]?.message).toContain('inlineConstructStyle');
    });

    it('should emit warning for invalid decoratorAlignment value', () => {
      const config: CerialConfig = {
        schema: './schemas',
        output: './client',
        format: {
          // @ts-expect-error -- testing invalid value
          decoratorAlignment: 'spaced',
        },
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]?.message).toContain('decoratorAlignment');
    });

    it('should emit warning for invalid trailingComma value', () => {
      const config: CerialConfig = {
        schema: './schemas',
        output: './client',
        format: {
          // @ts-expect-error -- testing invalid value
          trailingComma: 'always',
        },
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]?.message).toContain('trailingComma');
    });

    it('should emit warning for invalid commentStyle value', () => {
      const config: CerialConfig = {
        schema: './schemas',
        output: './client',
        format: {
          // @ts-expect-error -- testing invalid value
          commentStyle: 'block',
        },
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]?.message).toContain('commentStyle');
    });

    it('should emit warning for invalid blankLineBeforeDirectives value', () => {
      const config: CerialConfig = {
        schema: './schemas',
        output: './client',
        format: {
          // @ts-expect-error -- testing invalid value
          blankLineBeforeDirectives: 'never',
        },
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]?.message).toContain('blankLineBeforeDirectives');
    });

    it('should emit warnings for multiple invalid format values', () => {
      const config: CerialConfig = {
        schema: './schemas',
        output: './client',
        format: {
          // @ts-expect-error -- testing invalid values
          alignmentScope: 'invalid',
          // @ts-expect-error -- testing invalid values
          indentSize: 8,
          // @ts-expect-error -- testing invalid values
          trailingComma: 'yes',
        },
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBe(3);
    });

    it('should validate format config in per-schema entries', () => {
      const config: CerialConfig = {
        schemas: {
          auth: {
            path: './schemas/auth.cerial',
            output: './client/auth',
            format: {
              // @ts-expect-error -- testing invalid value
              alignmentScope: 'invalid',
            },
          },
        },
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]?.field).toContain('schemas.auth.format');
    });

    it('should accept all valid format values', () => {
      const config: CerialConfig = {
        schema: './schemas',
        output: './client',
        format: {
          alignmentScope: 'group',
          fieldGroupBlankLines: 'single',
          blockSeparation: 2,
          indentSize: 4,
          inlineConstructStyle: 'multi',
          decoratorAlignment: 'aligned',
          trailingComma: true,
          commentStyle: 'honor',
          blankLineBeforeDirectives: 'always',
        },
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toBeUndefined();
    });
  });

  describe('resolveConfig with format', () => {
    it('should include format in resolved single schema', () => {
      const config: CerialConfig = {
        schema: './schemas',
        output: './client',
        format: {
          indentSize: 4,
          trailingComma: true,
        },
      };
      const cwd = '/project';
      const resolved = resolveConfig(config, cwd);

      expect(resolved).toHaveLength(1);
      expect(resolved[0]!.format).toBeDefined();
      expect(resolved[0]!.format!.indentSize).toBe(4);
      expect(resolved[0]!.format!.trailingComma).toBe(true);
    });

    it('should merge format config in multi-schema (schema overrides root)', () => {
      const config: CerialConfig = {
        output: './generated',
        format: {
          indentSize: 2,
          blockSeparation: 2,
          alignmentScope: 'group',
        },
        schemas: {
          auth: {
            path: './schemas/auth.cerial',
            format: {
              indentSize: 4,
            },
          },
          posts: {
            path: './schemas/posts.cerial',
          },
        },
      };
      const cwd = '/project';
      const resolved = resolveConfig(config, cwd);

      expect(resolved).toHaveLength(2);

      // auth schema: indentSize overridden, blockSeparation and alignmentScope from root
      expect(resolved[0]!.format!.indentSize).toBe(4);
      expect(resolved[0]!.format!.blockSeparation).toBe(2);
      expect(resolved[0]!.format!.alignmentScope).toBe('group');

      // posts schema: all from root
      expect(resolved[1]!.format!.indentSize).toBe(2);
      expect(resolved[1]!.format!.blockSeparation).toBe(2);
      expect(resolved[1]!.format!.alignmentScope).toBe('group');
    });

    it('should not include format if not specified', () => {
      const config: CerialConfig = {
        schema: './schemas',
        output: './client',
      };
      const cwd = '/project';
      const resolved = resolveConfig(config, cwd);

      expect(resolved).toHaveLength(1);
      expect(resolved[0]!.format).toBeUndefined();
    });

    it('should handle empty format object', () => {
      const config: CerialConfig = {
        schema: './schemas',
        output: './client',
        format: {},
      };
      const cwd = '/project';
      const resolved = resolveConfig(config, cwd);

      expect(resolved).toHaveLength(1);
      expect(resolved[0]!.format).toBeUndefined();
    });

    it('should merge partial format overrides in multi-schema', () => {
      const config: CerialConfig = {
        output: './generated',
        format: {
          indentSize: 2,
          blockSeparation: 2,
          alignmentScope: 'group',
          decoratorAlignment: 'aligned',
        },
        schemas: {
          auth: {
            path: './schemas/auth.cerial',
            format: {
              blockSeparation: 1,
              decoratorAlignment: 'compact',
            },
          },
        },
      };
      const cwd = '/project';
      const resolved = resolveConfig(config, cwd);

      expect(resolved[0]!.format!.indentSize).toBe(2);
      expect(resolved[0]!.format!.blockSeparation).toBe(1);
      expect(resolved[0]!.format!.alignmentScope).toBe('group');
      expect(resolved[0]!.format!.decoratorAlignment).toBe('compact');
    });
  });
});
