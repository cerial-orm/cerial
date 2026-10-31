import { defineSchema } from '../../../../src/schema';
import './cerial/handles';
import { User } from './models/user.schema';

export default defineSchema({ models: [User] });
