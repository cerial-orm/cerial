/**
 * Restart the SurrealDB container so a test can lose a session for real. A dropped socket does not do
 * it: the session lives in the server process, so reconnecting replays auth against a server that
 * still remembers it. Only a restart destroys what the session was anchored to.
 *
 * The repo accepts any SurrealDB on 8000, so the container is named by the caller, never assumed.
 * The memory backend loses its data on restart: run these files apart from suites that need tables.
 */

import { setTimeout as sleep } from 'node:timers/promises';

/** Name of a container this machine may restart, or undefined to skip the tests that need one. */
export const RESTARTABLE_CONTAINER = process.env.CERIAL_RESTARTABLE_CONTAINER || undefined;

/** Restart the named container and wait until the database answers its health check again. */
export async function restartContainer(name: string): Promise<void> {
  const restart = Bun.spawn(['docker', 'restart', name], { stdout: 'ignore', stderr: 'pipe' });
  if ((await restart.exited) !== 0)
    throw new Error(`docker restart ${name} failed: ${await new Response(restart.stderr).text()}`);

  for (let attempt = 0; attempt < 60; attempt++) {
    const healthy = await fetch('http://127.0.0.1:8000/health').then(
      (response) => response.ok,
      () => false,
    );
    if (healthy) return;
    await sleep(500);
  }

  throw new Error(`${name} did not become healthy after restart`);
}
