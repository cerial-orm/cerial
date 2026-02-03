/**
 * Logger - logging utilities for CLI
 */

/** ANSI color codes */
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

/** Log level */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

/** Log output level for generate command */
export type LogOutputLevel = 'minimal' | 'medium' | 'full';

/** Logger options */
export interface LoggerOptions {
  /** Whether to use colors */
  useColors?: boolean;
  /** Whether to show timestamps */
  showTimestamp?: boolean;
  /** Minimum log level */
  minLevel?: LogLevel;
  /** Log output level for file generation */
  outputLevel?: LogOutputLevel;
}

/** Logger instance */
export class Logger {
  private options: Required<LoggerOptions>;

  constructor(options: LoggerOptions = {}) {
    this.options = {
      useColors: options.useColors ?? true,
      showTimestamp: options.showTimestamp ?? false,
      minLevel: options.minLevel ?? 'info',
      outputLevel: options.outputLevel ?? 'minimal',
    };
  }

  /** Set output level */
  setOutputLevel(level: LogOutputLevel): void {
    this.options.outputLevel = level;
  }

  /** Get current output level */
  getOutputLevel(): LogOutputLevel {
    return this.options.outputLevel;
  }

  private color(text: string, color: keyof typeof colors): string {
    if (!this.options.useColors) return text;
    return `${colors[color]}${text}${colors.reset}`;
  }

  private getTimestamp(): string {
    if (!this.options.showTimestamp) return '';
    return `[${new Date().toISOString()}] `;
  }

  debug(message: string): void {
    if (this.options.minLevel === 'debug') {
      console.log(`${this.getTimestamp()}${this.color('[DEBUG]', 'dim')} ${message}`);
    }
  }

  info(message: string): void {
    console.log(`${this.getTimestamp()}${this.color('[INFO]', 'blue')} ${message}`);
  }

  warn(message: string): void {
    console.log(`${this.getTimestamp()}${this.color('[WARN]', 'yellow')} ${message}`);
  }

  error(message: string): void {
    console.error(`${this.getTimestamp()}${this.color('[ERROR]', 'red')} ${message}`);
  }

  success(message: string): void {
    console.log(`${this.getTimestamp()}${this.color('[SUCCESS]', 'green')} ${message}`);
  }

  /** Log a file creation */
  fileCreated(path: string): void {
    console.log(`  ${this.color('+', 'green')} ${path}`);
  }

  /** Log progress */
  progress(message: string): void {
    console.log(`${this.color('→', 'cyan')} ${message}`);
  }
}

/** Default logger instance */
export const logger = new Logger();
