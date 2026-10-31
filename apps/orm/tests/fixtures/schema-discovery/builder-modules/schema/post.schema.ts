import { enum as enumeration, f, model } from '../../../../../src/parser/builder';

export const Status = enumeration('Status', ['DRAFT', 'LIVE']);

const Post = model('Post', { id: f.record().id(), title: f.string(), status: f.enum('Status') });

export default Post;
