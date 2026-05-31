import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { checkAssignmentSubmission } from "./assignment-submission-check.js";
import { MjuLmsSsoClient } from "./sso-client.js";
import type { FormPayloadValue } from "./sso-client.js";
import type {
  AssignmentSubmitCheckResult,
  AssignmentSubmitContentSource,
  AssignmentSubmitPlan,
  AssignmentSubmitResult,
  AssignmentSubmitTextArtifact,
  AssignmentTextArtifactFormat
} from "./types.js";

export interface SubmitAssignmentOptions {
  userId: string;
  password: string;
  kjkey: string;
  rtSeq: number;
  text?: string;
  textFilePath?: string;
  localFiles?: string[];
  artifactFormat?: string;
  artifactDir?: string;
  contentSource?: string;
  dryRun?: boolean;
}

interface AssignmentUploadResponsePayload {
  isError?: boolean;
  message?: string;
  seq1?: string | number;
}

interface AssignmentFinalSubmitResponsePayload {
  isError?: boolean;
  message?: string;
  isKjkey?: boolean;
  chSubjtMessage?: string;
}

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function sanitizeFileName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/^-|-$/g, "");
}

function parseLooseJson<T>(value: string | undefined): T | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const firstArrayIndex = trimmed.indexOf("[");
  const firstObjectIndex = trimmed.indexOf("{");
  let start = -1;
  let end = -1;

  if (
    firstArrayIndex >= 0 &&
    (firstObjectIndex < 0 || firstArrayIndex < firstObjectIndex)
  ) {
    start = firstArrayIndex;
    end = trimmed.lastIndexOf("]");
  } else if (firstObjectIndex >= 0) {
    start = firstObjectIndex;
    end = trimmed.lastIndexOf("}");
  }

  if (start < 0 || end < start) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as T;
  } catch {
    return undefined;
  }
}

export function parseAssignmentUploadResponse(value: string | undefined): {
  fileSeq?: string;
  errorMessage?: string;
} {
  const payload = parseLooseJson<AssignmentUploadResponsePayload>(value);
  const message = normalizeText(payload?.message);

  if (payload?.isError) {
    return {
      errorMessage: message ?? "LMS가 파일 업로드를 거부했습니다."
    };
  }

  const fileSeq =
    payload?.seq1 === undefined ? undefined : String(payload.seq1).trim();

  return {
    ...(fileSeq ? { fileSeq } : {})
  };
}

export function buildAssignmentFinalSubmitPayload(options: {
  check: AssignmentSubmitCheckResult;
  userId: string;
  text?: string;
  fileSeqs?: string[];
}): Record<string, FormPayloadValue> {
  const fileSeqs = options.fileSeqs?.filter((seq) => seq.trim().length > 0) ?? [];
  const payload: Record<string, FormPayloadValue> = {
    ud: options.userId,
    ky: options.check.kjkey,
    RT_SEQ: String(options.check.rtSeq),
    returnData: "json",
    JR_TXT: options.text ?? "",
    FILE_SEQS: fileSeqs.join(","),
    start: "",
    display: "",
    INPUT_METHOD_FLAG: "",
    encoding: "utf-8"
  };

  if (options.check.submitContentSeq) {
    payload.CONTENT_SEQ = options.check.submitContentSeq;
  }

  return payload;
}

export function parseAssignmentFinalSubmitResponse(
  value: string | undefined
): { ok: boolean; errorMessage?: string } {
  const payload = parseLooseJson<AssignmentFinalSubmitResponsePayload>(value);
  if (!payload) {
    return { ok: true };
  }

  const message =
    normalizeText(payload.message) ??
    normalizeText(payload.chSubjtMessage) ??
    undefined;

  if (payload.isError) {
    return {
      ok: false,
      errorMessage: message ?? "LMS가 과제 제출을 거부했습니다."
    };
  }

  if (payload.isKjkey === false) {
    return {
      ok: false,
      errorMessage:
        message ??
        "LMS가 현재 강의실 권한을 확인하지 못했습니다. ky/KJKEY 제출 컨텍스트가 일치하지 않습니다."
    };
  }

  return { ok: true };
}

export function buildAssignmentUploadMetadataPayload(options: {
  check: AssignmentSubmitCheckResult;
  userId: string;
}): Record<string, FormPayloadValue> {
  return {
    ...(options.check.uploadPath ? { path: options.check.uploadPath } : {}),
    ud: options.userId,
    ky: options.check.kjkey,
    returnData: "json",
    ...(options.check.uploadPfStFlag
      ? { pf_st_flag: options.check.uploadPfStFlag }
      : {}),
    ...(options.check.submitContentSeq
      ? { CONTENT_SEQ: options.check.submitContentSeq }
      : {}),
    encoding: "utf-8"
  };
}

export function parseAssignmentSubmitContentSource(
  value: string | undefined,
  context: { hasText: boolean; hasLocalFiles: boolean }
): AssignmentSubmitContentSource {
  if (!value) {
    return context.hasText ? "user-text" : "user-file";
  }

  if (
    value === "user-file" ||
    value === "user-text" ||
    value === "user-draft-transform"
  ) {
    return value;
  }

  throw new Error(
    "content-source 는 user-file, user-text, user-draft-transform 중 하나여야 합니다."
  );
}

export function parseAssignmentTextArtifactFormat(
  value: string | undefined
): AssignmentTextArtifactFormat {
  if (!value || value === "txt") {
    return "txt";
  }
  if (value === "md") {
    return "md";
  }

  throw new Error("artifact-format 은 txt 또는 md 만 지원합니다.");
}

export async function resolveAssignmentSubmitText(
  inlineText: string | undefined,
  textFilePath: string | undefined
): Promise<string | undefined> {
  const text = normalizeText(inlineText);
  const filePath = normalizeText(textFilePath);

  if (text && filePath) {
    throw new Error("text 와 text-file-path 는 동시에 사용할 수 없습니다.");
  }

  if (filePath) {
    return fs.readFile(filePath, "utf8");
  }

  return text;
}

export async function createAssignmentTextArtifact(options: {
  title: string;
  text: string;
  format: AssignmentTextArtifactFormat;
  artifactDir?: string;
}): Promise<AssignmentSubmitTextArtifact> {
  const baseDir =
    options.artifactDir ??
    (await fs.mkdtemp(path.join(os.tmpdir(), "mju-cli-assignment-")));
  await fs.mkdir(baseDir, { recursive: true });

  const fileName = `${sanitizeFileName(options.title) || "assignment"}.${options.format}`;
  const filePath = path.join(baseDir, fileName);
  const body =
    options.format === "md"
      ? options.text.trimEnd() + "\n"
      : options.text.replace(/\r?\n/g, "\n").trimEnd() + "\n";

  await fs.writeFile(filePath, body, "utf8");
  const stats = await fs.stat(filePath);

  return {
    path: filePath,
    fileName,
    format: options.format,
    sizeBytes: stats.size
  };
}

export function buildAssignmentSubmitPlan(options: {
  check: AssignmentSubmitCheckResult;
  contentSource: AssignmentSubmitContentSource;
  localFiles: string[];
  textArtifact?: AssignmentSubmitTextArtifact;
  willSubmitText?: boolean;
  dryRun?: boolean;
}): AssignmentSubmitPlan {
  const blockingReasons = [...options.check.blockingReasons];
  const warnings = [...options.check.warnings];
  const hasNewFiles = options.localFiles.length > 0;
  const hasTextArtifact = options.textArtifact !== undefined;

  if (!options.check.canProceed) {
    blockingReasons.push("제출 전 점검을 통과하지 못했습니다.");
  }

  if (!hasNewFiles && !hasTextArtifact && !options.check.usedExistingTextFallback) {
    blockingReasons.push("제출할 본문 또는 첨부 파일이 없습니다.");
  }

  if (hasNewFiles && (!options.check.hasFilePicker || !options.check.uploadUrl)) {
    blockingReasons.push("이 과제 제출 화면에서 파일 업로드 영역을 확인하지 못했습니다.");
  }

  if (options.contentSource === "user-file" && !hasNewFiles) {
    blockingReasons.push("content-source=user-file 이지만 첨부 파일이 없습니다.");
  }

  if (
    (options.contentSource === "user-text" ||
      options.contentSource === "user-draft-transform") &&
    !hasTextArtifact &&
    !options.check.usedExistingTextFallback
  ) {
    blockingReasons.push("content-source 가 텍스트 기반이지만 제출 본문이 없습니다.");
  }

  if (
    options.check.submissionMode === "update-submit" &&
    options.check.existingAttachments.length > 0 &&
    hasNewFiles
  ) {
    blockingReasons.push(
      "기존 첨부가 있는 수정 제출에서 새 첨부를 추가하면 기존 첨부 보존을 보장할 수 없어 차단했습니다."
    );
  }

  return {
    canSubmit: blockingReasons.length === 0,
    blockingReasons,
    warnings,
    contentSource: options.contentSource,
    ...(options.textArtifact ? { textArtifact: options.textArtifact } : {}),
    localFiles: options.localFiles,
    willUploadFiles: hasNewFiles,
    willSubmitText:
      options.willSubmitText ??
      (hasTextArtifact || options.check.usedExistingTextFallback),
    submissionMode: options.check.submissionMode,
    dryRun: options.dryRun ?? false
  };
}

async function uploadAssignmentFile(
  client: MjuLmsSsoClient,
  check: AssignmentSubmitCheckResult,
  userId: string,
  filePath: string
): Promise<{
  path: string;
  fileName: string;
  fileSeq?: string;
  statusCode: number;
  responseText?: string;
}> {
  if (!check.uploadUrl) {
    throw new Error("파일 업로드 URL을 확인하지 못했습니다.");
  }

  const resolvedPath = path.resolve(filePath);
  const fileName = path.basename(resolvedPath);
  const buffer = await fs.readFile(resolvedPath);
  const arrayBuffer = new ArrayBuffer(buffer.length);
  new Uint8Array(arrayBuffer).set(buffer);
  const form = new FormData();
  form.append("file", new Blob([arrayBuffer]), fileName);
  for (const [key, value] of Object.entries(
    buildAssignmentUploadMetadataPayload({ check, userId })
  )) {
    form.append(key, String(value));
  }

  const response = await client.postMultipart(check.uploadUrl, form);
  if (response.statusCode >= 400) {
    throw new Error(`과제 첨부 업로드에 실패했습니다. HTTP ${response.statusCode}`);
  }
  const parsed = parseAssignmentUploadResponse(response.text);
  if (parsed.errorMessage) {
    throw new Error(`과제 첨부 업로드에 실패했습니다: ${parsed.errorMessage}`);
  }
  if (!parsed.fileSeq) {
    throw new Error(
      `${fileName}: LMS 파일 업로드 응답에서 첨부 식별자(seq1)를 확인하지 못해 제출을 중단했습니다.`
    );
  }

  return {
    path: resolvedPath,
    fileName,
    fileSeq: parsed.fileSeq,
    statusCode: response.statusCode,
    ...(response.text ? { responseText: response.text.slice(0, 500) } : {})
  };
}

async function postSubmitCheck(
  client: MjuLmsSsoClient,
  check: AssignmentSubmitCheckResult
): Promise<void> {
  if (!check.submitCheckUrl) {
    return;
  }

  const response = await client.postForm(check.submitCheckUrl, {
    ...(check.submitCheckDiv ? { SUBMIT_CHECK_DIV: check.submitCheckDiv } : {}),
    ...(check.submitContentSeq ? { CONTENT_SEQ: check.submitContentSeq } : {}),
    RT_SEQ: String(check.rtSeq),
    encoding: "utf-8"
  });
  if (response.statusCode >= 400) {
    throw new Error(`과제 제출 가능 확인에 실패했습니다. HTTP ${response.statusCode}`);
  }
}

async function postFinalSubmit(
  client: MjuLmsSsoClient,
  check: AssignmentSubmitCheckResult,
  userId: string,
  fileSeqs: string[],
  text: string | undefined
): Promise<{ statusCode: number; responseText?: string }> {
  if (!check.submitUrl) {
    throw new Error("최종 제출 URL을 확인하지 못했습니다.");
  }

  const response = await client.postForm(
    check.submitUrl,
    buildAssignmentFinalSubmitPayload({ check, userId, text, fileSeqs })
  );
  if (response.statusCode >= 400) {
    throw new Error(`과제 최종 제출에 실패했습니다. HTTP ${response.statusCode}`);
  }
  const parsed = parseAssignmentFinalSubmitResponse(response.text);
  if (!parsed.ok) {
    throw new Error(`과제 최종 제출에 실패했습니다: ${parsed.errorMessage}`);
  }

  return {
    statusCode: response.statusCode,
    ...(response.text ? { responseText: response.text.slice(0, 500) } : {})
  };
}

export async function submitAssignment(
  client: MjuLmsSsoClient,
  options: SubmitAssignmentOptions
): Promise<AssignmentSubmitResult> {
  const text = await resolveAssignmentSubmitText(options.text, options.textFilePath);
  const localFiles = options.localFiles?.map((filePath) => path.resolve(filePath)) ?? [];
  const contentSource = parseAssignmentSubmitContentSource(options.contentSource, {
    hasText: text !== undefined,
    hasLocalFiles: localFiles.length > 0
  });
  const artifactFormat = parseAssignmentTextArtifactFormat(options.artifactFormat);
  const check = await checkAssignmentSubmission(client, {
    userId: options.userId,
    password: options.password,
    kjkey: options.kjkey,
    rtSeq: options.rtSeq,
    ...(text ? { text } : {}),
    localFiles
  });
  const shouldCreateTextArtifact = text !== undefined && contentSource !== "user-file";
  const textArtifact = shouldCreateTextArtifact
    ? await createAssignmentTextArtifact({
        title: check.title,
        text,
        format: artifactFormat,
        ...(options.artifactDir ? { artifactDir: options.artifactDir } : {})
      })
    : undefined;
  const uploadFiles = [
    ...localFiles,
    ...(textArtifact && check.hasFilePicker ? [textArtifact.path] : [])
  ];
  const plan = buildAssignmentSubmitPlan({
    check,
    contentSource,
    localFiles: uploadFiles,
    ...(textArtifact ? { textArtifact } : {}),
    willSubmitText: text !== undefined || check.usedExistingTextFallback,
    dryRun: options.dryRun ?? false
  });

  if (!plan.canSubmit) {
    throw new Error(`과제를 제출할 수 없습니다: ${plan.blockingReasons.join(" / ")}`);
  }

  if (plan.dryRun) {
    return {
      kjkey: options.kjkey,
      rtSeq: options.rtSeq,
      title: check.title,
      ...(check.courseTitle ? { courseTitle: check.courseTitle } : {}),
      contentSource,
      submissionMode: check.submissionMode,
      dryRun: true,
      check,
      plan,
      uploadedFiles: [],
      submitted: false
    };
  }

  const uploadedFiles = [];
  for (const filePath of uploadFiles) {
    uploadedFiles.push(await uploadAssignmentFile(client, check, options.userId, filePath));
  }
  const fileSeqs = uploadedFiles
    .map((file) => file.fileSeq)
    .filter((fileSeq): fileSeq is string => Boolean(fileSeq));

  await postSubmitCheck(client, check);
  const submitResponse = await postFinalSubmit(
    client,
    check,
    options.userId,
    fileSeqs,
    text
  );

  return {
    kjkey: options.kjkey,
    rtSeq: options.rtSeq,
    title: check.title,
    ...(check.courseTitle ? { courseTitle: check.courseTitle } : {}),
    contentSource,
    submissionMode: check.submissionMode,
    dryRun: false,
    check,
    plan,
    uploadedFiles,
    submitted: true,
    submitStatusCode: submitResponse.statusCode,
    ...(submitResponse.responseText
      ? { submitResponseText: submitResponse.responseText }
      : {})
  };
}
