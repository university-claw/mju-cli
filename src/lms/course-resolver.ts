import type { ResolvedLmsCredentials } from "../auth/types.js";
import { listRegularTakenCourses } from "./courses.js";
import type { CourseSummary } from "./types.js";
import type { MjuLmsSsoClient } from "./sso-client.js";

export interface CourseReferenceInput {
  course?: string;
  kjkey?: string;
}

export interface ResolvedCourseReference {
  kjkey: string;
  courseTitle?: string;
  courseCode?: string;
  year?: number;
  term?: number;
  termLabel?: string;
  resolvedBy:
    | "kjkey"
    | "course-kjkey"
    | "course-title-latest"
    | "course-code-latest"
    | "course-search-latest"
    | "course-title-all-terms"
    | "course-code-all-terms"
    | "course-search-all-terms";
}

interface CourseSelection {
  course?: CourseSummary;
  resolvedBy?: ResolvedCourseReference["resolvedBy"];
  ambiguousCandidates?: CourseSummary[];
  ambiguousReason?: string;
}

function normalizeLookupValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[\[\](){}\-_.]/g, "");
}

function looksLikeKjkey(value: string): boolean {
  return /^[A-Za-z0-9]{12,}$/.test(value);
}

function formatCourseCandidates(candidates: CourseSummary[]): string {
  return candidates
    .slice(0, 5)
    .map(
      (course) =>
        `- ${course.termLabel} | ${course.title} | ${course.courseCode} | ${course.professor} | ${course.kjkey}`
    )
    .join("\n");
}

function createAmbiguousCourseError(
  query: string,
  candidates: CourseSummary[],
  reason: string
): Error {
  return new Error(
    [
      `강의 식별자 "${query}" 로 여러 강의가 검색되었습니다. ${reason}`,
      "더 구체적인 강의명이나 KJKEY를 사용해주세요.",
      "",
      formatCourseCandidates(candidates)
    ].join("\n")
  );
}

function createNotFoundCourseError(query: string): Error {
  return new Error(
    [
      `강의 식별자 "${query}" 에 해당하는 강의를 찾지 못했습니다.`,
      "강의명을 더 정확히 입력하거나 KJKEY를 직접 사용해주세요."
    ].join("\n")
  );
}

function pickCourseFromCandidates(
  query: string,
  candidates: CourseSummary[],
  scope: "latest" | "all-terms"
): CourseSelection {
  if (candidates.length === 0) {
    return {};
  }

  const normalizedQuery = normalizeLookupValue(query);
  const exactTitleMatches = candidates.filter(
    (course) => normalizeLookupValue(course.title) === normalizedQuery
  );
  if (exactTitleMatches.length === 1) {
    return {
      course: exactTitleMatches[0],
      resolvedBy: scope === "latest" ? "course-title-latest" : "course-title-all-terms"
    };
  }
  if (exactTitleMatches.length > 1) {
    return {
      ambiguousCandidates: exactTitleMatches,
      ambiguousReason: "같은 강의명이 여러 개 있습니다."
    };
  }

  const exactCourseCodeMatches = candidates.filter(
    (course) => normalizeLookupValue(course.courseCode) === normalizedQuery
  );
  if (exactCourseCodeMatches.length === 1) {
    return {
      course: exactCourseCodeMatches[0],
      resolvedBy: scope === "latest" ? "course-code-latest" : "course-code-all-terms"
    };
  }
  if (exactCourseCodeMatches.length > 1) {
    return {
      ambiguousCandidates: exactCourseCodeMatches,
      ambiguousReason: "같은 과목코드에 해당하는 강의가 여러 개 있습니다."
    };
  }

  if (candidates.length === 1) {
    return {
      course: candidates[0],
      resolvedBy: scope === "latest" ? "course-search-latest" : "course-search-all-terms"
    };
  }

  return {
    ambiguousCandidates: candidates,
    ambiguousReason: "검색 결과가 여러 개 남았습니다."
  };
}

function toResolvedCourseReference(
  course: CourseSummary,
  resolvedBy: NonNullable<CourseSelection["resolvedBy"]>
): ResolvedCourseReference {
  return {
    kjkey: course.kjkey,
    courseTitle: course.title,
    courseCode: course.courseCode,
    year: course.year,
    term: course.term,
    termLabel: course.termLabel,
    resolvedBy
  };
}

export async function resolveCourseReference(
  client: MjuLmsSsoClient,
  credentials: ResolvedLmsCredentials,
  input: CourseReferenceInput
): Promise<ResolvedCourseReference> {
  const kjkey = input.kjkey?.trim();
  const course = input.course?.trim();

  if (kjkey && course) {
    throw new Error("--kjkey 와 --course 는 동시에 사용할 수 없습니다.");
  }

  if (kjkey) {
    return {
      kjkey,
      resolvedBy: "kjkey"
    };
  }

  if (!course) {
    throw new Error("강의 식별자가 없습니다. --course 또는 --kjkey 중 하나를 입력해주세요.");
  }

  if (looksLikeKjkey(course)) {
    return {
      kjkey: course,
      resolvedBy: "course-kjkey"
    };
  }

  const latestTermResult = await listRegularTakenCourses(client, {
    userId: credentials.userId,
    password: credentials.password,
    search: course
  });
  const latestSelection = pickCourseFromCandidates(
    course,
    latestTermResult.courses,
    "latest"
  );

  if (latestSelection.course && latestSelection.resolvedBy) {
    return toResolvedCourseReference(latestSelection.course, latestSelection.resolvedBy);
  }

  if (latestSelection.ambiguousCandidates) {
    throw createAmbiguousCourseError(
      course,
      latestSelection.ambiguousCandidates,
      latestSelection.ambiguousReason ?? "후보를 하나로 좁히지 못했습니다."
    );
  }

  const allTermsResult = await listRegularTakenCourses(client, {
    userId: credentials.userId,
    password: credentials.password,
    search: course,
    allTerms: true
  });
  const allTermsSelection = pickCourseFromCandidates(
    course,
    allTermsResult.courses,
    "all-terms"
  );

  if (allTermsSelection.course && allTermsSelection.resolvedBy) {
    return toResolvedCourseReference(allTermsSelection.course, allTermsSelection.resolvedBy);
  }

  if (allTermsSelection.ambiguousCandidates) {
    throw createAmbiguousCourseError(
      course,
      allTermsSelection.ambiguousCandidates,
      allTermsSelection.ambiguousReason ?? "후보를 하나로 좁히지 못했습니다."
    );
  }

  throw createNotFoundCourseError(course);
}
