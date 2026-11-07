import { createHash } from 'node:crypto';
import { CerialMigrationError } from '../errors';
import { acceptsNone, canonicalType, splitTopLevel } from './canonical';
import type { SchemaDifference } from './diff';
import { quoteFieldPath, quoteIdent } from './quote';
import type { FieldModel } from './types';

/** A definition rewritten to carry a `MIGRATE EXISTING ROWS` clause, and whether it can overwrite a stored value. */
export interface MigrateStep {
  readonly statement: string;
  /** Rows whose value does not convert get the fallback, so a stored value can be lost. */
  readonly overwrites: boolean;
  readonly reason: string;
}

// A migration's USING and FALLBACK must be constants: a call (`time::now()`, `rand::uuid::v4()`) or a parameter is refused.
const NON_CONSTANT = /[A-Za-z_]\w*::|\$/;

const where = (d: SchemaDifference): string =>
  [quoteFieldPath(d.field ?? []), ' on table ', quoteIdent(d.table ?? '')].join('');

const members = (kind: string): string[] => splitTopLevel(canonicalType(kind), '|');

/** Whether every value the old type accepted is accepted by the new one, so the server needs no conversion step. */
export function widens(from: string, to: string): boolean {
  const next = new Set(members(to));
  if (next.has('any')) return true;

  return members(from).every((member) => next.has(member));
}

function constantDefault(d: SchemaDifference, field: FieldModel, what: string): string | undefined {
  if (field.default === undefined) return undefined;
  if (NON_CONSTANT.test(field.default)) {
    throw new CerialMigrationError(
      [
        `Cannot plan ${what} ${where(d)}: its default (${field.default}) is computed at write time, which a data migration cannot use. `,
        'Make the field optional, or migrate the stored rows by hand.',
      ].join(''),
    );
  }

  return field.default;
}

/** `MIGRATE` names are unique per table and one name may hold one definition, so the name is a hash of the step. */
function migrationName(d: SchemaDifference, clause: string): string {
  const hash = createHash('sha256')
    .update([d.table, JSON.stringify(d.field), clause].join('\n'))
    .digest('hex');

  return ['cerial_', hash.slice(0, 12)].join('');
}

/**
 * The cast of the stored value. `<string>` turns NONE and NULL into the text "NONE" and "NULL", which then count as
 * converted, so FALLBACK never fires; a string target tests for them first. A nullable target keeps a stored NULL.
 * The other types reject NONE and NULL in the cast and reach FALLBACK (measured on 4.0.0).
 */
function castValue(field: FieldModel, fallback: string): string {
  const cast = ['<', field.kind, '>$value'].join('');
  const members = splitTopLevel(canonicalType(field.kind), '|');
  if (!members.includes('string')) return cast;

  const absent = members.includes('null') ? '$value IS NONE' : '$value IS NONE OR $value IS NULL';

  return ['IF ', absent, ' THEN ', fallback, ' ELSE ', cast, ' END'].join('');
}

function withClause(d: SchemaDifference, statement: string, using: string, fallback?: string): string {
  const tail = [' USING ', using, fallback === undefined ? '' : [' FALLBACK ', fallback].join('')].join('');

  return [statement.replace(/;\s*$/, ''), ' MIGRATE EXISTING ROWS AS ', migrationName(d, tail), tail, ';'].join('');
}

/**
 * The `MIGRATE EXISTING ROWS` form of a field step, or undefined when the table holds no rows or the server needs
 * no conversion. A new field
 * whose type rejects NONE is filled with its `@default`; a type change the new type does not already accept converts
 * with a cast and gives non-converting rows the `@default`, or NONE on an optional field. A step with no default or
 * optional type to fall back on throws `CerialMigrationError` naming the field and the fix.
 */
export function emitMigrate(d: SchemaDifference, statement: string, populated: boolean): MigrateStep | undefined {
  const field = d.desiredField;
  if (!populated || !field || typeof field.path.at(-1) !== 'string' || field.computed !== undefined) return undefined;

  if (d.kind === 'field-missing' || d.kind === 'field-missing-required') {
    if (acceptsNone(field.kind)) return undefined;
    const using = constantDefault(d, field, 'the new field');
    if (using === undefined) {
      throw new CerialMigrationError(
        [
          `Cannot plan the new required field ${where(d)}: existing rows have no value for it and it has no @default. `,
          'Add a @default, make the field optional, or add the field by hand after migrating the rows.',
        ].join(''),
      );
    }

    // A flexible object may already hold a value at this key; USING <default> would reset it, a cast keeps it.
    if (d.underFlexible) {
      return {
        statement: withClause(d, statement, castValue(field, using), using),
        overwrites: true,
        reason: [
          'values already stored at this key that convert to ',
          field.kind,
          ' are kept; rows without one, or with one that does not convert, get ',
          using,
        ].join(''),
      };
    }

    return {
      statement: withClause(d, statement, using),
      overwrites: false,
      reason: ['existing rows are filled with the default ', using].join(''),
    };
  }

  if (d.kind !== 'field-changed' || !d.changes?.includes('kind') || !d.liveField) return undefined;
  if (widens(d.liveField.kind, field.kind)) return undefined;

  const fallback = constantDefault(d, field, 'the type change of') ?? (acceptsNone(field.kind) ? 'NONE' : undefined);
  if (fallback === undefined) {
    throw new CerialMigrationError(
      [
        `Cannot plan the type change of field ${where(d)}: rows whose value does not convert to ${field.kind} need a fallback, `,
        'and the field has no @default and is not optional. Add a @default, make the field optional, or migrate the rows by hand.',
      ].join(''),
    );
  }

  return {
    statement: withClause(d, statement, castValue(field, fallback), fallback),
    overwrites: true,
    reason: [
      'values that convert to ',
      field.kind,
      ' are converted; rows whose value does not convert get ',
      fallback,
    ].join(''),
  };
}
