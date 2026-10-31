import { describe, expect, it } from 'bun:test';
import { emitHandles, HANDLES_MARKER } from '../../../../src/generators/handles';
import { lineOf, parseSchema } from './helpers';

const SCHEMA = `
model User {
  id Record(int) @id
  name String
}
object Address {
  street String
  city String
}
tuple Point {
  x Float,
  y Float
}
enum Role {
  ADMIN
  USER
}
literal Status {
  'on',
  'off'
}
`;

describe('emitHandles kinds', () => {
  const text = emitHandles(parseSchema(SCHEMA));

  it('starts with the generated header and imports only cerial/schema', () => {
    expect(text.startsWith(`${HANDLES_MARKER}\n`)).toBe(true);
    const imports = text.split('\n').filter((l) => l.startsWith('import '));
    expect(imports).toEqual(["import { handle } from 'cerial/schema';"]);
  });

  it('exports one handle per model, object, tuple, enum and literal', () => {
    expect(lineOf(text, 'User')).toContain('handle.model("User", { members: ["id", "name"], id: ["int"] })');
    expect(lineOf(text, 'Address')).toContain('handle.object("Address", { members: ["street", "city"] })');
    expect(lineOf(text, 'Point')).toContain('handle.tuple("Point"');
    expect(lineOf(text, 'Role')).toContain('handle.enum("Role", ["ADMIN", "USER"])');
    expect(lineOf(text, 'Status')).toContain('handle.literal("Status"');
  });

  it('never refers to the generated client', () => {
    expect(text).not.toMatch(/client|\.\.\/|\.\/index/i);
  });

  it('exports nothing for an empty AST beyond the header and import', () => {
    const empty = emitHandles(parseSchema(''));
    expect(empty).not.toContain('export const');
  });

  it('refuses a declaration whose name cannot be exported', () => {
    expect(() => emitHandles(parseSchema('object handle {\n  a String\n}'))).toThrow(/reserved word/);
  });
});
