/**
 * defineConfig helper for type-safe configuration
 */

import type { CerialConfig } from './types';

/**
 * Identity function that provides type-safety and IDE autocomplete for CerialConfig
 */
export function defineConfig(config: CerialConfig): CerialConfig {
  return config;
}
