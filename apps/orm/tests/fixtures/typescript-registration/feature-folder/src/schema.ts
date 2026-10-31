import { defineSchema } from '../../../../../src/schema';
import { Post } from './posts/post';
import { User } from './users/user';

export default defineSchema({ models: [User, Post] });
