/**
 * Migrations generators module
 */

export type { DefineFieldOptions, DefineTableOptions } from './define-generator';
export {
  generateDefineField,
  generateDefineIndex,
  generateDefineTable,
  generateMigrationCode,
  generateMigrationQuery,
  generateModelDefineStatements,
  generateRegistryDefineStatements,
} from './define-generator';
export type { SurrealQLType } from './type-mapper';
export {
  generateAssertClause,
  generateComputedClause,
  generateDefaultClause,
  generateLiteralSurrealType,
  generateTypeClause,
  getTypeAssertion,
  hasTypeAssertion,
  mapToSurrealType,
} from './type-mapper';

export { writeMigrationFile } from './writer';
