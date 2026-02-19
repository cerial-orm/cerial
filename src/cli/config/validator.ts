/**
 * Configuration validator
 */

import { dirname, resolve } from 'node:path';
import { Glob } from 'bun';
import type { CerialConfig, ResolvedSchemaEntry } from './types';

export interface ConfigValidationError {
  field: string;
  message: string;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
  warnings?: ConfigValidationError[];
}

const _RESERVED_NAMES_ERROR = new Set(['default', 'index']);
const _RESERVED_NAMES_WARN = new Set(['test']);

function isValidIdentifier(name: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
}

function pathsOverlap(path1: string, path2: string): boolean {
  const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/$/, '');
  const p1 = normalize(path1);
  const p2 = normalize(path2);

  return p1.startsWith(p2) || p2.startsWith(p1);
}

export function validateFolderConfig(config: Record<string, unknown>): ConfigValidationResult {
  const errors: ConfigValidationError[] = [];

  if ('schema' in config) {
    errors.push({
      field: 'schema',
      message: "Folder-level config must not contain 'schema'. The folder itself is the schema root.",
    });
  }

  if ('schemas' in config) {
    errors.push({
      field: 'schemas',
      message: "Folder-level config must not contain 'schemas'. The folder itself is the schema root.",
    });
  }

  if ('output' in config && typeof config.output !== 'string') {
    errors.push({
      field: 'output',
      message: "'output' must be a string",
    });
  }

  if ('connection' in config && (typeof config.connection !== 'object' || config.connection === null)) {
    errors.push({
      field: 'connection',
      message: "'connection' must be an object",
    });
  }

  if ('name' in config) {
    if (typeof config.name !== 'string') {
      errors.push({
        field: 'name',
        message: "'name' must be a string",
      });
    } else if (!isValidIdentifier(config.name)) {
      errors.push({
        field: 'name',
        message: "'name' must be a valid JavaScript identifier",
      });
    } else if (_RESERVED_NAMES_ERROR.has(config.name)) {
      errors.push({
        field: 'name',
        message: `Schema name '${config.name}' is reserved and cannot be used`,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

export function detectNestedConfigs(configPaths: string[]): void {
  const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/$/, '');

  for (let i = 0; i < configPaths.length; i++) {
    for (let j = i + 1; j < configPaths.length; j++) {
      const p1 = normalize(configPaths[i]!);
      const p2 = normalize(configPaths[j]!);

      if (p1.startsWith(`${p2}/`) || p2.startsWith(`${p1}/`)) {
        const [parent, child] = p1.startsWith(`${p2}/`) ? [p2, p1] : [p1, p2];
        throw new Error(
          `Nested configs detected: "${parent}" contains "${child}". Only one config per schema hierarchy is allowed.`,
        );
      }
    }
  }
}

export function validateConfig(config: CerialConfig): ConfigValidationResult {
  const errors: ConfigValidationError[] = [];
  const warnings: ConfigValidationError[] = [];

  if (!config.schemas && !config.schema) {
    errors.push({
      field: 'config',
      message: 'Either "schema" (single-schema) or "schemas" (multi-schema) must be provided',
    });

    return { valid: false, errors };
  }

  if (config.schemas) {
    const schemaNames = Object.keys(config.schemas);
    const outputPaths = new Set<string>();
    const schemaPaths: string[] = [];

    for (const name of schemaNames) {
      if (!isValidIdentifier(name)) {
        errors.push({
          field: `schemas.${name}`,
          message: `Schema name "${name}" must be a valid JavaScript identifier (alphanumeric, underscore, dollar sign)`,
        });
      }

      if (_RESERVED_NAMES_ERROR.has(name)) {
        errors.push({
          field: `schemas.${name}`,
          message: `Schema name "${name}" is reserved and cannot be used`,
        });
      } else if (_RESERVED_NAMES_WARN.has(name)) {
        warnings.push({
          field: `schemas.${name}`,
          message: `Schema name "${name}" is reserved and may cause issues`,
        });
      }

      const entry = config.schemas![name];
      if (!entry) continue;

      if (!entry.path) {
        errors.push({
          field: `schemas.${name}.path`,
          message: 'Schema path is required',
        });
      } else {
        schemaPaths.push(entry.path);
      }

      const outputPath = entry.output || config.output;
      if (!outputPath) {
        errors.push({
          field: `schemas.${name}.output`,
          message: 'Output path is required (either in entry or root config)',
        });
      } else if (outputPaths.has(outputPath)) {
        errors.push({
          field: `schemas.${name}.output`,
          message: `Output path "${outputPath}" is not unique across schemas`,
        });
      } else {
        outputPaths.add(outputPath);
      }
    }

    for (let i = 0; i < schemaPaths.length; i++) {
      for (let j = i + 1; j < schemaPaths.length; j++) {
        const path1 = schemaPaths[i];
        const path2 = schemaPaths[j];
        if (path1 && path2 && pathsOverlap(path1, path2)) {
          errors.push({
            field: 'schemas',
            message: `Schema paths overlap: "${path1}" and "${path2}"`,
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export async function detectConfigsInsideRootPaths(rootPaths: string[], _cwd: string): Promise<void> {
  const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/$/, '');

  for (const rootPath of rootPaths) {
    const normalizedRoot = normalize(resolve(rootPath));

    for (const pattern of [
      '**/cerial.config.ts',
      '**/cerial.config.json',
      '**/schema.cerial',
      '**/main.cerial',
      '**/index.cerial',
    ]) {
      const glob = new Glob(pattern);
      try {
        for await (const match of glob.scan({ cwd: rootPath })) {
          if (match.includes('node_modules/')) continue;

          const fullPath = resolve(rootPath, match);
          const configDir = normalize(dirname(fullPath));

          if (configDir === normalizedRoot) continue;

          const isConfig = pattern.endsWith('.ts') || pattern.endsWith('.json');
          const fileType = isConfig ? 'config file' : 'convention marker';

          throw new Error(
            `Found ${fileType} at '${configDir}' inside schema path '${normalizedRoot}' defined in root config. Remove the nested ${fileType} or adjust root config paths.`,
          );
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('inside schema path')) {
          throw error;
        }
      }
    }
  }
}

export function validateCombinedEntries(
  rootEntries: ResolvedSchemaEntry[],
  discoveredEntries: ResolvedSchemaEntry[],
): void {
  // Check root-vs-discovered collisions
  for (const discovered of discoveredEntries) {
    for (const root of rootEntries) {
      if (discovered.name === root.name) {
        throw new Error(
          `Auto-discovered schema name '${discovered.name}' collides with root-defined schema. Rename the folder or add it to root config explicitly.`,
        );
      }

      if (pathsOverlap(discovered.output, root.output)) {
        throw new Error(
          `Auto-discovered schema '${discovered.name}' output '${discovered.output}' collides with root-defined schema '${root.name}'.`,
        );
      }
    }
  }

  // Check discovered-vs-discovered collisions
  for (let i = 0; i < discoveredEntries.length; i++) {
    for (let j = i + 1; j < discoveredEntries.length; j++) {
      const entry1 = discoveredEntries[i]!;
      const entry2 = discoveredEntries[j]!;

      if (entry1.name === entry2.name) {
        throw new Error(
          `Duplicate schema name '${entry1.name}' discovered at '${entry1.path}' and '${entry2.path}'. Add a 'name' field to the folder config in one of them to disambiguate.`,
        );
      }

      if (pathsOverlap(entry1.output, entry2.output)) {
        throw new Error(
          `Discovered schema '${entry1.name}' output '${entry1.output}' collides with discovered schema '${entry2.name}'.`,
        );
      }
    }
  }
}

export function detectNestedSchemaRoots(roots: Array<{ path: string; type: 'folder-config' | 'convention-marker' }>): {
  ignored: Set<string>;
} {
  const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/$/, '');
  const ignored = new Set<string>();

  for (let i = 0; i < roots.length; i++) {
    for (let j = i + 1; j < roots.length; j++) {
      const root1 = roots[i]!;
      const root2 = roots[j]!;
      const p1 = normalize(root1.path);
      const p2 = normalize(root2.path);

      // Check if one is nested inside the other
      if (p1.startsWith(`${p2}/`) || p2.startsWith(`${p1}/`)) {
        const [parent, child] = p1.startsWith(`${p2}/`) ? [root2, root1] : [root1, root2];

        // Apply the 4-rule matrix
        if (parent.type === 'convention-marker' && child.type === 'folder-config') {
          // Rule 4: convention-marker parent + folder-config child → parent ignored
          ignored.add(parent.path);
        } else {
          // Rules 1, 2, 3: all other combinations throw error
          throw new Error(
            `Nested schema roots detected: '${parent.path}' contains '${child.path}'. Only one config per schema hierarchy is allowed.`,
          );
        }
      }
    }
  }

  return { ignored };
}
