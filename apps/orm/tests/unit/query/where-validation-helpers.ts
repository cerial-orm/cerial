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
  loose Geo @flexible
}

tuple Spot {
  label String,
  Geo
}

tuple Pair {
  first Int,
  second Int
}

model Owner {
  id Record @id
  name String
  places Relation[] @model(Place)
}

model Place {
  id Record @id
  name String
  ownerId Record
  owner Relation @field(ownerId) @model(Owner)
  address Addr
  open Addr @flexible
  stops Addr[]
  openStops Addr[] @flexible
  spot Spot
  pairs Pair[]
  @@unique(nameCity, [name, address.city])
}
`;

const { ast } = parse(schema);
const models = convertModels(ast.models);
const objects = convertObjects(ast.objects);
const tuples = convertTuples(ast.tuples);
resolveObjectFields(models, objects, createObjectRegistry(objects), createTupleRegistry(tuples));

const registry = createRegistry(models);

export const place = registry.Place!;
export const owner = registry.Owner!;
export const placeRegistry = registry;
