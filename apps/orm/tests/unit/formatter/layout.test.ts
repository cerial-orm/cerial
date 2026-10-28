import { describe, expect, it } from 'bun:test';
import { attachComments } from '../../../src/formatter/comment-attacher';
import { buildSourceLayout } from '../../../src/formatter/layout';
import { printEnum } from '../../../src/formatter/inline-printer';
import { printModel } from '../../../src/formatter/printer';
import { parse } from '../../../src/parser/parser';
import { tokenize } from '../../../src/parser/tokenizer';
import type { ASTEnum, ASTModel, Origin } from '../../../src/types';
import { config } from './helpers';

const TS_ORIGIN: Origin = { kind: 'ts', file: 'schema.ts', export: 'schema' };

function parsed(src: string) {
  const tokens = tokenize(src);
  const { ast } = parse(src);

  return { ast, comments: attachComments(tokens, ast), layout: buildSourceLayout(tokens) };
}

describe('buildSourceLayout', () => {
  it('counts only lines with no token as blank, and ignores blank lines inside a block comment', () => {
    const { layout } = parsed('model A {\n  a String\n\n  # c\n  b Int\n}\n');

    expect(layout.blankLinesBetween(2, 5)).toBe(1);
    expect(layout.blankLinesBetween(0, 1)).toBe(0);
  });

  it('reports whether a value shares the open brace line', () => {
    const { layout } = parsed('enum A { X, Y }\nenum B {\n  X\n}\n');

    expect(layout.hasValueOnOpenLine(1)).toBe(true);
    expect(layout.hasValueOnOpenLine(2)).toBe(false);
  });
});

describe('source-less printing', () => {
  const SRC = 'model A {\n  id Record @id\n\n  a String\n  @@index(i, [a])\n}\n';

  it('prints no blank line between fields and the always-form before directives without a layout', () => {
    const { ast, comments } = parsed(SRC);
    const model = ast.models[0]!;
    const cfg = config({ fieldGroupBlankLines: 'honor', blankLineBeforeDirectives: 'honor' });

    expect(printModel(model, comments, cfg)).toBe('model A {\n  id Record @id\n  a  String\n\n  @@index(i, [a])\n}');
  });

  it('treats a ts origin like a missing layout even when a layout is supplied', () => {
    const { ast, comments, layout } = parsed(SRC);
    const tsModel: ASTModel = {
      ...ast.models[0]!,
      origin: TS_ORIGIN,
      fields: ast.models[0]!.fields.map((f) => ({ ...f, origin: TS_ORIGIN })),
    };
    const cfg = config({ fieldGroupBlankLines: 'honor' });

    expect(printModel(tsModel, comments, cfg, layout)).toBe(printModel(ast.models[0]!, comments, cfg));
    expect(printModel(ast.models[0]!, comments, cfg, layout)).toContain('id Record @id\n\n');
  });

  it('prints an inline construct multi-line under honor when it has no source lines', () => {
    const { ast, comments } = parsed('enum A { X, Y }\n');
    const node: ASTEnum = { ...ast.enums[0]!, origin: TS_ORIGIN };

    expect(printEnum(node, comments, config({ inlineConstructStyle: 'honor' }))).toBe('enum A {\n  X,\n  Y\n}');
  });
});
