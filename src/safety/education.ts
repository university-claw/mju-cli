import type { ConsoleMessage, Page } from "playwright";

import { CliError } from "../errors.js";
import { resolveSsoPasswordChangeContinuationUrl } from "../lms/sso-client.js";

const SAFETY_BASE = "https://safety.mju.ac.kr";
const SAFETY_LOGIN_URL = `${SAFETY_BASE}/Account/LogOn`;
const SAFETY_ONLINE_EDU_URL = `${SAFETY_BASE}/Edu/OnLineEdu`;
const SAFETY_ONLINE_EDU_FALLBACK_URL = `${SAFETY_BASE}/Edu/OnlineEdu`;
const COURSE_HOUR_UNIT = 0.5;
const SAFETY_TOOL_TIMEOUT_MS = 60 * 60 * 1000;
const FIXED_VIDEO_CONSOLE_LOG_SCRIPT = `
const video = document.querySelector('video');

video.currentTime = video.duration;
video.dispatchEvent(new Event('timeupdate'));
video.dispatchEvent(new Event('ended'));

video.currentTime = video.duration - 1;
video.play();

setTimeout(() => {
  video.pause();
  video.dispatchEvent(new Event('ended'));
}, 1000);
`;

export interface SafetyEducationSelectionStatus {
  selected: number;
  required: number;
  raw: string;
}

export interface SafetyEducationCourseOption {
  index: number;
  name: string;
  value: string;
  title: string;
  checked: boolean;
  disabled: boolean;
}

export interface SelectedSafetyEducationCourse {
  index: number;
  value: string;
  title: string;
}

export interface SafetyEducationSelectCoursesOptions {
  userId: string;
  password: string;
  dryRun?: boolean;
  headless?: boolean;
}

export interface SafetyEducationCheckCompletionOptions {
  userId: string;
  password: string;
  headless?: boolean;
}

export interface SafetyEducationRunIncompleteVideoLogOptions {
  userId: string;
  password: string;
  rowNumber?: number;
  headless?: boolean;
}

export interface SafetyEducationRunIncompleteVideoLogsOptions {
  userId: string;
  password: string;
  headless?: boolean;
}

export interface SafetyEducationSelectCoursesResult {
  status: "alreadySelected" | "dryRun" | "selected";
  saved: boolean;
  dryRun: boolean;
  schedule: {
    value: string;
    label: string;
  };
  before: {
    progressStatus: string;
    selectionStatus?: SafetyEducationSelectionStatus;
  };
  selectedCourses: SelectedSafetyEducationCourse[];
  after?: {
    progressStatus: string;
    selectionStatus?: SafetyEducationSelectionStatus;
  };
  finalUrl: string;
}

export interface SafetyEducationCourseCompletion {
  rowNumber: number;
  title: string;
  durationMinutes?: number;
  recognizedHours?: number;
  category: string;
  changeAction: string;
  statusText: string;
  actionText: string;
  completed: boolean;
}

export interface SafetyEducationCompletionResult {
  allCompleted: boolean;
  schedule: {
    value: string;
    label: string;
  };
  progressStatus: string;
  counts: {
    total: number;
    completed: number;
    incomplete: number;
  };
  courses: SafetyEducationCourseCompletion[];
  incompleteCourses: SafetyEducationCourseCompletion[];
  finalUrl: string;
}

export interface SafetyEducationConsoleMessage {
  type: string;
  text: string;
  args: unknown[];
}

export interface SafetyEducationRunIncompleteVideoLogResult {
  status: "executed" | "noIncompleteCourses";
  schedule: {
    value: string;
    label: string;
  };
  progressStatus: string;
  counts: {
    total: number;
    completed: number;
    incomplete: number;
  };
  targetCourse?: SafetyEducationCourseCompletion;
  fixedScript: string;
  consoleMessages: SafetyEducationConsoleMessage[];
  popup?: {
    title: string;
    url: string;
  };
  finalUrl: string;
}

interface FixedConsoleLogExecution {
  consoleMessages: SafetyEducationConsoleMessage[];
  popup: {
    title: string;
    url: string;
  };
}

interface BrowserCourseSelectionSnapshot {
  selectionStatus: SafetyEducationSelectionStatus | null;
  courses: SafetyEducationCourseOption[];
}

interface PageSnapshot {
  schedule: {
    value: string;
    label: string;
  };
  progressStatus: string;
  bodyText: string;
  hasVisibleCourseSelectButton: boolean;
}

interface SafetyCredentials {
  userId: string;
  password: string;
}

async function loadPlaywright() {
  return import("playwright");
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function logSafetyProgress(message: string): void {
  console.error(`[safety ${new Date().toISOString()}] ${message}`);
}

function configureSafetyPageTimeouts(page: Page): void {
  page.setDefaultTimeout(SAFETY_TOOL_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(SAFETY_TOOL_TIMEOUT_MS);
}

async function getSafetyPageDiagnostics(
  page: Page,
): Promise<Record<string, unknown>> {
  const title = await page
    .title()
    .catch(
      (error: unknown) =>
        `title-error:${error instanceof Error ? error.message : String(error)}`,
    );
  const dom = await page
    .evaluate(() => {
      const bodyText = document.body?.innerText ?? "";
      const selectorStats = (selector: string) => {
        const elements = Array.from(document.querySelectorAll(selector));
        const first = elements[0] as HTMLElement | undefined;

        return {
          count: elements.length,
          firstVisible: first
            ? Boolean(
                first.offsetWidth ||
                first.offsetHeight ||
                first.getClientRects().length,
              )
            : false,
        };
      };

      return {
        readyState: document.readyState,
        bodyTextLength: bodyText.length,
        bodyHasIntegratedLogin: bodyText.includes("통합로그인"),
        bodyHasSafetyEducation: bodyText.includes("안전교육"),
        bodyHasProgressStatus: bodyText.includes("교육진행상태"),
        bodyHasCourseSelectionStatus: bodyText.includes("과목선택 현황"),
        selectors: {
          scheduleNo: selectorStats("#scheduleNo"),
          courseSelectButton: selectorStats("#btnMappingContent"),
          mappingDialog: selectorStats("#divMappingContent"),
          tables: selectorStats("table"),
          tableRows: selectorStats("table tr"),
          video: selectorStats("video"),
          iframe: selectorStats("iframe"),
        },
      };
    })
    .catch((error: unknown) => ({
      evaluateError: error instanceof Error ? error.message : String(error),
    }));

  return {
    url: page.url(),
    title,
    ...dom,
  };
}

async function logSafetyPageState(label: string, page: Page): Promise<void> {
  logSafetyProgress(
    `${label}: ${JSON.stringify(await getSafetyPageDiagnostics(page))}`,
  );
}

async function waitForSafetyDomainPage(
  page: Page,
  timeout: number,
): Promise<boolean> {
  return page
    .waitForFunction(
      () =>
        location.hostname === "safety.mju.ac.kr" &&
        !location.pathname.toLowerCase().includes("/account/logon") &&
        !location.pathname.toLowerCase().includes("/sso"),
      null,
      { timeout },
    )
    .then(() => true)
    .catch(() => false);
}

function preserveSsoAuthContinuationParams(
  currentUrl: string,
  continuationUrl: string,
): string {
  try {
    const current = new URL(currentUrl);
    const continuation = new URL(continuationUrl);
    if (
      current.hostname !== "sso.mju.ac.kr" ||
      continuation.hostname !== "sso.mju.ac.kr" ||
      current.pathname.toLowerCase() !== "/sso/auth" ||
      continuation.pathname.toLowerCase() !== "/sso/auth"
    ) {
      return continuationUrl;
    }

    for (const key of ["response_type", "client_id", "redirect_uri"]) {
      const value = current.searchParams.get(key);
      if (value && !continuation.searchParams.has(key)) {
        continuation.searchParams.set(key, value);
      }
    }

    return continuation.toString();
  } catch {
    return continuationUrl;
  }
}

async function continuePastSsoPasswordChangePageIfNeeded(
  page: Page,
): Promise<boolean> {
  logSafetyProgress("login: checking for SSO password-change continuation");
  const html = await page.content().catch((error: unknown) => {
    logSafetyProgress(
      `login: failed to read password-change page html error=${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return "";
  });
  let continuationUrl = resolveSsoPasswordChangeContinuationUrl({
    url: page.url(),
    text: html,
  });

  if (!continuationUrl) {
    logSafetyProgress("login: no SSO password-change continuation needed");
    return false;
  }

  continuationUrl = preserveSsoAuthContinuationParams(
    page.url(),
    continuationUrl,
  );
  logSafetyProgress(
    `login: SSO password-change continuation detected, navigating to ${continuationUrl}`,
  );
  await page.goto(continuationUrl, {
    waitUntil: "domcontentloaded",
    timeout: SAFETY_TOOL_TIMEOUT_MS,
  });
  logSafetyProgress(
    `login: after SSO password-change continuation url=${page.url()}`,
  );
  await logSafetyPageState(
    "login: page state after SSO password-change continuation",
    page,
  );

  return true;
}

export function parseSafetyEducationSelectionStatus(
  text: string,
): SafetyEducationSelectionStatus | null {
  const match = text.match(
    /과목선택\s*현황\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/u,
  );
  if (!match?.[1] || !match[2]) {
    return null;
  }

  return {
    selected: Number.parseFloat(match[1]),
    required: Number.parseFloat(match[2]),
    raw: `${match[1]} / ${match[2]}`,
  };
}

export function parseSafetyEducationProgressStatus(text: string): string {
  const match = text.match(/교육진행상태\s*>\s*([^\n\r]+)/u);
  return normalizeText(match?.[1] ?? "");
}

export function calculateNeededSafetyEducationCourseCount(
  status: SafetyEducationSelectionStatus,
  unit = COURSE_HOUR_UNIT,
): number {
  const remaining = status.required - status.selected;
  if (remaining <= 0) {
    return 0;
  }

  return Math.ceil(remaining / unit);
}

export function chooseSafetyEducationCourses(
  courses: SafetyEducationCourseOption[],
  neededCount: number,
): SelectedSafetyEducationCourse[] {
  if (neededCount <= 0) {
    return [];
  }

  return courses
    .filter((course) => !course.checked && !course.disabled)
    .slice(0, neededCount)
    .map((course) => ({
      index: course.index,
      value: course.value,
      title: course.title,
    }));
}

function parseOptionalNumber(value: string): number | undefined {
  const match = value.match(/\d+(?:\.\d+)?/);
  if (!match?.[0]) {
    return undefined;
  }

  return Number.parseFloat(match[0]);
}

function getCompletionCounts(courses: SafetyEducationCourseCompletion[]): {
  total: number;
  completed: number;
  incomplete: number;
} {
  const incomplete = courses.filter((course) => !course.completed).length;

  return {
    total: courses.length,
    completed: courses.length - incomplete,
    incomplete,
  };
}

export function parseSafetyEducationCompletionRows(
  rows: string[][],
): SafetyEducationCourseCompletion[] {
  return rows
    .map((cells): SafetyEducationCourseCompletion | null => {
      const rowNumber = Number.parseInt(cells[0] ?? "", 10);
      if (!Number.isFinite(rowNumber) || rowNumber <= 0 || cells.length < 6) {
        return null;
      }

      const statusText = normalizeText(
        cells[6] ?? cells[cells.length - 1] ?? "",
      );
      const actionText = normalizeText(cells.join(" "));
      const completed =
        /수강\s*\(/u.test(statusText) ||
        /수강완료|이수완료/u.test(statusText) ||
        (/수강\s*\(/u.test(actionText) && !/수강하기/u.test(actionText));
      const durationMinutes = parseOptionalNumber(cells[2] ?? "");
      const recognizedHours = parseOptionalNumber(cells[3] ?? "");

      return {
        rowNumber,
        title: normalizeText(cells[1] ?? ""),
        ...(durationMinutes !== undefined ? { durationMinutes } : {}),
        ...(recognizedHours !== undefined ? { recognizedHours } : {}),
        category: normalizeText(cells[4] ?? ""),
        changeAction: normalizeText(cells[5] ?? ""),
        statusText,
        actionText,
        completed,
      };
    })
    .filter((row): row is SafetyEducationCourseCompletion => row !== null);
}

export function chooseIncompleteSafetyEducationCourse(
  courses: SafetyEducationCourseCompletion[],
  rowNumber?: number,
): SafetyEducationCourseCompletion | null {
  const incompleteCourses = courses.filter((course) => !course.completed);
  if (rowNumber === undefined) {
    return incompleteCourses[0] ?? null;
  }

  return (
    incompleteCourses.find((course) => course.rowNumber === rowNumber) ?? null
  );
}

async function loginToSafety(
  page: Page,
  options: SafetyCredentials,
): Promise<void> {
  logSafetyProgress("login: goto safety login page");
  await page
    .goto(SAFETY_LOGIN_URL, {
      waitUntil: "domcontentloaded",
      timeout: SAFETY_TOOL_TIMEOUT_MS,
    })
    .catch(() => null);
  logSafetyProgress(`login: after login goto url=${page.url()}`);
  await logSafetyPageState("login: page state after login goto", page);

  const ssoLink = page.locator('a[href*="sso_check"]').first();
  logSafetyProgress("login: checking SSO link visibility");
  if (
    await ssoLink
      .isVisible({ timeout: SAFETY_TOOL_TIMEOUT_MS })
      .catch(() => false)
  ) {
    logSafetyProgress("login: SSO link visible, clicking");
    await ssoLink.click();
  } else {
    logSafetyProgress("login: SSO link not visible, continuing");
  }

  logSafetyProgress("login: waiting for SSO user id field");
  await page.waitForSelector("#input-userId", {
    timeout: SAFETY_TOOL_TIMEOUT_MS,
  });
  await logSafetyPageState("login: page state with SSO form", page);
  logSafetyProgress("login: filling SSO credentials");
  await page.fill("#input-userId", options.userId);
  await page.fill("#input-password", options.password);
  logSafetyProgress("login: submitting SSO form");
  await Promise.allSettled([
    page.waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: SAFETY_TOOL_TIMEOUT_MS,
    }),
    page.click("button.login_bt"),
  ]);
  logSafetyProgress(`login: after SSO submit url=${page.url()}`);
  await logSafetyPageState("login: page state after SSO submit", page);

  logSafetyProgress(
    "login: waiting briefly for safety domain after SSO submit",
  );
  let reachedSafetyDomain = await waitForSafetyDomainPage(page, 10_000);
  if (reachedSafetyDomain) {
    logSafetyProgress(
      `login: safety domain reached after SSO submit url=${page.url()}`,
    );
  } else {
    logSafetyProgress(
      "login: safety domain not reached after SSO submit, checking continuation",
    );
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      logSafetyProgress(
        `login: password-change continuation attempt=${attempt}`,
      );
      const continued = await continuePastSsoPasswordChangePageIfNeeded(page);
      if (!continued) {
        break;
      }

      logSafetyProgress(
        "login: waiting briefly for safety domain after continuation",
      );
      reachedSafetyDomain = await waitForSafetyDomainPage(page, 10_000);
      if (reachedSafetyDomain) {
        logSafetyProgress(
          `login: safety domain reached after continuation url=${page.url()}`,
        );
        break;
      }
    }
  }

  logSafetyProgress("login: waiting for safety domain page");
  reachedSafetyDomain =
    reachedSafetyDomain ||
    (await waitForSafetyDomainPage(page, SAFETY_TOOL_TIMEOUT_MS));
  if (!reachedSafetyDomain) {
    throw new CliError(
      "Safety SSO 로그인 후 Safety 도메인으로 이동하지 못했습니다.",
    );
  }
  logSafetyProgress(`login: safety domain reached url=${page.url()}`);
  await logSafetyPageState(
    "login: page state after safety domain reached",
    page,
  );
  await page
    .waitForLoadState("networkidle", { timeout: SAFETY_TOOL_TIMEOUT_MS })
    .catch(() => null);
  logSafetyProgress(`login: done url=${page.url()}`);
  await logSafetyPageState("login: final page state", page);
}

async function openSafetyOnlineEducation(page: Page): Promise<void> {
  const labNo = new URL(page.url()).searchParams.get("LabNo");
  const urls = [
    SAFETY_ONLINE_EDU_URL,
    labNo
      ? `${SAFETY_ONLINE_EDU_FALLBACK_URL}?LabNo=${encodeURIComponent(labNo)}`
      : SAFETY_ONLINE_EDU_FALLBACK_URL,
  ];

  for (const url of urls) {
    logSafetyProgress(`online-edu: goto ${url}`);
    await page
      .goto(url, {
        waitUntil: "domcontentloaded",
        timeout: SAFETY_TOOL_TIMEOUT_MS,
      })
      .catch(() => null);
    logSafetyProgress(`online-edu: after goto url=${page.url()}`);
    await logSafetyPageState("online-edu: page state after goto", page);

    logSafetyProgress("online-edu: waiting for #scheduleNo visibility");
    if (
      await page
        .locator("#scheduleNo")
        .isVisible({ timeout: SAFETY_TOOL_TIMEOUT_MS })
        .catch(() => false)
    ) {
      await page.waitForTimeout(2_000);
      logSafetyProgress("online-edu: schedule selector visible");
      await logSafetyPageState(
        "online-edu: page state with schedule selector",
        page,
      );
      return;
    }

    logSafetyProgress("online-edu: schedule selector not visible");
    await logSafetyPageState(
      "online-edu: page state without schedule selector",
      page,
    );
  }

  throw new CliError("연구실안전교육 과정 선택 요소를 찾지 못했습니다.");
}

async function getPageSnapshot(page: Page): Promise<PageSnapshot> {
  return page.evaluate(() => {
    const selectedSchedule =
      document.querySelector<HTMLSelectElement>("#scheduleNo");
    const selectedOption = selectedSchedule?.selectedOptions.item(0);
    const bodyText = document.body?.innerText ?? "";
    const courseSelectButton =
      document.querySelector<HTMLElement>("#btnMappingContent");

    return {
      schedule: {
        value: selectedSchedule?.value ?? "",
        label: selectedOption?.textContent?.trim() ?? "",
      },
      progressStatus:
        bodyText
          .match(/교육진행상태\s*>\s*([^\n\r]+)/u)?.[1]
          ?.replace(/\s+/g, " ")
          .trim() ?? "",
      bodyText,
      hasVisibleCourseSelectButton: courseSelectButton
        ? Boolean(
            courseSelectButton.offsetWidth ||
            courseSelectButton.offsetHeight ||
            courseSelectButton.getClientRects().length,
          )
        : false,
    };
  });
}

async function getCompletionRows(
  page: Page,
): Promise<SafetyEducationCourseCompletion[]> {
  logSafetyProgress("completion: extracting table rows from page");
  const rows = await page.evaluate(() => {
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

    return Array.from(
      document.querySelectorAll<HTMLTableRowElement>("table tr"),
    )
      .map((row) =>
        Array.from(row.cells).map((cell) => {
          const inputValues = Array.from(
            cell.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
              "input, button",
            ),
          )
            .map((input) => input.value || input.innerText || "")
            .filter(Boolean)
            .join(" ");
          return normalize(
            [cell.innerText, inputValues].filter(Boolean).join(" "),
          );
        }),
      )
      .filter((cells) => /^\d+$/.test(cells[0] ?? ""));
  });

  logSafetyProgress(
    `completion: raw numeric table row count=${rows.length} rows=${JSON.stringify(
      rows.map((cells) => cells.slice(0, 7)),
    )}`,
  );
  const parsedRows = parseSafetyEducationCompletionRows(rows);
  logSafetyProgress(
    `completion: parsed rows=${JSON.stringify(
      parsedRows.map((course) => ({
        rowNumber: course.rowNumber,
        title: course.title,
        statusText: course.statusText,
        completed: course.completed,
      })),
    )}`,
  );

  return parsedRows;
}

async function getSafetyEducationCompletionResult(
  page: Page,
): Promise<SafetyEducationCompletionResult> {
  logSafetyProgress("completion: snapshot begin");
  await logSafetyPageState("completion: page state before snapshot", page);
  const snapshot = await getPageSnapshot(page);
  logSafetyProgress(
    `completion: snapshot scheduleValue=${snapshot.schedule.value || "(empty)"} scheduleLabel=${snapshot.schedule.label || "(empty)"} progress=${snapshot.progressStatus || "(empty)"} hasCourseSelectButton=${snapshot.hasVisibleCourseSelectButton} bodyTextLength=${snapshot.bodyText.length}`,
  );
  if (!snapshot.schedule.value || snapshot.bodyText.includes("통합로그인")) {
    throw new CliError(
      "Safety SSO 로그인 후 연구실안전교육 페이지 진입에 실패했습니다.",
    );
  }

  const courses = await getCompletionRows(page);
  if (courses.length === 0) {
    throw new CliError("연구실안전교육 수강 현황 과목 목록을 찾지 못했습니다.");
  }

  const incompleteCourses = courses.filter((course) => !course.completed);
  const counts = getCompletionCounts(courses);
  logSafetyProgress(
    `completion: result allCompleted=${incompleteCourses.length === 0} total=${counts.total} completed=${counts.completed} incomplete=${counts.incomplete}`,
  );

  return {
    allCompleted: incompleteCourses.length === 0,
    schedule: snapshot.schedule,
    progressStatus: snapshot.progressStatus,
    counts,
    courses,
    incompleteCourses,
    finalUrl: page.url(),
  };
}

async function openCourseSelectionDialog(page: Page): Promise<void> {
  logSafetyProgress("course-selection: clicking #btnMappingContent");
  await logSafetyPageState(
    "course-selection: page state before dialog click",
    page,
  );
  await page.click("#btnMappingContent");
  logSafetyProgress(
    "course-selection: clicked #btnMappingContent, waiting for dialog",
  );
  await page.waitForFunction(
    () => {
      const dialog = document.querySelector<HTMLElement>("#divMappingContent");
      return (
        dialog &&
        Boolean(
          dialog.offsetWidth ||
          dialog.offsetHeight ||
          dialog.getClientRects().length,
        ) &&
        dialog.innerText.includes("과목선택 현황")
      );
    },
    null,
    { timeout: SAFETY_TOOL_TIMEOUT_MS },
  );
  logSafetyProgress("course-selection: dialog visible");
  await logSafetyPageState(
    "course-selection: page state after dialog opened",
    page,
  );
}

async function getCourseSelectionSnapshot(
  page: Page,
): Promise<BrowserCourseSelectionSnapshot> {
  logSafetyProgress("course-selection: reading dialog snapshot");
  const snapshot = await page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>("#divMappingContent");
    const text = dialog?.innerText ?? "";
    const statusMatch = text.match(
      /과목선택\s*현황\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/u,
    );
    const checkboxes = Array.from(
      dialog?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ??
        [],
    );

    return {
      selectionStatus:
        statusMatch?.[1] && statusMatch[2]
          ? {
              selected: Number.parseFloat(statusMatch[1]),
              required: Number.parseFloat(statusMatch[2]),
              raw: `${statusMatch[1]} / ${statusMatch[2]}`,
            }
          : null,
      courses: checkboxes.map((input, index) => ({
        index,
        name: input.name,
        value: input.value,
        title: (input.closest("tr")?.innerText ?? "")
          .replace(/\s+/g, " ")
          .trim(),
        checked: input.checked,
        disabled: input.disabled,
      })),
    };
  });
  logSafetyProgress(
    `course-selection: dialog snapshot selection=${snapshot.selectionStatus?.raw ?? "(missing)"} courses=${snapshot.courses.length} checked=${snapshot.courses.filter((course) => course.checked).length} disabled=${snapshot.courses.filter((course) => course.disabled).length}`,
  );
  logSafetyProgress(
    `course-selection: dialog courses=${JSON.stringify(
      snapshot.courses.map((course) => ({
        index: course.index,
        title: course.title,
        checked: course.checked,
        disabled: course.disabled,
      })),
    )}`,
  );

  return snapshot;
}

async function checkCoursesInDialog(
  page: Page,
  selectedCourses: SelectedSafetyEducationCourse[],
): Promise<SafetyEducationSelectionStatus | null> {
  logSafetyProgress(
    `course-selection: checking courses in dialog count=${selectedCourses.length} selected=${JSON.stringify(selectedCourses)}`,
  );
  const status = await page.evaluate((coursesToSelect) => {
    const dialog = document.querySelector<HTMLElement>("#divMappingContent");
    const selectedKeys = new Set(
      coursesToSelect.map((course) => `${course.index}|${course.value}`),
    );
    const checkboxes = Array.from(
      dialog?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ??
        [],
    );

    for (const input of checkboxes) {
      const index = checkboxes.indexOf(input);
      if (!selectedKeys.has(`${index}|${input.value}`)) {
        continue;
      }

      input.click();
    }

    const text = dialog?.innerText ?? "";
    const statusMatch = text.match(
      /과목선택\s*현황\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/u,
    );

    return statusMatch?.[1] && statusMatch[2]
      ? {
          selected: Number.parseFloat(statusMatch[1]),
          required: Number.parseFloat(statusMatch[2]),
          raw: `${statusMatch[1]} / ${statusMatch[2]}`,
        }
      : null;
  }, selectedCourses);
  logSafetyProgress(
    `course-selection: status after browser clicks=${status ? `${status.selected}/${status.required}` : "(missing)"}`,
  );

  return status;
}

async function saveCourseSelection(page: Page): Promise<void> {
  logSafetyProgress("course-selection: save begin");
  await logSafetyPageState("course-selection: page state before save", page);
  const navigation = page
    .waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: SAFETY_TOOL_TIMEOUT_MS,
    })
    .catch(() => null);
  logSafetyProgress("course-selection: clicking #MappingContent_btnSave");
  await page.click("#MappingContent_btnSave");
  logSafetyProgress(
    "course-selection: save clicked, awaiting navigation promise",
  );
  await navigation;
  logSafetyProgress("course-selection: navigation promise settled after save");
  await page.waitForTimeout(3_000);
  await logSafetyPageState(
    "course-selection: page state after save wait",
    page,
  );
}

async function markIncompleteCourseButton(
  page: Page,
  rowNumber: number,
  marker: string,
): Promise<void> {
  logSafetyProgress(
    `video-open: marking 수강하기 button row=${rowNumber} marker=${marker}`,
  );
  await logSafetyPageState(
    "video-open: page state before marking button",
    page,
  );
  const marked = await page.evaluate(
    ({ selectedRowNumber, targetMarker }) => {
      const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
      const rows = Array.from(
        document.querySelectorAll<HTMLTableRowElement>("table tr"),
      );
      const row = rows.find(
        (candidate) =>
          normalize(candidate.cells[0]?.innerText ?? "") ===
          String(selectedRowNumber),
      );
      if (!row) {
        return false;
      }

      const controls = Array.from(
        row.querySelectorAll<
          HTMLInputElement | HTMLButtonElement | HTMLAnchorElement
        >("input, button, a"),
      );
      const action = controls.find((control) => {
        const inputValue =
          control instanceof HTMLInputElement ||
          control instanceof HTMLButtonElement
            ? control.value
            : "";
        const text = normalize(
          [inputValue, control.textContent ?? "", control.title ?? ""]
            .filter(Boolean)
            .join(" "),
        );

        return text.includes("수강하기");
      });
      if (!action) {
        return false;
      }

      action.setAttribute("data-mju-cli-video-target", targetMarker);
      return true;
    },
    { selectedRowNumber: rowNumber, targetMarker: marker },
  );
  logSafetyProgress(
    `video-open: mark result row=${rowNumber} marked=${marked}`,
  );

  if (!marked) {
    throw new CliError(
      `미완료 과목 ${rowNumber}번 행에서 수강하기 버튼을 찾지 못했습니다.`,
    );
  }
}

async function openIncompleteCourseVideoPage(
  page: Page,
  course: SafetyEducationCourseCompletion,
): Promise<Page> {
  const marker = `mju-video-target-${Date.now()}-${course.rowNumber}`;
  logSafetyProgress(
    `video-open: begin row=${course.rowNumber} title=${course.title} marker=${marker}`,
  );
  await markIncompleteCourseButton(page, course.rowNumber, marker);

  logSafetyProgress("video-open: creating popup wait promise");
  const popupPromise = page
    .waitForEvent("popup", { timeout: SAFETY_TOOL_TIMEOUT_MS })
    .catch(() => null);
  logSafetyProgress(`video-open: clicking marked target marker=${marker}`);
  await page.locator(`[data-mju-cli-video-target="${marker}"]`).click();
  logSafetyProgress("video-open: click returned, awaiting popup");
  const popup = await popupPromise;
  if (!popup) {
    throw new CliError("수강하기 버튼 클릭 후 영상 팝업을 찾지 못했습니다.");
  }

  logSafetyProgress(`video-open: popup detected url=${popup.url()}`);
  configureSafetyPageTimeouts(popup);
  await logSafetyPageState(
    "video-open: popup state before domcontentloaded wait",
    popup,
  );
  await popup
    .waitForLoadState("domcontentloaded", { timeout: SAFETY_TOOL_TIMEOUT_MS })
    .catch(() => null);
  logSafetyProgress(
    `video-open: popup domcontentloaded wait settled url=${popup.url()}`,
  );
  await popup.waitForTimeout(1_000);
  await logSafetyPageState("video-open: popup state after initial wait", popup);

  return popup;
}

async function runFixedConsoleLogForIncompleteCourse(
  page: Page,
  course: SafetyEducationCourseCompletion,
): Promise<FixedConsoleLogExecution> {
  logSafetyProgress(
    `video-probe: begin row=${course.rowNumber} title=${course.title}`,
  );
  const popup = await openIncompleteCourseVideoPage(page, course);
  const consoleMessages: SafetyEducationConsoleMessage[] = [];
  const pendingConsoleMessages: Promise<void>[] = [];
  const handleConsole = (message: ConsoleMessage) => {
    logSafetyProgress(
      `video-probe: console event type=${message.type()} text=${message.text()}`,
    );
    if (message.type() !== "log") {
      return;
    }

    const pending = (async () => {
      const args = await Promise.all(
        message.args().map(async (arg) => {
          try {
            return await arg.jsonValue();
          } catch {
            return arg.toString();
          }
        }),
      );

      consoleMessages.push({
        type: message.type(),
        text: message.text(),
        args,
      });
      logSafetyProgress(
        `video-probe: captured console log args=${JSON.stringify(args)}`,
      );
    })();

    pendingConsoleMessages.push(pending);
  };

  popup.on("console", handleConsole);

  const isTargetClosedError = (error: unknown) =>
    error instanceof Error &&
    /Target page, context or browser has been closed/i.test(error.message);

  try {
    logSafetyProgress(
      `video-probe: executing fixed script=${FIXED_VIDEO_CONSOLE_LOG_SCRIPT}`,
    );

    await logSafetyPageState(
      "video-probe: popup state before fixed script",
      popup,
    );

    let result: unknown = null;
    let evaluateCompleted = false;
    let popupClosedDuringEvaluate = false;

    try {
      result = await popup.evaluate(async () => {
        const video = document.querySelector(
          "video",
        ) as HTMLVideoElement | null;

        if (!video) {
          throw new Error("video element not found");
        }

        const sleep = (ms: number) =>
          new Promise<void>((resolve) => setTimeout(resolve, ms));

        const safeDuration = Number.isFinite(video.duration)
          ? video.duration
          : 0;

        video.currentTime = safeDuration;
        video.dispatchEvent(new Event("timeupdate"));
        video.dispatchEvent(new Event("ended"));

        video.currentTime = Math.max(safeDuration - 1, 0);
        video.dispatchEvent(new Event("timeupdate"));

        try {
          await video.play();
        } catch (error) {
          console.log("video play failed", error);
        }

        await sleep(1500);

        video.pause();
        video.currentTime = safeDuration;
        video.dispatchEvent(new Event("timeupdate"));
        video.dispatchEvent(new Event("ended"));

        await sleep(1000);

        return {
          duration: video.duration,
          currentTime: video.currentTime,
          paused: video.paused,
          ended: video.ended,
        };
      });

      evaluateCompleted = true;

      logSafetyProgress(
        `video-probe: fixed script evaluate returned result=${JSON.stringify(result)}`,
      );
    } catch (error) {
      if (isTargetClosedError(error) || popup.isClosed()) {
        popupClosedDuringEvaluate = true;

        logSafetyProgress(
          "video-probe: popup/context closed during fixed script evaluate; treating as expected",
        );
      } else {
        throw error;
      }
    }

    const consoleSettled = await Promise.allSettled(pendingConsoleMessages);

    logSafetyProgress(
      `video-probe: console handler wait settled capturedCount=${consoleMessages.length} evaluateCompleted=${evaluateCompleted} popupClosedDuringEvaluate=${popupClosedDuringEvaluate} consoleSettled=${consoleSettled.length}`,
    );

    return {
      consoleMessages,
      popup: {
        title: "",
        url: "",
      },
    };
  } finally {
    logSafetyProgress(`video-probe: cleanup row=${course.rowNumber}`);

    popup.off("console", handleConsole);

    await popup.close().catch(() => null);

    logSafetyProgress(
      `video-probe: popup close attempted row=${course.rowNumber}`,
    );
  }
}

export async function selectSafetyEducationCourses(
  options: SafetyEducationSelectCoursesOptions,
): Promise<SafetyEducationSelectCoursesResult> {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless: options.headless ?? true,
    timeout: SAFETY_TOOL_TIMEOUT_MS,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  configureSafetyPageTimeouts(page);

  try {
    await loginToSafety(page, options);
    await openSafetyOnlineEducation(page);

    const initialSnapshot = await getPageSnapshot(page);
    if (
      !initialSnapshot.schedule.value ||
      initialSnapshot.bodyText.includes("통합로그인")
    ) {
      throw new CliError(
        "Safety SSO 로그인 후 연구실안전교육 페이지 진입에 실패했습니다.",
      );
    }

    if (!initialSnapshot.hasVisibleCourseSelectButton) {
      return {
        status: "alreadySelected",
        saved: false,
        dryRun: options.dryRun === true,
        schedule: initialSnapshot.schedule,
        before: {
          progressStatus: initialSnapshot.progressStatus,
        },
        selectedCourses: [],
        finalUrl: page.url(),
      };
    }

    await openCourseSelectionDialog(page);
    const beforeSelection = await getCourseSelectionSnapshot(page);
    if (!beforeSelection.selectionStatus) {
      throw new CliError("과목선택 모달에서 선택 현황을 찾지 못했습니다.");
    }

    const neededCount = calculateNeededSafetyEducationCourseCount(
      beforeSelection.selectionStatus,
    );
    const selectedCourses = chooseSafetyEducationCourses(
      beforeSelection.courses,
      neededCount,
    );

    if (selectedCourses.length < neededCount) {
      throw new CliError(
        `선택 가능한 과목이 부족합니다. 필요 ${neededCount}개, 가능 ${selectedCourses.length}개`,
      );
    }

    if (options.dryRun || neededCount === 0) {
      return {
        status: options.dryRun ? "dryRun" : "alreadySelected",
        saved: false,
        dryRun: options.dryRun === true,
        schedule: initialSnapshot.schedule,
        before: {
          progressStatus: initialSnapshot.progressStatus,
          selectionStatus: beforeSelection.selectionStatus,
        },
        selectedCourses,
        finalUrl: page.url(),
      };
    }

    const afterCheckStatus = await checkCoursesInDialog(page, selectedCourses);
    if (
      !afterCheckStatus ||
      afterCheckStatus.selected < afterCheckStatus.required
    ) {
      throw new CliError("과목선택 현황을 충족하지 못했습니다.");
    }

    await saveCourseSelection(page);
    const finalSnapshot = await getPageSnapshot(page);
    if (finalSnapshot.progressStatus !== "교육수강") {
      throw new CliError(
        `과목선택 저장 후 예상 상태가 아닙니다: ${finalSnapshot.progressStatus || "unknown"}`,
      );
    }

    return {
      status: "selected",
      saved: true,
      dryRun: false,
      schedule: finalSnapshot.schedule.value
        ? finalSnapshot.schedule
        : initialSnapshot.schedule,
      before: {
        progressStatus: initialSnapshot.progressStatus,
        selectionStatus: beforeSelection.selectionStatus,
      },
      selectedCourses,
      after: {
        progressStatus: finalSnapshot.progressStatus,
        selectionStatus: afterCheckStatus,
      },
      finalUrl: page.url(),
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

export async function checkSafetyEducationCompletion(
  options: SafetyEducationCheckCompletionOptions,
): Promise<SafetyEducationCompletionResult> {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless: options.headless ?? true,
    timeout: SAFETY_TOOL_TIMEOUT_MS,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  configureSafetyPageTimeouts(page);

  try {
    await loginToSafety(page, options);
    await openSafetyOnlineEducation(page);

    return await getSafetyEducationCompletionResult(page);
  } finally {
    await context.close();
    await browser.close();
  }
}

export async function runSafetyEducationIncompleteVideoLog(
  options: SafetyEducationRunIncompleteVideoLogOptions,
): Promise<SafetyEducationRunIncompleteVideoLogResult> {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless: options.headless ?? true,
    timeout: SAFETY_TOOL_TIMEOUT_MS,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  configureSafetyPageTimeouts(page);

  try {
    await loginToSafety(page, options);
    await openSafetyOnlineEducation(page);

    const snapshot = await getPageSnapshot(page);
    if (!snapshot.schedule.value || snapshot.bodyText.includes("통합로그인")) {
      throw new CliError(
        "Safety SSO 로그인 후 연구실안전교육 페이지 진입에 실패했습니다.",
      );
    }

    const courses = await getCompletionRows(page);
    if (courses.length === 0) {
      throw new CliError(
        "연구실안전교육 수강 현황 과목 목록을 찾지 못했습니다.",
      );
    }

    const counts = getCompletionCounts(courses);
    const targetCourse = chooseIncompleteSafetyEducationCourse(
      courses,
      options.rowNumber,
    );

    if (!targetCourse) {
      return {
        status: "noIncompleteCourses",
        schedule: snapshot.schedule,
        progressStatus: snapshot.progressStatus,
        counts,
        fixedScript: FIXED_VIDEO_CONSOLE_LOG_SCRIPT,
        consoleMessages: [],
        finalUrl: page.url(),
      };
    }

    const execution = await runFixedConsoleLogForIncompleteCourse(
      page,
      targetCourse,
    );

    return {
      status: "executed",
      schedule: snapshot.schedule,
      progressStatus: snapshot.progressStatus,
      counts,
      targetCourse,
      fixedScript: FIXED_VIDEO_CONSOLE_LOG_SCRIPT,
      consoleMessages: execution.consoleMessages,
      popup: execution.popup,
      finalUrl: page.url(),
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

export async function runSafetyEducationIncompleteVideoLogs(
  options: SafetyEducationRunIncompleteVideoLogsOptions,
): Promise<SafetyEducationCompletionResult> {
  logSafetyProgress("run-incomplete-videos: start");
  const { chromium } = await loadPlaywright();
  logSafetyProgress("run-incomplete-videos: launching browser");
  const browser = await chromium.launch({
    headless: options.headless ?? true,
    timeout: SAFETY_TOOL_TIMEOUT_MS,
  });
  logSafetyProgress("run-incomplete-videos: creating browser context");
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  configureSafetyPageTimeouts(page);
  logSafetyProgress("run-incomplete-videos: browser page ready");

  try {
    logSafetyProgress("run-incomplete-videos: login step begin");
    await loginToSafety(page, options);
    logSafetyProgress(
      `run-incomplete-videos: login step done url=${page.url()}`,
    );

    logSafetyProgress(
      "run-incomplete-videos: open online education step begin",
    );
    await openSafetyOnlineEducation(page);
    logSafetyProgress(
      `run-incomplete-videos: open online education step done url=${page.url()}`,
    );

    logSafetyProgress("run-incomplete-videos: reading initial page snapshot");
    const initialSnapshot = await getPageSnapshot(page);
    logSafetyProgress(
      `run-incomplete-videos: initial snapshot schedule=${initialSnapshot.schedule.label || "(empty)"} progress=${initialSnapshot.progressStatus || "(empty)"} hasCourseSelectButton=${initialSnapshot.hasVisibleCourseSelectButton}`,
    );
    if (
      !initialSnapshot.schedule.value ||
      initialSnapshot.bodyText.includes("통합로그인")
    ) {
      throw new CliError(
        "Safety SSO 로그인 후 연구실안전교육 페이지 진입에 실패했습니다.",
      );
    }

    if (initialSnapshot.hasVisibleCourseSelectButton) {
      logSafetyProgress("run-incomplete-videos: course selection required");
      logSafetyProgress(
        "run-incomplete-videos: opening course selection dialog",
      );
      await openCourseSelectionDialog(page);
      logSafetyProgress(
        "run-incomplete-videos: course selection dialog opened",
      );
      const beforeSelection = await getCourseSelectionSnapshot(page);
      if (!beforeSelection.selectionStatus) {
        throw new CliError("과목선택 모달에서 선택 현황을 찾지 못했습니다.");
      }
      logSafetyProgress(
        `run-incomplete-videos: selection status before selected=${beforeSelection.selectionStatus.selected} required=${beforeSelection.selectionStatus.required} courses=${beforeSelection.courses.length}`,
      );

      const neededCount = calculateNeededSafetyEducationCourseCount(
        beforeSelection.selectionStatus,
      );
      logSafetyProgress(
        `run-incomplete-videos: calculated needed course count=${neededCount}`,
      );
      const selectedCourses = chooseSafetyEducationCourses(
        beforeSelection.courses,
        neededCount,
      );
      logSafetyProgress(
        `run-incomplete-videos: selected candidate count=${selectedCourses.length}`,
      );

      if (selectedCourses.length < neededCount) {
        throw new CliError(
          `선택 가능한 과목이 부족합니다. 필요 ${neededCount}개, 가능 ${selectedCourses.length}개`,
        );
      }

      if (neededCount > 0) {
        logSafetyProgress(
          "run-incomplete-videos: checking selected courses in dialog",
        );
        const afterCheckStatus = await checkCoursesInDialog(
          page,
          selectedCourses,
        );
        if (
          !afterCheckStatus ||
          afterCheckStatus.selected < afterCheckStatus.required
        ) {
          throw new CliError("과목선택 현황을 충족하지 못했습니다.");
        }
        logSafetyProgress(
          `run-incomplete-videos: selection status after check selected=${afterCheckStatus.selected} required=${afterCheckStatus.required}`,
        );

        logSafetyProgress("run-incomplete-videos: saving course selection");
        await saveCourseSelection(page);
        logSafetyProgress(
          "run-incomplete-videos: course selection save returned",
        );
        const finalSnapshot = await getPageSnapshot(page);
        logSafetyProgress(
          `run-incomplete-videos: page snapshot after save progress=${finalSnapshot.progressStatus || "(empty)"}`,
        );
        if (finalSnapshot.progressStatus !== "교육수강") {
          throw new CliError(
            `과목선택 저장 후 예상 상태가 아닙니다: ${finalSnapshot.progressStatus || "unknown"}`,
          );
        }
      } else {
        logSafetyProgress(
          "run-incomplete-videos: no additional course selection needed",
        );
      }

      logSafetyProgress(
        "run-incomplete-videos: reopening online education after selection dialog",
      );
      await openSafetyOnlineEducation(page);
    } else {
      logSafetyProgress("run-incomplete-videos: course selection not required");
    }

    logSafetyProgress(
      "run-incomplete-videos: reading initial completion result",
    );
    const initialCompletion = await getSafetyEducationCompletionResult(page);
    logSafetyProgress(
      `run-incomplete-videos: initial completion total=${initialCompletion.counts.total} completed=${initialCompletion.counts.completed} incomplete=${initialCompletion.counts.incomplete}`,
    );
    if (initialCompletion.incompleteCourses.length > 0) {
      logSafetyProgress(
        `run-incomplete-videos: incomplete rows=${initialCompletion.incompleteCourses
          .map((course) => `${course.rowNumber}:${course.title}`)
          .join(" | ")}`,
      );
    } else {
      logSafetyProgress("run-incomplete-videos: no incomplete courses found");
    }

    for (const course of initialCompletion.incompleteCourses) {
      console.error(
        `[safety] run-incomplete-videos: before runFixedConsoleLogForIncompleteCourse row=${course.rowNumber} title=${course.title}`,
      );
      await openSafetyOnlineEducation(page);
      await runFixedConsoleLogForIncompleteCourse(page, course);
      await page.bringToFront().catch(() => null);
    }

    logSafetyProgress("run-incomplete-videos: reading final completion result");
    await openSafetyOnlineEducation(page);
    return await getSafetyEducationCompletionResult(page);
  } finally {
    logSafetyProgress("run-incomplete-videos: closing browser context");
    await context.close();
    await browser.close();
    logSafetyProgress("run-incomplete-videos: done");
  }
}
