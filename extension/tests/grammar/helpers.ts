import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createOnigScanner, createOnigString, loadWASM } from 'vscode-oniguruma';
import { type IGrammar, INITIAL, type IRawGrammar, type IToken, parseRawGrammar, Registry } from 'vscode-textmate';

const GRAMMAR_PATH = resolve(__dirname, '../../syntaxes/cerial.tmLanguage.json');
const WASM_PATH = resolve(__dirname, '../../node_modules/vscode-oniguruma/release/onig.wasm');
const FIXTURES_DIR = resolve(__dirname, '../fixtures');

let grammarInstance: IGrammar | null = null;
let wasmLoaded = false;

async function ensureWasmLoaded(): Promise<void> {
  if (wasmLoaded) return;
  const wasmBin = readFileSync(WASM_PATH).buffer;
  await loadWASM({ data: wasmBin });
  wasmLoaded = true;
}

export async function getGrammar(): Promise<IGrammar> {
  if (grammarInstance) return grammarInstance;

  await ensureWasmLoaded();

  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner,
      createOnigString,
    }),
    loadGrammar: async (scopeName: string): Promise<IRawGrammar | null> => {
      if (scopeName === 'source.cerial') {
        const content = readFileSync(GRAMMAR_PATH, 'utf-8');

        return parseRawGrammar(content, GRAMMAR_PATH);
      }

      return null;
    },
  });

  const grammar = await registry.loadGrammar('source.cerial');
  if (!grammar) throw new Error('Failed to load cerial grammar');

  grammarInstance = grammar;

  return grammar;
}

export interface TokenInfo {
  text: string;
  scopes: string[];
}

export interface LineTokens {
  line: string;
  tokens: TokenInfo[];
}

/**
 * Tokenize a single line of cerial source code.
 * Uses INITIAL ruleStack — suitable for single-line tests.
 */
export function tokenizeLine(grammar: IGrammar, line: string): TokenInfo[] {
  const result = grammar.tokenizeLine(line, INITIAL);

  return result.tokens.map((token: IToken, i: number) => {
    const nextOffset = i + 1 < result.tokens.length ? result.tokens[i + 1]!.startIndex : line.length;

    return {
      text: line.substring(token.startIndex, nextOffset),
      scopes: token.scopes,
    };
  });
}

/**
 * Tokenize an entire multi-line source, carrying ruleStack across lines.
 */
export function tokenizeSource(grammar: IGrammar, source: string): LineTokens[] {
  const lines = source.split('\n');
  const result: LineTokens[] = [];
  let ruleStack = INITIAL;

  for (const line of lines) {
    const lineResult = grammar.tokenizeLine(line, ruleStack);
    const tokens: TokenInfo[] = lineResult.tokens.map((token: IToken, i: number) => {
      const nextOffset = i + 1 < lineResult.tokens.length ? lineResult.tokens[i + 1]!.startIndex : line.length;

      return {
        text: line.substring(token.startIndex, nextOffset),
        scopes: token.scopes,
      };
    });
    result.push({ line, tokens });
    ruleStack = lineResult.ruleStack;
  }

  return result;
}

/**
 * Load a fixture file and tokenize it.
 */
export async function tokenizeFixture(fixtureName: string): Promise<LineTokens[]> {
  const grammar = await getGrammar();
  const filePath = join(FIXTURES_DIR, fixtureName);
  const source = readFileSync(filePath, 'utf-8');

  return tokenizeSource(grammar, source);
}

/**
 * Find the first token on a line matching a text substring.
 */
export function findToken(tokens: TokenInfo[], text: string): TokenInfo | undefined {
  return tokens.find((t) => t.text === text);
}

/**
 * Check that at least one token on the line has a scope containing the given substring.
 */
export function hasScope(tokens: TokenInfo[], scopeFragment: string): boolean {
  return tokens.some((t) => t.scopes.some((s) => s.includes(scopeFragment)));
}

/**
 * Get all tokens matching a specific scope fragment.
 */
export function tokensWithScope(tokens: TokenInfo[], scopeFragment: string): TokenInfo[] {
  return tokens.filter((t) => t.scopes.some((s) => s.includes(scopeFragment)));
}

/**
 * Assert a token has a scope containing the given fragment.
 */
export function expectScope(token: TokenInfo | undefined, scopeFragment: string): void {
  if (!token) throw new Error(`Token not found, expected scope: ${scopeFragment}`);
  const match = token.scopes.some((s) => s.includes(scopeFragment));
  if (!match) {
    throw new Error(
      `Expected scope containing "${scopeFragment}" but got: [${token.scopes.join(', ')}] for text "${token.text}"`,
    );
  }
}

/**
 * Format tokenized output for human-readable snapshot comparison.
 */
export function formatTokenSnapshot(lineTokens: LineTokens[]): string {
  const lines: string[] = [];

  for (const { line, tokens } of lineTokens) {
    lines.push(`// Line: ${JSON.stringify(line)}`);
    for (const token of tokens) {
      if (token.text.trim() === '') continue; // skip whitespace-only for readability
      const scopeStr = token.scopes.join(', ');
      lines.push(`//   ${JSON.stringify(token.text)}  ->  ${scopeStr}`);
    }
  }

  return lines.join('\n');
}
