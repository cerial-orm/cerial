import type { DatabasePin } from '../../types';
import { escapeTsString } from '../shared/escaping';

function quoted(value: string): string {
  return `'${escapeTsString(value)}'`;
}

/**
 * Emit the tables this client shares with another schema entry, with the database it was generated for.
 * Emits nothing without a pin, so a schema with no collision generates the same client as before.
 */
export function generateDatabasePins(pins: DatabasePin[] = []): string {
  if (!pins.length) return '';

  const rows = pins.map(
    (p) =>
      `  { table: ${quoted(p.table)}, entry: ${quoted(p.entry)}, otherEntries: [${p.otherEntries.map(quoted).join(', ')}], database: ${quoted(p.database)} },`,
  );

  return `// Tables another schema entry also maps to: this client is only valid on the database it was generated for.
const DATABASE_PINS: readonly { table: string; entry: string; otherEntries: readonly string[]; database: string }[] = [
${rows.join('\n')}
];`;
}

/** Lines of connect() that refuse a connection to a database other than the pinned one. */
export function generateDatabasePinCheck(pins: DatabasePin[] = []): string {
  if (!pins.length) return '';

  return `
    const mismatched = DATABASE_PINS.filter(pin => pin.database !== resolved.database);
    if (mismatched.length) {
      const detail = mismatched.map(pin => \`table '\${pin.table}' is also used by entry \${pin.otherEntries.map(name => \`'\${name}'\`).join(', ')}\`).join('; ');
      throw new CerialValidationError(\`Refusing to connect: this client (entry '\${mismatched[0]!.entry}') was generated for database '\${mismatched[0]!.database}', but the connection targets \${resolved.database === undefined ? 'no database' : \`database '\${resolved.database}'\`}. \${detail}. Connecting would make the clients share those tables.\`, { operation: 'connect' });
    }`;
}
