import { load, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";

import type { ResolvedLmsCredentials } from "../auth/types.js";
import type { MjuMsiClient } from "./client.js";
import { MSI_BASE } from "./constants.js";
import { loadMsiMenuSnapshot, openMsiMenu } from "./menu.js";
import type {
  MsiLectureEvaluationChoice,
  MsiLectureEvaluationListResult,
  MsiLectureEvaluationPreviewResult,
  MsiLectureEvaluationQuestion,
  MsiLectureEvaluationSatisfaction,
  MsiLectureEvaluationSatisfactionInference,
  MsiLectureEvaluationScope,
  MsiLectureEvaluationSubmitItem,
  MsiLectureEvaluationSubmitResult,
  MsiLectureEvaluationTarget,
  MsiLectureEvaluationVariant,
  MsiCreditBucket,
  MsiCourseScoreCourse,
  MsiCourseScoreItem,
  MsiCourseScoresResult,
  MsiCourseScoreTermOption,
  MsiCurrentGradeItem,
  MsiCurrentGradesResult,
  MsiGradeHistoryCourse,
  MsiGradeHistoryResult,
  MsiGradeHistoryRow,
  MsiGradeHistoryTermRecord,
  MsiGraduationCreditGap,
  MsiGraduationCreditItem,
  MsiGraduationRequirementsResult,
  MsiLastClassTimesResult,
  MsiMenuSpec,
  MsiScoreValue,
  MsiTimetableEntry,
  MsiTimetableResult,
  MsiTimetableTermOption
} from "./types.js";

export const MSI_TIMETABLE_MENU: MsiMenuSpec = {
  name: "수강과목시간표",
  urlPath: "/servlet/su/sug/Sug00Svl07getTimeTable",
  folderDiv: "102",
  pgmid: "W_SUG016"
};

export const MSI_CURRENT_GRADES_MENU: MsiMenuSpec = {
  name: "수강성적조회",
  urlPath: "/servlet/su/suh/Suh00Svl01showCurrentGrade",
  folderDiv: "104",
  pgmid: "W_SUH005"
};

export const MSI_COURSE_SCORES_MENU: MsiMenuSpec = {
  name: "수강점수조회",
  urlPath: "/servlet/su/suh/Suh00Svl01initScoreView",
  folderDiv: "104",
  pgmid: "W_SUH010"
};

export const MSI_GRADE_HISTORY_MENU: MsiMenuSpec = {
  name: "성적조회",
  urlPath: "/servlet/su/suh/Suh00Svl02studentGradeList",
  folderDiv: "104",
  pgmid: "W_SUH015"
};

export const MSI_GRADUATION_REQUIREMENTS_MENU: MsiMenuSpec = {
  name: "졸업학점조회",
  urlPath: "/servlet/su/sui/Sui00Svl01getGdtRequire",
  folderDiv: "104",
  pgmid: "W_SUI005"
};

export const MSI_LECTURE_EVALUATION_MENU: MsiMenuSpec = {
  name: "강의평가",
  urlPath: "/servlet/su/sug/Sug00Svl02initDeptSatis",
  folderDiv: "102",
  pgmid: "W_SUG020"
};

function cleanText(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/[^\d.-]/g, "");
  if (!normalized) {
    return undefined;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseInteger(value: string | undefined): number | undefined {
  const parsed = parseNumber(value);
  return parsed === undefined ? undefined : Math.trunc(parsed);
}

function parseKeyValueCard(cardHtml: string): Record<string, string> {
  const $ = load(cardHtml);
  const result: Record<string, string> = {};

  $(".flex-table-item").each((_, element) => {
    const title = cleanText($(element).find(".item-title").first().text());
    const valueContainer = $(element).find(".item-data").first().clone();
    valueContainer.find(".tooltip").remove();
    const value = cleanText(valueContainer.text());
    if (title) {
      result[title] = value;
    }
  });

  return result;
}

function parseCreditItems(sectionHtml: string): MsiCreditBucket[] {
  const $ = load(sectionHtml);
  const result: MsiCreditBucket[] = [];

  $(".flex-table-item").each((_, element) => {
    const title = cleanText($(element).find(".item-title").first().text());
    if (!title) {
      return;
    }

    const valueContainer = $(element).find(".item-data").first().clone();
    valueContainer.find(".tooltip").remove();
    const rawValue = cleanText(valueContainer.text());
    const credits = parseNumber(rawValue);
    const item: MsiCreditBucket = {
      label: title,
      rawValue
    };
    if (credits !== undefined) {
      item.credits = credits;
    }

    result.push(item);
  });

  return result;
}

function parseTimetableEntries(html: string): MsiTimetableEntry[] {
  const $ = load(html);
  const dayLabelMap: Record<number, string> = {
    1: "월",
    2: "화",
    3: "수",
    4: "목",
    5: "금",
    6: "토",
    7: "일"
  };

  return $('.detail-item[data-lectureday]')
    .map((_, element) => {
      const dayOfWeek = parseInteger($(element).attr("data-lectureday"));
      const style = $(element).attr("style") ?? "";
      const topPercent = /top:\s*([\d.]+)%/.exec(style)?.[1];
      const heightPercent = /height:\s*([\d.]+)%/.exec(style)?.[1];
      const onclick = $(element).attr("onclick") ?? $(element).attr("onClick") ?? "";
      const courseMatch = /openSyllabi\('([^']+)'\s*,\s*'([^']+)'\)/.exec(onclick);

      return {
        dayOfWeek: dayOfWeek ?? 0,
        dayLabel: dayLabelMap[dayOfWeek ?? 0] ?? "",
        courseTitle: cleanText($(element).find(".name").first().text()),
        ...(cleanText($(element).find(".code").first().text())
          ? { location: cleanText($(element).find(".code").first().text()) }
          : {}),
        ...(cleanText($(element).attr("data-tooltip") ?? "")
          ? { professor: cleanText($(element).attr("data-tooltip") ?? "") }
          : {}),
        ...(cleanText($(element).attr("data-tooltip2") ?? "")
          ? { timeRange: cleanText($(element).attr("data-tooltip2") ?? "") }
          : {}),
        ...(courseMatch?.[1] ? { curiNum: courseMatch[1] } : {}),
        ...(courseMatch?.[2] ? { courseCls: courseMatch[2] } : {}),
        ...(topPercent ? { topPercent: Number.parseFloat(topPercent) } : {}),
        ...(heightPercent ? { heightPercent: Number.parseFloat(heightPercent) } : {})
      };
    })
    .get()
    .filter((entry) => entry.courseTitle);
}

function parseTimetablePage(html: string): MsiTimetableResult {
  const $ = load(html);
  const year = parseInteger(
    $('form[name="form1"] input[name="year"]').first().attr("value")
  );
  const termOptions: MsiTimetableTermOption[] = $('form[name="form1"] select[name="smt"] option')
    .map((_, element) => ({
      code: cleanText($(element).attr("value") ?? ""),
      label: cleanText($(element).text()),
      selected: $(element).is("[selected]") || $(element).is(":selected")
    }))
    .get();
  const selectedTerm = termOptions.find((option) => option.selected) ?? termOptions[0];

  return {
    year: year ?? 0,
    termCode: selectedTerm?.code ?? "",
    termLabel: selectedTerm?.label ?? "",
    termOptions,
    entries: parseTimetableEntries(html)
  };
}

export function parseMsiTimetableTimeRange(
  timeRange: string | undefined
): { startTime: string; endTime: string; startMinutes: number; endMinutes: number } | undefined {
  const normalized = cleanText(timeRange ?? "").replace(/[–—]/g, "-");
  const match = /(\d{1,2}):(\d{2})\s*(?:~|-)\s*(\d{1,2}):(\d{2})/.exec(normalized);
  if (!match) {
    return undefined;
  }

  const startTime = `${match[1]!.padStart(2, "0")}:${match[2]}`;
  const endTime = `${match[3]!.padStart(2, "0")}:${match[4]}`;
  const startMinutes = Number.parseInt(match[1]!, 10) * 60 + Number.parseInt(match[2]!, 10);
  const endMinutes = Number.parseInt(match[3]!, 10) * 60 + Number.parseInt(match[4]!, 10);
  if (endMinutes < startMinutes) {
    return undefined;
  }

  return { startTime, endTime, startMinutes, endMinutes };
}

export function buildMsiLastClassTimes(
  timetable: MsiTimetableResult,
  generatedAt = new Date().toISOString()
): MsiLastClassTimesResult {
  const warnings: string[] = [];
  const latestByDay = new Map<
    number,
    { entry: MsiTimetableEntry; parsed: NonNullable<ReturnType<typeof parseMsiTimetableTimeRange>> }
  >();

  for (const entry of timetable.entries) {
    const parsed = parseMsiTimetableTimeRange(entry.timeRange);
    if (!parsed) {
      warnings.push(
        `${entry.dayLabel || entry.dayOfWeek} ${entry.courseTitle} 시간 범위를 해석하지 못했습니다.`
      );
      continue;
    }

    const dayOfWeek = Number.isFinite(entry.dayOfWeek) ? entry.dayOfWeek : 0;
    if (dayOfWeek < 1 || dayOfWeek > 7) {
      warnings.push(`${entry.courseTitle} 요일 정보를 해석하지 못했습니다.`);
      continue;
    }

    const previous = latestByDay.get(dayOfWeek);
    if (!previous || parsed.endMinutes > previous.parsed.endMinutes) {
      latestByDay.set(dayOfWeek, { entry, parsed });
    }
  }

  const days = [...latestByDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([dayOfWeek, { entry, parsed }]) => ({
      dayOfWeek,
      dayLabel: entry.dayLabel,
      courseTitle: entry.courseTitle,
      ...(entry.location ? { location: entry.location } : {}),
      ...(entry.professor ? { professor: entry.professor } : {}),
      endTime: parsed.endTime,
      timeRange: entry.timeRange ?? `${parsed.startTime}~${parsed.endTime}`
    }));

  return {
    year: timetable.year,
    termCode: timetable.termCode,
    termLabel: timetable.termLabel,
    generatedAt,
    days,
    warnings
  };
}

function extractCurrentGradesTitleMeta(html: string): {
  year?: number;
  termLabel?: string;
} {
  const $ = load(html);
  const title = cleanText($(".con-title").first().text());
  const match = /수강 성적조회 \((\d{4})\s+([^)]+)\)/.exec(title);
  if (!match) {
    return {};
  }

  const result: { year?: number; termLabel?: string } = {};
  const year = parseInteger(match[1]);
  const termLabel = cleanText(match[2]);

  if (year !== undefined) {
    result.year = year;
  }
  if (termLabel) {
    result.termLabel = termLabel;
  }

  return result;
}

function parseCurrentGradesPage(html: string): MsiCurrentGradesResult {
  const $ = load(html);
  const items: MsiCurrentGradeItem[] = [];

  $("tbody.ov").each((_, body) => {
    const row = $(body).find("tr").first();
    const cells = row.find("td");
    if (cells.length < 2) {
      return;
    }

    const courseClass = cleanText(cells.eq(0).text());
    const courseTitle = cleanText(cells.eq(1).text());
    const credits = parseNumber(cleanText(cells.eq(2).text()));
    const hiddenCourseCode =
      cleanText($(body).find('input[name="list_curiNum"]').first().attr("value") ?? "") ||
      undefined;
    const hiddenCourseClass =
      cleanText($(body).find('input[name="list_courseCls"]').first().attr("value") ?? "") ||
      undefined;
    const tailCells = cells.slice(3);
    const tailTexts = tailCells
      .map((__, cell) => cleanText($(cell).text()))
      .get()
      .filter(Boolean);

    const item: MsiCurrentGradeItem = {
      courseTitle,
      ...(hiddenCourseCode ? { courseCode: hiddenCourseCode } : {}),
      ...(hiddenCourseClass || courseClass
        ? { courseClass: hiddenCourseClass ?? courseClass }
        : {}),
      ...(credits !== undefined ? { credits } : {})
    };
    const [firstTailText, secondTailText, thirdTailText] = tailTexts;

    if (tailTexts.length === 1 && tailCells.first().attr("colspan") && firstTailText) {
      item.statusMessage = firstTailText;
    } else {
      if (firstTailText) {
        item.grade = firstTailText;
      }
      if (secondTailText) {
        item.publicStatus = secondTailText;
      }
      if (thirdTailText) {
        item.lectureEvaluationStatus = thirdTailText;
      }
    }

    items.push(item);
  });

  return {
    ...extractCurrentGradesTitleMeta(html),
    items
  };
}

function parseScoreValue(value: string | undefined): MsiScoreValue {
  const rawValue = cleanText(value);
  const result: MsiScoreValue = { rawValue };
  const pairMatch = /^(.+?)\s*\/\s*(.+?)(?:\s*(?:%|점))?$/.exec(rawValue);

  if (pairMatch) {
    const earned = parseNumber(pairMatch[1]);
    const total = parseNumber(pairMatch[2]);
    if (earned !== undefined) {
      result.earned = earned;
    }
    if (total !== undefined) {
      result.total = total;
    }
    return result;
  }

  const parsed = parseNumber(rawValue);
  if (parsed !== undefined) {
    result.value = parsed;
  }

  return result;
}

function parseCourseScoreTermOptions(html: string): MsiCourseScoreTermOption[] {
  const $ = load(html);

  return $('form[name="form1"] select[name="smt"] option')
    .map((_, element) => ({
      code: cleanText($(element).attr("value") ?? ""),
      label: cleanText($(element).text()),
      selected: $(element).is("[selected]") || $(element).is(":selected")
    }))
    .get();
}

function parseCourseScoreTitle(title: string): {
  courseCode?: string;
  courseTitle: string;
} {
  const match = /^(.+?)\s*-\s*(.+)$/.exec(title);
  if (!match) {
    return { courseTitle: title };
  }

  return {
    courseCode: cleanText(match[1]),
    courseTitle: cleanText(match[2])
  };
}

function parseCourseScoreItems(cardHtml: string): MsiCourseScoreItem[] {
  const $ = load(cardHtml);
  const items: MsiCourseScoreItem[] = [];
  let currentAssessmentCategory = "";

  $("table tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 5) {
      return;
    }

    const firstCell = cells.eq(0);
    const hasAssessmentCategoryCell =
      cells.length >= 6 || firstCell.attr("rowspan") !== undefined;
    const assessmentCategory = hasAssessmentCategoryCell
      ? cleanText(firstCell.text())
      : currentAssessmentCategory;
    const offset = hasAssessmentCategoryCell ? 1 : 0;
    const itemName = cleanText(cells.eq(offset).text());

    if (!assessmentCategory && !itemName) {
      return;
    }
    if (assessmentCategory) {
      currentAssessmentCategory = assessmentCategory;
    }

    const note = cleanText(cells.eq(offset + 4).text());
    const item: MsiCourseScoreItem = {
      assessmentCategory,
      itemName,
      ratio: parseScoreValue(cells.eq(offset + 1).text()),
      rawScore: parseScoreValue(cells.eq(offset + 2).text()),
      averageScore: parseScoreValue(cells.eq(offset + 3).text())
    };
    if (note) {
      item.note = note;
    }

    items.push(item);
  });

  return items;
}

export function parseMsiCourseScoresPage(html: string): MsiCourseScoresResult {
  const $ = load(html);
  const year = parseInteger(
    $('form[name="form1"] input[name="year"]').first().attr("value")
  );
  const termOptions = parseCourseScoreTermOptions(html);
  const selectedTerm = termOptions.find((option) => option.selected) ?? termOptions[0];
  const courses: MsiCourseScoreCourse[] = $(".card-item.basic")
    .map((_, card) => {
      const title = cleanText($(card).children(".data-title").first().text());
      if (!title || $(card).find("table").length === 0) {
        return null;
      }

      const titleParts = parseCourseScoreTitle(title);
      const course: MsiCourseScoreCourse = {
        title,
        ...titleParts,
        items: parseCourseScoreItems($(card).html() ?? "")
      };

      return course;
    })
    .get()
    .filter((course): course is MsiCourseScoreCourse => course !== null);

  return {
    year: year ?? 0,
    termCode: selectedTerm?.code ?? "",
    termLabel: selectedTerm?.label ?? "",
    termOptions,
    courses
  };
}

function parseHistorySummaryMetrics(text: string): {
  requestedCredits?: number;
  earnedCredits?: number;
  totalPoints?: number;
  gpa?: number;
} {
  const requestedMatch = /신청학점\s*:\s*([\d.]+)/.exec(text);
  const earnedMatch = /취득학점\s*:\s*([\d.]+)/.exec(text);
  const totalPointsMatch = /전체평점\s*:\s*([\d.]+)/.exec(text);
  const gpaMatch = /평점평균\s*:\s*([\d.]+)/.exec(text);

  const result: {
    requestedCredits?: number;
    earnedCredits?: number;
    totalPoints?: number;
    gpa?: number;
  } = {};
  const requestedCredits = requestedMatch?.[1] ? parseNumber(requestedMatch[1]) : undefined;
  const earnedCredits = earnedMatch?.[1] ? parseNumber(earnedMatch[1]) : undefined;
  const totalPoints = totalPointsMatch?.[1] ? parseNumber(totalPointsMatch[1]) : undefined;
  const gpa = gpaMatch?.[1] ? parseNumber(gpaMatch[1]) : undefined;

  if (requestedCredits !== undefined) {
    result.requestedCredits = requestedCredits;
  }
  if (earnedCredits !== undefined) {
    result.earnedCredits = earnedCredits;
  }
  if (totalPoints !== undefined) {
    result.totalPoints = totalPoints;
  }
  if (gpa !== undefined) {
    result.gpa = gpa;
  }

  return result;
}

function parseGradeHistoryTermCards(html: string): MsiGradeHistoryTermRecord[] {
  const $ = load(html);
  const result: MsiGradeHistoryTermRecord[] = [];

  $(".card-item.basic").each((_, card) => {
    const title = cleanText($(card).children(".data-title").first().text());
    const titleMatch = /^(\d{4})년도\s+(.+)\s+성적$/.exec(title);
    if (!titleMatch) {
      return;
    }

    const detailText = cleanText(
      $(card).children(".data-title.small.font-color-blue").first().text()
    );
    const courses: MsiGradeHistoryCourse[] = $(card)
      .find("table tbody tr")
      .map((__, row) => {
        const cells = $(row).find("td");
        if (cells.length < 5) {
          return null;
        }

        const credits = parseNumber(cleanText(cells.eq(3).text()));
        const course: MsiGradeHistoryCourse = {
          category: cleanText(cells.eq(0).text()),
          courseCode: cleanText(cells.eq(1).text()),
          courseTitle: cleanText(cells.eq(2).text()),
          grade: cleanText(cells.eq(4).text())
        };
        if (credits !== undefined) {
          course.credits = credits;
        }

        return course;
      })
      .get()
      .filter((course): course is MsiGradeHistoryCourse => course !== null);

    const year = parseInteger(titleMatch[1]);
    const record: MsiGradeHistoryTermRecord = {
      title,
      termLabel: cleanText(titleMatch[2]),
      courses
    };
    if (year !== undefined) {
      record.year = year;
    }

    const metrics = parseHistorySummaryMetrics(detailText);
    if (metrics.requestedCredits !== undefined) {
      record.requestedCredits = metrics.requestedCredits;
    }
    if (metrics.earnedCredits !== undefined) {
      record.earnedCredits = metrics.earnedCredits;
    }
    if (metrics.totalPoints !== undefined) {
      record.totalPoints = metrics.totalPoints;
    }
    if (metrics.gpa !== undefined) {
      record.gpa = metrics.gpa;
    }

    result.push(record);
  });

  return result;
}

function parseComprehensiveGradeRows(html: string): MsiGradeHistoryRow[] {
  const $ = load(html);
  const table = $("table")
    .filter((_, element) => {
      const headers = $(element)
        .find("thead th")
        .map((__, th) => cleanText($(th).text()))
        .get();
      return headers.join("|") === "년도|학기|이수구분|교과목명|교과코드|학점|성적|중복코드";
    })
    .first();

  if (table.length === 0) {
    return [];
  }

  return table
    .find("tbody tr")
    .map((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 7) {
        return null;
      }

      const year = parseInteger(cleanText(cells.eq(0).text()));
      const credits = parseNumber(cleanText(cells.eq(5).text()));
      const rowData: MsiGradeHistoryRow = {
        termLabel: cleanText(cells.eq(1).text()),
        category: cleanText(cells.eq(2).text()),
        courseTitle: cleanText(cells.eq(3).text()),
        courseCode: cleanText(cells.eq(4).text()),
        grade: cleanText(cells.eq(6).text())
      };
      const duplicateCode = cleanText(cells.eq(7).text());

      if (year !== undefined) {
        rowData.year = year;
      }
      if (credits !== undefined) {
        rowData.credits = credits;
      }
      if (duplicateCode) {
        rowData.duplicateCode = duplicateCode;
      }

      return rowData;
    })
    .get()
    .filter((row): row is MsiGradeHistoryRow => row !== null);
}

function parseGradeHistoryPage(html: string): MsiGradeHistoryResult {
  const $ = load(html);
  const studentInfoCard = $(".basic-group .card-item.basic").first();
  const overviewCard = $(".card-item.basic")
    .filter(
      (_, card) =>
        cleanText($(card).children(".data-title").first().text()) === "전체취득학점"
    )
    .first();
  const creditCard = $(".card-item.basic")
    .filter(
      (_, card) =>
        cleanText($(card).children(".data-title").first().text()) === "이수구분별 취득학점"
    )
    .first();

  const overview: Record<string, string> = {};
  overviewCard.find("thead th").each((index, th) => {
    const label = cleanText($(th).text());
    const value = cleanText(overviewCard.find("tbody td").eq(index).text());
    if (label) {
      overview[label] = value;
    }
  });

  return {
    studentInfo: parseKeyValueCard(studentInfoCard.html() ?? ""),
    overview,
    creditsByCategory: parseCreditItems(creditCard.html() ?? ""),
    termRecords: parseGradeHistoryTermCards(html),
    allRows: parseComprehensiveGradeRows(html)
  };
}

function parseGraduationCreditItems(sectionHtml: string): MsiGraduationCreditItem[] {
  const buckets = parseCreditItems(sectionHtml);
  return buckets.map((bucket) => ({
    label: bucket.label,
    rawValue: bucket.rawValue,
    ...(bucket.credits !== undefined ? { credits: bucket.credits } : {})
  }));
}

function parseGraduationPage(html: string): MsiGraduationRequirementsResult {
  const $ = load(html);
  const personalCard = $(".card-item.basic")
    .filter(
      (_, card) =>
        cleanText($(card).children(".data-title").first().text()) === "기본인적사항"
    )
    .first();
  const earnedCard = $(".card-item.basic")
    .filter(
      (_, card) =>
        cleanText($(card).children(".data-title").first().text()) === "이수학점내역"
    )
    .first();
  const requiredCard = $(".card-item.basic")
    .filter(
      (_, card) =>
        cleanText($(card).children(".data-title").first().text()) === "졸업필요학점계"
    )
    .first();
  const notes = $("ol li")
    .map((_, element) => cleanText($(element).text()))
    .get()
    .filter(Boolean);
  const earnedCredits = parseGraduationCreditItems(
    earnedCard.find("#studentCdt").html() ?? earnedCard.html() ?? ""
  );
  const requiredCredits = parseGraduationCreditItems(
    requiredCard.find("#requireCdt").html() ?? requiredCard.html() ?? ""
  );

  const earnedMap = new Map(earnedCredits.map((item) => [item.label, item.credits]));
  const requiredMap = new Map(requiredCredits.map((item) => [item.label, item.credits]));
  const labels = new Set([...earnedMap.keys(), ...requiredMap.keys()]);
  const creditGaps: MsiGraduationCreditGap[] = [...labels]
    .map((label) => {
      const earned = earnedMap.get(label);
      const required = requiredMap.get(label);
      const gap =
        earned !== undefined && required !== undefined
          ? Math.max(required - earned, 0)
          : undefined;

      return {
        label,
        ...(earned !== undefined ? { earned } : {}),
        ...(required !== undefined ? { required } : {}),
        ...(gap !== undefined ? { gap } : {})
      };
    })
    .filter((item) => item.earned !== undefined || item.required !== undefined);

  return {
    studentInfo: parseKeyValueCard(personalCard.html() ?? ""),
    earnedCredits,
    requiredCredits,
    creditGaps,
    notes
  };
}

function extractFormFields(html: string, selector: string): {
  action: string;
  fields: Record<string, string>;
} {
  const $ = load(html);
  const form = $(selector).first();
  const action = cleanText(form.attr("action") ?? "");
  if (!action) {
    throw new Error("MSI 조회 폼 action 을 찾지 못했습니다.");
  }

  const fields: Record<string, string> = {};
  form.find("input[name], select[name], textarea[name]").each((_, element) => {
    const name = $(element).attr("name");
    if (!name) {
      return;
    }

    if ($(element).is("select")) {
      fields[name] = cleanText(
        $(element).find("option:selected").attr("value") ??
          $(element).find("option").first().attr("value") ??
          ""
      );
      return;
    }

    if ($(element).is("textarea")) {
      fields[name] = $(element).text();
      return;
    }

    fields[name] = $(element).attr("value") ?? "";
  });

  return { action, fields };
}

function resolveMsiFormAction(action: string, context: string): string {
  const url = new URL(action, MSI_BASE);
  if (url.protocol !== "https:" || url.hostname !== "msi.mju.ac.kr") {
    throw new Error(`${context} form action이 MSI 도메인이 아닙니다.`);
  }

  return url.toString();
}

export function isMsiCourseScoresPage(html: string): boolean {
  const $ = load(html);
  const form = $('form[name="form1"]').first();
  const action = cleanText(form.attr("action") ?? "");

  return (
    form.find('input[name="year"]').length > 0 &&
    action.includes("/servlet/su/suh/Suh00Svl01initScoreView")
  );
}

function assertMsiCourseScoresPage(html: string, context: string): void {
  if (!isMsiCourseScoresPage(html)) {
    throw new Error(`${context} 결과가 MSI 수강점수조회 화면이 아닙니다.`);
  }
}

function assertSuccessfulResponse(
  response: { statusCode: number },
  context: string
): void {
  if (response.statusCode >= 400) {
    throw new Error(`${context} 요청에 실패했습니다. HTTP ${response.statusCode}`);
  }
}

export async function submitMsiFormQuery(
  client: Pick<MjuMsiClient, "postForm">,
  html: string,
  options: {
    year?: number;
    termCode?: string | number;
    context: string;
    validatePage?: (html: string) => void;
  }
): Promise<string> {
  const { action, fields } = extractFormFields(html, 'form[name="form1"]');
  const response = await client.postForm(resolveMsiFormAction(action, options.context), {
    ...fields,
    ...(options.year !== undefined ? { year: String(options.year) } : {}),
    ...(options.termCode !== undefined ? { smt: String(options.termCode) } : {})
  });

  assertSuccessfulResponse(response, options.context);
  options.validatePage?.(response.text);

  return response.text;
}

function inferLectureEvaluationVariant(text: string): MsiLectureEvaluationVariant {
  if (/중간/.test(text)) {
    return "midterm";
  }
  if (/기말|최종|강의평가|만족도/.test(text)) {
    return "regular";
  }

  return "unknown";
}

function inferLectureEvaluationScope(text: string): MsiLectureEvaluationScope {
  if (/DeptSatis|교육만족|부서만족|만족도\s*조사/i.test(text)) {
    return "department";
  }
  if (/StdSatis|재학생\s*만족도/i.test(text)) {
    return "department";
  }
  if (/EvalLecture|setEvalLecture|수강\s*강좌|강좌번호|강의별|강의평가/i.test(text)) {
    return "course";
  }

  return "unknown";
}

function satisfactionLabel(
  satisfaction: MsiLectureEvaluationSatisfaction
): MsiLectureEvaluationSatisfactionInference["label"] {
  switch (satisfaction) {
    case "very-satisfied":
      return "매우만족";
    case "satisfied":
      return "만족";
    case "neutral":
      return "보통";
    case "dissatisfied":
      return "불만족";
    case "very-dissatisfied":
      return "매우불만족";
  }
}

function classifySatisfactionLabel(
  label: string
): MsiLectureEvaluationSatisfaction | undefined {
  const normalized = cleanText(label).replace(/\s+/g, "");
  if (/매우만족|아주만족|매우그렇다|아주그렇다/.test(normalized)) {
    return "very-satisfied";
  }
  if (/매우불만족|아주불만족|전혀그렇지않다/.test(normalized)) {
    return "very-dissatisfied";
  }
  if (/불만족|그렇지않다/.test(normalized)) {
    return "dissatisfied";
  }
  if (/보통|중립|그저그렇다/.test(normalized)) {
    return "neutral";
  }
  if (/만족|그렇다/.test(normalized)) {
    return "satisfied";
  }

  return undefined;
}

export function inferMsiLectureEvaluationSatisfaction(options: {
  satisfaction?: string;
  instruction?: string;
}): MsiLectureEvaluationSatisfactionInference {
  const explicit = options.satisfaction?.trim();
  const instruction = options.instruction?.trim();
  const lookup: Record<string, MsiLectureEvaluationSatisfaction> = {
    "매우만족": "very-satisfied",
    "very-satisfied": "very-satisfied",
    "5": "very-satisfied",
    "만족": "satisfied",
    "satisfied": "satisfied",
    "4": "satisfied",
    "보통": "neutral",
    "neutral": "neutral",
    "3": "neutral",
    "불만족": "dissatisfied",
    "dissatisfied": "dissatisfied",
    "2": "dissatisfied",
    "매우불만족": "very-dissatisfied",
    "very-dissatisfied": "very-dissatisfied",
    "1": "very-dissatisfied"
  };

  if (explicit) {
    const satisfactionValue = lookup[explicit] ?? classifySatisfactionLabel(explicit);
    if (!satisfactionValue) {
      throw new Error(
        "satisfaction 은 매우만족/만족/보통/불만족/매우불만족 중 하나여야 합니다."
      );
    }
    return {
      satisfaction: satisfactionValue,
      label: satisfactionLabel(satisfactionValue),
      source: "explicit"
    };
  }

  if (instruction) {
    const satisfactionValue = classifySatisfactionLabel(instruction);
    if (satisfactionValue) {
      return {
        satisfaction: satisfactionValue,
        label: satisfactionLabel(satisfactionValue),
        source: "instruction"
      };
    }
  }

  return {
    satisfaction: "neutral",
    label: "보통",
    source: "default"
  };
}

function extractOptionLabel(
  $: CheerioAPI,
  input: ReturnType<CheerioAPI>,
  fallback: string
): string {
  const id = input.attr("id");
  if (id) {
    const byFor = cleanText($(`label[for="${id}"]`).first().text());
    if (byFor) {
      return byFor;
    }
  }

  const parentLabel = cleanText(input.closest("label").text());
  if (parentLabel) {
    return parentLabel;
  }

  return fallback;
}

function parseLectureEvaluationQuestionChoices(
  $: CheerioAPI,
  elements: ReturnType<CheerioAPI>
): MsiLectureEvaluationChoice[] {
  return elements
    .map((_, element) => {
      const item = $(element);
      const value = cleanText(item.attr("value") ?? "");
      const label = item.is("option")
        ? cleanText(item.text()) || value
        : extractOptionLabel($, item, value);
      const satisfaction = classifySatisfactionLabel(label);
      return {
        label,
        value,
        ...(satisfaction ? { satisfaction } : {})
      };
    })
    .get()
    .filter((choice) => choice.value.length > 0 && choice.label.length > 0);
}

function parseMsiLectureEvaluationQuestions(
  formHtml: string
): MsiLectureEvaluationQuestion[] {
  const $ = load(formHtml);
  const questions: MsiLectureEvaluationQuestion[] = [];
  const radioNames = new Set<string>();

  $('input[type="radio"][name]').each((_, element) => {
    const name = $(element).attr("name");
    if (name) {
      radioNames.add(name);
    }
  });

  for (const name of radioNames) {
    const choices = parseLectureEvaluationQuestionChoices(
      $,
      $('input[type="radio"][name]').filter(
        (_, element) => $(element).attr("name") === name
      )
    );
    questions.push({
      name,
      required: true,
      kind: "radio",
      choices
    });
  }

  $("select[name]").each((_, element) => {
    const name = $(element).attr("name");
    if (!name) {
      return;
    }
    const choices = parseLectureEvaluationQuestionChoices(
      $,
      $(element).find("option")
    );
    if (choices.some((choice) => choice.satisfaction)) {
      questions.push({
        name,
        required: $(element).is("[required]"),
        kind: "select",
        choices
      });
    }
  });

  $("textarea[name]").each((_, element) => {
    const name = $(element).attr("name");
    if (!name) {
      return;
    }
    questions.push({
      name,
      required: $(element).is("[required]"),
      kind: "textarea",
      choices: []
    });
  });

  return questions;
}

function extractLectureEvaluationHiddenFields(
  formHtml: string
): Record<string, string> {
  const $ = load(formHtml);
  const fields: Record<string, string> = {};
  $('input[name]').each((_, element) => {
    const type = ($(element).attr("type") ?? "text").toLowerCase();
    const name = $(element).attr("name");
    if (!name || type === "radio" || type === "checkbox" || type === "submit") {
      return;
    }
    fields[name] = $(element).attr("value") ?? "";
  });
  $("select[name]").each((_, element) => {
    const name = $(element).attr("name");
    if (!name || fields[name] !== undefined) {
      return;
    }
    const selected =
      $(element).find("option:selected").attr("value") ??
      $(element)
        .find("option")
        .filter((_, option) => {
          const value = cleanText($(option).attr("value") ?? "");
          const label = cleanText($(option).text());
          return value.length > 0 && !/선택|전체/.test(label);
        })
        .first()
        .attr("value") ??
      "";
    fields[name] = selected;
  });

  return fields;
}

function targetIdFromFields(
  fields: Record<string, string>,
  fallback: string
): string {
  for (const [name, value] of Object.entries(fields)) {
    if (/curi|course|lecture|lect|subj|satis|seq|idx/i.test(name) && value) {
      return value;
    }
  }

  return fallback;
}

function extractLectureEvaluationSaveAction(html: string): string | undefined {
  const match =
    /(?:form|frm|document\.form1)\.action\s*=\s*['"]([^'"]*Svl02(?:set|save)[^'"]*)['"]/i.exec(html) ??
    /action\s*=\s*['"]([^'"]*Svl02(?:set|save)[^'"]*)['"]/i.exec(html) ??
    /(?:form|frm|document\.form1)\.action\s*=\s*['"]([^'"]*Svl02[^'"]*)['"]/i.exec(html);

  return match?.[1];
}

function isLectureEvaluationSubmitted(
  text: string,
  scope: MsiLectureEvaluationScope
): boolean {
  if (/미완료/.test(text)) {
    return false;
  }

  if (scope === "course") {
    return /강의평가\s*\(완료됨\)|제출완료|평가완료/.test(text);
  }

  return /교육만족도\s*조사\s*\(완료됨\)|재학생\s*만족도\s*조사\s*\(완료됨\)|제출완료|평가완료/.test(text);
}

export function parseMsiLectureEvaluationPage(
  html: string,
  options: {
    menuName?: string;
    pageUrl?: string;
    targetTitlePrefix?: string;
    scope?: MsiLectureEvaluationScope;
  } = {}
): MsiLectureEvaluationListResult {
  const $ = load(html);
  const warnings: string[] = [];
  const forms = $("form").filter((_, form) => {
    const formHtml = $(form).html() ?? "";
    return (
      /radio|select|textarea|Satis|satis|평가|만족/.test(formHtml) &&
      $(form).find("input[name], select[name], textarea[name]").length > 0
    );
  });
  const selectedForms = forms.length > 0 ? forms : $("form").slice(0, 1);
  const targets: MsiLectureEvaluationTarget[] = [];
  const saveAction = extractLectureEvaluationSaveAction(html);

  selectedForms.each((index, form) => {
    const formHtml = $.html(form);
    const formItem = $(form);
    const parsedTitle =
      cleanText(formItem.find(".data-title, legend, h1, h2, h3, caption").first().text()) ||
      cleanText(formItem.closest(".card-item, .basic, .card").find(".data-title").first().text()) ||
      cleanText(formItem.text()).slice(0, 80) ||
      `${options.menuName ?? "강의평가"} ${index + 1}`;
    const rawTitle =
      options.targetTitlePrefix && !parsedTitle.includes(options.targetTitlePrefix)
        ? `${options.targetTitlePrefix} ${parsedTitle}`
        : parsedTitle;
    const action = cleanText(formItem.attr("action") ?? "");
    const hiddenFields = extractLectureEvaluationHiddenFields(formHtml);
    const questions = parseMsiLectureEvaluationQuestions(formHtml);
    if (questions.length === 0) {
      return;
    }
    const fullText = cleanText(formItem.text());
    const unavailable = /기간이 아닙니다|대상이 아닙니다|평가불가|마감/.test(fullText);
    const submitAction =
      saveAction && /savePage\(\)/.test(formHtml) ? saveAction : action;
    const scope =
      options.scope ??
      inferLectureEvaluationScope(
        `${options.pageUrl ?? ""} ${submitAction} ${options.menuName ?? ""} ${rawTitle}`
      );
    const checkedAnswerCount = formItem.find('input[type="radio"]:checked').length;
    const submitted =
      (scope === "course" && checkedAnswerCount > 0) ||
      isLectureEvaluationSubmitted(fullText, scope);

    targets.push({
      id: targetIdFromFields(hiddenFields, String(index + 1)),
      title: rawTitle,
      variant: inferLectureEvaluationVariant(`${options.menuName ?? ""} ${rawTitle}`),
      scope,
      submitted,
      available: !submitted && !unavailable && questions.length > 0,
      ...(submitAction
        ? { submitUrl: resolveMsiFormAction(submitAction, "MSI 강의평가") }
        : {}),
      questions,
      hiddenFields
    });
  });

  if (targets.length === 0) {
    warnings.push("강의평가 대상 폼을 찾지 못했습니다.");
  }

  return { targets, warnings };
}

interface LectureEvaluationPage {
  menu: MsiMenuSpec;
  html: string;
  pageUrl: string;
  targetTitlePrefix?: string;
  scope?: MsiLectureEvaluationScope;
}

interface LectureEvaluationCourseOption {
  selectName: string;
  value: string;
  label: string;
  actionUrl: string;
  fields: Record<string, string>;
}

function extractLectureEvaluationTabPaths(html: string): string[] {
  const paths = new Set<string>();
  const pattern =
    /(?:["'(=]\s*)?((?:\/servlet)?\/?su\/sug\/Sug00Svl02(?:init|select|get|show)[A-Za-z0-9_]*Satis[^"'()<>\s]*)/gi;
  for (const match of html.matchAll(pattern)) {
    const raw = match[1]?.replace(/&amp;/g, "&");
    if (!raw || /결과|result/i.test(raw)) {
      continue;
    }
    paths.add(raw.startsWith("/") ? raw : `/${raw}`);
  }

  return [...paths];
}

function siblingLectureEvaluationMenus(menu: MsiMenuSpec, html: string): MsiMenuSpec[] {
  const paths = new Set<string>(extractLectureEvaluationTabPaths(html));
  for (const match of html.matchAll(/changePage\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const suffix = match[1];
    if (suffix) {
      paths.add(`/servlet/su/sug/Sug00Svl02${suffix}`);
    }
  }
  if (menu.urlPath.includes("Sug00Svl02initDeptSatis")) {
    paths.add("/servlet/su/sug/Sug00Svl02initStdSatis");
    paths.add("/servlet/su/sug/Sug00Svl02initEvalLecture");
  }

  return [...paths]
    .filter((path) => path !== menu.urlPath)
    .map((path) => ({
      ...menu,
      name: path.includes("EvalLecture") ? "강의평가" : menu.name,
      urlPath: path
    }));
}

function selectLooksLikeCourseSelector(
  $: CheerioAPI,
  element: AnyNode
): boolean {
  const select = $(element);
  const name = cleanText(select.attr("name") ?? "");
  const id = cleanText(select.attr("id") ?? "");
  const nearby = cleanText(
    `${select.closest("tr, .flex-table-item, .form-group, .row, li, div").text()} ${name} ${id}`
  );
  const hasSatisfactionOptions = select
    .find("option")
    .toArray()
    .some((option) => {
      const label = cleanText($(option).text());
      return classifySatisfactionLabel(label) !== undefined;
    });
  if (/평가|만족/.test(nearby) && hasSatisfactionOptions) {
    return false;
  }

  return /수강|강좌|과목|교과|강의|curi|subj|lect|course/i.test(nearby);
}

function extractLectureEvaluationCourseOptions(
  html: string,
  pageUrl: string
): LectureEvaluationCourseOption[] {
  const $ = load(html);
  const options: LectureEvaluationCourseOption[] = [];

  $("select[name]").each((_, element) => {
    if (!selectLooksLikeCourseSelector($, element)) {
      return;
    }
    const select = $(element);
    const selectName = select.attr("name");
    if (!selectName) {
      return;
    }
    const form = select.closest("form");
    const formHtml = form.length > 0 ? $.html(form) : html;
    const fields = extractLectureEvaluationHiddenFields(formHtml);
    const action = cleanText(form.attr("action") ?? "") || pageUrl;
    const actionUrl = resolveMsiFormAction(action, "MSI 강의평가 수강강좌 선택");

    select.find("option").each((_, option) => {
      const value = cleanText($(option).attr("value") ?? "");
      const label = cleanText($(option).text());
      if (!value || !label || /선택|전체/.test(label)) {
        return;
      }
      options.push({
        selectName,
        value,
        label,
        actionUrl,
        fields: {
          ...fields,
          [selectName]: value
        }
      });
    });
  });

  return options;
}

function buildLectureEvaluationPayload(
  target: MsiLectureEvaluationTarget,
  satisfaction: MsiLectureEvaluationSatisfaction,
  comment: string | undefined
): Record<string, string> {
  const payload: Record<string, string> = { ...target.hiddenFields };

  for (const question of target.questions) {
    if (question.kind === "textarea") {
      payload[question.name] = comment?.trim() || "보통입니다.";
      continue;
    }

    const matched =
      question.choices.find((choice) => choice.satisfaction === satisfaction) ??
      question.choices.find((choice) => choice.satisfaction === "neutral") ??
      question.choices[Math.floor(question.choices.length / 2)];
    if (matched) {
      payload[question.name] = matched.value;
    }
  }

  return payload;
}

async function loadLectureEvaluationPages(
  client: MjuMsiClient,
  credentials: ResolvedLmsCredentials
): Promise<LectureEvaluationPage[]> {
  const menuItems = await loadMsiMenuSnapshot(client, credentials);
  const discovered = menuItems
    .filter(
      (item) =>
        item.urlPath.includes("Sug00Svl02initDeptSatis") ||
        (/강의평가|만족도/.test(item.name) && !/결과|조회/.test(item.name))
    )
    .map<MsiMenuSpec>((item) => ({
      name: item.name || MSI_LECTURE_EVALUATION_MENU.name,
      urlPath: item.urlPath || MSI_LECTURE_EVALUATION_MENU.urlPath,
      folderDiv: item.folderDiv || MSI_LECTURE_EVALUATION_MENU.folderDiv,
      pgmid: item.pgmid || MSI_LECTURE_EVALUATION_MENU.pgmid,
      sysdiv: item.sysdiv,
      subsysdiv: item.subsysdiv,
      submitMode: item.source === "side" ? "sideform" : "form1"
    }));
  const menus = discovered.length > 0 ? discovered : [MSI_LECTURE_EVALUATION_MENU];
  const pages: LectureEvaluationPage[] = [];
  const seenPageKeys = new Set<string>();

  for (const menu of menus) {
    const { pageResponse } = await openMsiMenu(client, credentials, menu);
    pages.push({
      menu,
      html: pageResponse.text,
      pageUrl: menu.urlPath,
      scope: inferLectureEvaluationScope(`${menu.urlPath} ${menu.name}`)
    });
    seenPageKeys.add(menu.urlPath);

    for (const siblingMenu of siblingLectureEvaluationMenus(menu, pageResponse.text)) {
      if (seenPageKeys.has(siblingMenu.urlPath)) {
        continue;
      }
      try {
        const { pageResponse: siblingResponse } = await openMsiMenu(
          client,
          credentials,
          siblingMenu
        );
        pages.push({
          menu: siblingMenu,
          html: siblingResponse.text,
          pageUrl: siblingMenu.urlPath,
          scope: inferLectureEvaluationScope(`${siblingMenu.urlPath} ${siblingMenu.name}`)
        });
        seenPageKeys.add(siblingMenu.urlPath);
      } catch {
        // 일부 학기에는 강의별 평가 탭이 없거나 아직 열리지 않는다. 기존 교육만족도
        // 흐름을 유지하기 위해 탭 보조 조회 실패는 list 경고 대신 무시한다.
      }
    }
  }

  const expandedPages: LectureEvaluationPage[] = [...pages];
  const seenCourseKeys = new Set<string>();
  for (const page of pages) {
    if (!page.pageUrl.includes("initEvalLecture")) {
      continue;
    }
    const courseOptions = extractLectureEvaluationCourseOptions(page.html, page.pageUrl);
    for (const courseOption of courseOptions) {
      const key = `${courseOption.actionUrl}:${courseOption.selectName}:${courseOption.value}`;
      if (seenCourseKeys.has(key)) {
        continue;
      }
      seenCourseKeys.add(key);
      const response = await client.postForm(courseOption.actionUrl, courseOption.fields);
      assertSuccessfulResponse(response, `MSI 강의평가 수강강좌 ${courseOption.label}`);
      expandedPages.push({
        menu: page.menu,
        html: response.text,
        pageUrl: courseOption.actionUrl,
        targetTitlePrefix: courseOption.label,
        scope: "course"
      });
    }
  }

  return expandedPages;
}

export async function listMsiLectureEvaluations(
  client: MjuMsiClient,
  credentials: ResolvedLmsCredentials
): Promise<MsiLectureEvaluationListResult> {
  const pages = await loadLectureEvaluationPages(client, credentials);
  const warnings: string[] = [];
  const targets: MsiLectureEvaluationTarget[] = [];

  for (const page of pages) {
    const parsed = parseMsiLectureEvaluationPage(page.html, {
      menuName: page.menu.name,
      pageUrl: page.pageUrl,
      ...(page.targetTitlePrefix ? { targetTitlePrefix: page.targetTitlePrefix } : {}),
      ...(page.scope ? { scope: page.scope } : {})
    });
    targets.push(...parsed.targets);
    if (parsed.targets.length > 0) {
      warnings.push(...parsed.warnings);
    }
  }

  if (targets.length === 0) {
    warnings.push("강의평가 대상 폼을 찾지 못했습니다.");
  }

  const uniqueTargets = new Map<string, MsiLectureEvaluationTarget>();
  for (const target of targets) {
    const key = `${target.scope}:${target.id}:${target.submitUrl ?? ""}`;
    if (!uniqueTargets.has(key)) {
      uniqueTargets.set(key, target);
    }
  }

  return { targets: [...uniqueTargets.values()], warnings };
}

function selectLectureEvaluationTargets(
  result: MsiLectureEvaluationListResult,
  options: { target?: string; all?: boolean }
): MsiLectureEvaluationTarget[] {
  const available = result.targets.filter((target) => target.available);
  if (options.target) {
    const selected = available.filter(
      (target) => target.id === options.target || target.title.includes(options.target ?? "")
    );
    if (selected.length === 0) {
      throw new Error(`강의평가 대상 '${options.target}' 을 찾지 못했습니다.`);
    }
    return selected;
  }

  if (available.length > 1 && !options.all) {
    throw new Error("강의평가 대상이 여러 개입니다. --target 또는 --all 을 지정하세요.");
  }

  return options.all ? available : available.slice(0, 1);
}

export async function previewMsiLectureEvaluationSubmit(
  client: MjuMsiClient,
  credentials: ResolvedLmsCredentials,
  options: {
    instruction?: string;
    satisfaction?: string;
    target?: string;
    all?: boolean;
  } = {}
): Promise<MsiLectureEvaluationPreviewResult> {
  const result = await listMsiLectureEvaluations(client, credentials);
  const inferred = inferMsiLectureEvaluationSatisfaction(options);
  const selectedTargets = selectLectureEvaluationTargets(result, options);

  return {
    ...result,
    inferred,
    selectedTargets
  };
}

async function verifyLectureEvaluationSubmit(
  client: MjuMsiClient,
  target: MsiLectureEvaluationTarget
): Promise<Record<string, unknown> | undefined> {
  if (
    !/Sug00Svl02set(?:Dept|Std)Satis/.test(target.submitUrl ?? "") ||
    !target.hiddenFields.year ||
    !target.hiddenFields.smt
  ) {
    return undefined;
  }

  const response = await client.postForm(
    "https://msi.mju.ac.kr/servlet/su/sug/Sug00Svl02selectCompleteStatus",
    {
      year: target.hiddenFields.year,
      smt: target.hiddenFields.smt
    },
    {
      headers: {
        ...(target.hiddenFields._csrf
          ? { "X-CSRF-TOKEN": target.hiddenFields._csrf }
          : {}),
        "x-requested-with": "XMLHttpRequest"
      }
    }
  );
  assertSuccessfulResponse(response, "MSI 강의평가 제출 상태 확인");

  const status = JSON.parse(response.text) as Record<string, unknown>;
  const expectedStatusKey =
    target.scope === "department"
      ? "dept"
      : target.scope === "course"
        ? "std"
        : undefined;
  const completed =
    status.dept === "완료됨" ||
    status.std === "완료됨" ||
    status.eval === "완료됨";

  if (expectedStatusKey && status[expectedStatusKey] !== "완료됨") {
    if (target.scope === "course") {
      return {
        ...status,
        completed: false,
        note:
          "강의별 평가는 전체 수강강좌가 모두 저장되기 전까지 MSI 완료 상태가 미완료일 수 있습니다."
      };
    }
    throw new Error(
      `MSI 강의평가 제출 요청은 완료됐지만 저장 완료 상태를 확인하지 못했습니다: ${response.text}`
    );
  }

  if (!expectedStatusKey && !completed) {
    throw new Error(
      `MSI 강의평가 제출 요청은 완료됐지만 저장 완료 상태를 확인하지 못했습니다: ${response.text}`
    );
  }

  return status;
}

export async function submitMsiLectureEvaluations(
  client: MjuMsiClient,
  credentials: ResolvedLmsCredentials,
  options: {
    instruction?: string;
    satisfaction?: string;
    target?: string;
    all?: boolean;
    comment?: string;
  } = {}
): Promise<MsiLectureEvaluationSubmitResult> {
  const preview = await previewMsiLectureEvaluationSubmit(client, credentials, options);
  const submitted: MsiLectureEvaluationSubmitItem[] = [];
  const skipped: MsiLectureEvaluationSubmitItem[] = [];

  for (const target of preview.selectedTargets) {
    if (!target.submitUrl) {
      skipped.push({
        targetId: target.id,
        title: target.title,
        variant: target.variant,
        submitted: false,
        skippedReason: "제출 URL을 찾지 못했습니다."
      });
      continue;
    }

    const response = await client.postForm(
      target.submitUrl,
      buildLectureEvaluationPayload(
        target,
        preview.inferred.satisfaction,
        options.comment
      )
    );
    assertSuccessfulResponse(response, `MSI 강의평가 ${target.title}`);
    const verification = await verifyLectureEvaluationSubmit(client, target);
    submitted.push({
      targetId: target.id,
      title: target.title,
      variant: target.variant,
      submitted: true,
      statusCode: response.statusCode,
      ...(verification ? { verification } : {})
    });
  }

  return {
    inferred: preview.inferred,
    submitted,
    skipped,
    warnings: preview.warnings
  };
}

export async function getMsiTimetable(
  client: MjuMsiClient,
  credentials: ResolvedLmsCredentials,
  options: {
    year?: number;
    termCode?: number;
  } = {}
): Promise<MsiTimetableResult> {
  const { pageResponse } = await openMsiMenu(client, credentials, MSI_TIMETABLE_MENU);
  let currentHtml = pageResponse.text;

  if (options.year !== undefined || options.termCode !== undefined) {
    currentHtml = await submitMsiFormQuery(client, currentHtml, {
      ...(options.year !== undefined ? { year: options.year } : {}),
      ...(options.termCode !== undefined ? { termCode: options.termCode } : {}),
      context: "MSI 시간표"
    });
  }

  return parseTimetablePage(currentHtml);
}

export async function getMsiLastClassTimes(
  client: MjuMsiClient,
  credentials: ResolvedLmsCredentials,
  options: {
    year?: number;
    termCode?: number;
  } = {}
): Promise<MsiLastClassTimesResult> {
  const timetable = await getMsiTimetable(client, credentials, options);
  return buildMsiLastClassTimes(timetable);
}

export async function getMsiCurrentTermGrades(
  client: MjuMsiClient,
  credentials: ResolvedLmsCredentials
): Promise<MsiCurrentGradesResult> {
  const { pageResponse } = await openMsiMenu(client, credentials, MSI_CURRENT_GRADES_MENU);
  return parseCurrentGradesPage(pageResponse.text);
}

export async function getMsiCourseScores(
  client: MjuMsiClient,
  credentials: ResolvedLmsCredentials,
  options: {
    year?: number;
    termCode?: string;
  } = {}
): Promise<MsiCourseScoresResult> {
  const { pageResponse } = await openMsiMenu(client, credentials, MSI_COURSE_SCORES_MENU);
  let currentHtml = pageResponse.text;
  assertMsiCourseScoresPage(currentHtml, "MSI 수강점수조회");

  if (options.year !== undefined || options.termCode !== undefined) {
    currentHtml = await submitMsiFormQuery(client, currentHtml, {
      ...(options.year !== undefined ? { year: options.year } : {}),
      ...(options.termCode !== undefined ? { termCode: options.termCode } : {}),
      context: "MSI 수강점수조회",
      validatePage: (html) => assertMsiCourseScoresPage(html, "MSI 수강점수조회")
    });
  }

  return parseMsiCourseScoresPage(currentHtml);
}

export async function getMsiGradeHistory(
  client: MjuMsiClient,
  credentials: ResolvedLmsCredentials
): Promise<MsiGradeHistoryResult> {
  const { pageResponse } = await openMsiMenu(client, credentials, MSI_GRADE_HISTORY_MENU);
  return parseGradeHistoryPage(pageResponse.text);
}

export async function getMsiGraduationRequirements(
  client: MjuMsiClient,
  credentials: ResolvedLmsCredentials
): Promise<MsiGraduationRequirementsResult> {
  const { pageResponse } = await openMsiMenu(
    client,
    credentials,
    MSI_GRADUATION_REQUIREMENTS_MENU
  );
  return parseGraduationPage(pageResponse.text);
}
