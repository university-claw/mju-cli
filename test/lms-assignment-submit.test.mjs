import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  buildAssignmentFinalSubmitPayload,
  buildAssignmentSubmitPlan,
  createAssignmentTextArtifact,
  parseAssignmentFinalSubmitResponse,
  parseAssignmentSubmitContentSource,
  parseAssignmentTextArtifactFormat,
  parseAssignmentUploadResponse
} from "../dist/lms/assignment-submission.js";

const baseCheck = {
  kjkey: "KJKEY",
  rtSeq: 123,
  title: "Synthetic Assignment",
  submissionMode: "initial-submit",
  alreadySubmitted: false,
  existingAttachments: [],
  hasSubmitButton: true,
  requiresTextInput: false,
  hasFilePicker: true,
  hasDeleteButton: false,
  providedTextLength: 0,
  effectiveTextLength: 0,
  usedExistingTextFallback: false,
  providedTextSatisfiesRequirement: true,
  localFiles: [],
  canProceed: true,
  blockingReasons: [],
  warnings: []
};

test("parseAssignmentSubmitContentSource rejects generated answer provenance", () => {
  assert.throws(
    () =>
      parseAssignmentSubmitContentSource("agent-generated-answer", {
        hasText: true,
        hasLocalFiles: false
      }),
    /content-source/
  );
});

test("parseAssignmentTextArtifactFormat allows only txt and md", () => {
  assert.equal(parseAssignmentTextArtifactFormat(undefined), "txt");
  assert.equal(parseAssignmentTextArtifactFormat("md"), "md");
  assert.throws(() => parseAssignmentTextArtifactFormat("docx"), /txt 또는 md/);
});

test("createAssignmentTextArtifact writes a local md artifact", async () => {
  const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), "mju-cli-test-"));
  const artifact = await createAssignmentTextArtifact({
    title: "Synthetic Assignment",
    text: "# Draft\n\nbody",
    format: "md",
    artifactDir
  });

  assert.equal(artifact.fileName, "Synthetic-Assignment.md");
  assert.equal(await fs.readFile(artifact.path, "utf8"), "# Draft\n\nbody\n");
  assert.equal(artifact.sizeBytes > 0, true);
});

test("buildAssignmentSubmitPlan blocks update submissions that cannot preserve attachments", () => {
  const plan = buildAssignmentSubmitPlan({
    check: {
      ...baseCheck,
      submissionMode: "update-submit",
      usedExistingTextFallback: true,
      existingAttachments: [{ fileSeq: "1", name: "old.pdf" }]
    },
    contentSource: "user-file",
    localFiles: ["/tmp/new.pdf"],
    dryRun: false
  });

  assert.equal(plan.canSubmit, false);
  assert.match(plan.blockingReasons.join("\n"), /기존 첨부 보존/);
});

test("buildAssignmentSubmitPlan blocks file input when upload endpoint is absent", () => {
  const plan = buildAssignmentSubmitPlan({
    check: {
      ...baseCheck,
      hasFilePicker: false
    },
    contentSource: "user-file",
    localFiles: ["/tmp/new.pdf"],
    dryRun: false
  });

  assert.equal(plan.canSubmit, false);
  assert.match(plan.blockingReasons.join("\n"), /파일 업로드 영역/);
});

test("parseAssignmentUploadResponse extracts LMS file seq", () => {
  assert.deepEqual(parseAssignmentUploadResponse('{"isError":false,"seq1":98765}'), {
    fileSeq: "98765"
  });

  assert.match(
    parseAssignmentUploadResponse('{"isError":true,"message":"권한 없음"}')
      .errorMessage,
    /권한 없음/
  );
});

test("buildAssignmentFinalSubmitPayload mirrors LMS report insert fields", () => {
  const payload = buildAssignmentFinalSubmitPayload({
    check: baseCheck,
    userId: "60212158",
    text: "본문",
    fileSeqs: ["10", "20"]
  });

  assert.deepEqual(payload, {
    ud: "60212158",
    ky: "KJKEY",
    RT_SEQ: "123",
    returnData: "json",
    JR_TXT: "본문",
    FILE_SEQS: "10,20",
    start: "",
    display: "",
    INPUT_METHOD_FLAG: "",
    encoding: "utf-8"
  });
});

test("parseAssignmentFinalSubmitResponse rejects LMS error payloads", () => {
  assert.deepEqual(parseAssignmentFinalSubmitResponse('{"isError":false,"isKjkey":true}'), {
    ok: true
  });

  assert.match(
    parseAssignmentFinalSubmitResponse('{"isError":true,"message":"접근 권한 없음"}')
      .errorMessage,
    /접근 권한 없음/
  );

  assert.match(
    parseAssignmentFinalSubmitResponse(
      '{"isError":false,"isKjkey":false,"chSubjtMessage":"강의실 오류"}'
    ).errorMessage,
    /강의실 오류/
  );
});
