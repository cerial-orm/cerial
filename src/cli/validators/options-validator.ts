/**
 * Options validator - validates CLI options
 */

/** Log output level */
export type LogOutputLevel = 'minimal' | 'medium' | 'full';

export interface CLIOptions {
  schema?: string;
  output?: string;
  watch?: boolean;
  format?: boolean;
  verbose?: boolean;
  log?: LogOutputLevel;
  clean?: boolean;
  name?: string;
  config?: string;
  yes?: boolean;
}

/** Validation error */
export interface OptionsValidationError {
  option: string;
  message: string;
}

/** Validation result */
export interface OptionsValidationResult {
  valid: boolean;
  errors: OptionsValidationError[];
}

/** Validate CLI options */
export function validateOptions(options: CLIOptions): OptionsValidationResult {
  const errors: OptionsValidationError[] = [];

  if (!options.output && !options.config) {
    errors.push({
      option: 'output',
      message: 'Output directory is required (-o or --output) when not using a config file',
    });
  }

  return {
    valid: !errors.length,
    errors,
  };
}

/** Get default options */
export function getDefaultOptions(): Partial<CLIOptions> {
  return {
    watch: false,
    verbose: false,
    log: 'minimal',
  };
}
