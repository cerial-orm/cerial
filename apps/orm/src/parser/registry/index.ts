export type {
  ArgumentShape,
  DecoratorEntry,
  DecoratorHandler,
  DecoratorName,
  DecoratorTarget,
  FieldTypeEntry,
  LiteralForm,
} from './types';

export type { RegisteredDecorator } from './decorator-registry';
export { DECORATOR_REGISTRY, getDecoratorEntry, matchDecoratorToken } from './decorator-registry';
export { FIELD_TYPE_REGISTRY, matchFieldTypeToken } from './field-type-registry';
