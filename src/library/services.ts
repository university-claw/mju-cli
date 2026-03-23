import type { ResolvedLmsCredentials } from "../auth/types.js";
import {
  LIBRARY_BRANCH_GROUPS,
  LIBRARY_HOMEPAGE_ID,
  LIBRARY_SMUF_METHOD_CODE,
  LIBRARY_STUDY_ROOM_TYPE_ID,
  type LibraryCampusKey
} from "./constants.js";
import { MjuLibraryClient } from "./client.js";
import type {
  LibraryBlockedTimeRange,
  LibraryCampusAvailability,
  LibraryRoomReservationSummary,
  LibraryStudyRoomDetail,
  LibraryStudyRoomSummary,
  LibraryTimeSlot,
  LibraryUseSection,
  LibraryUserInfo
} from "./types.js";

interface RawBranch {
  id?: number;
  name?: string;
  alias?: string;
}

interface RawFloor {
  value?: number;
  label?: string;
}

interface RawRoomType {
  id?: number;
  name?: string;
}

interface RawRoomRule {
  timeUnit?: string;
  useCompanionRegistration?: boolean;
  useOutsiderRegistration?: boolean;
  minTime?: number;
  maxTime?: number;
}

interface RawEquipment {
  id?: number;
  name?: string;
}

interface RawExpansionField {
  code?: string;
  name?: string;
  isMandatory?: boolean;
}

interface RawRoomSummary {
  id?: number;
  name?: string;
  roomType?: RawRoomType;
  floor?: RawFloor;
  minQuota?: number;
  maxQuota?: number;
  quota?: number;
  isChargeable?: boolean;
  unableMessage?: string;
}

interface RawRoomDetail extends RawRoomSummary {
  branch?: RawBranch;
  building?: {
    name?: string;
  };
  description?: string;
  attention?: string;
  note?: string;
  timeLine?: unknown;
  reservableDates?: string[] | null;
  reservableMonths?: string[] | null;
  rule?: RawRoomRule;
  equipments?: RawEquipment[] | null;
  expansionFields?: RawExpansionField[] | null;
}

interface RawListResponse<T> {
  totalCount?: number;
  list?: T[] | null;
}

interface RawUseSection {
  id?: number;
  code?: string;
  name?: string;
}

interface RawFloorsAndDates {
  floors?: RawFloor[] | null;
  reservableDates?: string[] | null;
  reservableMonths?: string[] | null;
}

interface RawRoomChargeSummary {
  id?: number;
  companionCnt?: number;
  useSection?: RawUseSection;
  reservationTime?: string;
  beginTime?: string;
  endTime?: string;
  state?: { code?: string; name?: string };
  room?: {
    id?: number;
    name?: string;
    branch?: RawBranch;
  };
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function cleanNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined;
  }

  return value;
}

function ensureNumber(value: number | undefined, message: string): number {
  if (value === undefined) {
    throw new Error(message);
  }

  return value;
}

function ensureString(value: string | undefined, message: string): string {
  if (!value) {
    throw new Error(message);
  }

  return value;
}

function sortUniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function resolveCampusKey(input: string | undefined): LibraryCampusKey | "all" {
  const normalized = input?.trim().toLowerCase();
  if (!normalized || normalized === "all" || normalized === "전체") {
    return "all";
  }

  if (normalized === "자연" || normalized === "자연캠퍼스" || normalized === "nature") {
    return "nature";
  }

  if (normalized === "인문" || normalized === "인문캠퍼스" || normalized === "humanities") {
    return "humanities";
  }

  throw new Error("campus 는 인문, 자연, all 중 하나여야 합니다.");
}

function mapRoomSummary(raw: RawRoomSummary): LibraryStudyRoomSummary {
  const roomId = ensureNumber(raw.id, "도서관 방 id 를 찾지 못했습니다.");
  const roomName = ensureString(raw.name, "도서관 방 이름을 찾지 못했습니다.");
  const roomTypeName = cleanString(raw.roomType?.name);
  const floorValue = cleanNumber(raw.floor?.value);
  const floorLabel = cleanString(raw.floor?.label);
  const minQuota = cleanNumber(raw.minQuota);
  const maxQuota = cleanNumber(raw.maxQuota);
  const quota = cleanNumber(raw.quota);
  const unableMessage = cleanString(raw.unableMessage);

  return {
    roomId,
    roomName,
    ...(roomTypeName !== undefined ? { roomTypeName } : {}),
    ...(floorValue !== undefined ? { floorValue } : {}),
    ...(floorLabel !== undefined ? { floorLabel } : {}),
    ...(minQuota !== undefined ? { minQuota } : {}),
    ...(maxQuota !== undefined ? { maxQuota } : {}),
    ...(quota !== undefined ? { quota } : {}),
    isChargeable: raw.isChargeable === true,
    ...(unableMessage !== undefined ? { unableMessage } : {})
  };
}

function mapUseSection(raw: RawUseSection): LibraryUseSection {
  return {
    id: ensureNumber(raw.id, "도서관 이용 목적 id 를 찾지 못했습니다."),
    code: ensureString(raw.code, "도서관 이용 목적 code 를 찾지 못했습니다."),
    name: ensureString(raw.name, "도서관 이용 목적 이름을 찾지 못했습니다.")
  };
}

function parseTimeLabel(value: string): number {
  const match = /^(\d{2,3}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`시간 형식이 올바르지 않습니다: ${value}`);
  }

  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
}

function formatTimeLabel(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function flattenTimeLineEntry(value: unknown, target: LibraryTimeSlot[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      flattenTimeLineEntry(item, target);
    }
    return;
  }

  if (
    typeof value !== "object" ||
    value === null ||
    !("hour" in value) ||
    !("minutes" in value)
  ) {
    return;
  }

  const hour = cleanNumber((value as { hour?: unknown }).hour);
  const minutes = (value as { minutes?: unknown }).minutes;
  if (hour === undefined || !Array.isArray(minutes) || minutes.length === 0) {
    return;
  }

  const stepMinutes = Math.floor(60 / minutes.length);
  minutes.forEach((minute, index) => {
    const className =
      typeof minute === "object" &&
      minute !== null &&
      "class" in minute &&
      typeof (minute as { class?: unknown }).class === "string"
        ? (minute as { class?: string }).class ?? ""
        : "";
    const selectable =
      typeof minute === "object" &&
      minute !== null &&
      "selectable" in minute &&
      typeof (minute as { selectable?: unknown }).selectable === "boolean"
        ? ((minute as { selectable?: boolean }).selectable ?? false)
        : false;

    target.push({
      time: formatTimeLabel(hour * 60 + index * stepMinutes),
      className,
      selectable,
      stepMinutes
    });
  });
}

function flattenTimeLine(raw: unknown): LibraryTimeSlot[] {
  const slots: LibraryTimeSlot[] = [];
  flattenTimeLineEntry(raw, slots);
  return slots.sort((left, right) => parseTimeLabel(left.time) - parseTimeLabel(right.time));
}

function deriveBlockedRanges(slots: LibraryTimeSlot[]): LibraryBlockedTimeRange[] {
  const ranges: LibraryBlockedTimeRange[] = [];
  let current: LibraryBlockedTimeRange | undefined;

  for (const slot of slots) {
    const blocked = slot.className.length > 0 || !slot.selectable;
    if (!blocked) {
      if (current) {
        ranges.push(current);
        current = undefined;
      }
      continue;
    }

    const slotEndTime = formatTimeLabel(parseTimeLabel(slot.time) + slot.stepMinutes);
    if (current && current.className === slot.className && current.endTime === slot.time) {
      current.endTime = slotEndTime;
      continue;
    }

    if (current) {
      ranges.push(current);
    }

    current = {
      startTime: slot.time,
      endTime: slotEndTime,
      className: slot.className || "blocked"
    };
  }

  if (current) {
    ranges.push(current);
  }

  return ranges;
}

function deriveReservableStartTimes(slots: LibraryTimeSlot[]): string[] {
  return slots
    .filter((slot) => slot.className.length === 0 && slot.selectable)
    .map((slot) => slot.time);
}

function hasAvailableTimeRange(
  slots: LibraryTimeSlot[],
  beginTime: string,
  endTime: string
): boolean {
  const beginMinutes = parseTimeLabel(beginTime);
  const endMinutes = parseTimeLabel(endTime);
  if (endMinutes <= beginMinutes) {
    return false;
  }

  const rangeSlots = slots.filter((slot) => {
    const minutes = parseTimeLabel(slot.time);
    return beginMinutes <= minutes && minutes < endMinutes;
  });

  if (rangeSlots.length === 0) {
    return false;
  }

  return rangeSlots.every((slot) => slot.className.length === 0 && slot.selectable);
}

function deriveReservableEndTimes(
  slots: LibraryTimeSlot[],
  beginTime: string,
  minDurationMinutes: number,
  maxDurationMinutes: number
): string[] {
  const baseSlot = slots.find((slot) => slot.time === beginTime);
  const stepMinutes = baseSlot?.stepMinutes ?? 10;
  const endTimes: string[] = [];
  const beginMinutes = parseTimeLabel(beginTime);

  for (
    let duration = minDurationMinutes;
    duration <= maxDurationMinutes;
    duration += stepMinutes
  ) {
    const endTime = formatTimeLabel(beginMinutes + duration);
    if (!hasAvailableTimeRange(slots, beginTime, endTime)) {
      break;
    }

    endTimes.push(endTime);
  }

  return endTimes;
}

function resolveDate(preferredDate: string | undefined, availableDates: string[]): string {
  const requested = preferredDate?.trim();
  if (requested) {
    if (!availableDates.includes(requested)) {
      throw new Error(
        `선택한 날짜 ${requested} 는 예약 가능 날짜가 아닙니다. 가능 날짜: ${availableDates.join(", ")}`
      );
    }

    return requested;
  }

  const firstDate = availableDates[0];
  if (!firstDate) {
    throw new Error("예약 가능한 날짜를 찾지 못했습니다.");
  }

  return firstDate;
}

function mapCampusAvailability(
  campus: LibraryCampusKey,
  rawFloorsAndDates: RawFloorsAndDates,
  rawRooms: RawListResponse<RawRoomSummary>,
  selectedDate: string
): LibraryCampusAvailability {
  const branchGroup = LIBRARY_BRANCH_GROUPS[campus];

  return {
    campus,
    branchGroupId: branchGroup.id,
    branchName: branchGroup.name,
    branchAlias: branchGroup.alias,
    selectedDate,
    availableDates: sortUniqueStrings(rawFloorsAndDates.reservableDates ?? []),
    floors: (rawFloorsAndDates.floors ?? [])
      .map((floor) => ({
        value: ensureNumber(floor.value, "도서관 층 value 를 찾지 못했습니다."),
        label: ensureString(floor.label, "도서관 층 label 을 찾지 못했습니다.")
      }))
      .sort((left, right) => left.value - right.value),
    rooms: (rawRooms.list ?? []).map(mapRoomSummary)
  };
}

function mapRoomDetail(
  rawRoom: RawRoomDetail,
  useSections: LibraryUseSection[],
  date: string,
  beginTime?: string
): LibraryStudyRoomDetail {
  const timeline = flattenTimeLine(rawRoom.timeLine);
  const campusId = cleanNumber(rawRoom.branch?.id);
  const campusName = cleanString(rawRoom.branch?.name);
  const campusAlias = cleanString(rawRoom.branch?.alias);
  const buildingName = cleanString(rawRoom.building?.name);
  const floorValue = cleanNumber(rawRoom.floor?.value);
  const floorLabel = cleanString(rawRoom.floor?.label);
  const roomTypeName = cleanString(rawRoom.roomType?.name);
  const minQuota = cleanNumber(rawRoom.minQuota);
  const maxQuota = cleanNumber(rawRoom.maxQuota);
  const quota = cleanNumber(rawRoom.quota);
  const description = cleanString(rawRoom.description);
  const attention = cleanString(rawRoom.attention);
  const note = cleanString(rawRoom.note);
  const timeUnit = cleanString(rawRoom.rule?.timeUnit);
  const minDurationMinutes = cleanNumber(rawRoom.rule?.minTime);
  const maxDurationMinutes = cleanNumber(rawRoom.rule?.maxTime);

  return {
    roomId: ensureNumber(rawRoom.id, "도서관 방 id 를 찾지 못했습니다."),
    roomName: ensureString(rawRoom.name, "도서관 방 이름을 찾지 못했습니다."),
    ...(campusId !== undefined ? { campusId } : {}),
    ...(campusName !== undefined ? { campusName } : {}),
    ...(campusAlias !== undefined ? { campusAlias } : {}),
    ...(buildingName !== undefined ? { buildingName } : {}),
    ...(floorValue !== undefined ? { floorValue } : {}),
    ...(floorLabel !== undefined ? { floorLabel } : {}),
    ...(roomTypeName !== undefined ? { roomTypeName } : {}),
    ...(minQuota !== undefined ? { minQuota } : {}),
    ...(maxQuota !== undefined ? { maxQuota } : {}),
    ...(quota !== undefined ? { quota } : {}),
    isChargeable: rawRoom.isChargeable === true,
    ...(description !== undefined ? { description } : {}),
    ...(attention !== undefined ? { attention } : {}),
    ...(note !== undefined ? { note } : {}),
    date,
    availableDates: sortUniqueStrings(rawRoom.reservableDates ?? []),
    availableMonths: sortUniqueStrings(rawRoom.reservableMonths ?? []),
    ...(timeUnit !== undefined ? { timeUnit } : {}),
    ...(minDurationMinutes !== undefined ? { minDurationMinutes } : {}),
    ...(maxDurationMinutes !== undefined ? { maxDurationMinutes } : {}),
    useCompanionRegistration: rawRoom.rule?.useCompanionRegistration === true,
    useOutsiderRegistration: rawRoom.rule?.useOutsiderRegistration === true,
    equipments: (rawRoom.equipments ?? [])
      .map((equipment) => {
        const id = cleanNumber(equipment.id);
        const name = cleanString(equipment.name);
        return id !== undefined && name ? { id, name } : null;
      })
      .filter((equipment): equipment is { id: number; name: string } => equipment !== null),
    expansionFields: (rawRoom.expansionFields ?? [])
      .map((field) => {
        const code = cleanString(field.code);
        const name = cleanString(field.name);
        return code && name
          ? { code, name, isMandatory: field.isMandatory === true }
          : null;
      })
      .filter(
        (field): field is { code: string; name: string; isMandatory: boolean } =>
          field !== null
      ),
    useSections,
    timeline,
    blockedRanges: deriveBlockedRanges(timeline),
    reservableStartTimes: deriveReservableStartTimes(timeline),
    ...(beginTime && minDurationMinutes !== undefined && maxDurationMinutes !== undefined
      ? {
          reservableEndTimes: deriveReservableEndTimes(
            timeline,
            beginTime,
            minDurationMinutes,
            maxDurationMinutes
          )
        }
      : {})
  };
}

function mapRoomReservationSummary(raw: RawRoomChargeSummary): LibraryRoomReservationSummary {
  const roomId = cleanNumber(raw.room?.id);
  const campusName = cleanString(raw.room?.branch?.name);
  const campusAlias = cleanString(raw.room?.branch?.alias);
  const useSectionName = cleanString(raw.useSection?.name);
  const stateCode = cleanString(raw.state?.code);
  const stateLabel = cleanString(raw.state?.name);
  const beginTime = cleanString(raw.beginTime);
  const endTime = cleanString(raw.endTime);

  return {
    reservationId: ensureNumber(raw.id, "예약 id 를 찾지 못했습니다."),
    ...(roomId !== undefined ? { roomId } : {}),
    roomName: ensureString(raw.room?.name, "예약 공간 이름을 찾지 못했습니다."),
    ...(campusName !== undefined ? { campusName } : {}),
    ...(campusAlias !== undefined ? { campusAlias } : {}),
    ...(useSectionName !== undefined ? { useSectionName } : {}),
    ...(stateCode !== undefined ? { stateCode } : {}),
    ...(stateLabel !== undefined ? { stateLabel } : {}),
    reservationTime:
      ensureString(raw.reservationTime, "예약 시간 문자열을 찾지 못했습니다."),
    ...(beginTime !== undefined ? { beginTime } : {}),
    ...(endTime !== undefined ? { endTime } : {}),
    companionCount: cleanNumber(raw.companionCnt) ?? 0
  };
}

async function ensureAuthenticated(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials
): Promise<LibraryUserInfo> {
  const { myInfo } = await client.ensureAuthenticated<{
    id?: number;
    name?: string;
    memberNo?: string;
    branch?: RawBranch;
  }>(credentials.userId, credentials.password);
  const branchId = cleanNumber(myInfo.branch?.id);
  const branchName = cleanString(myInfo.branch?.name);
  const branchAlias = cleanString(myInfo.branch?.alias);

  return {
    id: ensureNumber(myInfo.id, "도서관 사용자 id 를 찾지 못했습니다."),
    name: ensureString(myInfo.name, "도서관 사용자 이름을 찾지 못했습니다."),
    memberNo: ensureString(myInfo.memberNo, "도서관 사용자 학번을 찾지 못했습니다."),
    ...(branchId !== undefined ? { branchId } : {}),
    ...(branchName !== undefined ? { branchName } : {}),
    ...(branchAlias !== undefined ? { branchAlias } : {})
  };
}

async function fetchUseSections(
  client: MjuLibraryClient,
  roomId: number
): Promise<LibraryUseSection[]> {
  const response = await client.getApiData<RawListResponse<RawUseSection>>(
    `/${LIBRARY_HOMEPAGE_ID}/api/rooms/${roomId}/use-sections`
  );
  return (response.list ?? []).map(mapUseSection);
}

export async function listLibraryStudyRooms(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials,
  options: {
    campus?: string;
    date?: string;
  } = {}
): Promise<{
  user: LibraryUserInfo;
  campuses: LibraryCampusAvailability[];
}> {
  const user = await ensureAuthenticated(client, credentials);
  const campusSelection = resolveCampusKey(options.campus);
  const campuses: LibraryCampusKey[] =
    campusSelection === "all" ? ["nature", "humanities"] : [campusSelection];

  const results: LibraryCampusAvailability[] = [];
  for (const campus of campuses) {
    const branchGroup = LIBRARY_BRANCH_GROUPS[campus];
    const floorsAndDates = await client.getApiData<RawFloorsAndDates>(
      `/${LIBRARY_HOMEPAGE_ID}/api/room-floors-and-chargeable-dates`,
      {
        searchParams: {
          roomTypeId: LIBRARY_STUDY_ROOM_TYPE_ID,
          branchGroupId: branchGroup.id
        }
      }
    );
    const availableDates = sortUniqueStrings(floorsAndDates.reservableDates ?? []);
    const selectedDate = resolveDate(options.date, availableDates);
    const rooms = await client.getApiData<RawListResponse<RawRoomSummary>>(
      `/${LIBRARY_HOMEPAGE_ID}/api/rooms`,
      {
        searchParams: {
          roomTypeId: LIBRARY_STUDY_ROOM_TYPE_ID,
          branchGroupId: branchGroup.id,
          smufMethodCode: LIBRARY_SMUF_METHOD_CODE
        }
      }
    );

    results.push(mapCampusAvailability(campus, floorsAndDates, rooms, selectedDate));
  }

  return {
    user,
    campuses: results
  };
}

export async function getLibraryStudyRoomDetail(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials,
  options: {
    roomId: number;
    date: string;
    beginTime?: string;
  }
): Promise<{
  user: LibraryUserInfo;
  room: LibraryStudyRoomDetail;
}> {
  const user = await ensureAuthenticated(client, credentials);
  const rawRoom = await client.getApiData<RawRoomDetail>(
    `/${LIBRARY_HOMEPAGE_ID}/api/rooms/${options.roomId}`,
    {
      searchParams: {
        hopeDate: options.date
      }
    }
  );
  const useSections = await fetchUseSections(client, options.roomId);

  return {
    user,
    room: mapRoomDetail(rawRoom, useSections, options.date, options.beginTime)
  };
}

export async function listLibraryRoomReservations(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials
): Promise<{
  user: LibraryUserInfo;
  reservations: LibraryRoomReservationSummary[];
}> {
  const user = await ensureAuthenticated(client, credentials);
  let raw: RawListResponse<RawRoomChargeSummary>;
  try {
    raw = await client.getApiData<RawListResponse<RawRoomChargeSummary>>(
      `/${LIBRARY_HOMEPAGE_ID}/api/room-charges`
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("[success.noRecord]")) {
      raw = { list: [] };
    } else {
      throw error;
    }
  }

  return {
    user,
    reservations: (raw.list ?? []).map(mapRoomReservationSummary)
  };
}
