/**
 * Stable codes, one per error kind, in the register Prisma uses (`P2002`): a letter and four digits.
 * The leading digit is the layer. A consumer branches on the code, so the prose of a message can
 * improve without breaking anyone. Never renumber or reuse a code; retire it instead.
 *
 * C1xxx connection, C2xxx identifiers and schema, C3xxx input validation, C5xxx transactions,
 * C6xxx database, C7xxx generation. C4xxx is unused: relation-rule violations are validation errors.
 */
export const CERIAL_ERROR_CODES = {
  NOT_CONNECTED: 'C1000',
  CONNECTION: 'C1001',
  SESSION_LOST: 'C1002',
  UNKNOWN_MODEL: 'C2000',
  UNKNOWN_FIELD: 'C2001',
  MIGRATION: 'C2002',
  VALIDATION: 'C3000',
  TRANSACTION: 'C5000',
  UNIQUE_CONSTRAINT: 'C6000',
  DATABASE: 'C6001',
  GENERATION: 'C7000',
} as const;

export type CerialErrorCode = (typeof CERIAL_ERROR_CODES)[keyof typeof CERIAL_ERROR_CODES];
