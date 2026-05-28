import assert from "node:assert/strict";
import { test } from "node:test";

import { createLmsCommand } from "../dist/commands/lms.js";
import { buildOnlineInsights } from "../dist/lms/online-insights.js";

const transcriptFixture = {
  kjkey: "A20261TEST",
  courseTitle: "테스트 강의",
  lectureWeeks: 10102111,
  title: "1주차",
  selectedItem: {
    linkSeq: 1,
    title: "시스템 보안 실습",
    learningTime: "25:00",
    attendanceStatus: "incomplete",
    isCompleted: false
  },
  resolvedItemIndex: 0,
  resolvedBy: "linkSeq",
  summary: {
    title: "ASTRA 서포터즈",
    markdown: `### 요약
- Docker Compose 실습 환경을 구성하고 컨테이너 실행 결과를 확인합니다.
- 보고서를 작성해서 제출해야 합니다.
- 과제 마감 기한 전에 결과 문서를 업로드합니다.
- CGI 약자와 서버 구조 개념을 꼭 기억해야 합니다.`
  },
  tracks: [
    {
      kind: "subtitles",
      language: "KO",
      label: "한국어 (자동 생성)",
      url: "https://lms.mju.ac.kr/sample.vtt"
    }
  ],
  selectedTrack: {
    kind: "subtitles",
    language: "KO",
    label: "한국어 (자동 생성)",
    url: "https://lms.mju.ac.kr/sample.vtt"
  },
  captions: [
    {
      track: {
        kind: "subtitles",
        language: "KO",
        label: "한국어 (자동 생성)",
        url: "https://lms.mju.ac.kr/sample.vtt"
      },
      vtt: "WEBVTT",
      cueCount: 6,
      cues: [
        {
          start: "00:00:00.000",
          end: "00:00:05.000",
          text: "오늘은 CGI의 정의와 Common Gateway Interface 약자를 설명합니다."
        },
        {
          start: "00:00:05.000",
          end: "00:00:10.000",
          text: "서버 구조와 동작 원리는 시험 문제로 나올 수 있으니 꼭 기억하세요."
        },
        {
          start: "00:00:10.000",
          end: "00:00:15.000",
          text: "실습에서는 docker-compose up --build 명령어를 실행합니다."
        },
        {
          start: "00:00:15.000",
          end: "00:00:20.000",
          text: "컨테이너가 실행되면 로그 파일과 접속 결과를 확인합니다."
        },
        {
          start: "00:00:20.000",
          end: "00:00:25.000",
          text: "과제는 실습 보고서를 작성해서 제출해야 합니다."
        },
        {
          start: "00:00:25.000",
          end: "00:00:30.000",
          text: "업로드 기한을 넘기면 평가에 반영됩니다."
        }
      ],
      text: ""
    }
  ]
};

test("buildOnlineInsights returns high-signal highlights without scores by default", () => {
  const result = buildOnlineInsights(transcriptFixture);

  assert.equal(result.source.language, "KO");
  assert.equal(result.source.cueCount, 6);
  assert.equal(result.source.summaryUsed, true);
  assert.ok(result.highlights.examCandidates.length > 0);
  assert.ok(result.highlights.assignments.length > 0);
  assert.ok(result.highlights.practice.length > 0);
  assert.ok(result.highlights.important.length > 0);
  assert.ok(result.summaryHighlights.length > 0);
  assert.equal("score" in result.highlights.practice[0], false);
  assert.equal("score" in result.summaryHighlights[0], false);
  assert.ok(
    result.highlights.practice[0].evidence.some((item) =>
      item.text.includes("docker-compose")
    )
  );
});

test("buildOnlineInsights can include scores for debugging", () => {
  const result = buildOnlineInsights(transcriptFixture, {
    showScore: true,
    types: ["practice"],
    maxItemsPerType: 1
  });

  assert.equal(result.highlights.examCandidates.length, 0);
  assert.equal(result.highlights.assignments.length, 0);
  assert.equal(result.highlights.practice.length, 1);
  assert.equal(result.highlights.important.length, 0);
  assert.equal(typeof result.highlights.practice[0].score, "number");
});

test("buildOnlineInsights applies maxItemsPerType to summary highlights", () => {
  const result = buildOnlineInsights(transcriptFixture, {
    types: ["assignment"],
    maxItemsPerType: 1
  });

  assert.equal(result.summaryHighlights.length, 1);
  assert.equal(result.summaryHighlights[0].type, "assignment");
});

test("createLmsCommand exposes online insights command", () => {
  const command = createLmsCommand(() => ({ format: "json" }));
  const online = command.commands.find((child) => child.name() === "online");
  const insights = online?.commands.find((child) => child.name() === "insights");

  assert.ok(insights);
  assert.deepEqual(
    insights.options.map((option) => option.long),
    [
      "--course",
      "--kjkey",
      "--lecture-weeks",
      "--link-seq",
      "--item-index",
      "--language",
      "--types",
      "--max-items",
      "--show-score"
    ]
  );
});
