export interface MsiMenuSpec {
  name: string;
  urlPath: string;
  folderDiv: string;
  pgmid: string;
  sysdiv?: string;
  subsysdiv?: string;
  submitMode?: "sideform" | "form1";
}

export interface MsiMenuItem {
  folderName: string;
  name: string;
  urlPath: string;
  pgmid: string;
  folderDiv: string;
  sysdiv: string;
  subsysdiv: string;
  source: "right" | "side";
}

export interface MsiMainContext {
  csrfToken: string;
  sideFormDefaults: Record<string, string>;
  form1Defaults: Record<string, string>;
}

export interface MsiTimetableTermOption {
  code: string;
  label: string;
  selected: boolean;
}

export interface MsiTimetableEntry {
  dayOfWeek: number;
  dayLabel: string;
  courseTitle: string;
  location?: string;
  professor?: string;
  timeRange?: string;
  curiNum?: string;
  courseCls?: string;
  topPercent?: number;
  heightPercent?: number;
}

export interface MsiTimetableResult {
  year: number;
  termCode: string;
  termLabel: string;
  termOptions: MsiTimetableTermOption[];
  entries: MsiTimetableEntry[];
}

export interface MsiCurrentGradeItem {
  courseCode?: string;
  courseClass?: string;
  courseTitle: string;
  credits?: number;
  grade?: string;
  publicStatus?: string;
  lectureEvaluationStatus?: string;
  statusMessage?: string;
}

export interface MsiCurrentGradesResult {
  year?: number;
  termLabel?: string;
  items: MsiCurrentGradeItem[];
}

export interface MsiCreditBucket {
  label: string;
  credits?: number;
  rawValue: string;
}

export interface MsiGradeHistoryCourse {
  category: string;
  courseCode: string;
  courseTitle: string;
  credits?: number;
  grade: string;
}

export interface MsiGradeHistoryTermRecord {
  title: string;
  year?: number;
  termLabel: string;
  requestedCredits?: number;
  earnedCredits?: number;
  totalPoints?: number;
  gpa?: number;
  courses: MsiGradeHistoryCourse[];
}

export interface MsiGradeHistoryRow {
  year?: number;
  termLabel: string;
  category: string;
  courseTitle: string;
  courseCode: string;
  credits?: number;
  grade: string;
  duplicateCode?: string;
}

export interface MsiGradeHistoryResult {
  studentInfo: Record<string, string>;
  overview: Record<string, string>;
  creditsByCategory: MsiCreditBucket[];
  termRecords: MsiGradeHistoryTermRecord[];
  allRows: MsiGradeHistoryRow[];
}

export interface MsiGraduationCreditItem {
  label: string;
  credits?: number;
  rawValue: string;
}

export interface MsiGraduationCreditGap {
  label: string;
  earned?: number;
  required?: number;
  gap?: number;
}

export interface MsiGraduationRequirementsResult {
  studentInfo: Record<string, string>;
  earnedCredits: MsiGraduationCreditItem[];
  requiredCredits: MsiGraduationCreditItem[];
  creditGaps: MsiGraduationCreditGap[];
  notes: string[];
}
