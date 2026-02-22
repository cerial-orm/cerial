/**
 * Literal where type generator - generates Where types for literal definitions
 *
 * Generates filter types with type-aware operators based on the literal's
 * variant composition. String-only literals get string ops, number-only
 * get numeric ops, etc.
 */

import type { LiteralMetadata, ResolvedLiteralVariant } from '../../../types';

/** Analysis result for a literal's variant composition */
export interface LiteralTypeAnalysis {
  hasStringValues: boolean;
  hasNumberValues: boolean;
  hasBoolValues: boolean;
  hasBroadString: boolean;
  hasBroadNumber: boolean;
  hasBroadBool: boolean;
  hasBroadDate: boolean;
  hasTupleRefs: boolean;
  hasObjectRefs: boolean;
  isMixed: boolean;
}

/** Analyze the variant composition of a literal */
export function analyzeLiteralTypes(variants: ResolvedLiteralVariant[]): LiteralTypeAnalysis {
  const hasStringValues = variants.some((v) => v.kind === 'string');
  const hasNumberValues = variants.some((v) => v.kind === 'int' || v.kind === 'float');
  const hasBoolValues = variants.some((v) => v.kind === 'bool');
  const hasBroadString = variants.some((v) => v.kind === 'broadType' && v.typeName === 'String');
  const hasBroadNumber = variants.some(
    (v) => v.kind === 'broadType' && (v.typeName === 'Int' || v.typeName === 'Float'),
  );
  const hasBroadBool = variants.some((v) => v.kind === 'broadType' && v.typeName === 'Bool');
  const hasBroadDate = variants.some((v) => v.kind === 'broadType' && v.typeName === 'Date');
  const hasTupleRefs = variants.some((v) => v.kind === 'tupleRef');
  const hasObjectRefs = variants.some((v) => v.kind === 'objectRef');

  // Count distinct categories
  const categories = [
    hasStringValues || hasBroadString,
    hasNumberValues || hasBroadNumber || hasBroadDate,
    hasBoolValues || hasBroadBool,
    hasTupleRefs,
    hasObjectRefs,
  ].filter(Boolean).length;

  return {
    hasStringValues,
    hasNumberValues,
    hasBoolValues,
    hasBroadString,
    hasBroadNumber,
    hasBroadBool,
    hasBroadDate,
    hasTupleRefs,
    hasObjectRefs,
    isMixed: categories > 1,
  };
}

/** Generate Where interface for a literal definition */
export function generateLiteralWhereInterface(literal: LiteralMetadata): string {
  const analysis = analyzeLiteralTypes(literal.variants);
  const name = literal.name;
  const fields: string[] = [];

  // Always include eq/neq
  fields.push(`  eq?: ${name};`);
  fields.push(`  neq?: ${name};`);

  // in/notIn — always available
  fields.push(`  in?: ${name}[];`);
  fields.push(`  notIn?: ${name}[];`);

  // Numeric comparison ops: only when ALL value variants are numeric (or broad numeric/date)
  const isNumericOnly =
    !analysis.hasStringValues &&
    !analysis.hasBoolValues &&
    !analysis.hasBroadString &&
    !analysis.hasBroadBool &&
    !analysis.hasTupleRefs &&
    !analysis.hasObjectRefs &&
    (analysis.hasNumberValues || analysis.hasBroadNumber || analysis.hasBroadDate);

  if (isNumericOnly) {
    const numType = analysis.hasBroadDate ? 'Date' : 'number';
    fields.push(`  gt?: ${numType};`);
    fields.push(`  gte?: ${numType};`);
    fields.push(`  lt?: ${numType};`);
    fields.push(`  lte?: ${numType};`);
    fields.push(`  between?: [${numType}, ${numType}];`);
  }

  // String ops: only when broad String is present
  if (analysis.hasBroadString) {
    fields.push(`  contains?: string;`);
    fields.push(`  startsWith?: string;`);
    fields.push(`  endsWith?: string;`);
  }

  return `export interface ${name}Where {
${fields.join('\n')}
}`;
}

/** Generate Where types for all literals */
export function generateAllLiteralWhereTypes(literals: LiteralMetadata[]): string {
  if (!literals.length) return '';

  return literals.map(generateLiteralWhereInterface).join('\n\n');
}
