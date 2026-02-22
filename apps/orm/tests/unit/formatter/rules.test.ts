/**
 * Tests for decorator ordering and config resolution
 */

import { describe, expect, it } from 'bun:test';
import { DECORATOR_ORDER, resolveConfig, sortDecorators } from '../../../src/formatter/rules';
import { FORMAT_DEFAULTS } from '../../../src/formatter/types';
import type { SchemaDecorator } from '../../../src/types/common.types';
import type { ASTDecorator } from '../../../src/types/parser.types';

// Helper to create a decorator for testing
function createDecorator(type: SchemaDecorator, value?: unknown): ASTDecorator {
  return {
    type,
    value,
    range: {
      start: { line: 1, column: 0, offset: 0 },
      end: { line: 1, column: 10, offset: 10 },
    },
  };
}

describe('DECORATOR_ORDER', () => {
  it('should define all 28 decorators with unique positions', () => {
    const decorators: SchemaDecorator[] = [
      'id',
      'unique',
      'index',
      'now',
      'createdAt',
      'updatedAt',
      'default',
      'field',
      'model',
      'onDelete',
      'key',
      'distinct',
      'sort',
      'set',
      'defaultAlways',
      'flexible',
      'readonly',
      'nullable',
      'uuid',
      'uuid4',
      'uuid7',
      'point',
      'line',
      'polygon',
      'multipoint',
      'multiline',
      'multipolygon',
      'geoCollection',
    ];

    // All decorators should have a defined position
    decorators.forEach((decorator) => {
      const position = DECORATOR_ORDER[decorator];
      expect(position).toBeDefined();
      expect(typeof position).toBe('number');
    });

    // Should have exactly 28 entries
    expect(Object.keys(DECORATOR_ORDER).length).toBe(28);

    // All positions should be unique
    const positions = Object.values(DECORATOR_ORDER);
    const uniquePositions = new Set(positions);
    expect(uniquePositions.size).toBe(28);
  });

  it('should have id at position 0', () => {
    expect(DECORATOR_ORDER.id).toBe(0);
  });

  it('should have nullable at position 27 (last)', () => {
    expect(DECORATOR_ORDER.nullable).toBe(27);
  });

  it('should order constraints before relations', () => {
    expect(DECORATOR_ORDER.unique!).toBeLessThan(DECORATOR_ORDER.field!);
    expect(DECORATOR_ORDER.index!).toBeLessThan(DECORATOR_ORDER.field!);
  });

  it('should order relations before value generation', () => {
    expect(DECORATOR_ORDER.field!).toBeLessThan(DECORATOR_ORDER.default!);
    expect(DECORATOR_ORDER.model!).toBeLessThan(DECORATOR_ORDER.default!);
  });

  it('should order value generation before UUID generation', () => {
    expect(DECORATOR_ORDER.default!).toBeLessThan(DECORATOR_ORDER.uuid!);
    expect(DECORATOR_ORDER.createdAt!).toBeLessThan(DECORATOR_ORDER.uuid!);
  });

  it('should order UUID generation before readonly', () => {
    expect(DECORATOR_ORDER.uuid!).toBeLessThan(DECORATOR_ORDER.readonly!);
    expect(DECORATOR_ORDER.uuid7!).toBeLessThan(DECORATOR_ORDER.readonly!);
  });

  it('should order readonly before flexible', () => {
    expect(DECORATOR_ORDER.readonly!).toBeLessThan(DECORATOR_ORDER.flexible!);
  });

  it('should order flexible before array modifiers', () => {
    expect(DECORATOR_ORDER.flexible!).toBeLessThan(DECORATOR_ORDER.distinct!);
    expect(DECORATOR_ORDER.flexible!).toBeLessThan(DECORATOR_ORDER.sort!);
    expect(DECORATOR_ORDER.flexible!).toBeLessThan(DECORATOR_ORDER.set!);
  });

  it('should order array modifiers before geometry', () => {
    expect(DECORATOR_ORDER.set!).toBeLessThan(DECORATOR_ORDER.point!);
    expect(DECORATOR_ORDER.distinct!).toBeLessThan(DECORATOR_ORDER.point!);
  });

  it('should order geometry before nullable', () => {
    expect(DECORATOR_ORDER.point!).toBeLessThan(DECORATOR_ORDER.nullable!);
    expect(DECORATOR_ORDER.geoCollection!).toBeLessThan(DECORATOR_ORDER.nullable!);
  });
});

describe('sortDecorators', () => {
  it('should return empty array for empty input', () => {
    const result = sortDecorators([]);
    expect(result).toEqual([]);
  });

  it('should return single decorator unchanged', () => {
    const decorator = createDecorator('id');
    const result = sortDecorators([decorator]);
    expect(result).toEqual([decorator]);
  });

  it('should sort already-sorted decorators (stable)', () => {
    const decorators = [
      createDecorator('id'),
      createDecorator('unique'),
      createDecorator('default'),
      createDecorator('nullable'),
    ];
    const result = sortDecorators(decorators);
    expect(result).toEqual(decorators);
  });

  it('should sort @default before @unique', () => {
    const decorators = [createDecorator('default', 'x'), createDecorator('unique')];
    const result = sortDecorators(decorators);
    expect(result[0]!.type).toBe('unique');
    expect(result[1]!.type).toBe('default');
  });

  it('should sort @nullable to the end', () => {
    const decorators = [createDecorator('nullable'), createDecorator('id'), createDecorator('default')];
    const result = sortDecorators(decorators);
    expect(result[result.length - 1]!.type).toBe('nullable');
  });

  it('should sort complex decorator list correctly', () => {
    const decorators = [
      createDecorator('nullable'),
      createDecorator('default', 'value'),
      createDecorator('unique'),
      createDecorator('id'),
    ];
    const result = sortDecorators(decorators);
    expect(result.map((d) => d.type)).toEqual(['id', 'unique', 'default', 'nullable']);
  });

  it('should preserve decorator values during sort', () => {
    const defaultDecorator = createDecorator('default', 'myValue');
    const decorators = [createDecorator('nullable'), defaultDecorator, createDecorator('unique')];
    const result = sortDecorators(decorators);
    const sortedDefault = result.find((d) => d.type === 'default');
    expect(sortedDefault!.value).toBe('myValue');
  });

  it('should preserve decorator ranges during sort', () => {
    const range = {
      start: { line: 5, column: 10, offset: 50 },
      end: { line: 5, column: 20, offset: 60 },
    };
    const decorator = { type: 'default' as const, value: 'x', range };
    const decorators = [createDecorator('nullable'), decorator, createDecorator('unique')];
    const result = sortDecorators(decorators);
    const sortedDefault = result.find((d) => d.type === 'default');
    expect(sortedDefault!.range).toEqual(range);
  });

  it('should sort relation decorators in correct order', () => {
    const decorators = [
      createDecorator('onDelete', 'Cascade'),
      createDecorator('model', 'User'),
      createDecorator('field', 'userId'),
    ];
    const result = sortDecorators(decorators);
    const types = result.map((d) => d.type);
    expect(types[0]!).toBe('field');
    expect(types[1]!).toBe('model');
    expect(types[2]!).toBe('onDelete');
  });

  it('should sort array modifiers in correct order', () => {
    const decorators = [
      createDecorator('set'),
      createDecorator('nullable'),
      createDecorator('distinct'),
      createDecorator('sort'),
    ];
    const result = sortDecorators(decorators);
    const types = result.map((d) => d.type);
    expect(types[0]!).toBe('distinct');
    expect(types[1]!).toBe('sort');
    expect(types[2]!).toBe('set');
    expect(types[3]!).toBe('nullable');
  });

  it('should sort geometry decorators before nullable', () => {
    const decorators = [
      createDecorator('nullable'),
      createDecorator('point'),
      createDecorator('polygon'),
      createDecorator('line'),
    ];
    const result = sortDecorators(decorators);
    const nullableIndex = result.findIndex((d) => d.type === 'nullable');
    const geometryIndices = result
      .map((d, i) => (d.type === 'point' || d.type === 'polygon' || d.type === 'line' ? i : -1))
      .filter((i) => i !== -1);
    geometryIndices.forEach((i) => {
      expect(i).toBeLessThan(nullableIndex!);
    });
  });

  it('should sort UUID decorators in correct order', () => {
    const decorators = [createDecorator('uuid7'), createDecorator('uuid4'), createDecorator('uuid')];
    const result = sortDecorators(decorators);
    const types = result.map((d) => d.type);
    expect(types[0]!).toBe('uuid');
    expect(types[1]!).toBe('uuid4');
    expect(types[2]!).toBe('uuid7');
  });

  it('should not mutate original array', () => {
    const decorators = [createDecorator('nullable'), createDecorator('id')];
    const original = [...decorators];
    sortDecorators(decorators);
    expect(decorators).toEqual(original);
  });

  it('should sort value generation decorators in correct order', () => {
    const decorators = [
      createDecorator('now'),
      createDecorator('updatedAt'),
      createDecorator('createdAt'),
      createDecorator('defaultAlways', 'x'),
      createDecorator('default', 'y'),
    ];
    const result = sortDecorators(decorators);
    const types = result.map((d) => d.type);
    expect(types[0]!).toBe('default');
    expect(types[1]!).toBe('defaultAlways');
    expect(types[2]!).toBe('createdAt');
    expect(types[3]!).toBe('updatedAt');
    expect(types[4]!).toBe('now');
  });
});

describe('resolveConfig', () => {
  it('should return FORMAT_DEFAULTS when user config is undefined', () => {
    const result = resolveConfig(undefined);
    expect(result).toEqual(FORMAT_DEFAULTS);
  });

  it('should return FORMAT_DEFAULTS when user config is empty object', () => {
    const result = resolveConfig({});
    expect(result).toEqual(FORMAT_DEFAULTS);
  });

  it('should override single property', () => {
    const result = resolveConfig({ indentSize: 4 });
    expect(result.indentSize).toBe(4);
    expect(result.alignmentScope).toBe(FORMAT_DEFAULTS.alignmentScope);
    expect(result.blockSeparation).toBe(FORMAT_DEFAULTS.blockSeparation);
  });

  it('should override multiple properties', () => {
    const result = resolveConfig({
      indentSize: 4,
      alignmentScope: 'block',
      trailingComma: true,
    });
    expect(result.indentSize).toBe(4);
    expect(result.alignmentScope).toBe('block');
    expect(result.trailingComma).toBe(true);
    expect(result.blockSeparation).toBe(FORMAT_DEFAULTS.blockSeparation);
  });

  it('should handle all config properties', () => {
    const userConfig = {
      alignmentScope: 'block' as const,
      fieldGroupBlankLines: 'collapse' as const,
      blockSeparation: 1 as const,
      indentSize: 4 as const,
      inlineConstructStyle: 'single' as const,
      decoratorAlignment: 'compact' as const,
      trailingComma: true,
      commentStyle: 'hash' as const,
      blankLineBeforeDirectives: 'honor' as const,
    };
    const result = resolveConfig(userConfig);
    expect(result).toEqual(userConfig);
  });

  it('should filter out undefined values', () => {
    const result = resolveConfig({
      indentSize: 4,
      alignmentScope: undefined,
    });
    expect(result.indentSize).toBe(4);
    expect(result.alignmentScope).toBe(FORMAT_DEFAULTS.alignmentScope);
  });

  it('should return Required<FormatConfig> type', () => {
    const result = resolveConfig({ indentSize: 2 });
    // All properties should be defined
    expect(result.alignmentScope).toBeDefined();
    expect(result.fieldGroupBlankLines).toBeDefined();
    expect(result.blockSeparation).toBeDefined();
    expect(result.indentSize).toBeDefined();
    expect(result.inlineConstructStyle).toBeDefined();
    expect(result.decoratorAlignment).toBeDefined();
    expect(result.trailingComma).toBeDefined();
    expect(result.commentStyle).toBeDefined();
    expect(result.blankLineBeforeDirectives).toBeDefined();
  });

  it('should not mutate user config', () => {
    const userConfig = { indentSize: 4 as const };
    const original = { ...userConfig };
    resolveConfig(userConfig);
    expect(userConfig).toEqual(original);
  });

  it('should handle boolean false values correctly', () => {
    const result = resolveConfig({ trailingComma: false });
    expect(result.trailingComma).toBe(false);
  });

  it('should handle blockSeparation as number', () => {
    const result = resolveConfig({ blockSeparation: 1 });
    expect(result.blockSeparation).toBe(1);
  });

  it('should handle blockSeparation as honor', () => {
    const result = resolveConfig({ blockSeparation: 'honor' });
    expect(result.blockSeparation).toBe('honor');
  });

  it('should handle indentSize as tab', () => {
    const result = resolveConfig({ indentSize: 'tab' });
    expect(result.indentSize).toBe('tab');
  });
});
