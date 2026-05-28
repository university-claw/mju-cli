import assert from "node:assert/strict";
import { test } from "node:test";

import { createLmsCommand } from "../dist/commands/lms.js";
import {
  buildOnlinePlainTranscriptResult,
  buildOnlineSummaryResult,
  parseOnlineLearningFormContext,
  parseSubtitleTracks,
  parseWebVtt
} from "../dist/lms/online-transcript.js";

const learningFormFixture = `
  <html>
    <body>
      <div class="ai_supporters_title"><span>ASTRA 서포터즈</span></div>
      <div id="ai_supporters_summary">
### 요약
- 첫 번째 항목
- 두 번째 항목
      </div>
      <script>
        cv.load("current", "ITEM-123", "CONTENT-456", "ORG-789", "10102111", "A20261TEST", "00000000", "N");
      </script>
    </body>
  </html>
`;

const playerFixture = `
  <video>
    <source src="https://media.example.test/video.mp4" type="video/mp4">
    <track kind="subtitles" src="/ilosfiles/contents-subtitle/1/2/3.vtt?v=1" srclang="KO" label="한국어 (자동 생성)">
    <track kind="subtitles" src="https://lms.mju.ac.kr/ilosfiles/contents-subtitle/1/2/4.vtt?v=1" srclang="EN" label="English (Auto-generate)">
    <track kind="metadata" src="/metadata.vtt" srclang="KO" label="Metadata">
  </video>
`;

const vttFixture = `WEBVTT

intro
00:00:00.000 --> 00:00:02.500 align:start
안녕하세요 <b>여러분</b>

00:00:02.500 --> 00:00:04.000
두 번째 줄 &amp; 기호
`;

const transcriptResultFixture = {
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
    markdown: "### 요약\n- 첫 번째 항목"
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
      vtt: "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n첫 번째 자막",
      cueCount: 1,
      cues: [
        {
          start: "00:00:00.000",
          end: "00:00:02.000",
          text: "첫 번째 자막"
        }
      ],
      text: "첫 번째 자막"
    }
  ]
};

test("parseOnlineLearningFormContext extracts summary and cv.load identifiers", () => {
  const result = parseOnlineLearningFormContext(learningFormFixture);

  assert.deepEqual(result, {
    summary: {
      title: "ASTRA 서포터즈",
      markdown: "### 요약\n- 첫 번째 항목\n- 두 번째 항목"
    },
    itemId: "ITEM-123",
    contentId: "CONTENT-456",
    organizationId: "ORG-789"
  });
});

test("parseSubtitleTracks extracts subtitle track metadata and absolutizes URLs", () => {
  assert.deepEqual(parseSubtitleTracks(playerFixture), [
    {
      kind: "subtitles",
      language: "KO",
      label: "한국어 (자동 생성)",
      url: "https://lms.mju.ac.kr/ilosfiles/contents-subtitle/1/2/3.vtt?v=1"
    },
    {
      kind: "subtitles",
      language: "EN",
      label: "English (Auto-generate)",
      url: "https://lms.mju.ac.kr/ilosfiles/contents-subtitle/1/2/4.vtt?v=1"
    }
  ]);
});

test("parseWebVtt extracts cues and plain text", () => {
  assert.deepEqual(parseWebVtt(vttFixture), [
    {
      identifier: "intro",
      start: "00:00:00.000",
      end: "00:00:02.500",
      settings: "align:start",
      text: "안녕하세요 여러분"
    },
    {
      start: "00:00:02.500",
      end: "00:00:04.000",
      text: "두 번째 줄 & 기호"
    }
  ]);
});

test("buildOnlineSummaryResult returns only LMS summary payload", () => {
  const result = buildOnlineSummaryResult(transcriptResultFixture);

  assert.equal(result.summary.markdown, "### 요약\n- 첫 번째 항목");
  assert.equal("tracks" in result, false);
  assert.equal("captions" in result, false);
  assert.equal("selectedTrack" in result, false);
});

test("buildOnlinePlainTranscriptResult returns only plain subtitle text payload", () => {
  const result = buildOnlinePlainTranscriptResult(transcriptResultFixture);

  assert.equal(result.source.language, "KO");
  assert.equal(result.source.cueCount, 1);
  assert.equal(result.text, "첫 번째 자막");
  assert.equal("summary" in result, false);
  assert.equal("tracks" in result, false);
  assert.equal("captions" in result, false);
  assert.equal("vtt" in result, false);
  assert.equal("cues" in result, false);
});

test("createLmsCommand exposes online summary command", () => {
  const command = createLmsCommand(() => ({ format: "json" }));
  const online = command.commands.find((child) => child.name() === "online");
  const summary = online?.commands.find((child) => child.name() === "summary");

  assert.ok(summary);
  assert.deepEqual(
    summary.options.map((option) => option.long),
    ["--course", "--kjkey", "--lecture-weeks", "--link-seq", "--item-index"]
  );
});

test("createLmsCommand exposes online transcript command as plain text output", () => {
  const command = createLmsCommand(() => ({ format: "json" }));
  const online = command.commands.find((child) => child.name() === "online");
  const transcript = online?.commands.find((child) => child.name() === "transcript");

  assert.ok(transcript);
  assert.deepEqual(
    transcript.options.map((option) => option.long),
    [
      "--course",
      "--kjkey",
      "--lecture-weeks",
      "--link-seq",
      "--item-index",
      "--language"
    ]
  );
});
