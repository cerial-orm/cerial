import {
  parseFieldDecorator,
  parseKeyDecorator,
  parseModelDecorator,
  parseOnDeleteDecorator,
} from '../../types/field-decorators';
import type { DecoratorEntry } from '../types';

export const relationDecorators: readonly DecoratorEntry[] = [
  {
    name: '@field',
    constructId: 'decorator.field',
    args: { kind: 'name' },
    targets: ['modelField'],
    excludes: [],
    description: 'On a Relation field, names the Record field in this model that stores the foreign key.',
    parse: parseFieldDecorator,
  },
  {
    name: '@model',
    constructId: 'decorator.model',
    args: { kind: 'name' },
    targets: ['modelField'],
    excludes: [],
    description: 'On a Relation field, names the model the relation points to.',
    parse: parseModelDecorator,
  },
  {
    name: '@onDelete',
    constructId: 'decorator.onDelete',
    args: { kind: 'choice', choices: ['Cascade', 'SetNull', 'SetNone', 'Restrict', 'NoAction'], optional: false },
    targets: ['modelField'],
    excludes: [],
    description:
      'Sets what happens to this record when the related record is deleted. Only on optional or nullable forward relations.',
    parse: parseOnDeleteDecorator,
  },
  {
    name: '@key',
    constructId: 'decorator.key',
    args: { kind: 'name' },
    targets: ['modelField'],
    excludes: [],
    description: 'Names a relation so the two sides match when several relations connect the same pair of models.',
    parse: parseKeyDecorator,
  },
];
