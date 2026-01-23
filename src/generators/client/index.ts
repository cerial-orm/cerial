/**
 * Client generators barrel export
 */

export {
  generateImports,
  generateClientSetup,
  generateConnectFunction,
  generateDisconnectFunction,
  generateUseConnectionFunction,
  generateClientTemplate,
} from './template';

export {
  generateConnectionConfigInterface,
  generateDbProxyInterface,
  generateConnectionExports,
} from './connection-template';

export {
  writeClientMain,
  writeModelTypes,
  writeModelsIndex,
  writeClientIndex,
  writeClient,
} from './writer';
