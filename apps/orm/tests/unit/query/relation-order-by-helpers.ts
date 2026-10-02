import {
  convertModels,
  convertObjects,
  convertTuples,
  createTupleRegistry,
  resolveObjectFields,
} from '../../../src/generators/metadata';
import { createObjectRegistry, createRegistry } from '../../../src/generators/metadata/registry-generator';
import { parse } from '../../../src/parser/parser';

const schema = `
object Addr {
  city String
}

model Country {
  id Record @id
  name String
  authors Relation[] @model(Author)
}

model Author {
  id Record @id
  name String
  address Addr
  countryId Record?
  country Relation? @field(countryId) @model(Country)
  posts Relation[] @model(Post)
}

model Post {
  id Record @id
  title String
  address Addr
  authorId Record
  author Relation @field(authorId) @model(Author)
  editorIds Record[]
  editors Relation[] @field(editorIds) @model(Author) @key(editing)
}
`;

const { ast } = parse(schema);
const models = convertModels(ast.models);
const objects = convertObjects(ast.objects);
const tuples = convertTuples(ast.tuples);
resolveObjectFields(models, objects, createObjectRegistry(objects), createTupleRegistry(tuples));

export const registry = createRegistry(models);
export const post = registry.Post!;
export const author = registry.Author!;
export const country = registry.Country!;
