import { parseDefaultAlwaysDecorator, parseDefaultDecorator } from '../../types/field-decorators';
import type { DecoratorEntry } from '../types';

export const defaultDecorators: readonly DecoratorEntry[] = [
  {
    name: '@default',
    args: { kind: 'literal', forms: ['boolean', 'null', 'int', 'float', 'string', 'raw'] },
    targets: ['modelField', 'objectField', 'tupleElement'],
    excludes: ['@now', '@createdAt', '@updatedAt', '@defaultAlways', '@uuid', '@uuid4', '@uuid7'],
    description: 'Sets the value used when none is given on create. @default(null) needs @nullable.',
    parse: parseDefaultDecorator,
  },
  {
    name: '@defaultAlways',
    args: { kind: 'literal', forms: ['boolean', 'null', 'int', 'float', 'string', 'raw'] },
    targets: ['modelField', 'objectField', 'tupleElement'],
    excludes: ['@now', '@createdAt', '@updatedAt', '@default', '@readonly', '@uuid', '@uuid4', '@uuid7'],
    description: 'Like @default, but resets the field to the value on every write when none is given.',
    parse: parseDefaultAlwaysDecorator,
  },
];
