/** A statement as the plan carries it, without the trailing semicolons and surrounding space. */
export const trimStatement = (text: string): string => text.trim().replace(/;+\s*$/, '');

/** The message of a thrown value. */
export const describe = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));
