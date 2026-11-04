/**
 * Unit Tests: Composite Directive Validator
 *
 * @@index and @@unique rules, validated through the same checks `cerial generate` runs.
 */

import { describe, expect, test } from 'bun:test';
import { parse } from '../../../src/parser/parser';
import { validateAll } from './helpers';

/** Helper: parse a schema and run validation, return all errors */
function parseAndValidate(source: string) {
  const result = parse(source);
  const validationErrors = validateAll(result.ast);

  return { ast: result.ast, parseErrors: result.errors, validationErrors };
}

describe('Composite Directive Validator', () => {
  describe('mixed with field-level decorators', () => {
    test('should parse @index field-level decorator', () => {
      const result = parse(`
        model User {
          id Record @id
          email Email @unique
          name String @index
        }
      `);

      expect(result.errors).toHaveLength(0);
      const nameField = result.ast.models[0]?.fields.find((f) => f.name === 'name');
      expect(nameField?.decorators.some((d) => d.type === 'index')).toBe(true);
    });

    test('should reject @index and @unique on the same field', () => {
      const { validationErrors } = parseAndValidate(`
        model User {
          id Record @id
          email Email @index @unique
        }
      `);

      expect(validationErrors.length).toBeGreaterThan(0);
      expect(validationErrors.some((e) => e.message.includes('@index') && e.message.includes('@unique'))).toBe(true);
    });

    test('should reject @unique on array field (String[])', () => {
      const { validationErrors } = parseAndValidate(`
        model User {
          id Record @id
          tags String[] @unique
        }
      `);

      expect(validationErrors.length).toBeGreaterThan(0);
      expect(
        validationErrors.some(
          (e) => e.message.includes('tags') && e.message.includes('array') && e.message.includes('@unique'),
        ),
      ).toBe(true);
    });

    test('should reject @unique on array field (Int[])', () => {
      const { validationErrors } = parseAndValidate(`
        model Product {
          id Record @id
          codes Int[] @unique
        }
      `);

      expect(validationErrors.length).toBeGreaterThan(0);
      expect(validationErrors.some((e) => e.message.includes('codes') && e.message.includes('array'))).toBe(true);
    });

    test('should reject @unique on array field (Record[])', () => {
      const { validationErrors } = parseAndValidate(`
        model ItemGroup {
          id Record @id
          memberIds Record[] @unique
        }
      `);

      expect(validationErrors.length).toBeGreaterThan(0);
      expect(validationErrors.some((e) => e.message.includes('memberIds') && e.message.includes('array'))).toBe(true);
    });

    test('should allow @index on array field (per-element indexing)', () => {
      const { validationErrors } = parseAndValidate(`
        model User {
          id Record @id
          tags String[] @index
        }
      `);

      const indexArrayErrors = validationErrors.filter(
        (e) => e.message.includes('tags') && e.message.includes('array'),
      );
      expect(indexArrayErrors).toHaveLength(0);
    });
  });

  describe('minimum fields', () => {
    test('should error on composite with only 1 field', () => {
      const { validationErrors } = parseAndValidate(`
        model User {
          id Record @id
          email Email
          @@unique(singleField, [email])
        }
      `);

      expect(validationErrors.length).toBeGreaterThan(0);
      expect(validationErrors.some((e) => e.message.includes('at least 2 fields'))).toBe(true);
    });
  });

  describe('global name uniqueness', () => {
    test('should error on duplicate composite names across models', () => {
      const { validationErrors } = parseAndValidate(`
        model User {
          id Record @id
          firstName String
          lastName String
          @@unique(nameCombo, [firstName, lastName])
        }

        model Product {
          id Record @id
          name String
          sku String
          @@unique(nameCombo, [name, sku])
        }
      `);

      expect(validationErrors.length).toBeGreaterThan(0);
      expect(validationErrors.some((e) => e.message.includes('nameCombo') && e.message.includes('already used'))).toBe(
        true,
      );
    });
  });

  describe('duplicate fields', () => {
    test('should error on duplicate fields within a composite', () => {
      const { validationErrors } = parseAndValidate(`
        model User {
          id Record @id
          firstName String
          lastName String
          @@unique(dupFields, [firstName, firstName])
        }
      `);

      expect(validationErrors.length).toBeGreaterThan(0);
      expect(validationErrors.some((e) => e.message.includes('Duplicate field'))).toBe(true);
    });
  });

  describe('field existence', () => {
    test('should error on non-existent field', () => {
      const { validationErrors } = parseAndValidate(`
        model User {
          id Record @id
          firstName String
          lastName String
          @@unique(badRef, [firstName, middleName])
        }
      `);

      expect(validationErrors.length).toBeGreaterThan(0);
      expect(
        validationErrors.some((e) => e.message.includes("'middleName'") && e.message.includes('does not exist')),
      ).toBe(true);
    });

    test('should error on non-existent dot-notation subfield', () => {
      const { validationErrors } = parseAndValidate(`
        object Address {
          city String
        }

        model Store {
          id Record @id
          address Address
          name String
          @@unique(badDot, [address.nonExistent, name])
        }
      `);

      expect(validationErrors.length).toBeGreaterThan(0);
      expect(
        validationErrors.some(
          (e) => e.message.includes("'address.nonExistent'") && e.message.includes('does not exist'),
        ),
      ).toBe(true);
    });
  });

  describe('@id field rejection', () => {
    test('should error when @id field is in composite', () => {
      const { validationErrors } = parseAndValidate(`
        model User {
          id Record @id
          firstName String
          lastName String
          @@unique(withId, [id, firstName])
        }
      `);

      expect(validationErrors.length).toBeGreaterThan(0);
      expect(validationErrors.some((e) => e.message.includes('@id'))).toBe(true);
    });
  });

  describe('relation field rejection', () => {
    test('should error when Relation field is in composite', () => {
      const { validationErrors } = parseAndValidate(`
        model User {
          id Record @id
          name String
          profileId Record
          profile Relation @field(profileId) @model(Profile)
          @@index(badRelation, [name, profile])
        }

        model Profile {
          id Record @id
          bio String
        }
      `);

      expect(validationErrors.length).toBeGreaterThan(0);
      expect(validationErrors.some((e) => e.message.includes('Relation') && e.message.includes('virtual'))).toBe(true);
    });
  });

  describe('array field rejection', () => {
    test('should error when array field is in composite', () => {
      const { validationErrors } = parseAndValidate(`
        model User {
          id Record @id
          name String
          tags String[]
          @@index(badArray, [name, tags])
        }
      `);

      expect(validationErrors.length).toBeGreaterThan(0);
      expect(validationErrors.some((e) => e.message.includes('array'))).toBe(true);
    });
  });

  describe('object + own subfield overlap', () => {
    test('should error when object and its subfield are both in composite', () => {
      const { validationErrors } = parseAndValidate(`
        object Address {
          city String
          zip String
        }

        model Store {
          id Record @id
          address Address
          @@unique(overlap, [address, address.city])
        }
      `);

      expect(validationErrors.length).toBeGreaterThan(0);
      expect(validationErrors.some((e) => e.message.includes('redundant'))).toBe(true);
    });
  });

  describe('valid composite with Record field', () => {
    test('should allow Record fields (non-relation) in composites', () => {
      const { validationErrors } = parseAndValidate(`
        model Comment {
          id Record @id
          postId Record
          authorId Record
          post Relation @field(postId) @model(Post)
          author Relation @field(authorId) @model(Author)
          @@unique(postAuthor, [postId, authorId])
        }

        model Post {
          id Record @id
          title String
        }

        model Author {
          id Record @id
          name String
        }
      `);

      // Only Record fields (not Relation) so this should be valid
      const relatedErrors = validationErrors.filter((e) => e.message.includes('postAuthor'));
      expect(relatedErrors).toHaveLength(0);
    });
  });

  describe('valid composite with whole-object field', () => {
    test('should allow object-typed field (whole object index)', () => {
      const { validationErrors } = parseAndValidate(`
        object Address {
          city String
          zip String
        }

        model Store {
          id Record @id
          name String
          address Address
          @@unique(nameAddress, [name, address])
        }
      `);

      const relatedErrors = validationErrors.filter((e) => e.message.includes('nameAddress'));
      expect(relatedErrors).toHaveLength(0);
    });
  });
});

describe('nullsNotDistinct refusals', () => {
  const COLUMNS = `
    id Record @id
    tenantId Record? @nullable
    slug String? @nullable
    code String
    label String`;

  test('@unique(nullsNotDistinct) on a @nullable field is accepted', () => {
    const { parseErrors, validationErrors } = parseAndValidate(`
      model User {
        id Record @id
        nickname String? @nullable @unique(nullsNotDistinct)
      }
    `);

    expect(parseErrors).toHaveLength(0);
    expect(validationErrors).toHaveLength(0);
  });

  test('@unique(nullsNotDistinct) on an Any field is accepted, since Any holds null', () => {
    const { validationErrors } = parseAndValidate(`
      model User {
        id Record @id
        extra Any @unique(nullsNotDistinct)
      }
    `);

    expect(validationErrors).toHaveLength(0);
  });

  test('refused on a field that cannot hold null, naming the field and model', () => {
    const { validationErrors } = parseAndValidate(`
      model User {
        id Record @id
        nickname String? @unique(nullsNotDistinct)
      }
    `);

    expect(validationErrors).toHaveLength(1);
    expect(validationErrors[0]!.message).toBe(
      "Field 'nickname' in model User has @unique(nullsNotDistinct) but cannot hold null, so the option changes nothing: a unique index never compares NONE. Add @nullable, or use @unique.",
    );
  });

  test('refused on a required field, and plain @unique on the same field is accepted', () => {
    expect(
      parseAndValidate('model U {\n  id Record @id\n  e String @unique(nullsNotDistinct)\n}\n').validationErrors,
    ).toHaveLength(1);
    expect(parseAndValidate('model U {\n  id Record @id\n  e String @unique\n}\n').validationErrors).toHaveLength(0);
  });

  test('refused on an object field that cannot hold null, naming the object', () => {
    const { validationErrors } = parseAndValidate(`
      object Profile {
        handle String? @unique(nullsNotDistinct)
      }
      model User {
        id Record @id
        profile Profile?
      }
    `);

    expect(validationErrors).toHaveLength(1);
    expect(validationErrors[0]!.message).toContain("Field 'handle' in object Profile has @unique(nullsNotDistinct)");
  });

  test('accepted on a @nullable object field', () => {
    const { validationErrors } = parseAndValidate(`
      object Profile {
        handle String? @nullable @unique(nullsNotDistinct)
      }
      model User {
        id Record @id
        profile Profile?
      }
    `);

    expect(validationErrors).toHaveLength(0);
  });

  test('composite with one nullable column is accepted', () => {
    const { validationErrors } = parseAndValidate(
      `model T {${COLUMNS}\n    @@unique(tenantSlug, [tenantId, code], nullsNotDistinct)\n  }`,
    );

    expect(validationErrors).toHaveLength(0);
  });

  test('composite with two nullable columns is accepted', () => {
    const { validationErrors } = parseAndValidate(
      `model T {${COLUMNS}\n    @@unique(tenantSlug, [tenantId, slug], nullsNotDistinct)\n  }`,
    );

    expect(validationErrors).toHaveLength(0);
  });

  test('composite with no nullable column is refused, naming the directive and its fields', () => {
    const { validationErrors } = parseAndValidate(
      `model T {${COLUMNS}\n    @@unique(codeLabel, [code, label], nullsNotDistinct)\n  }`,
    );

    expect(validationErrors).toHaveLength(1);
    expect(validationErrors[0]!.message).toBe(
      '@@unique("codeLabel") has nullsNotDistinct but none of its fields (code, label) can hold null, so the option changes nothing. Add @nullable to one of them, or drop the option.',
    );
  });

  test('the same composite without the option is accepted', () => {
    const { validationErrors } = parseAndValidate(`model T {${COLUMNS}\n    @@unique(codeLabel, [code, label])\n  }`);

    expect(validationErrors).toHaveLength(0);
  });

  test('a dotted path counts the sub-field, not its parent', () => {
    const base = (sub: string) => `
      object Addr {
        city String?${sub}
      }
      model T {
        id Record @id
        code String
        addr Addr
        @@unique(byCity, [code, addr.city], nullsNotDistinct)
      }
    `;

    expect(parseAndValidate(base('')).validationErrors).toHaveLength(1);
    expect(parseAndValidate(base(' @nullable')).validationErrors).toHaveLength(0);
  });

  test('refused on @@index, naming the directive', () => {
    const { parseErrors, validationErrors } = parseAndValidate(
      `model T {${COLUMNS}\n    @@index(byTenant, [tenantId, slug], nullsNotDistinct)\n  }`,
    );

    expect(parseErrors).toHaveLength(0);
    expect(validationErrors).toHaveLength(1);
    expect(validationErrors[0]!.message).toBe(
      '@@index("byTenant") cannot take nullsNotDistinct: it only applies to @@unique.',
    );
  });

  test('@@index without the option is accepted', () => {
    expect(
      parseAndValidate(`model T {${COLUMNS}\n    @@index(byTenant, [tenantId, slug])\n  }`).validationErrors,
    ).toHaveLength(0);
  });
});
