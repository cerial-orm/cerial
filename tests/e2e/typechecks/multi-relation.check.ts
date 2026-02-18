/**
 * Type checks for Multi-Relation types (multiple relations to same model)
 *
 * These relations use @key decorator for disambiguation.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import type { CerialId } from 'cerial';
import { Test } from 'ts-toolbelt';
import type {
  AgentInclude,
  CustomerInclude,
  Document,
  DocumentCreateInput,
  DocumentInclude,
  DocumentUpdateInput,
  Order,
  OrderCreateInput,
  OrderUpdateInput,
  Writer,
  WriterCreateInput,
  WriterInclude,
} from '../generated';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// Multi-Relation: Writer <-> Document (author AND reviewer)
// =============================================================================

// Writer base type
Test.checks([Test.check<Writer['id'], CerialId<string>, Test.Pass>(), Test.check<Writer['name'], string, Test.Pass>()]);

// Document should have authorId (required) and reviewerId (optional)
Test.checks([
  Test.check<Document['id'], CerialId<string>, Test.Pass>(),
  Test.check<Document['title'], string, Test.Pass>(),
  Test.check<Document['authorId'], CerialId<string>, Test.Pass>(),
  Test.check<Extends<Document['reviewerId'], CerialId | null | undefined>, 1, Test.Pass>(),
]);

// =============================================================================
// Multi-Relation Create Types
// =============================================================================

// Document can connect both author and reviewer
type DocumentWithBothRelations = {
  title: string;
  author: { connect: string };
  reviewer: { connect: string };
};
Test.checks([Test.check<Extends<DocumentWithBothRelations, DocumentCreateInput>, 1, Test.Pass>()]);

// Document can create author and connect reviewer
type DocumentMixedOps = {
  title: string;
  author: { create: { name: string } };
  reviewer: { connect: string };
};
Test.checks([Test.check<Extends<DocumentMixedOps, DocumentCreateInput>, 1, Test.Pass>()]);

// Document without reviewer (optional)
type DocumentWithoutReviewer = {
  title: string;
  author: { connect: string };
};
Test.checks([Test.check<Extends<DocumentWithoutReviewer, DocumentCreateInput>, 1, Test.Pass>()]);

// =============================================================================
// Multi-Relation from Reverse Side
// =============================================================================

// Writer can create authored documents
type WriterWithAuthoredDocs = {
  name: string;
  authoredDocs: { create: [{ title: string }] };
};
Test.checks([Test.check<Extends<WriterWithAuthoredDocs, WriterCreateInput>, 1, Test.Pass>()]);

// Writer can connect to reviewed documents
type WriterWithReviewedDocs = {
  name: string;
  reviewedDocs: { connect: string[] };
};
Test.checks([Test.check<Extends<WriterWithReviewedDocs, WriterCreateInput>, 1, Test.Pass>()]);

// Writer can have both authored and reviewed
type WriterWithBothDocTypes = {
  name: string;
  authoredDocs: { connect: string[] };
  reviewedDocs: { connect: string[] };
};
Test.checks([Test.check<Extends<WriterWithBothDocTypes, WriterCreateInput>, 1, Test.Pass>()]);

// =============================================================================
// Multi-Relation Update Types
// =============================================================================

// Document can change author
type DocumentChangeAuthor = { author: { connect: string } };
Test.checks([Test.check<Extends<DocumentChangeAuthor, DocumentUpdateInput>, 1, Test.Pass>()]);

// Document can disconnect reviewer (optional)
type DocumentDisconnectReviewer = { reviewer: { disconnect: true } };
Test.checks([Test.check<Extends<DocumentDisconnectReviewer, DocumentUpdateInput>, 1, Test.Pass>()]);

// =============================================================================
// Multi-Relation Include Types
// =============================================================================

// WriterInclude should support both authoredDocs and reviewedDocs
type IncludeAuthoredDocs = { authoredDocs: true };
type IncludeReviewedDocs = { reviewedDocs: true };
type IncludeBothDocTypes = { authoredDocs: true; reviewedDocs: true };
Test.checks([
  Test.check<Extends<IncludeAuthoredDocs, WriterInclude>, 1, Test.Pass>(),
  Test.check<Extends<IncludeReviewedDocs, WriterInclude>, 1, Test.Pass>(),
  Test.check<Extends<IncludeBothDocTypes, WriterInclude>, 1, Test.Pass>(),
]);

// DocumentInclude should support both author and reviewer
type IncludeAuthor = { author: true };
type IncludeReviewer = { reviewer: true };
type IncludeBothWriters = { author: true; reviewer: true };
Test.checks([
  Test.check<Extends<IncludeAuthor, DocumentInclude>, 1, Test.Pass>(),
  Test.check<Extends<IncludeReviewer, DocumentInclude>, 1, Test.Pass>(),
  Test.check<Extends<IncludeBothWriters, DocumentInclude>, 1, Test.Pass>(),
]);

// =============================================================================
// Mixed Optionality: Order with Customer (required) and Agent (optional)
// =============================================================================

// Order should have customerId (required) and assigneeId (optional)
Test.checks([
  Test.check<Order['id'], CerialId<string>, Test.Pass>(),
  Test.check<Order['orderNumber'], string, Test.Pass>(),
  Test.check<Order['customerId'], CerialId<string>, Test.Pass>(),
  Test.check<Extends<Order['assigneeId'], CerialId | null | undefined>, 1, Test.Pass>(),
]);

// Order must have customer
type OrderWithCustomer = {
  orderNumber: string;
  customer: { connect: string };
};
Test.checks([Test.check<Extends<OrderWithCustomer, OrderCreateInput>, 1, Test.Pass>()]);

// Order with both customer and assignee
type OrderWithBoth = {
  orderNumber: string;
  customer: { connect: string };
  assignee: { connect: string };
};
Test.checks([Test.check<Extends<OrderWithBoth, OrderCreateInput>, 1, Test.Pass>()]);

// Order can disconnect assignee (optional) but not customer (required)
type OrderDisconnectAssignee = { assignee: { disconnect: true } };
Test.checks([Test.check<Extends<OrderDisconnectAssignee, OrderUpdateInput>, 1, Test.Pass>()]);

// Customer and Agent Include
type IncludeOrders = { orders: true };
Test.checks([
  Test.check<Extends<IncludeOrders, CustomerInclude>, 1, Test.Pass>(),
  Test.check<Extends<{ assignedOrders: true }, AgentInclude>, 1, Test.Pass>(),
]);
