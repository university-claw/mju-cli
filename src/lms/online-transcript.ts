import { load } from "cheerio";

import { CliError } from "../errors.js";
import {
  LMS_BASE,
  STUDENT_ONLINE_LEARNING_FORM_URL,
  STUDENT_ONLINE_VIEW_NAVI_URL
} from "./constants.js";
import { getCourseOnlineWeek } from "./online.js";
import type { MjuLmsSsoClient } from "./sso-client.js";
import type { OnlineLearningItem } from "./types.js";

interface ResolvedOnlineItem {
  item: OnlineLearningItem;
  itemIndex: number;
  resolvedBy: "linkSeq" | "itemIndex" | "single-item";
}

export interface OnlineTranscriptSummary {
  title?: string;
  markdown: string;
}

export interface OnlineTranscriptTrack {
  kind: string;
  language: string;
  label: string;
  url: string;
}

export interface OnlineTranscriptCue {
  identifier?: string;
  start: string;
  end: string;
  settings?: string;
  text: string;
}

export interface OnlineTranscriptCaption {
  track: OnlineTranscriptTrack;
  vtt: string;
  cueCount: number;
  cues: OnlineTranscriptCue[];
  text: string;
}

export interface OnlineTranscriptResult {
  kjkey: string;
  courseTitle?: string;
  lectureWeeks: number;
  title?: string;
  week?: number;
  weekLabel?: string;
  selectedItem: OnlineLearningItem;
  resolvedItemIndex: number;
  resolvedBy: ResolvedOnlineItem["resolvedBy"];
  summary: OnlineTranscriptSummary | null;
  tracks: OnlineTranscriptTrack[];
  selectedTrack?: OnlineTranscriptTrack;
  captions: OnlineTranscriptCaption[];
}

export interface OnlineSummaryResult {
  kjkey: string;
  courseTitle?: string;
  lectureWeeks: number;
  title?: string;
  week?: number;
  weekLabel?: string;
  selectedItem: OnlineLearningItem;
  resolvedItemIndex: number;
  resolvedBy: ResolvedOnlineItem["resolvedBy"];
  summary: OnlineTranscriptSummary | null;
}

export interface OnlinePlainTranscriptResult {
  kjkey: string;
  courseTitle?: string;
  lectureWeeks: number;
  title?: string;
  week?: number;
  weekLabel?: string;
  selectedItem: OnlineLearningItem;
  resolvedItemIndex: number;
  resolvedBy: ResolvedOnlineItem["resolvedBy"];
  source: {
    language: string;
    label: string;
    cueCount: number;
  };
  text: string;
}

export interface GetOnlineTranscriptOptions {
  userId: string;
  password: string;
  kjkey: string;
  lectureWeeks: number;
  linkSeq?: number;
  itemIndex?: number;
  language?: string;
  allLanguages?: boolean;
}

export interface GetOnlineSummaryOptions {
  userId: string;
  password: string;
  kjkey: string;
  lectureWeeks: number;
  linkSeq?: number;
  itemIndex?: number;
}

interface OnlineLearningFormContext {
  summary: OnlineTranscriptSummary | null;
  itemId: string;
  contentId: string;
  organizationId: string;
}

interface OnlineLearningFormLoadResult {
  detail: Awaited<ReturnType<typeof getCourseOnlineWeek>>;
  resolvedItem: ResolvedOnlineItem;
  formContext: OnlineLearningFormContext;
}

interface OnlineViewNaviResponse {
  isError?: boolean;
  isKjkey?: boolean;
  message?: string;
  chSubjtMessage?: string;
  item_id?: string;
  path?: string;
  kind?: string;
  cid?: string;
  vr?: string;
}

function cleanInlineText(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function cleanMarkdown(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function describeSelectableItems(items: OnlineLearningItem[]): string {
  return items
    .map((item, index) => `${index}: linkSeq ${item.linkSeq} - ${item.title}`)
    .join("; ");
}

function resolveOnlineItem(
  items: OnlineLearningItem[],
  options: Pick<GetOnlineSummaryOptions, "linkSeq" | "itemIndex">
): ResolvedOnlineItem {
  if (items.length === 0) {
    throw new CliError("선택한 온라인 주차에 영상 항목이 없습니다.");
  }

  if (options.linkSeq !== undefined && options.itemIndex !== undefined) {
    throw new CliError("link-seq 와 item-index 는 동시에 사용할 수 없습니다.");
  }

  if (options.linkSeq !== undefined) {
    const itemIndex = items.findIndex((item) => item.linkSeq === options.linkSeq);
    if (itemIndex === -1) {
      throw new CliError(
        `link-seq ${options.linkSeq} 항목을 찾지 못했습니다. 가능한 항목: ${describeSelectableItems(items)}`
      );
    }

    return {
      item: items[itemIndex],
      itemIndex,
      resolvedBy: "linkSeq"
    };
  }

  if (options.itemIndex !== undefined) {
    if (options.itemIndex < 0 || options.itemIndex >= items.length) {
      throw new CliError(
        `item-index 범위를 벗어났습니다. 가능한 항목: ${describeSelectableItems(items)}`
      );
    }

    return {
      item: items[options.itemIndex],
      itemIndex: options.itemIndex,
      resolvedBy: "itemIndex"
    };
  }

  if (items.length === 1) {
    return {
      item: items[0],
      itemIndex: 0,
      resolvedBy: "single-item"
    };
  }

  throw new CliError(
    `이 주차에는 영상이 여러 개라서 --link-seq 또는 --item-index 가 필요합니다. 가능한 항목: ${describeSelectableItems(items)}`
  );
}

function parseCvLoadContext(html: string): {
  itemId: string;
  contentId: string;
  organizationId: string;
} {
  const match = html.match(/cv\.load\(([^)]*)\)/);
  if (!match?.[1]) {
    throw new Error("온라인 학습 페이지에서 영상 item_id 를 찾지 못했습니다.");
  }

  const args = [...match[1].matchAll(/"([^"]*)"/g)].map((item) => item[1] ?? "");
  const itemId = args[1]?.trim();
  if (!itemId) {
    throw new Error("온라인 학습 페이지에서 영상 item_id 를 찾지 못했습니다.");
  }

  return {
    itemId,
    contentId: args[2]?.trim() ?? "",
    organizationId: args[3]?.trim() ?? ""
  };
}

export function parseOnlineLearningFormContext(html: string): OnlineLearningFormContext {
  const $ = load(html);
  const summaryMarkdown = cleanMarkdown($("#ai_supporters_summary").first().text());
  const summaryTitle = cleanInlineText($(".ai_supporters_title").first().text());
  const cvLoad = parseCvLoadContext(html);

  return {
    summary: summaryMarkdown
      ? {
          ...(summaryTitle ? { title: summaryTitle } : {}),
          markdown: summaryMarkdown
        }
      : null,
    ...cvLoad
  };
}

export function parseSubtitleTracks(html: string): OnlineTranscriptTrack[] {
  const $ = load(html);

  return $("track")
    .map((_, element) => {
      const item = $(element);
      const src = item.attr("src")?.trim();
      const language = item.attr("srclang")?.trim().toUpperCase() ?? "";
      const label = cleanInlineText(item.attr("label"));
      const kind = item.attr("kind")?.trim() || "subtitles";

      if (!src || !language || (kind !== "subtitles" && kind !== "captions")) {
        return null;
      }

      return {
        kind,
        language,
        label,
        url: new URL(src, LMS_BASE).toString()
      };
    })
    .get()
    .filter((track): track is OnlineTranscriptTrack => track !== null);
}

function parseOnlineViewNaviResponse(text: string): OnlineViewNaviResponse {
  try {
    return JSON.parse(text) as OnlineViewNaviResponse;
  } catch (error) {
    throw new Error(
      `온라인 영상 내비게이션 응답을 해석하지 못했습니다: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function buildPlayerUrl(
  data: OnlineViewNaviResponse,
  lectureWeeks: number,
  linkSeq: number
): string {
  if (!data.isKjkey || !data.item_id || !data.path || !data.kind || !data.cid) {
    throw new Error(
      data.message || data.chSubjtMessage || "온라인 영상 URL 구성 정보를 찾지 못했습니다."
    );
  }

  const url = new URL("/ilos/cls/st/online/online_learning.acl", LMS_BASE);
  url.searchParams.set("item_id", data.item_id);
  url.searchParams.set("link_seq", String(linkSeq));
  url.searchParams.set("lecture_weeks", String(lectureWeeks));
  url.searchParams.set("path", data.path);
  url.searchParams.set("kind", data.kind);
  url.searchParams.set("cid", data.cid);
  url.searchParams.set("browserType", "chrome");
  if (data.vr) {
    url.searchParams.set("vr", data.vr);
  }
  url.searchParams.set("replace", "Y");
  return url.toString();
}

function parseTimingLine(value: string): {
  start: string;
  end: string;
  settings?: string;
} | null {
  const match = value.match(/^(.+?)\s+-->\s+(\S+)(?:\s+(.*))?$/);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  return {
    start: match[1].trim(),
    end: match[2].trim(),
    ...(match[3]?.trim() ? { settings: match[3].trim() } : {})
  };
}

function stripVttTags(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

export function parseWebVtt(vtt: string): OnlineTranscriptCue[] {
  const lines = vtt.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const cues: OnlineTranscriptCue[] = [];
  let index = 0;

  if (lines[index]?.startsWith("WEBVTT")) {
    index++;
  }

  while (index < lines.length) {
    while (index < lines.length && lines[index]?.trim() === "") {
      index++;
    }

    if (index >= lines.length) {
      break;
    }

    let identifier: string | undefined;
    let timing = parseTimingLine(lines[index]?.trim() ?? "");
    if (!timing) {
      const possibleIdentifier = lines[index]?.trim();
      index++;
      timing = parseTimingLine(lines[index]?.trim() ?? "");
      if (!timing) {
        continue;
      }
      if (possibleIdentifier) {
        identifier = possibleIdentifier;
      }
    }

    index++;
    const textLines: string[] = [];
    while (index < lines.length && lines[index]?.trim() !== "") {
      textLines.push(lines[index] ?? "");
      index++;
    }

    const text = stripVttTags(textLines.join("\n")).trim();
    cues.push({
      ...(identifier ? { identifier } : {}),
      start: timing.start,
      end: timing.end,
      ...(timing.settings ? { settings: timing.settings } : {}),
      text
    });
  }

  return cues;
}

function buildTranscriptText(cues: OnlineTranscriptCue[]): string {
  return cues
    .map((cue) => cue.text)
    .filter(Boolean)
    .join("\n");
}

function selectTracks(
  tracks: OnlineTranscriptTrack[],
  options: Pick<GetOnlineTranscriptOptions, "language" | "allLanguages">
): OnlineTranscriptTrack[] {
  if (options.allLanguages) {
    return tracks;
  }

  const language = (options.language?.trim() || "KO").toUpperCase();
  const track = tracks.find((item) => item.language.toUpperCase() === language);
  if (!track) {
    throw new Error(
      `자막 언어 ${language} 를 찾지 못했습니다. 가능한 언어: ${tracks
        .map((item) => `${item.language} (${item.label || item.kind})`)
        .join(", ")}`
    );
  }

  return [track];
}

async function downloadCaption(
  client: MjuLmsSsoClient,
  track: OnlineTranscriptTrack
): Promise<OnlineTranscriptCaption> {
  const response = await client.getBinary(track.url);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`자막 다운로드에 실패했습니다: HTTP ${response.statusCode}`);
  }

  const vtt = response.rawBody.toString("utf8");
  const cues = parseWebVtt(vtt);

  return {
    track,
    vtt,
    cueCount: cues.length,
    cues,
    text: buildTranscriptText(cues)
  };
}

function buildSummaryResult(
  options: GetOnlineSummaryOptions,
  detail: Awaited<ReturnType<typeof getCourseOnlineWeek>>,
  resolvedItem: ResolvedOnlineItem,
  summary: OnlineTranscriptSummary | null
): OnlineSummaryResult {
  return {
    kjkey: options.kjkey,
    ...(detail.courseTitle ? { courseTitle: detail.courseTitle } : {}),
    lectureWeeks: options.lectureWeeks,
    ...(detail.title ? { title: detail.title } : {}),
    ...(detail.week !== undefined ? { week: detail.week } : {}),
    ...(detail.weekLabel ? { weekLabel: detail.weekLabel } : {}),
    selectedItem: resolvedItem.item,
    resolvedItemIndex: resolvedItem.itemIndex,
    resolvedBy: resolvedItem.resolvedBy,
    summary
  };
}

async function loadOnlineLearningForm(
  client: MjuLmsSsoClient,
  options: GetOnlineSummaryOptions
): Promise<OnlineLearningFormLoadResult> {
  const detail = await getCourseOnlineWeek(client, {
    userId: options.userId,
    password: options.password,
    kjkey: options.kjkey,
    lectureWeeks: options.lectureWeeks
  });
  const resolvedItem = resolveOnlineItem(detail.items, options);
  const formResponse = await client.postForm(STUDENT_ONLINE_LEARNING_FORM_URL, {
    lecture_weeks: options.lectureWeeks,
    _KJKEY: options.kjkey,
    ...(detail.launchForm.kjLectType ? { kj_lect_type: detail.launchForm.kjLectType } : {}),
    link_seq: resolvedItem.item.linkSeq,
    force: ""
  });
  const formContext = parseOnlineLearningFormContext(formResponse.text);

  return {
    detail,
    resolvedItem,
    formContext
  };
}

export function buildOnlineSummaryResult(
  transcript: OnlineTranscriptResult
): OnlineSummaryResult {
  return {
    kjkey: transcript.kjkey,
    ...(transcript.courseTitle ? { courseTitle: transcript.courseTitle } : {}),
    lectureWeeks: transcript.lectureWeeks,
    ...(transcript.title ? { title: transcript.title } : {}),
    ...(transcript.week !== undefined ? { week: transcript.week } : {}),
    ...(transcript.weekLabel ? { weekLabel: transcript.weekLabel } : {}),
    selectedItem: transcript.selectedItem,
    resolvedItemIndex: transcript.resolvedItemIndex,
    resolvedBy: transcript.resolvedBy,
    summary: transcript.summary
  };
}

export function buildOnlinePlainTranscriptResult(
  transcript: OnlineTranscriptResult
): OnlinePlainTranscriptResult {
  const caption = transcript.captions[0];
  if (!caption) {
    throw new Error("선택한 언어의 자막 원문을 찾지 못했습니다.");
  }

  return {
    kjkey: transcript.kjkey,
    ...(transcript.courseTitle ? { courseTitle: transcript.courseTitle } : {}),
    lectureWeeks: transcript.lectureWeeks,
    ...(transcript.title ? { title: transcript.title } : {}),
    ...(transcript.week !== undefined ? { week: transcript.week } : {}),
    ...(transcript.weekLabel ? { weekLabel: transcript.weekLabel } : {}),
    selectedItem: transcript.selectedItem,
    resolvedItemIndex: transcript.resolvedItemIndex,
    resolvedBy: transcript.resolvedBy,
    source: {
      language: caption.track.language,
      label: caption.track.label,
      cueCount: caption.cueCount
    },
    text: caption.text
  };
}

export async function getOnlineSummary(
  client: MjuLmsSsoClient,
  options: GetOnlineSummaryOptions
): Promise<OnlineSummaryResult> {
  const { detail, resolvedItem, formContext } = await loadOnlineLearningForm(
    client,
    options
  );

  return buildSummaryResult(options, detail, resolvedItem, formContext.summary);
}

export async function getOnlinePlainTranscript(
  client: MjuLmsSsoClient,
  options: Omit<GetOnlineTranscriptOptions, "allLanguages">
): Promise<OnlinePlainTranscriptResult> {
  const transcript = await getOnlineTranscript(client, options);
  return buildOnlinePlainTranscriptResult(transcript);
}

export async function getOnlineTranscript(
  client: MjuLmsSsoClient,
  options: GetOnlineTranscriptOptions
): Promise<OnlineTranscriptResult> {
  const { detail, resolvedItem, formContext } = await loadOnlineLearningForm(
    client,
    options
  );
  const naviResponse = await client.postForm(STUDENT_ONLINE_VIEW_NAVI_URL, {
    content_id: formContext.contentId,
    organization_id: formContext.organizationId,
    lecture_weeks: options.lectureWeeks,
    navi: "current",
    item_id: formContext.itemId,
    ky: options.kjkey,
    ud: options.userId,
    returnData: "json",
    encoding: "utf-8"
  });
  const naviData = parseOnlineViewNaviResponse(naviResponse.text);
  if (naviData.isError) {
    throw new Error(
      naviData.message || naviData.chSubjtMessage || "온라인 영상 내비게이션 요청에 실패했습니다."
    );
  }

  const playerUrl = buildPlayerUrl(
    naviData,
    options.lectureWeeks,
    resolvedItem.item.linkSeq
  );
  const playerResponse = await client.getPage(playerUrl);
  const tracks = parseSubtitleTracks(playerResponse.text);
  if (tracks.length === 0) {
    throw new Error("온라인 영상 플레이어에서 자막 track 을 찾지 못했습니다.");
  }

  const selectedTracks = selectTracks(tracks, options);
  const captions = await Promise.all(
    selectedTracks.map((track) => downloadCaption(client, track))
  );

  return {
    kjkey: options.kjkey,
    ...(detail.courseTitle ? { courseTitle: detail.courseTitle } : {}),
    lectureWeeks: options.lectureWeeks,
    ...(detail.title ? { title: detail.title } : {}),
    ...(detail.week !== undefined ? { week: detail.week } : {}),
    ...(detail.weekLabel ? { weekLabel: detail.weekLabel } : {}),
    selectedItem: resolvedItem.item,
    resolvedItemIndex: resolvedItem.itemIndex,
    resolvedBy: resolvedItem.resolvedBy,
    summary: formContext.summary,
    tracks,
    ...(!options.allLanguages && selectedTracks[0] ? { selectedTrack: selectedTracks[0] } : {}),
    captions
  };
}
