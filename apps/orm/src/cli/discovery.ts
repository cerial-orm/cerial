/**
 * Schema discovery - discovers schemas via folder configs and convention markers.
 * Extracted from generate.ts to avoid pulling in the full generation pipeline
 * when only discovery logic is needed (e.g., the format command).
 */

import { basename, resolve } from 'node:path';
import type { ResolvedSchemaEntry } from './config';
import {
  detectConfigsInsideRootPaths,
  detectNestedSchemaRoots,
  findFolderConfigs,
  loadFolderConfig,
  toClientClassName,
  validateCombinedEntries,
} from './config';
import type { PathFilter } from './filters';
import { findSchemaRoots } from './resolvers';
import { logger } from './utils';

export async function applyFolderOverridesAndDiscover(
  entries: ResolvedSchemaEntry[],
  cwd: string,
  filter?: PathFilter,
): Promise<ResolvedSchemaEntry[]> {
  const mergedEntries: ResolvedSchemaEntry[] = [];
  for (const entry of entries) {
    const folderConfig = await loadFolderConfig(entry.path);
    if (folderConfig) {
      mergedEntries.push({
        ...entry,
        ...(folderConfig.output ? { output: resolve(entry.path, folderConfig.output) } : {}),
        ...(folderConfig.connection ? { connection: folderConfig.connection } : {}),
      });
    } else {
      mergedEntries.push(entry);
    }
  }

  await detectConfigsInsideRootPaths(
    mergedEntries.map((e) => e.path),
    cwd,
  );

  const allFolderConfigs = await findFolderConfigs(cwd, filter);
  const rootPaths = mergedEntries.map((e) => resolve(e.path));
  const discovered = allFolderConfigs.filter(({ dir }) => {
    const resolvedDir = resolve(dir);

    return !rootPaths.some((rp) => resolvedDir === rp || resolvedDir.startsWith(`${rp}/`));
  });

  const discoveredEntries: ResolvedSchemaEntry[] = discovered.map(({ dir, config }) => {
    const name = config.name ?? basename(dir);

    return {
      name,
      path: dir,
      output: config.output ? resolve(dir, config.output) : resolve(dir, 'client'),
      clientClassName: toClientClassName(name),
      connection: config.connection,
    };
  });

  for (const entry of discoveredEntries) {
    logger.warn(
      `Auto-discovered schema '${entry.name}' from folder config at '${entry.path}' (not defined in root config)`,
    );
  }

  // Discover convention markers
  const schemaRoots = await findSchemaRoots(cwd, filter);

  // Filter out markers at/inside root paths (root config covers them)
  const discoveredMarkers = schemaRoots.filter(({ path: markerPath }) => {
    const resolvedMarker = resolve(markerPath);

    return !rootPaths.some((rp) => resolvedMarker === rp || resolvedMarker.startsWith(`${rp}/`));
  });

  // Filter out markers where folder config already exists (folder config wins)
  const folderConfigDirs = new Set(discovered.map(({ dir }) => resolve(dir)));
  const uniqueMarkers = discoveredMarkers.filter(({ path: mp }) => !folderConfigDirs.has(resolve(mp)));

  // Cross-method nesting detection (folder-config ↔ convention-marker)
  const typedRoots: Array<{ path: string; type: 'folder-config' | 'convention-marker' }> = [
    ...discovered.map(({ dir }) => ({ path: dir, type: 'folder-config' as const })),
    ...uniqueMarkers.map(({ path: mp }) => ({ path: mp, type: 'convention-marker' as const })),
  ];
  const { ignored } = detectNestedSchemaRoots(typedRoots);

  // Filter out ignored markers
  const finalMarkers = uniqueMarkers.filter(({ path: mp }) => !ignored.has(mp));

  const takenNames = new Set(discoveredEntries.map((e) => e.name));
  const deduplicatedMarkers = finalMarkers.filter(({ path: mp }) => {
    const name = basename(mp);
    if (takenNames.has(name)) return false;
    takenNames.add(name);

    return true;
  });

  const markerEntries: ResolvedSchemaEntry[] = deduplicatedMarkers.map(({ path: mp }) => {
    const name = basename(mp);

    return {
      name,
      path: mp,
      output: resolve(mp, 'client'),
      clientClassName: toClientClassName(name),
    };
  });

  for (const entry of markerEntries) {
    logger.warn(
      `Auto-discovered schema '${entry.name}' from convention marker at '${entry.path}' (not defined in root config)`,
    );
  }

  // Combine ALL discovered entries (folder configs + convention markers)
  const allDiscoveredEntries = [...discoveredEntries, ...markerEntries];
  validateCombinedEntries(mergedEntries, allDiscoveredEntries);

  return [...mergedEntries, ...allDiscoveredEntries];
}
