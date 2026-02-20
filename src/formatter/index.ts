/**
 * Formatter module exports
 */

export type { AlignedField } from './aligner';
export { alignFields, calculateColumnWidths } from './aligner';
export type { CommentMap } from './comment-attacher';
export { attachComments, detectCommentStyle } from './comment-attacher';
export { formatCerialSource, normalizeCommentText } from './formatter';
export { printEnum, printLiteral, printTuple } from './inline-printer';
export {
  buildTypeWithModifiers,
  extractDecoratorText,
  formatDirective,
  printModel,
  printObject,
} from './printer';
export { DECORATOR_ORDER, resolveConfig, sortDecorators } from './rules';
export type { FormatConfig, FormatOptions, FormatResult } from './types';
export { FORMAT_DEFAULTS } from './types';
