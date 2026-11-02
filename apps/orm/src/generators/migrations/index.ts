/**
 * Migrations generators module
 */

export type { DefineFieldOptions, DefineTableOptions } from './define-generator';
export {
  generateDefineField,
  generateDefineIndex,
  generateDefineTable,
  generateMigrationQuery,
  generateModelDefineStatements,
  generateRegistryDefineStatements,
} from './define-generator';
export { generateManifestCode } from './manifest';
export type { SurrealQLType } from './type-mapper';
export {
  generateAssertClause,
  generateComputedClause,
  generateDefaultClause,
  generateIdTypeClause,
  generateLiteralSurrealType,
  generateTupleSurrealTypeLiteral,
  generateTypeClause,
  generateValueClause,
  getTypeAssertion,
  hasTypeAssertion,
  mapToSurrealType,
} from './type-mapper';

export { writeManifestFile, writeMigrationFile } from './writer';
