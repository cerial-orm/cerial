/**
 * Client generators barrel export
 */

export {
  generateClientClass,
  generateClientSetup,
  generateClientTemplate,
  generateConnectFunction,
  generateDisconnectFunction,
  generateImports,
  generateTypedDbInterface,
  generateUseConnectionFunction,
} from './template';

export {
  generateConnectionConfigInterface,
  generateConnectionExports,
  generateDbProxyInterface,
} from './connection-template';

export {
  formatCode,
  writeClient,
  writeClientIndex,
  writeClientMain,
  writeModelsIndex,
  writeModelTypes,
} from './writer';
