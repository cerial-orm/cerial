/**
 * CerialId - A wrapper class for SurrealDB record IDs
 *
 * Provides a consistent interface for working with record IDs that:
 * - Accepts multiple input formats (CerialId, RecordId, StringRecordId, string)
 * - Normalizes values internally (unescaped table and id)
 * - Outputs properly escaped format via toString()
 * - Validates table names when paired with Relations
 */

import { RecordId, StringRecordId } from 'surrealdb';

/**
 * Union type for all acceptable record ID input formats
 */
export type RecordIdInput = CerialId | RecordId | StringRecordId | string;

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
 * Parse a record string into table and id components
 * Handles various formats:
 * - 'table:id' (simple)
 * - '⟨table⟩:id' (angle bracket escaped table)
 * - 'table:⟨id⟩' (angle bracket escaped id)
 * - '⟨table⟩:⟨id⟩' (both escaped)
 * - '`table`:id' (backtick escaped - user input)
 * - 'id' (no table, just id)
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
 * CerialId class for handling SurrealDB record IDs
 */
export class CerialId {
  /** The table name (unescaped). May be undefined for ID-only values. */
  public table: string | undefined;

  /** The ID value (unescaped, always string). */
  public id: string;

  /**
   * Create a new CerialId
   * @param input - CerialId, RecordId, StringRecordId, or string
   * @param tableOverride - Optional table name to set/override
   */
  constructor(input: RecordIdInput, tableOverride?: string) {
    if (input instanceof CerialId) {
      // Clone from another CerialId
      this.table = input.table;
      this.id = input.id;
    } else if (isRecordId(input)) {
      // Extract from RecordId (already normalized)
      this.table = input.table.name;
      this.id = input.id.toString();
    } else if (isStringRecordId(input)) {
      // Parse StringRecordId's string representation
      const parsed = parseRecordString(input.toString());
      this.table = parsed.table;
      this.id = parsed.id;
    } else if (typeof input === 'string') {
      // Parse string
      const parsed = parseRecordString(input);
      this.table = parsed.table;
      this.id = parsed.id;
    } else {
      throw new Error(`Invalid input type for CerialId: ${typeof input}`);
    }

    // Apply table override if provided
    if (tableOverride !== undefined) {
      this.table = tableOverride;
    }

    // Normalize via RecordId if we have both table and id
    // This ensures consistent internal representation
    if (this.table !== undefined && this.id !== undefined) {
      const recordId = new RecordId(this.table, this.id);
      this.table = recordId.table.name;
      this.id = recordId.id.toString();
    }
  }

  /**
   * Check if a value is a CerialId instance
   */
  static is(value: unknown): value is CerialId {
    return value instanceof CerialId;
  }

  /**
   * Create a CerialId from any supported input type
   * @param value - CerialId, RecordId, StringRecordId, or string
   * @param table - Optional table name to set/override
   */
  static from(value: RecordIdInput, table?: string): CerialId {
    return new CerialId(value, table);
  }

  /**
   * Create a CerialId from a string
   * @param str - String in 'table:id' or 'id' format
   */
  static fromString(str: string): CerialId {
    return new CerialId(str);
  }

  /**
   * Create a CerialId from a RecordId
   * @param recordId - SurrealDB RecordId instance
   */
  static fromRecordId(recordId: RecordId): CerialId {
    return new CerialId(recordId);
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
        // Re-normalize with the new table
        const recordId = new RecordId(expectedTable, cerialId.id);
        cerialId.table = recordId.table.name;
        cerialId.id = recordId.id.toString();
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
   * @returns 'table:id' format (escaped) or just 'id' if no table
   */
  toString(): string {
    if (!this.hasTable) return this.id;

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
   * Enables: cerialId == 'user:abc' (returns true)
   * Note: cerialId1 == cerialId2 still returns false for different instances
   * @returns Same as toString()
   */
  valueOf(): string {
    return this.toString();
  }

  /**
   * Compare with another record ID value
   * @param other - CerialId, RecordId, StringRecordId, or string
   * @returns true if both represent the same record
   */
  equals(other: RecordIdInput): boolean {
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
    } else {
      // String
      const parsed = parseRecordString(other);
      if (!parsed.table) return false;
      otherRecordId = new RecordId(parsed.table, parsed.id);
    }

    return thisRecordId.equals(otherRecordId);
  }

  /**
   * Create a copy of this CerialId
   */
  clone(): CerialId {
    return new CerialId(this);
  }

  /**
   * Create a new CerialId with a different table
   * @param newTable - The new table name
   */
  withTable(newTable: string): CerialId {
    const cloned = this.clone();
    cloned.table = newTable;
    // Re-normalize
    const recordId = new RecordId(newTable, cloned.id);
    cloned.table = recordId.table.name;
    cloned.id = recordId.id.toString();

    return cloned;
  }

  /**
   * Create a new CerialId with a different id
   * @param newId - The new id value
   */
  withId(newId: string): CerialId {
    const cloned = this.clone();
    cloned.id = newId;
    // Re-normalize if we have a table
    if (cloned.table) {
      const recordId = new RecordId(cloned.table, newId);
      cloned.table = recordId.table.name;
      cloned.id = recordId.id.toString();
    }

    return cloned;
  }

  /**
   * Convert to a SurrealDB RecordId
   * @throws Error if table is undefined
   */
  toRecordId(): RecordId {
    if (!this.hasTable) {
      throw new Error('Cannot create RecordId: table is undefined');
    }

    return new RecordId(this.table!, this.id);
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
