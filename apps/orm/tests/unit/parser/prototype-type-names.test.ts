import { describe, expect, test } from 'bun:test';
import { parse } from '../../../src/parser/parser';

const HOST = 'model Host {\n  id Record @id\n  name String\n}\n';

describe('literal variants named after Object.prototype members', () => {
  test.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty'])('%s is not a broad type', (name) => {
    const { ast, errors } = parse(`${HOST}\nliteral L { ${name}, 'a' }\n`);

    expect(ast.literals[0]?.variants.some((v) => v.kind === 'broadType')).toBeFalsy();
    expect(errors.length).toBeGreaterThan(0);
  });

  test('a real broad type still parses', () => {
    const { ast, errors } = parse(`${HOST}\nliteral L { String, 'a' }\n`);

    expect(errors).toHaveLength(0);
    expect(ast.literals[0]?.variants[0]).toEqual({ kind: 'broadType', typeName: 'String' });
  });
});
