/**
 * Type checks for Many-to-Many relation types
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { CerialId } from 'cerial';
import { Test } from 'ts-toolbelt';
import type {
  Blogger,
  BloggerCreateInput,
  BloggerInclude,
  Course,
  CourseCreateInput,
  CourseInclude,
  CourseUpdateInput,
  Label,
  LabelCreate,
  Student,
  StudentCreateInput,
  StudentInclude,
  StudentUpdateInput,
} from '../generated';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// True N-N: Student <-> Course (bidirectional)
// =============================================================================

// Student should have courseIds array
Test.checks([
  Test.check<Student['id'], CerialId, Test.Pass>(),
  Test.check<Student['name'], string, Test.Pass>(),
  Test.check<Student['courseIds'], CerialId[], Test.Pass>(),
]);

// Course should have studentIds array
Test.checks([
  Test.check<Course['id'], CerialId, Test.Pass>(),
  Test.check<Course['name'], string, Test.Pass>(),
  Test.check<Course['studentIds'], CerialId[], Test.Pass>(),
]);

// =============================================================================
// N-N Create Types
// =============================================================================

// StudentCreateInput should allow courses connect array
type StudentWithCoursesConnect = {
  name: string;
  email: string;
  courses: { connect: string[] };
};
Test.checks([Test.check<Extends<StudentWithCoursesConnect, StudentCreateInput>, 1, Test.Pass>()]);

// StudentCreateInput should allow courses create array
type StudentWithCoursesCreate = {
  name: string;
  email: string;
  courses: { create: [{ name: string; code: string }] };
};
Test.checks([Test.check<Extends<StudentWithCoursesCreate, StudentCreateInput>, 1, Test.Pass>()]);

// CourseCreateInput should allow students connect array
type CourseWithStudentsConnect = {
  name: string;
  code: string;
  students: { connect: string[] };
};
Test.checks([Test.check<Extends<CourseWithStudentsConnect, CourseCreateInput>, 1, Test.Pass>()]);

// =============================================================================
// N-N Update Types
// =============================================================================

// StudentUpdateInput should allow courses operations
type StudentAddCourses = { courses: { connect: string[] } };
type StudentRemoveCourses = { courses: { disconnect: string[] } };
type StudentBothOps = { courses: { connect: string[]; disconnect: string[] } };
Test.checks([
  Test.check<Extends<StudentAddCourses, StudentUpdateInput>, 1, Test.Pass>(),
  Test.check<Extends<StudentRemoveCourses, StudentUpdateInput>, 1, Test.Pass>(),
  Test.check<Extends<StudentBothOps, StudentUpdateInput>, 1, Test.Pass>(),
]);

// CourseUpdateInput should allow students operations
type CourseAddStudents = { students: { connect: string[] } };
type CourseRemoveStudents = { students: { disconnect: string[] } };
Test.checks([
  Test.check<Extends<CourseAddStudents, CourseUpdateInput>, 1, Test.Pass>(),
  Test.check<Extends<CourseRemoveStudents, CourseUpdateInput>, 1, Test.Pass>(),
]);

// =============================================================================
// N-N Include Types
// =============================================================================

// StudentInclude should support courses include
type IncludeCourses = { courses: true };
type IncludeCoursesWithOptions = {
  courses: {
    where: { name: { contains: string } };
    limit: number;
  };
};
Test.checks([
  Test.check<Extends<IncludeCourses, StudentInclude>, 1, Test.Pass>(),
  Test.check<Extends<IncludeCoursesWithOptions, StudentInclude>, 1, Test.Pass>(),
]);

// CourseInclude should support students include
type IncludeStudents = { students: true };
Test.checks([Test.check<Extends<IncludeStudents, CourseInclude>, 1, Test.Pass>()]);

// =============================================================================
// One-Directional Many: Blogger -> Label (NOT true n-n)
// =============================================================================

// Blogger should have labelIds array
Test.checks([
  Test.check<Blogger['id'], CerialId, Test.Pass>(),
  Test.check<Blogger['labelIds'], CerialId[], Test.Pass>(),
]);

// Label should NOT have bloggerIds (one-directional)
// Label only has id and name
Test.checks([Test.check<Label['id'], CerialId, Test.Pass>(), Test.check<Label['name'], string, Test.Pass>()]);

// BloggerCreateInput should allow labels connect
type BloggerWithLabelsConnect = {
  name: string;
  labels: { connect: string[] };
};
Test.checks([Test.check<Extends<BloggerWithLabelsConnect, BloggerCreateInput>, 1, Test.Pass>()]);

// BloggerInclude should support labels
type IncludeLabels = { labels: true };
Test.checks([Test.check<Extends<IncludeLabels, BloggerInclude>, 1, Test.Pass>()]);

// LabelCreate should NOT have bloggers field (one-directional)
type LabelBasic = { name: string };
Test.checks([Test.check<Extends<LabelBasic, LabelCreate>, 1, Test.Pass>()]);
