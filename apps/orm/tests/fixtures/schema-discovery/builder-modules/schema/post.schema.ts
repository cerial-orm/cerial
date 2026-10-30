import { enum as enumeration, f, literalField, model } from '../../../../../src/parser/builder';

export const Status = enumeration('Status', ['DRAFT', 'LIVE']);

const Post = model('Post', { id: f.record().id(), title: f.string(), status: literalField('Status') });

export default Post;
