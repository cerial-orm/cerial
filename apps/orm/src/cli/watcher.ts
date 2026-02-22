/**
 * File watcher for per-schema regeneration on .cerial file changes.
 * Uses node:fs watch with recursive option (supported natively by Bun on macOS/Linux).
 */

import { type FSWatcher, watch } from 'node:fs';
import { basename, resolve } from 'node:path';
import { resolveConfig as resolveFormatConfig } from '../formatter/rules';
import type { FormatConfig } from '../formatter/types';
import type { PathFilter } from './filters/types';
import { formatSingleFile } from './format';
import { generateSingleSchema } from './generate';

/** Base fields needed by any watcher target */
export interface WatchTargetBase {
  name?: string;
  schemaPath: string;
  filter?: PathFilter;
}

/** Watch target for a single schema (generate mode) */
export interface WatchTarget extends WatchTargetBase {
  outputDir: string;
  clientClassName?: string;
}

/** Watch target for format mode */
export interface FormatWatchTarget extends WatchTargetBase {
  formatConfig?: FormatConfig;
}

export type WatchCallback<T extends WatchTargetBase = WatchTargetBase> = (target: T, filename: string) => Promise<void>;

export const DEBOUNCE_MS = 300;

export function isCerialFile(filename: string | null): boolean {
  if (!filename) return false;

  return filename.endsWith('.cerial');
}

export function isCerialIgnoreFile(filename: string | null): boolean {
  if (!filename) return false;

  return filename.endsWith('.cerialignore');
}

export function shouldTriggerRegeneration(filename: string | null, filter?: PathFilter): boolean {
  if (!filename) return false;

  // .cerialignore changes always trigger (filter re-resolution needed)
  if (isCerialIgnoreFile(filename)) return true;

  // Must be a .cerial file
  if (!isCerialFile(filename)) return false;

  // If no filter, all .cerial files trigger
  if (!filter) return true;

  // Check filter — normalize Windows backslashes before checking
  return filter.shouldInclude(filename.replace(/\\/g, '/'));
}

export function getSchemaLabel(target: WatchTargetBase): string {
  return target.name ?? target.schemaPath;
}

export interface Debouncer {
  schedule(key: string, fn: () => void): void;
  cancel(key: string): void;
  cancelAll(): void;
  pending(): number;
}

export function createDebouncer(delayMs: number): Debouncer {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  return {
    schedule(key: string, fn: () => void): void {
      const existing = timers.get(key);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        timers.delete(key);
        fn();
      }, delayMs);

      timers.set(key, timer);
    },
    cancel(key: string): void {
      const timer = timers.get(key);
      if (timer) {
        clearTimeout(timer);
        timers.delete(key);
      }
    },
    cancelAll(): void {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    },
    pending(): number {
      return timers.size;
    },
  };
}

/**
 * Generic file watcher: watches schema directories and calls the provided callback on .cerial file changes.
 * Reuses debounce and filter logic. Returns a Promise that resolves when stopped via SIGINT.
 */
export async function startWatcherWithCallback<T extends WatchTargetBase>(
  targets: T[],
  onFileChange: WatchCallback<T>,
  options?: { label?: string },
): Promise<void> {
  if (!targets.length) return;

  const label = options?.label ?? 'watch';
  const watchers: FSWatcher[] = [];
  const debouncer = createDebouncer(DEBOUNCE_MS);

  function cleanup(): void {
    for (const watcher of watchers) {
      watcher.close();
    }
    debouncer.cancelAll();
  }

  for (const target of targets) {
    try {
      const watcher = watch(target.schemaPath, { recursive: true }, (_event, filename) => {
        if (!shouldTriggerRegeneration(filename, target.filter)) return;

        debouncer.schedule(target.schemaPath, () => {
          void onFileChange(target, filename!);
        });
      });

      watchers.push(watcher);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${label}] Failed to watch '${getSchemaLabel(target)}': ${message}`);
    }
  }

  if (!watchers.length) {
    console.error(`[${label}] No watchers could be started. Exiting.`);

    return;
  }

  console.log(`[${label}] Watching ${targets.length} schema(s) for changes...`);

  return new Promise<void>((resolvePromise) => {
    process.on('SIGINT', () => {
      console.log(`\n[${label}] Stopping watchers...`);
      cleanup();
      resolvePromise();
    });
  });
}

export interface WatcherOptions {
  format?: boolean;
  formatConfig?: FormatConfig;
}

/**
 * Start watching schema directories for .cerial file changes.
 * On change, regenerates only the affected schema.
 * If format option is enabled, formats the changed file before generating.
 * Returns a Promise that resolves when the watcher is stopped via SIGINT.
 */
export async function startWatcher(schemas: WatchTarget[], options?: WatcherOptions): Promise<void> {
  return startWatcherWithCallback(
    schemas,
    async (target, filename) => {
      const schemaLabel = getSchemaLabel(target);

      // Format mode: format the changed file before generating
      if (options?.format && isCerialFile(filename)) {
        const filePath = resolve(target.schemaPath, filename);
        const resolvedFormatConfig = resolveFormatConfig(options.formatConfig);
        const formatResult = await formatSingleFile(filePath, resolvedFormatConfig);

        if (formatResult.error) {
          // Silent error handling in watch mode
          return;
        }
      }

      console.log(`[watch] Change detected in '${schemaLabel}' (${filename}). Regenerating...`);

      const start = performance.now();
      try {
        const result = await generateSingleSchema({
          schemaPath: target.schemaPath,
          outputDir: target.outputDir,
          clientClassName: target.clientClassName,
          logLevel: 'minimal',
        });

        const elapsed = Math.round(performance.now() - start);

        if (result.success) {
          console.log(`[watch] '${schemaLabel}' regenerated in ${elapsed}ms`);
        } else {
          for (const error of result.errors) {
            console.error(`[watch] Error regenerating '${schemaLabel}': ${error}`);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[watch] Error regenerating '${schemaLabel}': ${message}`);
      }
    },
    { label: 'watch' },
  );
}

/**
 * Start watching schema directories for .cerial file changes (format mode).
 * On change, formats the changed file with silent error handling.
 * Parse errors are silently skipped; verbose mode logs them.
 */
export async function startFormatterWatcher(
  targets: FormatWatchTarget[],
  config: Required<FormatConfig>,
  options?: { verbose?: boolean },
): Promise<void> {
  const verbose = options?.verbose ?? false;

  return startWatcherWithCallback(
    targets,
    async (target, filename) => {
      // Only format .cerial files (skip .cerialignore changes)
      if (!isCerialFile(filename)) return;

      const filePath = resolve(target.schemaPath, filename);
      const result = await formatSingleFile(filePath, config);

      if (result.error) {
        if (verbose) {
          console.log(`[format-watch] Error in '${basename(filename)}': ${result.error.message}`);
        }

        return;
      }

      if (result.changed) {
        console.log(`[format-watch] Formatted '${basename(filename)}'`);
      } else if (verbose) {
        console.log(`[format-watch] '${basename(filename)}' unchanged`);
      }
    },
    { label: 'format-watch' },
  );
}
