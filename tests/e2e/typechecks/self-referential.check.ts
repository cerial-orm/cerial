/**
 * Type checks for Self-Referential relation types
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { Test } from 'ts-toolbelt';
import type {
  Person,
  PersonCreate,
  PersonCreateInput,
  PersonUpdateInput,
  PersonInclude,
  EmployeeWithReports,
  EmployeeWithReportsCreate,
  EmployeeWithReportsCreateInput,
  EmployeeWithReportsUpdateInput,
  EmployeeWithReportsInclude,
  Assistant,
  AssistantCreate,
  AssistantCreateInput,
  AssistantUpdateInput,
  AssistantInclude,
  Friend,
  FriendCreate,
  FriendCreateInput,
  FriendUpdateInput,
  FriendInclude,
  CategoryTree,
  CategoryTreeCreate,
  CategoryTreeCreateInput,
  CategoryTreeUpdateInput,
  CategoryTreeInclude,
} from '../generated';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// Self-Ref 1-1: Person with mentor (single-sided)
// =============================================================================

// Person should have optional mentorId
Test.checks([
  Test.check<Person['id'], string, Test.Pass>(),
  Test.check<Person['name'], string, Test.Pass>(),
  Test.check<Extends<Person['mentorId'], string | null | undefined>, 1, Test.Pass>(),
]);

// Person can connect to mentor
type PersonWithMentor = { name: string; mentor: { connect: string } };
Test.checks([Test.check<Extends<PersonWithMentor, PersonCreateInput>, 1, Test.Pass>()]);

// Person can disconnect mentor
type PersonDisconnectMentor = { mentor: { disconnect: true } };
Test.checks([Test.check<Extends<PersonDisconnectMentor, PersonUpdateInput>, 1, Test.Pass>()]);

// PersonInclude should support mentor
type IncludeMentor = { mentor: true };
Test.checks([Test.check<Extends<IncludeMentor, PersonInclude>, 1, Test.Pass>()]);

// =============================================================================
// Self-Ref 1-n with Reverse: EmployeeWithReports (manager/directReports)
// =============================================================================

// EmployeeWithReports should have optional managerId
Test.checks([
  Test.check<EmployeeWithReports['id'], string, Test.Pass>(),
  Test.check<EmployeeWithReports['name'], string, Test.Pass>(),
  Test.check<Extends<EmployeeWithReports['managerId'], string | null | undefined>, 1, Test.Pass>(),
]);

// EmployeeWithReports can connect to manager
type EmployeeWithManager = { name: string; manager: { connect: string } };
Test.checks([Test.check<Extends<EmployeeWithManager, EmployeeWithReportsCreateInput>, 1, Test.Pass>()]);

// EmployeeWithReports can create with direct reports
type EmployeeWithDirectReports = {
  name: string;
  directReports: { create: [{ name: string }] };
};
Test.checks([Test.check<Extends<EmployeeWithDirectReports, EmployeeWithReportsCreateInput>, 1, Test.Pass>()]);

// EmployeeWithReportsInclude should support both manager and directReports
type IncludeManager = { manager: true };
type IncludeDirectReports = { directReports: true };
type IncludeBoth = { manager: true; directReports: true };
Test.checks([
  Test.check<Extends<IncludeManager, EmployeeWithReportsInclude>, 1, Test.Pass>(),
  Test.check<Extends<IncludeDirectReports, EmployeeWithReportsInclude>, 1, Test.Pass>(),
  Test.check<Extends<IncludeBoth, EmployeeWithReportsInclude>, 1, Test.Pass>(),
]);

// =============================================================================
// Self-Ref 1-1 with Reverse: Assistant (assists/assistedBy with @key)
// =============================================================================

// Assistant should have optional assistsId
Test.checks([
  Test.check<Assistant['id'], string, Test.Pass>(),
  Test.check<Assistant['name'], string, Test.Pass>(),
  Test.check<Extends<Assistant['assistsId'], string | null | undefined>, 1, Test.Pass>(),
]);

// Assistant can connect to assists
type AssistantWithAssists = { name: string; assists: { connect: string } };
Test.checks([Test.check<Extends<AssistantWithAssists, AssistantCreateInput>, 1, Test.Pass>()]);

// AssistantInclude should support both assists and assistedBy
type IncludeAssists = { assists: true };
type IncludeAssistedBy = { assistedBy: true };
Test.checks([
  Test.check<Extends<IncludeAssists, AssistantInclude>, 1, Test.Pass>(),
  Test.check<Extends<IncludeAssistedBy, AssistantInclude>, 1, Test.Pass>(),
]);

// =============================================================================
// Self-Ref n-n Symmetric: Friend (friends pattern)
// =============================================================================

// Friend should have friendIds array
Test.checks([
  Test.check<Friend['id'], string, Test.Pass>(),
  Test.check<Friend['name'], string, Test.Pass>(),
  Test.check<Friend['friendIds'], string[], Test.Pass>(),
]);

// Friend can connect to friends
type FriendWithFriends = { name: string; friends: { connect: string[] } };
Test.checks([Test.check<Extends<FriendWithFriends, FriendCreateInput>, 1, Test.Pass>()]);

// Friend can update friends
type FriendAddFriends = { friends: { connect: string[] } };
type FriendRemoveFriends = { friends: { disconnect: string[] } };
Test.checks([
  Test.check<Extends<FriendAddFriends, FriendUpdateInput>, 1, Test.Pass>(),
  Test.check<Extends<FriendRemoveFriends, FriendUpdateInput>, 1, Test.Pass>(),
]);

// FriendInclude should support friends
type IncludeFriends = { friends: true };
Test.checks([Test.check<Extends<IncludeFriends, FriendInclude>, 1, Test.Pass>()]);

// =============================================================================
// Self-Ref Tree: CategoryTree (parent/children with @key)
// =============================================================================

// CategoryTree should have optional parentId
Test.checks([
  Test.check<CategoryTree['id'], string, Test.Pass>(),
  Test.check<CategoryTree['name'], string, Test.Pass>(),
  Test.check<Extends<CategoryTree['parentId'], string | null | undefined>, 1, Test.Pass>(),
]);

// CategoryTree can connect to parent
type CategoryWithParent = { name: string; parent: { connect: string } };
Test.checks([Test.check<Extends<CategoryWithParent, CategoryTreeCreateInput>, 1, Test.Pass>()]);

// CategoryTree can create children
type CategoryWithChildren = { name: string; children: { create: [{ name: string }] } };
Test.checks([Test.check<Extends<CategoryWithChildren, CategoryTreeCreateInput>, 1, Test.Pass>()]);

// CategoryTreeInclude should support both parent and children
type IncludeParent = { parent: true };
type IncludeChildren = { children: true };
type IncludeTreeBoth = { parent: true; children: true };
Test.checks([
  Test.check<Extends<IncludeParent, CategoryTreeInclude>, 1, Test.Pass>(),
  Test.check<Extends<IncludeChildren, CategoryTreeInclude>, 1, Test.Pass>(),
  Test.check<Extends<IncludeTreeBoth, CategoryTreeInclude>, 1, Test.Pass>(),
]);

// Nested include for tree traversal
type IncludeNestedTree = {
  children: {
    include: { children: true };
  };
};
Test.checks([Test.check<Extends<IncludeNestedTree, CategoryTreeInclude>, 1, Test.Pass>()]);
