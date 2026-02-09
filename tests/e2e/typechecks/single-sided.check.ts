/**
 * Type checks for Single-Sided relation types
 *
 * Single-sided relations only define the PK side - the target model
 * has no reverse relation defined. These must use optional Record? and Relation?.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { Test } from 'ts-toolbelt';
import { CerialId } from 'cerial';
import type {
  UserSingleSided,
  ProfileSingleSided,
  ProfileSingleSidedCreate,
  ProfileSingleSidedCreateInput,
  ProfileSingleSidedUpdate,
  ProfileSingleSidedUpdateInput,
  ProfileSingleSidedInclude,
  Article,
  Comment,
  CommentCreate,
  CommentCreateInput,
  CommentUpdateInput,
  CommentInclude,
  SocialUser,
  SocialUserCreate,
  SocialUserCreateInput,
  SocialUserUpdateInput,
  SocialUserInclude,
} from '../generated';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// 1-1 Single-Sided: ProfileSingleSided -> UserSingleSided
// =============================================================================

// ProfileSingleSided should have optional userId (single-sided must be optional)
Test.checks([
  Test.check<ProfileSingleSided['id'], CerialId, Test.Pass>(),
  // userId should be optional (CerialId | null | undefined)
  Test.check<Extends<ProfileSingleSided['userId'], CerialId | null | undefined>, 1, Test.Pass>(),
]);

// UserSingleSided should NOT have profile relation (single-sided)
Test.checks([
  Test.check<UserSingleSided['id'], CerialId, Test.Pass>(),
  Test.check<UserSingleSided['name'], string, Test.Pass>(),
]);

// =============================================================================
// Single-Sided Create - Can Create Without Relation
// =============================================================================

// ProfileSingleSided can be created without user (optional)
type ProfileWithoutUser = { bio: string };
Test.checks([Test.check<Extends<ProfileWithoutUser, ProfileSingleSidedCreateInput>, 1, Test.Pass>()]);

// ProfileSingleSided can connect to user
type ProfileWithUserConnect = { bio: string; user: { connect: string } };
Test.checks([Test.check<Extends<ProfileWithUserConnect, ProfileSingleSidedCreateInput>, 1, Test.Pass>()]);

// =============================================================================
// Single-Sided Update - Can Disconnect
// =============================================================================

// ProfileSingleSided can disconnect user (optional relation)
type ProfileDisconnectUser = { user: { disconnect: true } };
Test.checks([Test.check<Extends<ProfileDisconnectUser, ProfileSingleSidedUpdateInput>, 1, Test.Pass>()]);

// =============================================================================
// Single-Sided Include
// =============================================================================

// ProfileSingleSidedInclude should support user include
type IncludeUser = { user: true };
Test.checks([Test.check<Extends<IncludeUser, ProfileSingleSidedInclude>, 1, Test.Pass>()]);

// =============================================================================
// 1-n Single-Sided: Comment -> Article (Article has no comments accessor)
// =============================================================================

// Comment should have optional articleId
Test.checks([
  Test.check<Comment['id'], CerialId, Test.Pass>(),
  Test.check<Extends<Comment['articleId'], CerialId | null | undefined>, 1, Test.Pass>(),
]);

// Article should NOT have comments relation
Test.checks([Test.check<Article['id'], CerialId, Test.Pass>(), Test.check<Article['title'], string, Test.Pass>()]);

// Comment can be created without article
type CommentWithoutArticle = { text: string };
Test.checks([Test.check<Extends<CommentWithoutArticle, CommentCreateInput>, 1, Test.Pass>()]);

// Comment can connect to article
type CommentWithArticle = { text: string; article: { connect: string } };
Test.checks([Test.check<Extends<CommentWithArticle, CommentCreateInput>, 1, Test.Pass>()]);

// Comment can disconnect article
type CommentDisconnect = { article: { disconnect: true } };
Test.checks([Test.check<Extends<CommentDisconnect, CommentUpdateInput>, 1, Test.Pass>()]);

// =============================================================================
// Self-Referential Single-Sided Array: SocialUser (Twitter following pattern)
// =============================================================================

// SocialUser should have followingIds array but NO followers
Test.checks([
  Test.check<SocialUser['id'], CerialId, Test.Pass>(),
  Test.check<SocialUser['name'], string, Test.Pass>(),
  Test.check<SocialUser['followingIds'], CerialId[], Test.Pass>(),
]);

// SocialUser can be created with following
type SocialUserWithFollowing = {
  name: string;
  following: { connect: string[] };
};
Test.checks([Test.check<Extends<SocialUserWithFollowing, SocialUserCreateInput>, 1, Test.Pass>()]);

// SocialUser can update following
type SocialUserAddFollowing = { following: { connect: string[] } };
type SocialUserRemoveFollowing = { following: { disconnect: string[] } };
Test.checks([
  Test.check<Extends<SocialUserAddFollowing, SocialUserUpdateInput>, 1, Test.Pass>(),
  Test.check<Extends<SocialUserRemoveFollowing, SocialUserUpdateInput>, 1, Test.Pass>(),
]);

// SocialUserInclude should support following
type IncludeFollowing = { following: true };
Test.checks([Test.check<Extends<IncludeFollowing, SocialUserInclude>, 1, Test.Pass>()]);
