import { describe, expect, it } from 'bun:test';
import { emitHandles } from '../../../../src/generators/handles';
import { parseSchema } from './helpers';

const A = 'model Alpha {\n  id Record @id\n}\nobject Zed {\n  a Int\n}\n';
const B = 'model Beta {\n  id Record(int) @id\n}\nobject Amy {\n  b Int\n}\n';

describe('emitHandles stability', () => {
  it('gives the same bytes for the same AST', () => {
    expect(emitHandles(parseSchema(A + B))).toBe(emitHandles(parseSchema(A + B)));
  });

  it('gives the same bytes whatever order the declarations arrived in', () => {
    expect(emitHandles(parseSchema(A + B))).toBe(emitHandles(parseSchema(B + A)));
  });

  it('changes when a member changes', () => {
    expect(emitHandles(parseSchema(A))).not.toBe(
      emitHandles(parseSchema(A.replace('Record @id', 'Record @id\n  x Int'))),
    );
  });

  it('does not mutate the AST it is given', () => {
    const ast = parseSchema('model P {\n  id Record @id\n}\nmodel C extends P {\n  n Int\n}');
    const before = JSON.stringify(ast);
    emitHandles(ast);
    expect(JSON.stringify(ast)).toBe(before);
  });
});
