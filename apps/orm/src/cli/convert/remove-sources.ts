import { realpathSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { PlannedOutput } from './output-paths';

/** One config entry and everything it reads, so a file two entries read can be told from one only this run owns. */
export interface SourceClaim {
  readonly name: string | undefined;
  /** Every schema file the entry resolved, `.cerial` and TypeScript. */
  readonly sources: readonly string[];
  /** The config values that name a file directly: `files`, `path` and `entry`. */
  readonly listed: readonly { readonly key: 'files' | 'path' | 'entry'; readonly file: string }[];
}

export interface ConvertedSources {
  /** Every `.cerial` file this run read. */
  readonly inputs: readonly string[];
  /** The files that emitted a declaration, each with the module that replaces it. */
  readonly outputs: readonly PlannedOutput[];
  /** Targets the commit wrote; empty for a dry run. */
  readonly written: readonly string[];
  readonly claims: readonly SourceClaim[];
}

export interface RemoveSourcesOptions {
  readonly dryRun?: boolean;
  /** Replaces the deletion so a failure can be injected. */
  readonly remove?: (path: string) => Promise<void>;
}

export interface RemovalReport {
  readonly removed: readonly string[];
  readonly kept: readonly string[];
  readonly failed: readonly string[];
  /** What to print, in order. */
  readonly lines: readonly string[];
}

/** The path a file really is, for comparison only; a missing file compares by its resolved path. */
function real(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/**
 * Deletes the `.cerial` files that were fully converted. It runs only after the writer's commit returned, so
 * a refusal, a failed gate or a rollback never reaches it. A file it cannot remove is reported and the rest go on;
 * the converted output is never touched.
 */
export async function removeSources(
  converted: ConvertedSources,
  options: RemoveSourcesOptions = {},
): Promise<RemovalReport> {
  const remove = options.remove ?? unlink;
  const outputOf = new Map(converted.outputs.map((o) => [o.source, o.target]));
  const written = new Set(converted.written.map(real));
  const targets = new Set(converted.outputs.map((o) => real(o.target)));
  const removed: string[] = [];
  const kept: string[] = [];
  const failed: string[] = [];
  const lines: string[] = [];
  const configLines: string[] = [];

  for (const input of [...new Set(converted.inputs)]) {
    const target = outputOf.get(input);
    const resolved = real(input);
    let reason: string | undefined;
    if (target === undefined) reason = 'it holds no declaration, so its comments exist nowhere else';
    else if (targets.has(resolved)) reason = 'it is also an output of this run';
    else if (!options.dryRun && !written.has(real(target))) reason = 'its converted module was not written';
    else if (converted.claims.filter((c) => c.sources.some((s) => real(s) === resolved)).length > 1)
      reason = 'another schema entry reads it';

    if (reason !== undefined || target === undefined) {
      kept.push(input);
      lines.push(`kept ${input}: ${reason}`);
      continue;
    }

    if (options.dryRun) {
      lines.push(`would remove ${input}`);
    } else {
      try {
        await remove(input);
      } catch (error) {
        failed.push(input);
        lines.push(`NOT removed ${input}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      lines.push(`removed ${input}`);
    }
    removed.push(input);

    for (const claim of converted.claims) {
      for (const { key, file } of claim.listed) {
        if (real(file) !== resolved) continue;
        const entry = claim.name ? ` in schema '${claim.name}'` : '';
        configLines.push(
          `change '${key}'${entry} from ${file} to ${target}, or generate stops: the file no longer exists`,
        );
      }
    }
  }

  return { removed, kept, failed, lines: [...lines, ...configLines] };
}
