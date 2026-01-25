/**
 * Generators module barrel export
 */

// Types generators
export {
  generateAllDerivedTypes,
  generateClientIndex,
  generateCreateType,
  generateDbClientInterface,
  generateDerivedTypes,
  generateFieldDefinition,
  generateFieldType,
  generateFieldWhereType,
  generateInterface,
  generateInterfaces,
  generateInternalIndex,
  generateMethodSignatures,
  generateModelExports,
  generateModelInterface,
  generateModelsIndex,
  generateModelTypes,
  generateOrderByType,
  generateSelectType,
  generateUpdateType,
  generateWhereInputInterface,
  generateWhereInterface,
  generateWhereTypes,
} from './types';

// Metadata generators
export {
  convertField,
  convertFields,
  convertModel,
  convertModels,
  createRegistry,
  generateRegistryCode,
  writeInternalIndex,
  writeModelRegistry,
} from './metadata';

// Client generators
export {
  formatCode,
  generateClientClass,
  generateClientSetup,
  generateClientTemplate,
  generateConnectFunction,
  generateConnectionConfigInterface,
  generateConnectionExports,
  generateDbProxyInterface,
  generateDisconnectFunction,
  generateImports,
  generateTypedDbInterface,
  generateUseConnectionFunction,
  writeClient,
  writeClientIndex as writeClientIndexFile,
  writeClientMain,
  writeModelsIndex,
  writeModelTypes,
} from './client';

// Migration generators
export {
  generateAssertClause,
  generateDefaultClause,
  generateDefineField,
  generateDefineIndex,
  generateDefineTable,
  generateMigrationCode,
  generateMigrationQuery,
  generateModelDefineStatements,
  generateRegistryDefineStatements,
  generateTypeClause,
  getTypeAssertion,
  hasTypeAssertion,
  mapToSurrealType,
  writeMigrationFile,
} from './migrations';

export type { DefineFieldOptions, DefineTableOptions, SurrealQLType } from './migrations';
