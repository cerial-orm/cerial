/**
 * Validation utility functions
 */

import { RecordId, StringRecordId } from 'surrealdb';
import type { SchemaFieldType } from '../types/common.types';
import { CerialId } from './cerial-id';
import { isBoolean, isDate, isNumber, isString } from './type-utils';

/** Validate email format */
export function isValidEmail(value: string): boolean {
  // Simple email regex
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Check if value is a RecordIdInput type (CerialId, RecordId, StringRecordId, string) */
function isRecordIdInput(value: unknown): boolean {
  return CerialId.is(value) || value instanceof RecordId || value instanceof StringRecordId || isString(value);
}

/** Validate value matches schema field type */
export function validateFieldType(value: unknown, type: SchemaFieldType): boolean {
  switch (type) {
    case 'string':
    case 'email':
      return isString(value);
    case 'int':
      return isNumber(value) && Number.isInteger(value);
    case 'float':
      return isNumber(value);
    case 'bool':
      return isBoolean(value);
    case 'date':
      return isDate(value) || (isString(value) && !Number.isNaN(Date.parse(value)));
    case 'record':
      // Record type can be a string identifier, CerialId, RecordId, or StringRecordId
      return isRecordIdInput(value);
    case 'object':
      // Object type: must be a plain object (not array, not null)
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'tuple':
      // Tuple type: array form [1, 2] or object form { lat: 1, lng: 2 }
      return Array.isArray(value) || (typeof value === 'object' && value !== null);
    case 'literal':
      // Literal values can be strings, numbers, booleans, arrays (tuple variant), or objects (object variant)
      // Specific variant validation is handled by the type system at compile time
      return value !== undefined && value !== null;
    default:
      return false;
  }
}

/** Validate model name (PascalCase) */
export function isValidModelName(name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

/** Validate object name (PascalCase, same rules as model names) */
export function isValidObjectName(name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

/** Validate field name (camelCase or snake_case) */
export function isValidFieldName(name: string): boolean {
  return /^[a-z_][a-zA-Z0-9_]*$/.test(name);
}

/** Validate operator is a known comparison operator */
export function isComparisonOperator(op: string): boolean {
  return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(op);
}

/** Validate operator is a known string operator */
export function isStringOperator(op: string): boolean {
  return ['contains', 'startsWith', 'endsWith'].includes(op);
}

/** Validate operator is a known array operator */
export function isArrayOperator(op: string): boolean {
  return ['in', 'notIn'].includes(op);
}

/** Validate operator is a known special operator */
export function isSpecialOperator(op: string): boolean {
  return ['isNull', 'isDefined', 'between'].includes(op);
}

/** Validate operator is a known logical operator */
export function isLogicalOperator(op: string): boolean {
  return ['AND', 'OR', 'NOT'].includes(op);
}

/** Validate a value is not empty */
export function isNotEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

/** Validation result type */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Create a successful validation result */
export function validResult(): ValidationResult {
  return { valid: true, errors: [] };
}

/** Create a failed validation result */
export function invalidResult(errors: string | string[]): ValidationResult {
  return {
    valid: false,
    errors: Array.isArray(errors) ? errors : [errors],
  };
}
