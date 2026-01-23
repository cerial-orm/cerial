/**
 * Generators module barrel export
 */

// Types generators
export {
  generateFieldType,
  generateFieldDefinition,
  generateInterface,
  generateInterfaces,
  generateFieldWhereType,
  generateWhereInterface,
  generateWhereInputInterface,
  generateWhereTypes,
  generateCreateType,
  generateUpdateType,
  generateSelectType,
  generateOrderByType,
  generateDerivedTypes,
  generateAllDerivedTypes,
  generateMethodSignatures,
  generateModelInterface,
  generateModelTypes,
  generateDbClientInterface,
  generateModelExports,
  generateModelsIndex,
  generateInternalIndex,
  generateClientIndex,
} from './types';

// Metadata generators
export {
  convertField,
  convertFields,
  convertModel,
  convertModels,
  generateRegistryCode,
  createRegistry,
  writeModelRegistry,
  writeInternalIndex,
} from './metadata';

// Client generators
export {
  generateImports,
  generateClientSetup,
  generateConnectFunction,
  generateDisconnectFunction,
  generateUseConnectionFunction,
  generateClientTemplate,
  generateConnectionConfigInterface,
  generateDbProxyInterface,
  generateConnectionExports,
  writeClientMain,
  writeModelTypes,
  writeModelsIndex,
  writeClientIndex as writeClientIndexFile,
  writeClient,
} from './client';
