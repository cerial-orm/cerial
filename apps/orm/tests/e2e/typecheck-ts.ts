/**
 * Runs the compile-time checks under `typechecks/` against the client generated from the
 * TypeScript corpus. The overlay method lives in `typecheck-overlay.ts`.
 */

import { typecheckAgainst } from './typecheck-overlay';

process.exit(await typecheckAgainst('typecheck:ts', 'typechecks-ts', 'generated-ts'));
