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
model User {
  id Record @id
  name String
  posts Relation[] @model(Post)
}

model Post {
  id Record @id
  title String
  authorId Record
  author Relation @field(authorId) @model(User)
  comments Relation[] @model(Comment)
  tagIds Record[]
  tags Relation[] @field(tagIds) @model(Tag)
}

model Comment {
  id Record @id
  text String
  postId Record
  post Relation @field(postId) @model(Post)
}

model Tag {
  id Record @id
  label String
  postIds Record[]
  posts Relation[] @field(postIds) @model(Post)
}
`;

const { ast } = parse(schema);
const models = convertModels(ast.models);
const objects = convertObjects(ast.objects);
const tuples = convertTuples(ast.tuples);
resolveObjectFields(models, objects, createObjectRegistry(objects), createTupleRegistry(tuples));

export const bodyRegistry = createRegistry(models);
