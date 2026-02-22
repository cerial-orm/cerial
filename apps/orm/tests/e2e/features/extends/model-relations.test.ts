import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from '../../../../src/utils/cerial-id';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  RELATION_TABLES,
  testConfig,
  truncateTables,
  uniqueEmail,
  uniqueId,
} from './helpers';

describe('E2E Extends: Relations with Inheritance', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, RELATION_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, RELATION_TABLES);
  });

  describe('author and post (1:N bidirectional)', () => {
    test('create author and post with inherited fields', async () => {
      const email = uniqueEmail('author');
      const author = await client.db.ExtRelBlogAuthor.create({
        data: { name: 'Author', email, bio: 'Writer' },
      });

      expect(author.id).toBeInstanceOf(CerialId);
      expect(author.name).toBe('Author');
      expect(author.email).toBe(email);
      expect(author.bio).toBe('Writer');

      const post = await client.db.ExtRelBlogPost.create({
        data: { title: 'First Post', content: 'Hello', authorId: author.id },
      });

      expect(post.id).toBeInstanceOf(CerialId);
      expect(post.title).toBe('First Post');
      expect(post.content).toBe('Hello');
      expect(post.authorId).toBeInstanceOf(CerialId);
    });

    test('include posts on author', async () => {
      const email = uniqueEmail('inc-author');
      const author = await client.db.ExtRelBlogAuthor.create({
        data: { name: 'IncAuthor', email },
      });

      await client.db.ExtRelBlogPost.create({
        data: { title: 'Post A', authorId: author.id },
      });
      await client.db.ExtRelBlogPost.create({
        data: { title: 'Post B', authorId: author.id },
      });

      const result = await client.db.ExtRelBlogAuthor.findOne({
        where: { id: author.id },
        include: { posts: true },
      });

      expect(result).not.toBeNull();
      expect(result!.name).toBe('IncAuthor');
      expect(result!.posts).toHaveLength(2);
      const titles = result!.posts.map((p) => p.title).sort();
      expect(titles).toEqual(['Post A', 'Post B']);
    });

    test('include author on post', async () => {
      const email = uniqueEmail('inc-post');
      const author = await client.db.ExtRelBlogAuthor.create({
        data: { name: 'PostAuthor', email },
      });

      const post = await client.db.ExtRelBlogPost.create({
        data: { title: 'Inc Post', authorId: author.id },
      });

      const result = await client.db.ExtRelBlogPost.findOne({
        where: { id: post.id },
        include: { author: true },
      });

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Inc Post');
      expect(result!.author.name).toBe('PostAuthor');
      expect(result!.author.email).toBe(email);
    });

    test('nested create post via author', async () => {
      const email = uniqueEmail('nested');
      const author = await client.db.ExtRelBlogAuthor.create({
        data: {
          name: 'NestedAuthor',
          email,
          posts: {
            create: [{ title: 'Nested 1' }, { title: 'Nested 2', content: 'Body' }],
          },
        },
      });

      const withPosts = await client.db.ExtRelBlogAuthor.findOne({
        where: { id: author.id },
        include: { posts: true },
      });

      expect(withPosts).not.toBeNull();
      expect(withPosts!.posts).toHaveLength(2);
    });

    test('include with orderBy on posts', async () => {
      const email = uniqueEmail('ord-posts');
      const author = await client.db.ExtRelBlogAuthor.create({
        data: { name: 'OrdAuthor', email },
      });

      await client.db.ExtRelBlogPost.create({
        data: { title: 'Zebra', authorId: author.id },
      });
      await client.db.ExtRelBlogPost.create({
        data: { title: 'Apple', authorId: author.id },
      });

      const result = await client.db.ExtRelBlogAuthor.findOne({
        where: { id: author.id },
        include: { posts: { orderBy: { title: 'asc' } } },
      });

      expect(result).not.toBeNull();
      expect(result!.posts[0]!.title).toBe('Apple');
      expect(result!.posts[1]!.title).toBe('Zebra');
    });

    test('include with limit on posts', async () => {
      const email = uniqueEmail('lim-posts');
      const author = await client.db.ExtRelBlogAuthor.create({
        data: { name: 'LimAuthor', email },
      });

      for (let i = 0; i < 5; i++) {
        await client.db.ExtRelBlogPost.create({
          data: { title: `Post ${i}`, authorId: author.id },
        });
      }

      const result = await client.db.ExtRelBlogAuthor.findOne({
        where: { id: author.id },
        include: { posts: { limit: 2 } },
      });

      expect(result).not.toBeNull();
      expect(result!.posts).toHaveLength(2);
    });
  });

  describe('optional relation (ExtRelProject)', () => {
    // ExtRelProject extends ExtRelOwner: id, createdAt, updatedAt, name, description?, ownerId?, owner?

    test('create project without owner', async () => {
      const project = await client.db.ExtRelProject.create({
        data: { name: 'No Owner Project' },
      });

      expect(project.id).toBeInstanceOf(CerialId);
      expect(project.name).toBe('No Owner Project');
      expect(project.ownerId).toBeUndefined();
    });

    test('create project with owner', async () => {
      const email = uniqueEmail('owner');
      const author = await client.db.ExtRelBlogAuthor.create({
        data: { name: 'Owner', email },
      });

      const project = await client.db.ExtRelProject.create({
        data: { name: 'Owned Project', ownerId: author.id },
      });

      expect(project.ownerId).toBeInstanceOf(CerialId);
    });

    test('include owner when present', async () => {
      const email = uniqueEmail('inc-owner');
      const author = await client.db.ExtRelBlogAuthor.create({
        data: { name: 'ProjOwner', email },
      });

      const project = await client.db.ExtRelProject.create({
        data: { name: 'WithOwner', ownerId: author.id },
      });

      const result = await client.db.ExtRelProject.findOne({
        where: { id: project.id },
        include: { owner: true },
      });

      expect(result).not.toBeNull();
      expect(result!.owner).toBeDefined();
      expect(result!.owner!.name).toBe('ProjOwner');
    });

    test('include owner when absent', async () => {
      const project = await client.db.ExtRelProject.create({
        data: { name: 'NoOwner' },
      });

      const result = await client.db.ExtRelProject.findOne({
        where: { id: project.id },
        include: { owner: true },
      });

      expect(result).not.toBeNull();
      expect(result!.owner).toBeNull();
    });

    test('connect owner via nested create', async () => {
      const email = uniqueEmail('connect-owner');
      const author = await client.db.ExtRelBlogAuthor.create({
        data: { name: 'ConnOwner', email },
      });

      const project = await client.db.ExtRelProject.create({
        data: {
          name: 'ConnProject',
          owner: { connect: author.id },
        },
      });

      const found = await client.db.ExtRelProject.findOne({
        where: { id: project.id },
        include: { owner: true },
      });

      expect(found).not.toBeNull();
      expect(found!.owner).toBeDefined();
      expect(found!.owner!.name).toBe('ConnOwner');
    });
  });

  describe('omitted relation (ExtRelPostSummary)', () => {
    // ExtRelPostSummary extends ExtRelBlogPost[!author, !authorId]
    // Fields: id, createdAt, updatedAt, title, content?, summary?, wordCount?

    test('create without author relation', async () => {
      const summary = await client.db.ExtRelPostSummary.create({
        data: {
          title: 'Summary Post',
          content: 'Full content',
          summary: 'Short',
          wordCount: 100,
        },
      });

      expect(summary.id).toBeInstanceOf(CerialId);
      expect(summary.title).toBe('Summary Post');
      expect(summary.content).toBe('Full content');
      expect(summary.summary).toBe('Short');
      expect(summary.wordCount).toBe(100);
      // No authorId or author fields
      expect('authorId' in summary).toBe(false);
      expect('author' in summary).toBe(false);
    });

    test('metadata does not contain author fields', () => {
      const metadata = client.db.ExtRelPostSummary.getMetadata();
      const fieldNames = metadata.fields.map((f) => f.name);

      expect(fieldNames).toContain('id');
      expect(fieldNames).toContain('title');
      expect(fieldNames).toContain('content');
      expect(fieldNames).toContain('summary');
      expect(fieldNames).toContain('wordCount');
      expect(fieldNames).not.toContain('authorId');
    });

    test('CRUD on ExtRelPostSummary', async () => {
      const created = await client.db.ExtRelPostSummary.create({
        data: { title: 'CRUD Summary' },
      });

      const found = await client.db.ExtRelPostSummary.findOne({
        where: { id: created.id },
      });
      expect(found).not.toBeNull();
      expect(found!.title).toBe('CRUD Summary');

      const updated = await client.db.ExtRelPostSummary.updateMany({
        where: { id: created.id },
        data: { summary: 'Added summary', wordCount: 50 },
      });
      expect(updated[0]!.summary).toBe('Added summary');
      expect(updated[0]!.wordCount).toBe(50);
    });
  });

  describe('ExtRelPostArchive (omits content, author, authorId)', () => {
    // Fields: id, createdAt, updatedAt, title, archivedAt?, archiveReason?

    test('create with own + inherited fields', async () => {
      const archive = await client.db.ExtRelPostArchive.create({
        data: {
          title: 'Archived Post',
          archiveReason: 'Outdated',
        },
      });

      expect(archive.id).toBeInstanceOf(CerialId);
      expect(archive.title).toBe('Archived Post');
      expect(archive.archiveReason).toBe('Outdated');
      // content, authorId, author omitted
      expect('content' in archive).toBe(false);
      expect('authorId' in archive).toBe(false);
    });

    test('metadata excludes omitted fields', () => {
      const metadata = client.db.ExtRelPostArchive.getMetadata();
      const fieldNames = metadata.fields.map((f) => f.name);

      expect(fieldNames).toContain('title');
      expect(fieldNames).toContain('archivedAt');
      expect(fieldNames).toContain('archiveReason');
      expect(fieldNames).not.toContain('content');
      expect(fieldNames).not.toContain('authorId');
    });
  });

  describe('self-referential relation (ExtRelComment)', () => {
    // ExtRelComment extends ExtRelBase: id, createdAt, updatedAt, content, parentCommentId?, parentComment?

    test('create top-level comment', async () => {
      const comment = await client.db.ExtRelComment.create({
        data: { content: 'Top comment' },
      });

      expect(comment.id).toBeInstanceOf(CerialId);
      expect(comment.content).toBe('Top comment');
      expect(comment.parentCommentId).toBeUndefined();
    });

    test('create reply to comment', async () => {
      const parent = await client.db.ExtRelComment.create({
        data: { content: 'Parent' },
      });

      const reply = await client.db.ExtRelComment.create({
        data: { content: 'Reply', parentCommentId: parent.id },
      });

      expect(reply.parentCommentId).toBeInstanceOf(CerialId);
      expect(reply.parentCommentId!.id).toBe(parent.id.id);
    });

    test('include parentComment', async () => {
      const parent = await client.db.ExtRelComment.create({
        data: { content: 'Parent Comment' },
      });

      const child = await client.db.ExtRelComment.create({
        data: { content: 'Child Comment', parentCommentId: parent.id },
      });

      const result = await client.db.ExtRelComment.findOne({
        where: { id: child.id },
        include: { parentComment: true },
      });

      expect(result).not.toBeNull();
      expect(result!.content).toBe('Child Comment');
      expect(result!.parentComment).toBeDefined();
      expect(result!.parentComment!.content).toBe('Parent Comment');
    });

    test('nested create via parentComment', async () => {
      const comment = await client.db.ExtRelComment.create({
        data: {
          content: 'Reply',
          parentComment: {
            create: { content: 'Auto Parent' },
          },
        },
      });

      const found = await client.db.ExtRelComment.findOne({
        where: { id: comment.id },
        include: { parentComment: true },
      });

      expect(found).not.toBeNull();
      expect(found!.parentComment).not.toBeNull();
      expect(found!.parentComment!.content).toBe('Auto Parent');
    });
  });

  describe('ExtRelCommentModerated (extends with additional relation)', () => {
    // ExtRelCommentModerated extends ExtRelComment + isApproved, approvedBy?, approver?

    test('create moderated comment', async () => {
      const comment = await client.db.ExtRelCommentModerated.create({
        data: { content: 'Moderated comment', isApproved: false },
      });

      expect(comment.id).toBeInstanceOf(CerialId);
      expect(comment.content).toBe('Moderated comment');
      expect(comment.isApproved).toBe(false);
      expect(comment.parentCommentId).toBeUndefined();
      expect(comment.approvedBy).toBeUndefined();
    });

    test('create with approver relation', async () => {
      const email = uniqueEmail('approver');
      const approver = await client.db.ExtRelBlogAuthor.create({
        data: { name: 'Approver', email },
      });

      const comment = await client.db.ExtRelCommentModerated.create({
        data: {
          content: 'Approved comment',
          isApproved: true,
          approvedBy: approver.id,
        },
      });

      expect(comment.isApproved).toBe(true);
      expect(comment.approvedBy).toBeInstanceOf(CerialId);
    });

    test('include approver on moderated comment', async () => {
      const email = uniqueEmail('inc-approver');
      const approver = await client.db.ExtRelBlogAuthor.create({
        data: { name: 'IncApprover', email },
      });

      const comment = await client.db.ExtRelCommentModerated.create({
        data: {
          content: 'To include',
          isApproved: true,
          approvedBy: approver.id,
        },
      });

      const result = await client.db.ExtRelCommentModerated.findOne({
        where: { id: comment.id },
        include: { approver: true },
      });

      expect(result).not.toBeNull();
      expect(result!.approver).toBeDefined();
      expect(result!.approver!.name).toBe('IncApprover');
    });

    test('include both parentComment and approver', async () => {
      const email = uniqueEmail('both-inc');
      const approver = await client.db.ExtRelBlogAuthor.create({
        data: { name: 'BothApprover', email },
      });

      const parentComment = await client.db.ExtRelComment.create({
        data: { content: 'Parent For Mod' },
      });

      const comment = await client.db.ExtRelCommentModerated.create({
        data: {
          content: 'Moderated reply',
          parentCommentId: parentComment.id,
          isApproved: true,
          approvedBy: approver.id,
        },
      });

      const result = await client.db.ExtRelCommentModerated.findOne({
        where: { id: comment.id },
        include: { parentComment: true, approver: true },
      });

      expect(result).not.toBeNull();
      expect(result!.parentComment).not.toBeNull();
      expect(result!.parentComment!.content).toBe('Parent For Mod');
      expect(result!.approver).not.toBeNull();
      expect(result!.approver!.name).toBe('BothApprover');
    });

    test('default isApproved is false', async () => {
      const comment = await client.db.ExtRelCommentModerated.create({
        data: { content: 'Default check' },
      });

      expect(comment.isApproved).toBe(false);
    });
  });

  describe('tag junction model', () => {
    test('create tag and post-tag junction', async () => {
      const tag = await client.db.ExtRelBlogTag.create({
        data: { name: `tag-${uniqueId()}` },
      });

      expect(tag.id).toBeInstanceOf(CerialId);
      expect(tag.name).toBeDefined();

      const email = uniqueEmail('tag-author');
      const author = await client.db.ExtRelBlogAuthor.create({
        data: { name: 'TagAuthor', email },
      });

      const post = await client.db.ExtRelBlogPost.create({
        data: { title: 'Tagged Post', authorId: author.id },
      });

      const postTag = await client.db.ExtRelBlogPostTag.create({
        data: { postId: post.id, tagId: tag.id },
      });

      expect(postTag.id).toBeInstanceOf(CerialId);
    });
  });
});
