/**
 * File watcher for per-schema regeneration on .cerial file changes.
 * Uses node:fs watch with recursive option (supported natively by Bun on macOS/Linux).
 */

import { spawn } from 'node:child_process';
import { type FSWatcher, watch } from 'node:fs';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import { resolveConfig as resolveFormatConfig } from '../formatter/rules';
import type { FormatConfig } from '../formatter/types';
import type { PathFilter } from './filters/types';
import { formatSingleFile } from './format';
import { generateSingleSchema } from './generate';
import { isSchemaFile, isTypescriptSchemaFile, resolveSinglePath } from './resolvers/schema-resolver';

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
  /** The `--config` path the user passed; set only on targets built from a config entry */
  configPath?: string;
  /** The config entry's `defineSchema()` module; its imports are what generation registers, so they are watched */
  entry?: string;
  /** The config's listed `files`, absolute */
  files?: string[];
  /** The config gave no `path`, so `schemaPath` is the folder of the entry and listed files and holds no schema files of its own */
  entryOnly?: boolean;
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

/** Where a TypeScript entry writes, so its own output never triggers it */
export interface TypescriptEntryScope {
  schemaPath: string;
  outputDir: string;
}

/** A plain `.ts` file in a TypeScript entry: a schema module may import it, unless it is generated output */
function isTypescriptDependency(filename: string, scope: TypescriptEntryScope): boolean {
  if (!filename.endsWith('.ts')) return false;

  const path = filename.replace(/\\/g, '/');
  if (/(^|\/)cerial\/handles\.ts$/.test(path) || /(^|\/)node_modules\//.test(path)) return false;

  const outputRelative = relative(resolve(scope.schemaPath), resolve(scope.outputDir)).replace(/\\/g, '/');
  const outputInside = outputRelative !== '' && !outputRelative.startsWith('..') && !isAbsolute(outputRelative);

  return !(outputInside && (path === outputRelative || path.startsWith(`${outputRelative}/`)));
}

export function shouldTriggerRegeneration(
  filename: string | null,
  filter?: PathFilter,
  typescriptEntry?: TypescriptEntryScope,
): boolean {
  if (!filename) return false;

  // .cerialignore changes always trigger (filter re-resolution needed)
  if (isCerialIgnoreFile(filename)) return true;

  // Must be a .cerial file, a TypeScript schema module, or (in a TypeScript entry) a file one may import
  const isTrigger =
    isSchemaFile(filename) ||
    (!!typescriptEntry && !isTypescriptSchemaFile(filename) && isTypescriptDependency(filename, typescriptEntry));
  if (!isTrigger) return false;

  // If no filter, all trigger
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
  options?: { label?: string; shouldTrigger?: (target: T, filename: string | null) => boolean },
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
    process.off('SIGINT', onSigint);
  }

  let resolveStopped: () => void = () => {};
  const onSigint = (): void => {
    console.log(`\n[${label}] Stopping watchers...`);
    cleanup();
    resolveStopped();
  };

  // Targets can share a schemaPath, so the index is the only key unique to each target
  for (const [index, target] of targets.entries()) {
    try {
      const watcher = watch(target.schemaPath, { recursive: true }, (_event, filename) => {
        const triggers = options?.shouldTrigger ?? ((t, f) => shouldTriggerRegeneration(f, t.filter));
        if (!triggers(target, filename)) return;

        debouncer.schedule(String(index), () => {
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
    resolveStopped = resolvePromise;
    process.once('SIGINT', onSigint);
  });
}

/** The running CLI, re-invoked in a child process so a TypeScript entry sees a fresh module cache */
export interface CliInvocation {
  execPath: string;
  entry: string;
  /** Extra leading args, for runtimes that need them */
  args?: string[];
}

export interface WatcherOptions {
  format?: boolean;
  formatConfig?: FormatConfig;
  /** Defaults to the running process: `process.execPath` and `process.argv[1]` */
  cli?: CliInvocation;
}

/** True when the entry's TypeScript modules are what generation imports: some exist and no `.cerial` file does */
export async function holdsTypescriptModules(
  target: WatchTargetBase & { entry?: string; files?: string[] },
): Promise<boolean> {
  // An entry module is TypeScript by definition, and what it imports need not be named `*.schema.ts`
  if (target.entry || target.files?.some((file) => file.endsWith('.ts'))) return true;

  try {
    const files = await resolveSinglePath(target.schemaPath, process.cwd(), target.filter);

    return files.some(isTypescriptSchemaFile) && !files.some((f) => f.endsWith('.cerial'));
  } catch {
    return false;
  }
}

/**
 * The args that make a child regenerate exactly this target. A config entry is selected by name so its
 * client class name and filters apply; `-s` would silently fall back to the default class name. Only paths
 * and names travel on argv.
 */
export function buildGenerateArgs(target: WatchTarget, cli: CliInvocation): string[] {
  const select =
    target.name && target.clientClassName
      ? ['-n', target.name, ...(target.configPath ? ['-C', target.configPath] : [])]
      : ['-s', target.schemaPath];

  return [...(cli.args ?? []), cli.entry, 'generate', ...select, '-o', target.outputDir, '--log', 'minimal'];
}

/**
 * Run one generation in a child process of this same CLI, in this process's working directory so a config
 * found relative to it is found again. Resolves with a failure message, or null on success.
 */
export function runGenerateChild(target: WatchTarget, cli: CliInvocation): Promise<string | null> {
  const args = buildGenerateArgs(target, cli);

  return new Promise((resolvePromise) => {
    try {
      const child = spawn(cli.execPath, args, { stdio: 'inherit' });
      child.once('error', (error) => resolvePromise(`could not start the generation process: ${error.message}`));
      child.once('close', (code, signal) => {
        if (code === 0) return resolvePromise(null);
        resolvePromise(
          signal ? `generation process was stopped by ${signal}` : `generation process exited with code ${code}`,
        );
      });
    } catch (error) {
      resolvePromise(error instanceof Error ? error.message : String(error));
    }
  });
}

/**
 * Serialises regenerations of one entry: at most one runs at a time, and changes that arrive while it runs
 * cost exactly one more run afterwards.
 */
export function createCoalescedRunner(run: () => Promise<void>): () => Promise<void> {
  let running = false;
  let again = false;

  return async () => {
    if (running) {
      again = true;

      return;
    }
    running = true;
    try {
      do {
        again = false;
        await run();
      } while (again);
    } finally {
      running = false;
    }
  };
}

/**
 * Start watching schema directories for .cerial file changes.
 * On change, regenerates only the affected schema.
 * A TypeScript entry regenerates in a child process, because an imported module stays cached in this one.
 * If format option is enabled, formats the changed file before generating.
 * Returns a Promise that resolves when the watcher is stopped via SIGINT.
 */
export async function startWatcher(schemas: WatchTarget[], options?: WatcherOptions): Promise<void> {
  const cli: CliInvocation = options?.cli ?? { execPath: process.execPath, entry: process.argv[1]! };
  const typescriptTargets = new Set<WatchTarget>();
  for (const target of schemas) {
    if (await holdsTypescriptModules(target)) typescriptTargets.add(target);
  }
  const runners = new Map<WatchTarget, () => Promise<void>>();

  async function regenerate(target: WatchTarget, schemaLabel: string): Promise<void> {
    const start = performance.now();

    if (typescriptTargets.has(target)) {
      const failure = await runGenerateChild(target, cli);
      if (failure) console.error(`[watch] Error regenerating '${schemaLabel}': ${failure}`);
      else console.log(`[watch] '${schemaLabel}' regenerated in ${Math.round(performance.now() - start)}ms`);

      return;
    }

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
  }

  return startWatcherWithCallback(
    schemas,
    async (target, filename) => {
      const schemaLabel = getSchemaLabel(target);

      // Format mode: format the changed file before generating
      if (options?.format && isCerialFile(filename) && !target.entryOnly) {
        const filePath = resolve(target.schemaPath, filename);
        const resolvedFormatConfig = resolveFormatConfig(options.formatConfig);
        const formatResult = await formatSingleFile(filePath, resolvedFormatConfig);

        if (formatResult.error) {
          // Silent error handling in watch mode
          return;
        }
      }

      console.log(`[watch] Change detected in '${schemaLabel}' (${filename}). Regenerating...`);

      let runner = runners.get(target);
      if (!runner) {
        runner = createCoalescedRunner(() => regenerate(target, schemaLabel));
        runners.set(target, runner);
      }
      await runner();
    },
    {
      label: 'watch',
      shouldTrigger: (target, filename) =>
        shouldTriggerRegeneration(
          filename,
          target.filter,
          typescriptTargets.has(target) ? { schemaPath: target.schemaPath, outputDir: target.outputDir } : undefined,
        ),
    },
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
