import { defineSchema } from '../../../../../src/schema';
import { Shared } from '../schemas/shared.schema';
import { Registered } from './registered';

export default defineSchema({ models: [Registered, Shared] });
