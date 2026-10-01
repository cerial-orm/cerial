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
object Geo {
  lat Float
  lng Float
}

object Addr {
  city String
  geo Geo
}

tuple Spot {
  label String,
  Geo
}

model Author {
  id Record @id
  name String
  posts Relation[] @model(Post)
}

model Post {
  id Record @id
  title String
  accessedAt Date @now
  address Addr
  loose Addr @flexible
  spot Spot
  authorId Record
  author Relation @field(authorId) @model(Author)

  @@unique(titleAuthor, [title, authorId])
}
`;

const { ast } = parse(schema);
const models = convertModels(ast.models);
const objects = convertObjects(ast.objects);
const tuples = convertTuples(ast.tuples);
resolveObjectFields(models, objects, createObjectRegistry(objects), createTupleRegistry(tuples));

export const registry = createRegistry(models);
export const post = registry.Post!;
