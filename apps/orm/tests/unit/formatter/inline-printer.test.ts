/**
 * Tests for inline construct printer (enums, literals, tuples)
 */

import { describe, expect, it } from 'bun:test';
import type { CommentMap } from '../../../src/formatter/comment-attacher';
import { attachComments } from '../../../src/formatter/comment-attacher';
import { printEnum, printLiteral, printTuple } from '../../../src/formatter/inline-printer';
import type { FormatConfig } from '../../../src/formatter/types';
import { FORMAT_DEFAULTS } from '../../../src/formatter/types';
import { parse } from '../../../src/parser/parser';
import { tokenize } from '../../../src/parser/tokenizer';
import type { ASTEnum, ASTLiteral, ASTTuple } from '../../../src/types';

/** Create a resolved config with overrides */
function config(overrides: Partial<FormatConfig> = {}): Required<FormatConfig> {
  return { ...FORMAT_DEFAULTS, ...overrides };
}

/** Empty comment map for tests that don't need comments */
const NO_COMMENTS: CommentMap = new Map();

/** Parse source and return the first enum, its comments, and the source */
function parseEnum(src: string): { node: ASTEnum; comments: CommentMap; source: string } {
  const { ast } = parse(src);
  const tokens = tokenize(src);
  const comments = attachComments(tokens, ast);

  return { node: ast.enums[0]!, comments, source: src };
}

/** Parse source and return the first literal, its comments, and the source */
function parseLiteral(src: string): { node: ASTLiteral; comments: CommentMap; source: string } {
  const { ast } = parse(src);
  const tokens = tokenize(src);
  const comments = attachComments(tokens, ast);

  return { node: ast.literals[0]!, comments, source: src };
}

/** Parse source and return the first tuple, its comments, and the source */
function parseTuple(src: string): { node: ASTTuple; comments: CommentMap; source: string } {
  const { ast } = parse(src);
  const tokens = tokenize(src);
  const comments = attachComments(tokens, ast);

  return { node: ast.tuples[0]!, comments, source: src };
}

describe('printEnum', () => {
  describe('single-line mode', () => {
    it('should format enum as single line', () => {
      const { node, comments, source } = parseEnum('enum Role { Admin, User, Moderator }');
      const result = printEnum(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('enum Role { Admin, User, Moderator }');
    });

    it('should format multi-line source as single line when style is single', () => {
      const src = 'enum Role {\n  Admin,\n  User,\n  Moderator\n}';
      const { node, comments, source } = parseEnum(src);
      const result = printEnum(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('enum Role { Admin, User, Moderator }');
    });

    it('should handle single-value enum', () => {
      const { node, comments, source } = parseEnum('enum Singleton { Only }');
      const result = printEnum(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('enum Singleton { Only }');
    });
  });

  describe('multi-line mode', () => {
    it('should format enum as multi-line with 2-space indent', () => {
      const { node, comments, source } = parseEnum('enum Role { Admin, User, Moderator }');
      const result = printEnum(
        node,
        comments,
        config({ inlineConstructStyle: 'multi', indentSize: 2, trailingComma: false }),
        source,
      );

      expect(result).toBe('enum Role {\n  Admin,\n  User,\n  Moderator\n}');
    });

    it('should format enum as multi-line with 4-space indent', () => {
      const { node, comments, source } = parseEnum('enum Color { Red, Green, Blue }');
      const result = printEnum(
        node,
        comments,
        config({ inlineConstructStyle: 'multi', indentSize: 4, trailingComma: false }),
        source,
      );

      expect(result).toBe('enum Color {\n    Red,\n    Green,\n    Blue\n}');
    });

    it('should format enum as multi-line with tab indent', () => {
      const { node, comments, source } = parseEnum('enum Size { Small, Large }');
      const result = printEnum(
        node,
        comments,
        config({ inlineConstructStyle: 'multi', indentSize: 'tab', trailingComma: false }),
        source,
      );

      expect(result).toBe('enum Size {\n\tSmall,\n\tLarge\n}');
    });

    it('should add trailing comma when trailingComma is true', () => {
      const { node, comments, source } = parseEnum('enum Role { Admin, User, Moderator }');
      const result = printEnum(node, comments, config({ inlineConstructStyle: 'multi', trailingComma: true }), source);

      expect(result).toBe('enum Role {\n  Admin,\n  User,\n  Moderator,\n}');
    });

    it('should not add trailing comma when trailingComma is false', () => {
      const { node, comments, source } = parseEnum('enum Role { Admin, User, Moderator }');
      const result = printEnum(node, comments, config({ inlineConstructStyle: 'multi', trailingComma: false }), source);

      expect(result).toBe('enum Role {\n  Admin,\n  User,\n  Moderator\n}');
    });

    it('should handle single-value enum in multi-line mode without trailing comma', () => {
      const { node, comments, source } = parseEnum('enum Singleton { Only }');
      const result = printEnum(node, comments, config({ inlineConstructStyle: 'multi', trailingComma: false }), source);

      expect(result).toBe('enum Singleton {\n  Only\n}');
    });

    it('should handle single-value enum in multi-line mode with trailing comma', () => {
      const { node, comments, source } = parseEnum('enum Singleton { Only }');
      const result = printEnum(node, comments, config({ inlineConstructStyle: 'multi', trailingComma: true }), source);

      expect(result).toBe('enum Singleton {\n  Only,\n}');
    });
  });

  describe('honor mode', () => {
    it('should preserve single-line format', () => {
      const { node, comments, source } = parseEnum('enum Role { Admin, User, Moderator }');
      const result = printEnum(node, comments, config({ inlineConstructStyle: 'honor' }), source);

      expect(result).toBe('enum Role { Admin, User, Moderator }');
    });

    it('should preserve multi-line format', () => {
      const src = 'enum Role {\n  Admin,\n  User,\n  Moderator\n}';
      const { node, comments, source } = parseEnum(src);
      const result = printEnum(node, comments, config({ inlineConstructStyle: 'honor', trailingComma: false }), source);

      expect(result).toBe('enum Role {\n  Admin,\n  User,\n  Moderator\n}');
    });

    it('should detect multi-line from newline-separated enum', () => {
      const src = 'enum Severity {\n  LOW\n  MEDIUM\n  HIGH\n}';
      const { node, comments, source } = parseEnum(src);
      const result = printEnum(node, comments, config({ inlineConstructStyle: 'honor', trailingComma: false }), source);

      expect(result).toBe('enum Severity {\n  LOW,\n  MEDIUM,\n  HIGH\n}');
    });
  });

  describe('leading comments', () => {
    it('should preserve leading comments before enum', () => {
      const src = '# Role definitions\nenum Role { Admin, User }';
      const { node, comments, source } = parseEnum(src);
      const result = printEnum(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('# Role definitions\nenum Role { Admin, User }');
    });

    it('should preserve multiple leading comments', () => {
      const src = '# Line 1\n# Line 2\nenum Role { Admin, User }';
      const { node, comments, source } = parseEnum(src);
      const result = printEnum(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('# Line 1\n# Line 2\nenum Role { Admin, User }');
    });

    it('should handle no comments', () => {
      const { node, comments, source } = parseEnum('enum Role { Admin }');
      const result = printEnum(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('enum Role { Admin }');
    });

    it('should preserve slash-style leading comments', () => {
      const src = '// Role enum\nenum Role { Admin, User }';
      const { node, comments, source } = parseEnum(src);
      const result = printEnum(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('// Role enum\nenum Role { Admin, User }');
    });
  });
});

describe('printLiteral', () => {
  describe('single-line mode', () => {
    it('should format string variant literal as single line', () => {
      const { node, comments, source } = parseLiteral("literal Status { 'active', 'inactive', 'pending' }");
      const result = printLiteral(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe("literal Status { 'active', 'inactive', 'pending' }");
    });

    it('should format integer variant literal', () => {
      const { node, comments, source } = parseLiteral('literal Priority { 1, 2, 3 }');
      const result = printLiteral(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('literal Priority { 1, 2, 3 }');
    });

    it('should format boolean variant literal', () => {
      const { node, comments, source } = parseLiteral("literal Flag { true, false, 'maybe' }");
      const result = printLiteral(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe("literal Flag { true, false, 'maybe' }");
    });

    it('should format broad type variants', () => {
      const { node, comments, source } = parseLiteral('literal Broad { String, Int }');
      const result = printLiteral(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('literal Broad { String, Int }');
    });

    it('should format mixed variant types', () => {
      const { node, comments, source } = parseLiteral("literal Mixed { 'low', 'high', 1, 2, true }");
      const result = printLiteral(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe("literal Mixed { 'low', 'high', 1, 2, true }");
    });

    it('should format float variants', () => {
      const { node, comments, source } = parseLiteral('literal Ratio { 0.5, 1.0, 1.5 }');
      const result = printLiteral(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('literal Ratio { 0.5, 1.0, 1.5 }');
    });

    it('should format multi-line source as single line when style is single', () => {
      const src = "literal Status {\n  'active',\n  'inactive'\n}";
      const { node, comments, source } = parseLiteral(src);
      const result = printLiteral(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe("literal Status { 'active', 'inactive' }");
    });
  });

  describe('multi-line mode', () => {
    it('should format literal as multi-line with 2-space indent', () => {
      const { node, comments, source } = parseLiteral("literal Status { 'active', 'inactive', 'pending' }");
      const result = printLiteral(
        node,
        comments,
        config({ inlineConstructStyle: 'multi', indentSize: 2, trailingComma: false }),
        source,
      );

      expect(result).toBe("literal Status {\n  'active',\n  'inactive',\n  'pending'\n}");
    });

    it('should format literal as multi-line with 4-space indent', () => {
      const { node, comments, source } = parseLiteral('literal Priority { 1, 2, 3 }');
      const result = printLiteral(
        node,
        comments,
        config({ inlineConstructStyle: 'multi', indentSize: 4, trailingComma: false }),
        source,
      );

      expect(result).toBe('literal Priority {\n    1,\n    2,\n    3\n}');
    });

    it('should format literal as multi-line with tab indent', () => {
      const { node, comments, source } = parseLiteral("literal Opt { 'a', 'b' }");
      const result = printLiteral(
        node,
        comments,
        config({ inlineConstructStyle: 'multi', indentSize: 'tab', trailingComma: false }),
        source,
      );

      expect(result).toBe("literal Opt {\n\t'a',\n\t'b'\n}");
    });

    it('should add trailing comma when trailingComma is true', () => {
      const { node, comments, source } = parseLiteral("literal Status { 'active', 'inactive' }");
      const result = printLiteral(
        node,
        comments,
        config({ inlineConstructStyle: 'multi', trailingComma: true }),
        source,
      );

      expect(result).toBe("literal Status {\n  'active',\n  'inactive',\n}");
    });

    it('should not add trailing comma when trailingComma is false', () => {
      const { node, comments, source } = parseLiteral("literal Status { 'active', 'inactive' }");
      const result = printLiteral(
        node,
        comments,
        config({ inlineConstructStyle: 'multi', trailingComma: false }),
        source,
      );

      expect(result).toBe("literal Status {\n  'active',\n  'inactive'\n}");
    });

    it('should handle single-variant literal in multi-line mode', () => {
      const { node, comments, source } = parseLiteral("literal One { 'only' }");
      const result = printLiteral(
        node,
        comments,
        config({ inlineConstructStyle: 'multi', trailingComma: true }),
        source,
      );

      expect(result).toBe("literal One {\n  'only',\n}");
    });
  });

  describe('honor mode', () => {
    it('should preserve single-line literal format', () => {
      const { node, comments, source } = parseLiteral("literal Status { 'active', 'inactive' }");
      const result = printLiteral(node, comments, config({ inlineConstructStyle: 'honor' }), source);

      expect(result).toBe("literal Status { 'active', 'inactive' }");
    });

    it('should preserve multi-line literal format', () => {
      const src = "literal Status {\n  'active',\n  'inactive'\n}";
      const { node, comments, source } = parseLiteral(src);
      const result = printLiteral(
        node,
        comments,
        config({ inlineConstructStyle: 'honor', trailingComma: false }),
        source,
      );

      expect(result).toBe("literal Status {\n  'active',\n  'inactive'\n}");
    });

    it('should respect honor mode with trailing comma config on multi-line', () => {
      const src = "literal Status {\n  'active',\n  'inactive'\n}";
      const { node, comments, source } = parseLiteral(src);
      const result = printLiteral(
        node,
        comments,
        config({ inlineConstructStyle: 'honor', trailingComma: true }),
        source,
      );

      expect(result).toBe("literal Status {\n  'active',\n  'inactive',\n}");
    });
  });

  describe('literal ref variants', () => {
    it('should format literal with literalRef variant', () => {
      const src = "literal Status { 'active', 'inactive' }\nliteral ExtStatus { Status, 'archived' }";
      const { ast } = parse(src);
      const tokens = tokenize(src);
      const comments = attachComments(tokens, ast);
      const node = ast.literals[1]!;
      const result = printLiteral(node, comments, config({ inlineConstructStyle: 'single' }), src);

      expect(result).toBe("literal ExtStatus { Status, 'archived' }");
    });

    it('should format literal with tupleRef variant', () => {
      const src = "tuple Coord { lat Float, lng Float }\nliteral WithTuple { 'none', Coord }";
      const { ast } = parse(src);
      const tokens = tokenize(src);
      const comments = attachComments(tokens, ast);
      const node = ast.literals[0]!;
      const result = printLiteral(node, comments, config({ inlineConstructStyle: 'single' }), src);

      expect(result).toBe("literal WithTuple { 'none', Coord }");
    });

    it('should format literal with objectRef variant', () => {
      const src = "object Point { x Int\n  y Int }\nliteral WithObj { 'empty', Point }";
      const { ast } = parse(src);
      const tokens = tokenize(src);
      const comments = attachComments(tokens, ast);
      const node = ast.literals[0]!;
      const result = printLiteral(node, comments, config({ inlineConstructStyle: 'single' }), src);

      expect(result).toBe("literal WithObj { 'empty', Point }");
    });
  });

  describe('leading comments', () => {
    it('should preserve leading comments before literal', () => {
      const src = "# Status options\nliteral Status { 'active', 'inactive' }";
      const { node, comments, source } = parseLiteral(src);
      const result = printLiteral(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe("# Status options\nliteral Status { 'active', 'inactive' }");
    });
  });
});

describe('printTuple', () => {
  describe('single-line mode', () => {
    it('should format named-element tuple as single line', () => {
      const src = 'tuple Coordinate {\n  lat Float,\n  lng Float\n}';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('tuple Coordinate { lat Float, lng Float }');
    });

    it('should format unnamed-element tuple as single line', () => {
      const src = 'tuple Pair {\n  Int,\n  String\n}';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('tuple Pair { Int, String }');
    });

    it('should format mixed named/unnamed elements', () => {
      const src = 'tuple Entry {\n  name String,\n  Int,\n  Bool\n}';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('tuple Entry { name String, Int, Bool }');
    });

    it('should format elements with decorators', () => {
      const src = 'tuple Data {\n  count Int @default(0),\n  label String @nullable\n}';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('tuple Data { count Int @default(0), label String @nullable }');
    });

    it('should format elements with object type references', () => {
      const src = 'object Addr { street String\n  city String }\ntuple Located {\n  tag String,\n  Addr\n}';
      const { ast } = parse(src);
      const tokens = tokenize(src);
      const comments = attachComments(tokens, ast);
      const node = ast.tuples[0]!;
      const result = printTuple(node, comments, config({ inlineConstructStyle: 'single' }), src);

      expect(result).toBe('tuple Located { tag String, Addr }');
    });

    it('should format elements with tuple type references', () => {
      const src = 'tuple Inner {\n  x Int,\n  y Int\n}\ntuple Outer {\n  label String,\n  Inner\n}';
      const { ast } = parse(src);
      const tokens = tokenize(src);
      const comments = attachComments(tokens, ast);
      const node = ast.tuples[1]!;
      const result = printTuple(node, comments, config({ inlineConstructStyle: 'single' }), src);

      expect(result).toBe('tuple Outer { label String, Inner }');
    });

    it('should format multi-line source as single line when style is single', () => {
      const src = 'tuple Coord {\n  lat Float,\n  lng Float\n}';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('tuple Coord { lat Float, lng Float }');
    });
  });

  describe('multi-line mode', () => {
    it('should format tuple as multi-line with 2-space indent', () => {
      const src = 'tuple Coord { lat Float, lng Float }';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(
        node,
        comments,
        config({ inlineConstructStyle: 'multi', indentSize: 2, trailingComma: false }),
        source,
      );

      expect(result).toBe('tuple Coord {\n  lat Float,\n  lng Float\n}');
    });

    it('should format tuple as multi-line with 4-space indent', () => {
      const src = 'tuple Coord { lat Float, lng Float }';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(
        node,
        comments,
        config({ inlineConstructStyle: 'multi', indentSize: 4, trailingComma: false }),
        source,
      );

      expect(result).toBe('tuple Coord {\n    lat Float,\n    lng Float\n}');
    });

    it('should format tuple as multi-line with tab indent', () => {
      const src = 'tuple Coord { lat Float, lng Float }';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(
        node,
        comments,
        config({ inlineConstructStyle: 'multi', indentSize: 'tab', trailingComma: false }),
        source,
      );

      expect(result).toBe('tuple Coord {\n\tlat Float,\n\tlng Float\n}');
    });

    it('should add trailing comma when trailingComma is true', () => {
      const src = 'tuple Coord { lat Float, lng Float }';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(node, comments, config({ inlineConstructStyle: 'multi', trailingComma: true }), source);

      expect(result).toBe('tuple Coord {\n  lat Float,\n  lng Float,\n}');
    });

    it('should not add trailing comma when trailingComma is false', () => {
      const src = 'tuple Coord { lat Float, lng Float }';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(
        node,
        comments,
        config({ inlineConstructStyle: 'multi', trailingComma: false }),
        source,
      );

      expect(result).toBe('tuple Coord {\n  lat Float,\n  lng Float\n}');
    });

    it('should handle single-element tuple in multi-line mode', () => {
      const src = 'tuple Solo { Int }';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(node, comments, config({ inlineConstructStyle: 'multi', trailingComma: true }), source);

      expect(result).toBe('tuple Solo {\n  Int,\n}');
    });

    it('should format decorators on elements in multi-line mode', () => {
      const src = 'tuple WithDec {\n  count Int @default(0),\n  tag String @nullable\n}';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(
        node,
        comments,
        config({ inlineConstructStyle: 'multi', trailingComma: false }),
        source,
      );

      expect(result).toBe('tuple WithDec {\n  count Int @default(0),\n  tag String @nullable\n}');
    });
  });

  describe('honor mode', () => {
    it('should preserve single-line tuple format', () => {
      const src = 'tuple Coord { lat Float, lng Float }';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(node, comments, config({ inlineConstructStyle: 'honor' }), source);

      expect(result).toBe('tuple Coord { lat Float, lng Float }');
    });

    it('should preserve multi-line tuple format', () => {
      const src = 'tuple Coord {\n  lat Float,\n  lng Float\n}';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(
        node,
        comments,
        config({ inlineConstructStyle: 'honor', trailingComma: false }),
        source,
      );

      expect(result).toBe('tuple Coord {\n  lat Float,\n  lng Float\n}');
    });

    it('should respect honor mode with trailing comma config on multi-line', () => {
      const src = 'tuple Coord {\n  lat Float,\n  lng Float\n}';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(node, comments, config({ inlineConstructStyle: 'honor', trailingComma: true }), source);

      expect(result).toBe('tuple Coord {\n  lat Float,\n  lng Float,\n}');
    });
  });

  describe('element types', () => {
    it('should format all primitive element types', () => {
      const src = 'tuple Multi { String, Int, Float, Bool, Date }';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('tuple Multi { String, Int, Float, Bool, Date }');
    });

    it('should format nullable element', () => {
      const src = 'tuple WithNull {\n  text String,\n  Float @nullable\n}';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('tuple WithNull { text String, Float @nullable }');
    });

    it('should format element with @createdAt decorator', () => {
      const src = 'tuple Timed {\n  label String,\n  ts Date @createdAt\n}';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('tuple Timed { label String, ts Date @createdAt }');
    });

    it('should format element with @updatedAt decorator', () => {
      const src = 'tuple Tracked {\n  label String,\n  modified Date @updatedAt\n}';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('tuple Tracked { label String, modified Date @updatedAt }');
    });

    it('should format element with @defaultAlways decorator', () => {
      const src = 'tuple Resetting {\n  count Int @defaultAlways(0),\n  String\n}';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('tuple Resetting { count Int @defaultAlways(0), String }');
    });

    it('should format element with string default value', () => {
      const src = "tuple WithStrDefault {\n  label String @default('hello'),\n  Int\n}";
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe("tuple WithStrDefault { label String @default('hello'), Int }");
    });

    it('should format element with boolean default value', () => {
      const src = 'tuple WithBoolDefault {\n  flag Bool @default(true),\n  Int\n}';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('tuple WithBoolDefault { flag Bool @default(true), Int }');
    });

    it('should format element with multiple decorators', () => {
      const src = 'tuple Multi {\n  val Int @default(0) @nullable,\n  String\n}';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('tuple Multi { val Int @default(0) @nullable, String }');
    });
  });

  describe('leading comments', () => {
    it('should preserve leading comments before tuple', () => {
      const src = '# Coordinate pair\ntuple Coord {\n  lat Float,\n  lng Float\n}';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('# Coordinate pair\ntuple Coord { lat Float, lng Float }');
    });

    it('should preserve multiple leading comments', () => {
      const src = '# Line 1\n# Line 2\ntuple Coord {\n  lat Float,\n  lng Float\n}';
      const { node, comments, source } = parseTuple(src);
      const result = printTuple(node, comments, config({ inlineConstructStyle: 'single' }), source);

      expect(result).toBe('# Line 1\n# Line 2\ntuple Coord { lat Float, lng Float }');
    });
  });
});

describe('edge cases', () => {
  it('should handle empty comment map', () => {
    const src = 'enum Role { Admin, User }';
    const { ast } = parse(src);
    const result = printEnum(ast.enums[0]!, NO_COMMENTS, config({ inlineConstructStyle: 'single' }), src);

    expect(result).toBe('enum Role { Admin, User }');
  });

  it('should handle all three types in same source', () => {
    const src = [
      'enum Color { Red, Green, Blue }',
      "literal Priority { 'low', 'high' }",
      'tuple Pair { Int, String }',
    ].join('\n');

    const { ast } = parse(src);
    const tokens = tokenize(src);
    const comments = attachComments(tokens, ast);
    const cfg = config({ inlineConstructStyle: 'single' });

    expect(printEnum(ast.enums[0]!, comments, cfg, src)).toBe('enum Color { Red, Green, Blue }');
    expect(printLiteral(ast.literals[0]!, comments, cfg, src)).toBe("literal Priority { 'low', 'high' }");
    expect(printTuple(ast.tuples[0]!, comments, cfg, src)).toBe('tuple Pair { Int, String }');
  });

  it('should use default config values correctly', () => {
    const src = 'enum Role { Admin, User }';
    const { ast } = parse(src);

    // Default: inlineConstructStyle = 'multi', trailingComma = false, indentSize = 2
    const result = printEnum(ast.enums[0]!, NO_COMMENTS, FORMAT_DEFAULTS, src);

    expect(result).toBe('enum Role {\n  Admin,\n  User\n}');
  });

  it('should handle many enum values', () => {
    const values = Array.from({ length: 10 }, (_, i) => `V${i}`);
    const src = `enum Big { ${values.join(', ')} }`;
    const { node, comments, source } = parseEnum(src);
    const result = printEnum(node, comments, config({ inlineConstructStyle: 'single' }), source);

    expect(result).toBe(`enum Big { ${values.join(', ')} }`);
  });

  it('should handle float variant with whole number (preserves decimal)', () => {
    const src = 'literal Levels { 1.0, 2.0, 3.0 }';
    const { node, comments, source } = parseLiteral(src);
    const result = printLiteral(node, comments, config({ inlineConstructStyle: 'single' }), source);

    expect(result).toBe('literal Levels { 1.0, 2.0, 3.0 }');
  });

  it('should handle float variant with fractional part', () => {
    const src = 'literal Ratios { 0.25, 0.5, 0.75 }';
    const { node, comments, source } = parseLiteral(src);
    const result = printLiteral(node, comments, config({ inlineConstructStyle: 'single' }), source);

    expect(result).toBe('literal Ratios { 0.25, 0.5, 0.75 }');
  });

  it('should handle negative number variants', () => {
    const src = 'literal Range { -10, 0, 10 }';
    const { node, comments, source } = parseLiteral(src);
    const result = printLiteral(node, comments, config({ inlineConstructStyle: 'single' }), source);

    expect(result).toBe('literal Range { -10, 0, 10 }');
  });
});
