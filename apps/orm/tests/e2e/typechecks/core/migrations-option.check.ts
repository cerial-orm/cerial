/**
 * Type checks for the `migrations` client option
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { Test } from 'ts-toolbelt';
import { CerialClient } from '../../generated';

type Options = NonNullable<ConstructorParameters<typeof CerialClient>[0]>;

Test.checks([Test.check<Options['migrations'], 'auto' | 'verify' | 'off' | undefined, Test.Pass>()]);

new CerialClient();
new CerialClient({});
new CerialClient({ migrations: 'auto' });
new CerialClient({ migrations: 'verify' });
new CerialClient({ migrations: 'off' });

// @ts-expect-error - only 'auto', 'verify' and 'off' are accepted
new CerialClient({ migrations: 'lazy' });

// @ts-expect-error - a boolean is not a mode
new CerialClient({ migrations: false });
