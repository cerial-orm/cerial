/**
 * Tuple type generators barrel export
 */

export {
  generateTupleInputInterface,
  generateTupleInterface,
  generateTupleInterfaces,
  generateTupleOutputType,
  tupleHasNamedElements,
  tupleHasObjectElements,
  tupleHasObjectElementsDeep,
  tupleHasTupleElements,
} from './interface-generator';

export { generateTupleWhereInterface, generateTupleWhereTypes } from './where-generator';

export { generateTupleArrayForm, generateTupleUpdateType, generateAllTupleUpdateTypes } from './update-generator';

export { generateTupleSelectType, generateAllTupleSelectTypes } from './select-generator';
