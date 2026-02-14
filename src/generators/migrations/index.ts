/**
 * Migrations generators module
 */

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

export type { SurrealQLType } from './type-mapper';

export {
  generateDefineField,
  generateDefineIndex,
  generateDefineTable,
  generateMigrationCode,
  generateMigrationQuery,
  generateModelDefineStatements,
  generateRegistryDefineStatements,
} from './define-generator';

export type { DefineFieldOptions, DefineTableOptions } from './define-generator';

export { writeMigrationFile } from './writer';
