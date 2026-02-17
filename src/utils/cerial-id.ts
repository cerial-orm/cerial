/**
 * CerialId - A wrapper class for SurrealDB record IDs
 *
 * Provides a consistent interface for working with record IDs that:
 * - Accepts multiple input formats (CerialId, RecordId, StringRecordId, string, number, array, object, bigint)
 * - Preserves native typed ID values (no string coercion)
 * - Normalizes string values internally (unescaped table and id)
 * - Outputs properly escaped format via toString()
 * - Validates table names when paired with Relations
 */

import { RecordId, StringRecordId } from 'surrealdb';
import type { RecordIdValue } from 'surrealdb';

/**
 * Union type for all acceptable record ID input formats (generic)
 */
export type RecordIdInput<T extends RecordIdValue = RecordIdValue> =
  | T
  | CerialId<T>
  | RecordId<string, T>
  | StringRecordId;

/**
 * Check if a value is a StringRecordId instance
 */
function isStringRecordId(value: unknown): value is StringRecordId {
  return value instanceof StringRecordId;
}

/**
 * Check if a value is a RecordId instance
 */
function isRecordId(value: unknown): value is RecordId {
  return value instanceof RecordId;
}

/**
 * Check if a value is a valid RecordIdInput type.
 * Matches: CerialId, RecordId, StringRecordId, or string
 */
export function isRecordIdInput(value: unknown): value is RecordIdInput {
  return (
    CerialId.is(value) || value instanceof RecordId || value instanceof StringRecordId || typeof value === 'string'
  );
}

/**
 * Parse a record string into table and id components
 * Handles various formats:
 * - 'table:id' (simple)
 * - '⟨table⟩:id' (angle bracket escaped table)
 * - 'table:⟨id⟩' (angle bracket escaped id)
 * - '⟨table⟩:⟨id⟩' (both escaped)
 * - '`table`:id' (backtick escaped - user input)
 * - 'id' (no table, just id)
 *
 * TODO: Replace with RecordId.parse() when available in surrealdb SDK
 */
function parseRecordString(str: string): { table: string | undefined; id: string } {
  // Handle backtick escaping: `table`:id (user might type this)
  const backtickTableMatch = str.match(/^`([^`]*)`:(.*)/);
  if (backtickTableMatch && backtickTableMatch[1] !== undefined && backtickTableMatch[2] !== undefined) {
    let id = backtickTableMatch[2];
    // Check if id is also backtick escaped
    const backtickIdMatch = id.match(/^`([^`]*)`$/);
    if (backtickIdMatch && backtickIdMatch[1] !== undefined) id = backtickIdMatch[1];
    // Check if id is angle bracket escaped
    const angleIdMatch = id.match(/^⟨([^⟩]*)⟩$/);
    if (angleIdMatch && angleIdMatch[1] !== undefined) id = angleIdMatch[1];

    return { table: backtickTableMatch[1], id };
  }

  // Handle angle bracket escaping: ⟨table⟩:id (from SurrealDB output)
  const angleTableMatch = str.match(/^⟨([^⟩]*)⟩:(.*)/);
  if (angleTableMatch && angleTableMatch[1] !== undefined && angleTableMatch[2] !== undefined) {
    let id = angleTableMatch[2];
    // Check if id is also angle bracket escaped
    const idMatch = id.match(/^⟨([^⟩]*)⟩$/);
    if (idMatch && idMatch[1] !== undefined) id = idMatch[1];

    return { table: angleTableMatch[1], id };
  }

  // Handle table:⟨id⟩ format (only id escaped)
  const angleIdOnlyMatch = str.match(/^([^:⟨`]+):⟨([^⟩]*)⟩$/);
  if (angleIdOnlyMatch && angleIdOnlyMatch[1] !== undefined && angleIdOnlyMatch[2] !== undefined) {
    return { table: angleIdOnlyMatch[1], id: angleIdOnlyMatch[2] };
  }

  // Simple table:id format - split on first colon only
  // This handles IDs with colons like 'user:id:with:colons'
  const colonIdx = str.indexOf(':');
  if (colonIdx > 0) {
    return { table: str.slice(0, colonIdx), id: str.slice(colonIdx + 1) };
  }

  // No colon - just an ID, table is undefined
  return { table: undefined, id: str };
}

/**
 * Deep clone a RecordIdValue. Primitives and class instances (Uuid) are returned as-is.
 * Arrays and plain objects are deep-cloned via structuredClone.
 */
function cloneIdValue<V extends RecordIdValue>(value: V): V {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return value;
  }
  if (Array.isArray(value)) {
    return structuredClone(value) as V;
  }
  if (typeof value === 'object' && value !== null) {
    // Plain objects get deep-cloned; class instances (Uuid, etc.) are immutable — return as-is
    if (Object.getPrototypeOf(value) === Object.prototype) {
      return structuredClone(value) as V;
    }

    return value;
  }

  return value;
}

/**
 * CerialId class for handling SurrealDB record IDs
 * Generic over the ID value type for type-safe typed IDs
 */
export class CerialId<T extends RecordIdValue = RecordIdValue> {
  /** The table name (unescaped). May be undefined for ID-only values. */
  public table: string | undefined;

  /** The ID value (preserves native type: string, number, array, object, bigint, Uuid). */
  public id: T;

  /**
   * Create a new CerialId
   * @param input - CerialId, RecordId, StringRecordId, string, number, bigint, array, or object
   * @param tableOverride - Optional table name to set/override
   */
  // Overloads: string inputs widen to CerialId<string> (parsing changes the value),
  // typed inputs preserve their exact type via generic inference
  constructor(input: string, tableOverride?: string);
  constructor(input: StringRecordId, tableOverride?: string);
  constructor(input: CerialId<T>, tableOverride?: string);
  constructor(input: RecordId<string, T>, tableOverride?: string);
  constructor(input: T, tableOverride?: string);
  constructor(input: RecordIdInput<T>, tableOverride?: string);
  constructor(input: RecordIdInput<T>, tableOverride?: string) {
    if (input instanceof CerialId) {
      // Clone from another CerialId
      this.table = input.table;
      this.id = input.id as T;
    } else if (isRecordId(input)) {
      // Extract from RecordId — preserve native typed ID (NO .toString())
      this.table = input.table.name;
      this.id = input.id as T;
    } else if (isStringRecordId(input)) {
      // Parse StringRecordId's string representation
      const parsed = parseRecordString(input.toString());
      this.table = parsed.table;
      this.id = parsed.id as T;
    } else if (typeof input === 'string') {
      // Parse string
      const parsed = parseRecordString(input);
      this.table = parsed.table;
      this.id = parsed.id as T;
    } else if (typeof input === 'number' || typeof input === 'bigint') {
      // Store numeric types directly — no table
      this.table = undefined;
      this.id = input as T;
    } else if (Array.isArray(input)) {
      // Store array IDs directly — no table
      this.table = undefined;
      this.id = input as T;
    } else if (typeof input === 'object' && input !== null) {
      // Store object IDs (including Uuid) directly — no table
      this.table = undefined;
      this.id = input as T;
    } else {
      throw new Error(`Invalid input type for CerialId: ${typeof input}`);
    }

    // Apply table override if provided
    if (tableOverride !== undefined) {
      this.table = tableOverride;
    }

    // Normalize via RecordId if we have both table and a STRING id
    // Typed IDs (number, array, object) don't need normalization
    if (this.table !== undefined && typeof this.id === 'string') {
      const recordId = new RecordId(this.table, this.id);
      this.table = recordId.table.name;
      this.id = recordId.id as T;
    }
  }

  /**
   * Check if a value is a CerialId instance
   */
  static is(value: unknown): value is CerialId {
    return value instanceof CerialId;
  }

  static from(value: string, table?: string): CerialId<string>;
  static from(value: StringRecordId, table?: string): CerialId<string>;
  static from<U extends RecordIdValue = RecordIdValue>(value: RecordIdInput<U>, table?: string): CerialId<U>;
  static from<U extends RecordIdValue = RecordIdValue>(value: RecordIdInput<U>, table?: string): CerialId<U> {
    return new CerialId<U>(value, table);
  }

  /**
   * Create a CerialId from a string
   * @param str - String in 'table:id' or 'id' format
   */
  static fromString(str: string): CerialId<string> {
    return new CerialId<string>(str);
  }

  /**
   * Create a CerialId from a RecordId (generic — preserves typed ID)
   * @param recordId - SurrealDB RecordId instance
   */
  static fromRecordId<U extends RecordIdValue>(recordId: RecordId<string, U>): CerialId<U> {
    return new CerialId<U>(recordId);
  }

  /**
   * Parse a value into a CerialId with optional table validation
   * @param value - Any supported input type
   * @param expectedTable - Expected table name (throws if mismatch, sets if missing)
   */
  static parse(value: RecordIdInput, expectedTable?: string): CerialId {
    const cerialId = new CerialId(value);

    if (expectedTable !== undefined) {
      if (cerialId.hasTable && cerialId.table !== expectedTable) {
        throw new Error(`Table "${cerialId.table}" does not match expected table "${expectedTable}"`);
      }
      if (!cerialId.hasTable) {
        cerialId.table = expectedTable;
        // Re-normalize with the new table (only for string IDs)
        if (typeof cerialId.id === 'string') {
          const recordId = new RecordId(expectedTable, cerialId.id);
          cerialId.table = recordId.table.name;
          cerialId.id = recordId.id;
        }
      }
    }

    return cerialId;
  }

  /**
   * Check if this CerialId has a table set
   */
  get hasTable(): boolean {
    return this.table !== undefined;
  }

  /**
   * Check if this CerialId is complete (has both table and id)
   */
  get isComplete(): boolean {
    return this.table !== undefined && this.id !== undefined && this.id !== '';
  }

  /**
   * Convert to string representation
   * Uses RecordId.toString() for proper escaping of special characters
   * @returns 'table:id' format (escaped) or string representation of id if no table
   */
  toString(): string {
    if (!this.hasTable) {
      if (typeof this.id === 'string') return this.id;

      return String(this.id);
    }

    return new RecordId(this.table!, this.id).toString();
  }

  /**
   * Custom JSON serialization
   * @returns Same as toString()
   */
  toJSON(): string {
    return this.toString();
  }

  /**
   * Primitive value for comparisons
   * @returns Same as toString()
   */
  valueOf(): string {
    return this.toString();
  }

  /**
   * Compare with another record ID value
   * @param other - Any value; returns false for non-recognizable types
   * @returns true if both represent the same record
   */
  equals(other: unknown): boolean {
    if (!this.hasTable) return false;

    const thisRecordId = this.toRecordId();

    let otherRecordId: RecordId;

    if (other instanceof CerialId) {
      if (!other.hasTable) return false;
      otherRecordId = other.toRecordId();
    } else if (isRecordId(other)) {
      otherRecordId = other;
    } else if (isStringRecordId(other)) {
      const parsed = parseRecordString(other.toString());
      if (!parsed.table) return false;
      otherRecordId = new RecordId(parsed.table, parsed.id);
    } else if (typeof other === 'string') {
      const parsed = parseRecordString(other);
      if (!parsed.table) return false;
      otherRecordId = new RecordId(parsed.table, parsed.id);
    } else {
      // Non-recognizable type — return false
      return false;
    }

    return thisRecordId.equals(otherRecordId);
  }

  /**
   * Create a deep copy of this CerialId
   */
  clone(): CerialId<T> {
    const cloned = Object.create(CerialId.prototype) as CerialId<T>;
    cloned.table = this.table;
    cloned.id = cloneIdValue(this.id) as T;

    return cloned;
  }

  /**
   * Create a new CerialId with a different table
   * @param newTable - The new table name
   */
  withTable(newTable: string): CerialId<T> {
    const cloned = this.clone();
    cloned.table = newTable;
    // Re-normalize table name only for string IDs
    if (typeof cloned.id === 'string') {
      const recordId = new RecordId(newTable, cloned.id);
      cloned.table = recordId.table.name;
      cloned.id = recordId.id as T;
    }

    return cloned;
  }

  /**
   * Create a new CerialId with a different id
   * @param newId - The new id value
   */
  withId<U extends RecordIdValue>(newId: U): CerialId<U> {
    const result = Object.create(CerialId.prototype) as CerialId<U>;
    result.table = this.table;
    result.id = newId;
    // Re-normalize if we have a table and string id
    if (result.table && typeof newId === 'string') {
      const recordId = new RecordId(result.table, newId);
      result.table = recordId.table.name;
      result.id = recordId.id as U;
    }

    return result;
  }

  /**
   * Convert to a SurrealDB RecordId
   * Passes native id directly for lossless round-trip
   * @throws Error if table is undefined
   */
  toRecordId(): RecordId<string, T> {
    if (!this.hasTable) {
      throw new Error('Cannot create RecordId: table is undefined');
    }

    return new RecordId(this.table!, this.id) as RecordId<string, T>;
  }
}

/**
 * Standalone type guard function for CerialId
 * @param value - Any value to check
 * @returns true if value is a CerialId instance
 */
export function isCerialId(value: unknown): value is CerialId {
  return CerialId.is(value);
}
