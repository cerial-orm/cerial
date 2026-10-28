import { attachComments } from '../../../src/formatter/comment-attacher';
import { buildSourceLayout } from '../../../src/formatter/layout';
import { printModel, printObject } from '../../../src/formatter/printer';
import { FORMAT_DEFAULTS } from '../../../src/formatter/types';
import type { FormatConfig } from '../../../src/formatter/types';
import { parse } from '../../../src/parser/parser';
import { tokenize } from '../../../src/parser/tokenizer';

export function config(overrides?: FormatConfig): Required<FormatConfig> {
  return { ...FORMAT_DEFAULTS, ...overrides };
}

export function formatModel(source: string, overrides?: FormatConfig): string {
  const tokens = tokenize(source);
  const { ast } = parse(source);
  const comments = attachComments(tokens, ast);
  const model = ast.models[0]!;

  return printModel(model, comments, config(overrides), buildSourceLayout(tokens));
}

export function formatObject(source: string, overrides?: FormatConfig): string {
  const tokens = tokenize(source);
  const { ast } = parse(source);
  const comments = attachComments(tokens, ast);
  const object = ast.objects[0]!;

  return printObject(object, comments, config(overrides), buildSourceLayout(tokens));
}
