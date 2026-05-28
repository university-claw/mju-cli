import assert from "node:assert/strict";
import { test } from "node:test";

import { createSafetyCommand } from "../dist/commands/safety.js";
import {
  calculateNeededSafetyEducationCourseCount,
  chooseSafetyEducationCourses,
  chooseIncompleteSafetyEducationCourse,
  parseSafetyEducationCompletionRows,
  parseSafetyEducationProgressStatus,
  parseSafetyEducationSelectionStatus
} from "../dist/safety/education.js";

const modalTextFixture = `
성명 김준현 (00000000) 소속 테스트학부 과목선택 현황 2 / 6
안전교육은 재수강할 수 있습니다.
`;

const progressTextFixture = `
안전교육 수강 현황

교육진행상태 > 과목선택

언어 선택 후 선택과목을 설정하세요.
`;

const coursesFixture = [
  {
    index: 0,
    name: "scheduleContentList[0].ContentNo",
    value: "40050",
    title: "[소방] 소방 안전 기본 이론",
    checked: true,
    disabled: true
  },
  {
    index: 1,
    name: "scheduleContentList[1].ContentNo",
    value: "40051",
    title: "[소방] 소화 설비의 종류 및 사용법",
    checked: true,
    disabled: true
  },
  {
    index: 2,
    name: "scheduleContentList[2].ContentNo",
    value: "40001",
    title: "[안전의식] 안전사고는 왜 일어나는가",
    checked: false,
    disabled: false
  },
  {
    index: 3,
    name: "scheduleContentList[3].ContentNo",
    value: "40002",
    title: "[안전의식] 안전과 인간공학",
    checked: false,
    disabled: false
  },
  {
    index: 4,
    name: "scheduleContentList[4].ContentNo",
    value: "40003",
    title: "[안전의식] 기본 실험 안전 수칙",
    checked: false,
    disabled: false
  }
];

test("parseSafetyEducationSelectionStatus extracts selected and required hours", () => {
  assert.deepEqual(parseSafetyEducationSelectionStatus(modalTextFixture), {
    selected: 2,
    required: 6,
    raw: "2 / 6"
  });
});

test("parseSafetyEducationProgressStatus extracts current education status", () => {
  assert.equal(parseSafetyEducationProgressStatus(progressTextFixture), "과목선택");
});

test("calculateNeededSafetyEducationCourseCount converts missing hours to course count", () => {
  assert.equal(
    calculateNeededSafetyEducationCourseCount({
      selected: 2,
      required: 6,
      raw: "2 / 6"
    }),
    8
  );
});

test("chooseSafetyEducationCourses picks enabled unchecked courses from top", () => {
  assert.deepEqual(chooseSafetyEducationCourses(coursesFixture, 2), [
    {
      index: 2,
      value: "40001",
      title: "[안전의식] 안전사고는 왜 일어나는가"
    },
    {
      index: 3,
      value: "40002",
      title: "[안전의식] 안전과 인간공학"
    }
  ]);
});

test("parseSafetyEducationCompletionRows detects completed and incomplete videos", () => {
  assert.deepEqual(
    parseSafetyEducationCompletionRows([
      ["1", "[소방] 소방 안전 기본 이론", "27", "0.5", "필수", "-", "수강(2026.04.14)"],
      ["2", "[안전의식] 안전사고는 왜 일어나는가", "26", "0.5", "선택", "변경", "수강하기"],
      ["과정구성", "총 6시간"]
    ]),
    [
      {
        rowNumber: 1,
        title: "[소방] 소방 안전 기본 이론",
        durationMinutes: 27,
        recognizedHours: 0.5,
        category: "필수",
        changeAction: "-",
        statusText: "수강(2026.04.14)",
        actionText: "1 [소방] 소방 안전 기본 이론 27 0.5 필수 - 수강(2026.04.14)",
        completed: true
      },
      {
        rowNumber: 2,
        title: "[안전의식] 안전사고는 왜 일어나는가",
        durationMinutes: 26,
        recognizedHours: 0.5,
        category: "선택",
        changeAction: "변경",
        statusText: "수강하기",
        actionText: "2 [안전의식] 안전사고는 왜 일어나는가 26 0.5 선택 변경 수강하기",
        completed: false
      }
    ]
  );
});

test("chooseIncompleteSafetyEducationCourse only targets incomplete videos", () => {
  const rows = parseSafetyEducationCompletionRows([
    ["1", "[소방] 소방 안전 기본 이론", "27", "0.5", "필수", "-", "수강(2026.04.14)"],
    ["2", "[안전의식] 안전사고는 왜 일어나는가", "26", "0.5", "선택", "변경", "수강하기"],
    ["3", "[안전관리] 연구실 지진 대응 매뉴얼", "28", "0.5", "선택", "변경", "수강하기"]
  ]);

  assert.equal(chooseIncompleteSafetyEducationCourse(rows)?.rowNumber, 2);
  assert.equal(chooseIncompleteSafetyEducationCourse(rows, 3)?.rowNumber, 3);
  assert.equal(chooseIncompleteSafetyEducationCourse(rows, 1), null);
});

test("createSafetyCommand exposes education select-courses command", () => {
  const command = createSafetyCommand(() => ({ format: "json" }));
  const education = command.commands.find((child) => child.name() === "education");
  const selectCourses = education?.commands.find(
    (child) => child.name() === "select-courses"
  );

  assert.ok(selectCourses);
  assert.deepEqual(
    selectCourses.options.map((option) => option.long),
    ["--dry-run", "--show-browser"]
  );
});

test("createSafetyCommand exposes education check-completion command", () => {
  const command = createSafetyCommand(() => ({ format: "json" }));
  const education = command.commands.find((child) => child.name() === "education");
  const checkCompletion = education?.commands.find(
    (child) => child.name() === "check-completion"
  );

  assert.ok(checkCompletion);
  assert.deepEqual(
    checkCompletion.options.map((option) => option.long),
    ["--show-browser"]
  );
});

test("createSafetyCommand exposes education run-incomplete-video command", () => {
  const command = createSafetyCommand(() => ({ format: "json" }));
  const education = command.commands.find((child) => child.name() === "education");
  const runIncompleteVideoLog = education?.commands.find(
    (child) => child.name() === "run-incomplete-video"
  );

  assert.ok(runIncompleteVideoLog);
  assert.deepEqual(
    runIncompleteVideoLog.options.map((option) => option.long),
    ["--row", "--show-browser"]
  );
});

test("createSafetyCommand exposes education run-incomplete-videos command", () => {
  const command = createSafetyCommand(() => ({ format: "json" }));
  const education = command.commands.find((child) => child.name() === "education");
  const runIncompleteVideoLogs = education?.commands.find(
    (child) => child.name() === "run-incomplete-videos"
  );

  assert.ok(runIncompleteVideoLogs);
  assert.deepEqual(
    runIncompleteVideoLogs.options.map((option) => option.long),
    ["--show-browser"]
  );
});
