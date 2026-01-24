/**
 * Options validator - validates CLI options
 */

/** CLI options */
export interface CLIOptions {
  /** Schema file/directory path */
  schema?: string;
  /** Output directory */
  output?: string;
  /** Watch mode */
  watch?: boolean;
  /** Verbose output */
  verbose?: boolean;
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

  // Output is required
  if (!options.output) {
    errors.push({
      option: 'output',
      message: 'Output directory is required (-o or --output)',
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
  };
}
