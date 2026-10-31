import { defineSchema } from '../../../../../src/schema';
import { Post } from './models/post.schema';
import { Tag } from './models/tag.schema';
import { User } from './models/user.schema';

export default defineSchema({ models: [User, Post, Tag] });
