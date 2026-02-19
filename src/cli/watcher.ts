/**
 * File watcher for per-schema regeneration on .cerial file changes.
 * Uses node:fs watch with recursive option (supported natively by Bun on macOS/Linux).
 */

import { type FSWatcher, watch } from 'node:fs';
import { generateSingleSchema } from './generate';

/** Watch target for a single schema */
export interface WatchTarget {
  name?: string;
  schemaPath: string;
  outputDir: string;
  clientClassName?: string;
}

export const DEBOUNCE_MS = 300;

export function isCerialFile(filename: string | null): boolean {
  if (!filename) return false;

  return filename.endsWith('.cerial');
}

export function getSchemaLabel(target: WatchTarget): string {
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
 * Start watching schema directories for .cerial file changes.
 * On change, regenerates only the affected schema.
 * Returns a Promise that resolves when the watcher is stopped via SIGINT.
 */
export async function startWatcher(schemas: WatchTarget[]): Promise<void> {
  if (!schemas.length) return;

  const watchers: FSWatcher[] = [];
  const debouncer = createDebouncer(DEBOUNCE_MS);

  async function regenerateSchema(target: WatchTarget, filename: string): Promise<void> {
    const label = getSchemaLabel(target);
    console.log(`[watch] Change detected in '${label}' (${filename}). Regenerating...`);

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
        console.log(`[watch] '${label}' regenerated in ${elapsed}ms`);
      } else {
        for (const error of result.errors) {
          console.error(`[watch] Error regenerating '${label}': ${error}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[watch] Error regenerating '${label}': ${message}`);
    }
  }

  function cleanup(): void {
    for (const watcher of watchers) {
      watcher.close();
    }
    debouncer.cancelAll();
  }

  for (const target of schemas) {
    try {
      const watcher = watch(target.schemaPath, { recursive: true }, (_event, filename) => {
        if (!isCerialFile(filename)) return;

        debouncer.schedule(target.schemaPath, () => {
          void regenerateSchema(target, filename!);
        });
      });

      watchers.push(watcher);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[watch] Failed to watch '${getSchemaLabel(target)}': ${message}`);
    }
  }

  if (!watchers.length) {
    console.error('[watch] No watchers could be started. Exiting.');

    return;
  }

  console.log(`[watch] Watching ${schemas.length} schema(s) for changes...`);

  return new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      console.log('\n[watch] Stopping watchers...');
      cleanup();
      resolve();
    });
  });
}
