/**
 * The nine sized number types must print with their DSL spelling in every position, and the
 * formatter must be idempotent and keep the AST for each.
 */

import { describe, expect, it } from 'bun:test';
import { formatCerialSource } from '../../../src/formatter/formatter';
import { parse } from '../../../src/parser/parser';

const TYPES = ['Int8', 'Uint8', 'Int16', 'Uint16', 'Int32', 'Uint32', 'Uint64', 'Float16', 'Float32'] as const;

function format(source: string, config?: Parameters<typeof formatCerialSource>[1]): string {
  const result = formatCerialSource(source, config);
  if (result.error) throw new Error(result.error.message);

  return result.formatted;
}

/** Strip source positions so two parses of differently laid out text compare equal. */
function shape(source: string): string {
  const { ast, errors } = parse(source);
  expect(errors ?? []).toEqual([]);

  return JSON.stringify(ast, (key, value) =>
    [
      'range',
      'loc',
      'start',
      'end',
      'line',
      'column',
      'offset',
      'position',
      'comments',
      'sourceText',
      'source',
    ].includes(key)
      ? undefined
      : value,
  );
}

function expectStable(source: string, config?: Parameters<typeof formatCerialSource>[1]): string {
  const once = format(source, config);
  expect(format(once, config)).toBe(once);
  expect(shape(once)).toBe(shape(source));

  return once;
}

describe('formatter: sized number types', () => {
  for (const type of TYPES) {
    describe(type, () => {
      it('model fields: plain, optional, array, nullable, set, default', () => {
        const out = expectStable(
          [
            'model M {',
            '  id Record @id',
            `  a ${type}`,
            `  b ${type}?`,
            `  c ${type}[]`,
            `  d ${type} @nullable`,
            `  e ${type}[] @set`,
            `  f ${type} @default(1)`,
            '}',
          ].join('\n'),
        );
        for (const name of ['a', 'b', 'c', 'd', 'e', 'f'])
          expect(out).toMatch(new RegExp(`^\\s+${name}\\s+${type}(\\?|\\[\\])?(\\s|$)`, 'm'));
        expect(out).toContain('@set');
        expect(out).toContain('@nullable');
        expect(out).toContain('@default(1)');
      });

      it('object fields', () => {
        const out = expectStable(`object O {\n  a ${type}\n  b ${type}?\n  c ${type}[]\n}`);
        expect(out).toContain(`a ${type}\n`);
        expect(out).toContain(`b ${type}?`);
        expect(out).toContain(`c ${type}[]`);
      });

      it('tuple elements, single-line', () => {
        const out = expectStable(`tuple T { ${type}, x ${type} }`, { inlineConstructStyle: 'single' });
        expect(out).toContain(`${type}, x ${type}`);
      });

      it('tuple elements, multi-line', () => {
        const out = expectStable(`tuple T { ${type}, x ${type} @nullable }`, { inlineConstructStyle: 'multi' });
        expect(out).toContain(`  ${type},`);
        expect(out).toContain(`x ${type} @nullable`);
      });
    });
  }

  it('prints @default(255) and a mixed model unchanged and stably', () => {
    const src = 'model M {\n  id Record @id\n  a Uint8 @default(255)\n  b Float32 @default(1.5)\n}\n';
    const out = expectStable(src);
    expect(out).toContain('@default(255)');
    expect(out).toContain('@default(1.5)');
  });

  it('is stable under every tuple style with an optional sized element', () => {
    for (const style of ['single', 'multi', 'honor'] as const) {
      const out = expectStable('tuple T {\n  Int8,\n  Uint64 @nullable,\n  Float16\n}\n', {
        inlineConstructStyle: style,
      });
      expect(out).not.toMatch(/\b(int8|uint64|float16)\b/);
    }
  });

  describe('negative', () => {
    it('leaves a misspelled sized type for the parser to refuse, without rewriting it', () => {
      const src = 'model M {\n  id Record @id\n  a Uint9\n}\n';
      const result = formatCerialSource(src);
      if (!result.error) expect(result.formatted).toContain('Uint9');
      else expect(result.error.message).toBeTruthy();
    });

    it('does not normalise the case of a wrong-cased name (parser refuses it)', () => {
      for (const bad of ['uint8', 'UINT8', 'int8', 'Float64', 'Int64']) {
        const src = `model M {\n  id Record @id\n  a ${bad}\n}\n`;
        const result = formatCerialSource(src);
        if (!result.error) {
          expect(result.formatted).toContain(` ${bad}`);
          expect(result.formatted).not.toMatch(/ (Int8|Uint8|Float64|Int64)\b/);
        }
      }
    });
  });
});
