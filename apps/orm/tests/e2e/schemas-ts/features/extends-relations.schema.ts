import { f, model } from '../../../../src/schema';

export const ExtRelBase = model(
  'ExtRelBase',
  {
    id: f.record().id().private(),
    createdAt: f.date().createdAt().private(),
    updatedAt: f.date().updatedAt(),
  },
  { abstract: true },
);

export const ExtRelAuthor = model(
  'ExtRelAuthor',
  {
    name: f.string(),
    email: f.email().unique(),
  },
  { abstract: true, extends: ExtRelBase },
);

export const ExtRelBlogAuthor = model(
  'ExtRelBlogAuthor',
  {
    bio: f.string().optional(),
    posts: f.reverse('ExtRelBlogPost').array(),
  },
  { extends: ExtRelAuthor },
);

export const ExtRelBaseBlogPost = model(
  'ExtRelBaseBlogPost',
  {
    title: f.string(),
    body: f.string().optional(),
    authorId: f.record(),
    author: f.relation('ExtRelBlogAuthor').field('authorId'),
  },
  { abstract: true, extends: ExtRelBase },
);

export const ExtRelBlogPost = model('ExtRelBlogPost', {}, { extends: ExtRelBaseBlogPost });

export const ExtRelOwner = model('ExtRelOwner', { name: f.string() }, { abstract: true, extends: ExtRelBase });

export const ExtRelProject = model(
  'ExtRelProject',
  {
    description: f.string().optional(),
    ownerId: f.record().optional(),
    owner: f.relation('ExtRelBlogAuthor').optional().field('ownerId'),
  },
  { extends: ExtRelOwner },
);

export const ExtRelTag = model('ExtRelTag', { name: f.string().unique() }, { abstract: true, extends: ExtRelBase });

export const ExtRelBlogTag = model(
  'ExtRelBlogTag',
  { postTags: f.reverse('ExtRelBlogPostTag').array() },
  { extends: ExtRelTag },
);

export const ExtRelBlogPostTag = model('ExtRelBlogPostTag', {
  id: f.record().id(),
  postId: f.record().optional(),
  post: f.relation('ExtRelBlogPost').optional().field('postId'),
  tagId: f.record(),
  tag: f.relation('ExtRelBlogTag').field('tagId'),
});

export const ExtRelPostSummary = model(
  'ExtRelPostSummary',
  {
    summary: f.string().optional(),
    wordCount: f.int().optional(),
  },
  { extends: ExtRelBaseBlogPost.omit('author', 'authorId') },
);

export const ExtRelPostArchive = model(
  'ExtRelPostArchive',
  {
    archivedAt: f.date().createdAt(),
    archiveReason: f.string().optional(),
  },
  { extends: ExtRelBaseBlogPost.omit('body', 'author', 'authorId') },
);

export const ExtRelBaseComment = model(
  'ExtRelBaseComment',
  {
    body: f.string(),
    parentCommentId: f.record().optional(),
    parentComment: f.relation('ExtRelComment').optional().field('parentCommentId'),
  },
  { abstract: true, extends: ExtRelBase },
);

export const ExtRelComment = model('ExtRelComment', {}, { extends: ExtRelBaseComment });

export const ExtRelCommentModerated = model(
  'ExtRelCommentModerated',
  {
    isApproved: f.bool().default(false),
    approvedBy: f.record().optional(),
    approver: f.relation('ExtRelBlogAuthor').optional().field('approvedBy'),
  },
  { extends: ExtRelBaseComment },
);
