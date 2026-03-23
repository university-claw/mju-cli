import { load } from "cheerio";

import type { DecodedResponse } from "../lms/types.js";
import type { ResolvedLmsCredentials } from "../auth/types.js";
import type { MjuMsiClient } from "./client.js";
import {
  MSI_BASE,
  MSI_GO_BODY_PAGE_URL,
  MSI_MAIN_URL,
  MSI_RIGHT_MENU_URL,
  MSI_SIDE_MENU_URL
} from "./constants.js";
import type { MsiMainContext, MsiMenuItem, MsiMenuSpec } from "./types.js";

function cleanText(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function extractHiddenDefaults(
  html: string,
  selector: string
): Record<string, string> {
  const $ = load(html);
  const result: Record<string, string> = {};

  $(`${selector} input[name]`).each((_, element) => {
    const name = $(element).attr("name");
    if (!name) {
      return;
    }

    result[name] = $(element).attr("value") ?? "";
  });

  return result;
}

export function extractMainContext(html: string): MsiMainContext {
  const $ = load(html);
  const csrfToken =
    $('meta[name="_csrf"]').attr("content") ??
    $('input[name="_csrf"]').first().attr("value") ??
    "";

  if (!csrfToken) {
    throw new Error("MSI 메인 화면에서 CSRF 토큰을 찾지 못했습니다.");
  }

  return {
    csrfToken,
    sideFormDefaults: extractHiddenDefaults(html, "#sideform"),
    form1Defaults: extractHiddenDefaults(html, "#frm")
  };
}

function normalizeRightMenuItem(item: Record<string, unknown>): MsiMenuItem | null {
  const pgmid = cleanText(String(item.pgm_id ?? ""));
  const urlPath = cleanText(String(item.pgm_utl ?? ""));
  if (!pgmid || !urlPath) {
    return null;
  }

  return {
    folderName: "RIGHT",
    name: cleanText(String(item.pgm_nm ?? "")),
    urlPath,
    pgmid,
    folderDiv: cleanText(String(item.folder_order ?? "")),
    sysdiv: cleanText(String(item.sys_div ?? "SCH")) || "SCH",
    subsysdiv: cleanText(String(item.sub_sys_div ?? "")),
    source: "right"
  };
}

function normalizeSideMenuItem(item: Record<string, unknown>): MsiMenuItem | null {
  const pgmid = cleanText(String(item.pgmid ?? ""));
  const urlPath = cleanText(String(item.pgmurl ?? ""));
  if (!pgmid || !urlPath) {
    return null;
  }

  return {
    folderName: cleanText(String(item.foldernm ?? "")),
    name: cleanText(String(item.pgmnm ?? "")),
    urlPath,
    pgmid,
    folderDiv: cleanText(String(item.folderdiv ?? "")),
    sysdiv: "SCH",
    subsysdiv: "SCH",
    source: "side"
  };
}

async function postMainForm(
  client: MjuMsiClient,
  url: string,
  form: Record<string, string>,
  csrfToken: string,
  options: { xhr?: boolean; referer?: string } = {}
): Promise<DecodedResponse> {
  const headers: Record<string, string> = {
    "X-CSRF-TOKEN": csrfToken
  };

  if (options.xhr) {
    headers["x-requested-with"] = "XMLHttpRequest";
  }

  if (options.referer) {
    headers.referer = options.referer;
  }

  return client.postForm(url, form, { headers });
}

function ensureSuccessfulResponse(
  response: DecodedResponse,
  context: string
): void {
  if (response.statusCode >= 400) {
    throw new Error(`${context} 요청이 실패했습니다. HTTP ${response.statusCode}`);
  }
}

export async function loadMsiMenuSnapshot(
  client: MjuMsiClient,
  credentials: ResolvedLmsCredentials
): Promise<MsiMenuItem[]> {
  const { mainResponse } = await client.ensureAuthenticated(
    credentials.userId,
    credentials.password
  );
  const context = extractMainContext(mainResponse.text);

  const rightMenuResponse = await postMainForm(
    client,
    MSI_RIGHT_MENU_URL,
    { sysdiv: "SCH" },
    context.csrfToken,
    {
      xhr: true,
      referer: MSI_MAIN_URL
    }
  );
  ensureSuccessfulResponse(rightMenuResponse, "MSI 우측 메뉴 조회");
  const sideMenuResponse = await postMainForm(
    client,
    MSI_SIDE_MENU_URL,
    {
      sysdiv: "SCH",
      subsysdiv: "SCH",
      pgmid: ""
    },
    context.csrfToken,
    {
      xhr: true,
      referer: MSI_MAIN_URL
    }
  );
  ensureSuccessfulResponse(sideMenuResponse, "MSI 좌측 메뉴 조회");

  const rightMenuRaw = JSON.parse(rightMenuResponse.text) as Record<string, unknown>[];
  const sideMenuRaw = JSON.parse(sideMenuResponse.text) as Record<string, unknown>[];
  const items = [
    ...rightMenuRaw
      .map((item) => normalizeRightMenuItem(item))
      .filter((item): item is MsiMenuItem => item !== null),
    ...sideMenuRaw
      .map((item) => normalizeSideMenuItem(item))
      .filter((item): item is MsiMenuItem => item !== null)
  ];
  const unique = new Map<string, MsiMenuItem>();
  for (const item of items) {
    const key = `${item.source}:${item.pgmid}:${item.urlPath}`;
    if (!unique.has(key)) {
      unique.set(key, item);
    }
  }

  const result = [...unique.values()];
  await client.saveMainHtml(mainResponse.text);
  await client.saveMenuSnapshot(result);
  return result;
}

export async function openMsiMenu(
  client: MjuMsiClient,
  credentials: ResolvedLmsCredentials,
  menu: MsiMenuSpec
): Promise<{
  mainResponse: DecodedResponse;
  mainContext: MsiMainContext;
  pageResponse: DecodedResponse;
}> {
  const { mainResponse } = await client.ensureAuthenticated(
    credentials.userId,
    credentials.password
  );
  const mainContext = extractMainContext(mainResponse.text);
  const sysdiv = menu.sysdiv ?? "SCH";
  const subsysdiv = menu.subsysdiv ?? "SCH";

  const prepResponse = await postMainForm(
    client,
    MSI_GO_BODY_PAGE_URL,
    {
      urlstr: menu.urlPath,
      sysdiv,
      subsysdiv,
      folderdiv: menu.folderDiv,
      pgmid: menu.pgmid
    },
    mainContext.csrfToken,
    {
      xhr: true,
      referer: MSI_MAIN_URL
    }
  );
  ensureSuccessfulResponse(prepResponse, `MSI ${menu.name} goBodyPage`);

  const baseForm =
    menu.submitMode === "form1"
      ? mainContext.form1Defaults
      : mainContext.sideFormDefaults;
  const form = {
    ...baseForm,
    _csrf: baseForm._csrf || mainContext.csrfToken
  };
  const pageResponse = await postMainForm(
    client,
    new URL(menu.urlPath, MSI_BASE).toString(),
    form,
    mainContext.csrfToken,
    {
      referer: MSI_MAIN_URL
    }
  );
  ensureSuccessfulResponse(pageResponse, `MSI ${menu.name} 본문 조회`);

  return {
    mainResponse,
    mainContext,
    pageResponse
  };
}
