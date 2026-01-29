/**
 * Bun test preload script
 *
 * This runs before any e2e tests to generate the client.
 */

import { setup } from './setup';

await setup();
