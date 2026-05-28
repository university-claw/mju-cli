import type { MjuLmsSsoClient } from "./sso-client.js";
import {
  getOnlineTranscript,
  type GetOnlineTranscriptOptions,
  type OnlineTranscriptCue,
  type OnlineTranscriptResult
} from "./online-transcript.js";

export type OnlineInsightType =
  | "exam-candidate"
  | "assignment"
  | "practice"
  | "important";

export interface OnlineInsightEvidence {
  start: string;
  end: string;
  text: string;
}

export interface OnlineInsightTimeRange {
  start: string;
  end: string;
}

export interface OnlineInsightItem {
  type: OnlineInsightType;
  label: string;
  title: string;
  timeRange: OnlineInsightTimeRange;
  keywords: string[];
  reasons: string[];
  evidence: OnlineInsightEvidence[];
  commands?: string[];
  score?: number;
}

export interface OnlineSummaryInsightItem {
  type: OnlineInsightType;
  label: string;
  title: string;
  keywords: string[];
  reasons: string[];
  text: string;
  commands?: string[];
  score?: number;
}

export interface OnlineInsightsResult {
  kjkey: string;
  courseTitle?: string;
  lectureWeeks: number;
  title?: string;
  selectedItem: OnlineTranscriptResult["selectedItem"];
  source: {
    language: string;
    cueCount: number;
    summaryUsed: boolean;
  };
  counts: {
    examCandidates: number;
    assignments: number;
    practice: number;
    important: number;
    summaryHighlights: number;
  };
  highlights: {
    examCandidates: OnlineInsightItem[];
    assignments: OnlineInsightItem[];
    practice: OnlineInsightItem[];
    important: OnlineInsightItem[];
  };
  summaryHighlights: OnlineSummaryInsightItem[];
}

export interface BuildOnlineInsightsOptions {
  types?: OnlineInsightType[];
  maxItemsPerType?: number;
  showScore?: boolean;
}

export interface GetOnlineInsightsOptions extends GetOnlineTranscriptOptions {
  types?: OnlineInsightType[];
  maxItemsPerType?: number;
  showScore?: boolean;
}

interface InsightRule {
  type: OnlineInsightType;
  outputKey: keyof OnlineInsightsResult["highlights"];
  label: string;
  primary: string[];
  secondary: string[];
  baseReason: string;
  threshold: number;
  maxItems: number;
}

interface ScoredText {
  type: OnlineInsightType;
  label: string;
  score: number;
  keywords: string[];
  reasons: string[];
  commands: string[];
}

interface ScoredCueWindow extends ScoredText {
  cueIndex: number;
  evidence: OnlineInsightEvidence[];
}

const INSIGHT_RULES: InsightRule[] = [
  {
    type: "exam-candidate",
    outputKey: "examCandidates",
    label: "시험/개념 후보",
    primary: ["시험", "중간", "기말", "퀴즈", "출제", "문제", "나올", "외워", "암기", "평가"],
    secondary: ["정의", "의미", "차이", "비교", "원리", "구조", "흐름", "약자", "개념"],
    baseReason: "시험/개념 신호",
    threshold: 7,
    maxItems: 5
  },
  {
    type: "assignment",
    outputKey: "assignments",
    label: "과제/제출 후보",
    primary: ["과제", "제출", "보고서", "레포트", "리포트", "마감", "기한"],
    secondary: ["작성", "조사", "정리", "파일", "문서", "결과", "캡처", "업로드"],
    baseReason: "과제/제출 신호",
    threshold: 6,
    maxItems: 5
  },
  {
    type: "practice",
    outputKey: "practice",
    label: "실습 절차",
    primary: [
      "실습",
      "설치",
      "실행",
      "명령어",
      "다운로드",
      "압축",
      "docker",
      "docker-compose",
      "git",
      "python",
      "node",
      "npm",
      "bash",
      "shell",
      "컨테이너",
      "터미널",
      "코드"
    ],
    secondary: ["파일", "서버", "빌드", "build", "환경", "접속", "확인", "디렉토리"],
    baseReason: "실습/명령어 신호",
    threshold: 6,
    maxItems: 8
  },
  {
    type: "important",
    outputKey: "important",
    label: "중요 설명",
    primary: ["중요", "반드시", "꼭", "핵심", "주의", "기억", "포인트", "알아두"],
    secondary: ["정리", "확인", "이해", "필요", "집중", "조심"],
    baseReason: "강조 표현",
    threshold: 5,
    maxItems: 10
  }
];

const COMMAND_PATTERN =
  /\b(?:docker(?:-compose)?|git|python3?|node|npm|npx|pip|curl|wget|ssh|bash|chmod|cd|ls|cat|mkdir|rm|cp|mv)\b[^\n.;。]*/gi;

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function secondsFromTimestamp(value: string): number {
  const parts = value.split(":");
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return (
      Number.parseInt(hours ?? "0", 10) * 3600 +
      Number.parseInt(minutes ?? "0", 10) * 60 +
      Number.parseFloat(seconds ?? "0")
    );
  }
  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return Number.parseInt(minutes ?? "0", 10) * 60 + Number.parseFloat(seconds ?? "0");
  }
  return Number.parseFloat(value);
}

function includesKeyword(text: string, keyword: string): boolean {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function extractCommands(text: string): string[] {
  return unique(
    (text.match(COMMAND_PATTERN) ?? [])
      .map((item) =>
        item
          .replace(/\bdocker\s+common\s+compose\b/gi, "docker-compose")
          .replace(/\bdocker\s+compose\b/gi, "docker-compose")
          .replace(/\s+command\b.*$/i, "")
          .replace(/\s+명령어.*$/u, "")
          .replace(/[가-힣].*$/u, "")
          .replace(/^[`"'“‘(]+|[`"'”’),:;]+$/g, "")
          .trim()
      )
      .filter((item) => item.length > 1 && item.length <= 80)
  );
}

function scoreText(text: string, rule: InsightRule): ScoredText {
  const normalized = normalizeText(text);
  const primaryHits = rule.primary.filter((keyword) => includesKeyword(normalized, keyword));
  const secondaryHits = rule.secondary.filter((keyword) =>
    includesKeyword(normalized, keyword)
  );
  const commands = extractCommands(normalized);
  const reasons: string[] = [];
  let score = primaryHits.length * 4 + secondaryHits.length * 2;

  if (primaryHits.length > 0) {
    reasons.push(rule.baseReason);
  }
  if (secondaryHits.length > 0) {
    reasons.push("관련 개념/문맥 신호");
  }
  if (commands.length > 0 && rule.type === "practice") {
    score += 4;
    reasons.push("명령어 패턴");
  }
  if (primaryHits.length + secondaryHits.length >= 3) {
    score += 2;
    reasons.push("키워드 밀집");
  }

  return {
    type: rule.type,
    label: rule.label,
    score,
    keywords: unique([...primaryHits, ...secondaryHits]),
    reasons: unique(reasons),
    commands
  };
}

function cueWindow(cues: OnlineTranscriptCue[], index: number): OnlineInsightEvidence[] {
  return cues
    .slice(Math.max(0, index - 1), Math.min(cues.length, index + 2))
    .filter((cue) => normalizeText(cue.text))
    .map((cue) => ({
      start: cue.start,
      end: cue.end,
      text: normalizeText(cue.text)
    }));
}

function scoreCues(
  cues: OnlineTranscriptCue[],
  rule: InsightRule
): ScoredCueWindow[] {
  return cues
    .map((cue, index): ScoredCueWindow | null => {
      const evidence = cueWindow(cues, index);
      const scored = scoreText(evidence.map((item) => item.text).join(" "), rule);
      if (scored.score < rule.threshold) {
        return null;
      }

      return {
        ...scored,
        cueIndex: index,
        evidence
      };
    })
    .filter((item): item is ScoredCueWindow => item !== null);
}

function mergeScoredWindows(windows: ScoredCueWindow[]): ScoredCueWindow[] {
  const sorted = [...windows].sort((left, right) => {
    const leftStart = secondsFromTimestamp(left.evidence[0]?.start ?? "0");
    const rightStart = secondsFromTimestamp(right.evidence[0]?.start ?? "0");
    return leftStart - rightStart;
  });
  const merged: ScoredCueWindow[] = [];

  for (const item of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous) {
      merged.push(item);
      continue;
    }

    const previousEnd = secondsFromTimestamp(
      previous.evidence[previous.evidence.length - 1]?.end ?? "0"
    );
    const itemStart = secondsFromTimestamp(item.evidence[0]?.start ?? "0");
    const sharedKeywords = item.keywords.some((keyword) =>
      previous.keywords.includes(keyword)
    );

    if (itemStart - previousEnd <= 20 && sharedKeywords) {
      previous.score = Math.max(previous.score, item.score) + 1;
      previous.keywords = unique([...previous.keywords, ...item.keywords]);
      previous.reasons = unique([...previous.reasons, ...item.reasons]);
      previous.commands = unique([...previous.commands, ...item.commands]);
      previous.evidence = dedupeEvidence([...previous.evidence, ...item.evidence]).slice(0, 4);
      continue;
    }

    merged.push(item);
  }

  return merged;
}

function dedupeEvidence(evidence: OnlineInsightEvidence[]): OnlineInsightEvidence[] {
  const seen = new Set<string>();
  const result: OnlineInsightEvidence[] = [];

  for (const item of evidence) {
    const key = `${item.start}|${item.end}|${item.text}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }

  return result;
}

function buildTitle(keywords: string[], evidence: OnlineInsightEvidence[]): string {
  const keywordTitle = keywords.slice(0, 3).join(" / ");
  if (keywordTitle) {
    return `${keywordTitle} 관련 구간`;
  }

  const firstText = evidence[0]?.text ?? "중요 구간";
  return firstText.length > 36 ? `${firstText.slice(0, 36)}...` : firstText;
}

function toInsightItem(item: ScoredCueWindow, showScore: boolean): OnlineInsightItem {
  const evidence = dedupeEvidence(item.evidence).slice(0, 3);

  return {
    type: item.type,
    label: item.label,
    title: buildTitle(item.keywords, evidence),
    timeRange: {
      start: evidence[0]?.start ?? "",
      end: evidence[evidence.length - 1]?.end ?? ""
    },
    keywords: item.keywords,
    reasons: item.reasons,
    evidence,
    ...(item.commands.length > 0 ? { commands: item.commands } : {}),
    ...(showScore ? { score: item.score } : {})
  };
}

function splitSummaryMarkdown(markdown: string): string[] {
  return markdown
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/^#{1,6}\s*/, "")
        .replace(/^\s*[-*]\s*/, "")
        .replace(/^\s*\d+\.\s*/, "")
        .replace(/\*\*/g, "")
        .trim()
    )
    .filter((line) => line.length >= 12);
}

function buildSummaryHighlights(
  transcript: OnlineTranscriptResult,
  types: Set<OnlineInsightType>,
  showScore: boolean,
  maxItemsPerType: number | undefined
): OnlineSummaryInsightItem[] {
  if (!transcript.summary?.markdown) {
    return [];
  }

  const lines = splitSummaryMarkdown(transcript.summary.markdown);
  const result: Array<OnlineSummaryInsightItem & { internalScore: number }> = [];

  for (const line of lines) {
    for (const rule of INSIGHT_RULES) {
      if (!types.has(rule.type)) {
        continue;
      }

      const scored = scoreText(line, rule);
      if (scored.score < rule.threshold) {
        continue;
      }

      result.push({
        type: scored.type,
        label: scored.label,
        title: buildTitle(scored.keywords, [
          {
            start: "",
            end: "",
            text: line
          }
        ]),
        keywords: scored.keywords,
        reasons: scored.reasons,
        text: line,
        ...(scored.commands.length > 0 ? { commands: scored.commands } : {}),
        ...(showScore ? { score: scored.score } : {}),
        internalScore: scored.score
      });
    }
  }

  const sorted = result.sort((left, right) => right.internalScore - left.internalScore);
  const filtered =
    maxItemsPerType === undefined
      ? sorted
      : sorted.filter((item, _index, items) => {
          const beforeSameType = items
            .slice(0, _index)
            .filter((candidate) => candidate.type === item.type).length;
          return beforeSameType < maxItemsPerType;
        });

  return filtered.slice(0, 8).map(({ internalScore: _internalScore, ...item }) => item);
}

function parseTypeSet(types: OnlineInsightType[] | undefined): Set<OnlineInsightType> {
  return new Set(types && types.length > 0 ? types : INSIGHT_RULES.map((rule) => rule.type));
}

export function buildOnlineInsights(
  transcript: OnlineTranscriptResult,
  options: BuildOnlineInsightsOptions = {}
): OnlineInsightsResult {
  const showScore = options.showScore === true;
  const maxItemsPerType = options.maxItemsPerType;
  const types = parseTypeSet(options.types);
  const caption = transcript.captions[0];
  const cues = caption?.cues ?? [];
  const highlights: OnlineInsightsResult["highlights"] = {
    examCandidates: [],
    assignments: [],
    practice: [],
    important: []
  };

  for (const rule of INSIGHT_RULES) {
    if (!types.has(rule.type)) {
      continue;
    }

    const limit = maxItemsPerType ?? rule.maxItems;
    highlights[rule.outputKey] = mergeScoredWindows(scoreCues(cues, rule))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map((item) => toInsightItem(item, showScore));
  }

  const summaryHighlights = buildSummaryHighlights(
    transcript,
    types,
    showScore,
    maxItemsPerType
  );

  return {
    kjkey: transcript.kjkey,
    ...(transcript.courseTitle ? { courseTitle: transcript.courseTitle } : {}),
    lectureWeeks: transcript.lectureWeeks,
    ...(transcript.title ? { title: transcript.title } : {}),
    selectedItem: transcript.selectedItem,
    source: {
      language: caption?.track.language ?? transcript.selectedTrack?.language ?? "",
      cueCount: caption?.cueCount ?? 0,
      summaryUsed: transcript.summary !== null
    },
    counts: {
      examCandidates: highlights.examCandidates.length,
      assignments: highlights.assignments.length,
      practice: highlights.practice.length,
      important: highlights.important.length,
      summaryHighlights: summaryHighlights.length
    },
    highlights,
    summaryHighlights
  };
}

export async function getOnlineInsights(
  client: MjuLmsSsoClient,
  options: GetOnlineInsightsOptions
): Promise<OnlineInsightsResult> {
  const transcript = await getOnlineTranscript(client, {
    userId: options.userId,
    password: options.password,
    kjkey: options.kjkey,
    lectureWeeks: options.lectureWeeks,
    ...(options.linkSeq !== undefined ? { linkSeq: options.linkSeq } : {}),
    ...(options.itemIndex !== undefined ? { itemIndex: options.itemIndex } : {}),
    ...(options.language ? { language: options.language } : {})
  });

  return buildOnlineInsights(transcript, {
    ...(options.types ? { types: options.types } : {}),
    ...(options.maxItemsPerType !== undefined
      ? { maxItemsPerType: options.maxItemsPerType }
      : {}),
    ...(options.showScore ? { showScore: true } : {})
  });
}
