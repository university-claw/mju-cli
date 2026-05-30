import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";

import { load } from "cheerio";
import got, { type Response } from "got";
import { CookieJar } from "tough-cookie";

import { resolveSsoPasswordChangeContinuationUrl } from "../lms/sso-client.js";
import type { DecodedResponse, SsoForm } from "../lms/types.js";
import { decodeHtml } from "../lms/encoding.js";
import {
  createCookieSessionStore,
  resolveStorageContext
} from "../storage/resolver.js";
import type { LmsSessionStorage } from "../storage/types.js";
import {
  encryptPasswordForSso,
  encryptSessionKeyForSso,
  genSsoKeyMaterial
} from "../lms/sso-crypto.js";
import {
  looksLikePasswordChangeInterstitial,
  looksLoggedIn
} from "./auth-heuristics.js";
import {
  MSI_BASE,
  MSI_LOGIN_SECURITY_URL,
  MSI_MAIN_URL,
  MSI_SECURITY_CHECK_URL
} from "./constants.js";
import type { MsiMenuItem } from "./types.js";
import type { MsiRuntimeConfig } from "./config.js";

interface RequestOptions {
  headers?: Record<string, string>;
  followRedirect?: boolean;
}

type PasswordChangeContinuationResult =
  | { ok: true; response: DecodedResponse }
  | {
      ok: false;
      detail:
        | "password_change_cancel_url_missing"
        | "password_change_cancel_request_failed"
        | "password_change_cancel_still_interstitial"
        | "password_change_cancel_not_logged_in";
      cause?: unknown;
    };

function msiDiagnosticError(code: string, message: string, cause?: unknown): Error {
  const error = new Error(`[${code}] ${message}`);
  if (cause !== undefined) {
    (error as Error & { cause?: unknown }).cause = cause;
  }
  return error;
}

function isMsiDiagnosticError(error: unknown): boolean {
  return error instanceof Error && /^\[msi\.[a-zA-Z0-9_.-]+\]/u.test(error.message);
}

function describeUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function withMsiStep<T>(code: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isMsiDiagnosticError(error)) {
      throw error;
    }
    throw msiDiagnosticError(code, describeUnknownError(error), error);
  }
}

function toDecodedResponse(response: Response<Buffer>): DecodedResponse {
  return {
    statusCode: response.statusCode,
    url: response.url,
    text: decodeHtml(response.rawBody, response.headers),
    rawBody: response.rawBody,
    headers: response.headers
  };
}

function resolveRedirectUrl(
  response: Pick<DecodedResponse, "url" | "headers">,
  baseUrl: string
): string | undefined {
  const locationHeader = response.headers.location;
  const location =
    typeof locationHeader === "string" ? locationHeader : locationHeader?.[0];

  return location ? new URL(location, baseUrl).toString() : undefined;
}

export function resolveMsiLoginContinuationUrl(
  response: Pick<DecodedResponse, "url" | "headers" | "text">,
  baseUrl: string
): string | undefined {
  if (response.url.includes("code=")) {
    return response.url;
  }

  const redirectUrl = resolveRedirectUrl(response, baseUrl);
  if (redirectUrl?.includes("code=")) {
    return redirectUrl;
  }

  const passwordChangeContinuationUrl =
    resolveSsoPasswordChangeContinuationUrl({
      url: redirectUrl ?? response.url,
      text: response.text
    });

  return passwordChangeContinuationUrl ?? redirectUrl;
}

function normalizeHtmlUrl(value: string): string {
  return value.replace(/&amp;/giu, "&").trim();
}

function resolveSafeMsiCancelUrl(rawUrl: string, baseUrl: string): string | undefined {
  const normalized = normalizeHtmlUrl(rawUrl);
  if (!normalized) {
    return undefined;
  }

  try {
    const url = new URL(normalized, baseUrl);
    const lowerUrl = url.toString().toLowerCase();
    const allowedHost =
      url.hostname === "msi.mju.ac.kr" || url.hostname === "sso.mju.ac.kr";
    const passwordChangeTarget =
      lowerUrl.includes("/sso/change/pw") ||
      lowerUrl.includes("password") ||
      lowerUrl.includes("passwd") ||
      lowerUrl.includes("pwd") ||
      lowerUrl.includes("pwchange") ||
      lowerUrl.includes("changepw") ||
      lowerUrl.includes("change-pw");

    return allowedHost && !passwordChangeTarget ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function resolveMsiCancelScriptUrl(text: string, baseUrl: string): string | undefined {
  const locationPatterns = [
    /(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/iu,
    /(?:window\.)?location\.replace\(\s*["']([^"']+)["']\s*\)/iu
  ];

  for (const pattern of locationPatterns) {
    const candidate = pattern.exec(text)?.[1];
    const url = candidate ? resolveSafeMsiCancelUrl(candidate, baseUrl) : undefined;
    if (url) {
      return url;
    }
  }

  const directCancelUrl = text.match(
    /(?:cancel|cancle)[A-Za-z0-9_$]*\s*=\s*["']([^"']+)["']/iu
  )?.[1];
  return directCancelUrl
    ? resolveSafeMsiCancelUrl(directCancelUrl, baseUrl)
    : undefined;
}

export function resolveMsiPasswordChangeCancelUrl(
  response: Pick<DecodedResponse, "url" | "text">
): string | undefined {
  const $ = load(response.text);
  for (const element of $("a, button, input").toArray()) {
    const node = $(element);
    const label = `${node.text()} ${node.attr("value") ?? ""} ${
      node.attr("title") ?? ""
    } ${node.attr("aria-label") ?? ""}`.toLowerCase();
    if (
      !label.includes("취소") &&
      !label.includes("cancel") &&
      !label.includes("cancle")
    ) {
      continue;
    }

    for (const attr of ["href", "data-url", "formaction"]) {
      const url = resolveSafeMsiCancelUrl(node.attr(attr) ?? "", response.url);
      if (url) {
        return url;
      }
    }

    const onclickUrl = resolveMsiCancelScriptUrl(node.attr("onclick") ?? "", response.url);
    if (onclickUrl) {
      return onclickUrl;
    }
  }

  const mainStartMatch = response.text.match(
    /https?:\/\/msi\.mju\.ac\.kr\/servlet\/security\/MySecurityStart|\/servlet\/security\/MySecurityStart/iu
  )?.[0];
  const mainStartUrl = mainStartMatch
    ? resolveSafeMsiCancelUrl(mainStartMatch, response.url)
    : undefined;
  if (mainStartUrl) {
    return mainStartUrl;
  }

  return resolveSsoPasswordChangeContinuationUrl(response) ?? undefined;
}

export class MjuMsiClient {
  private cookieJar = new CookieJar();
  private http;
  private readonly sessionStore: LmsSessionStorage;

  constructor(private readonly config: MsiRuntimeConfig) {
    this.sessionStore = createCookieSessionStore(
      resolveStorageContext(config.appDataDir),
      "msi",
      config.sessionFile
    );
    this.http = this.buildHttpClient();
  }

  private buildHttpClient() {
    // MSI/WebLogic이 응답 직후 TCP를 닫는 경우 Node agent가 stale한 소켓을
    // keep-alive pool에서 재사용해 ECONNRESET이 난다. 매 요청 fresh connection을
    // 쓰고, 그래도 터지는 transient 오류는 2회 재시도한다.
    return got.extend({
      cookieJar: this.cookieJar,
      followRedirect: true,
      throwHttpErrors: false,
      retry: {
        limit: 2,
        methods: ["GET", "POST"],
        errorCodes: [
          "ECONNRESET",
          "ETIMEDOUT",
          "EAI_AGAIN",
          "ECONNREFUSED",
          "EPIPE"
        ]
      },
      // keepAlive를 꺼도 Node가 TLS session ticket을 캐시해서 두 번째 요청에 재사용하는데,
      // MSI WebLogic이 이 TLS resumption을 거부하며 RST를 보낸다 → maxCachedSessions:0 필수.
      agent: {
        https: new https.Agent({ keepAlive: false, maxCachedSessions: 0 })
      },
      headers: {
        "user-agent": this.config.userAgent
      },
      responseType: "buffer"
    });
  }

  private resetHttpState(): void {
    this.cookieJar = new CookieJar();
    this.http = this.buildHttpClient();
  }

  async restoreSavedSession(): Promise<boolean> {
    const restored = await this.sessionStore.load();
    if (!restored) {
      return false;
    }

    this.cookieJar = restored;
    this.http = this.buildHttpClient();
    return true;
  }

  async clearSavedSession(): Promise<boolean> {
    this.resetHttpState();
    return this.sessionStore.remove();
  }

  async getPage(
    url: string | URL,
    options: RequestOptions = {}
  ): Promise<DecodedResponse> {
    const response = await this.http.get(url.toString(), {
      responseType: "buffer",
      ...(options.headers ? { headers: options.headers } : {}),
      ...(options.followRedirect !== undefined
        ? { followRedirect: options.followRedirect }
        : {})
    });
    return toDecodedResponse(response);
  }

  async postForm(
    url: string | URL,
    form: Record<string, string>,
    options: RequestOptions = {}
  ): Promise<DecodedResponse> {
    const response = await this.http.post(url.toString(), {
      responseType: "buffer",
      form,
      ...(options.headers ? { headers: options.headers } : {}),
      ...(options.followRedirect !== undefined
        ? { followRedirect: options.followRedirect }
        : {})
    });
    return toDecodedResponse(response);
  }

  async fetchMainPage(): Promise<DecodedResponse> {
    return this.getPage(MSI_MAIN_URL);
  }

  private async continuePastPasswordChangeInterstitial(
    response: DecodedResponse
  ): Promise<PasswordChangeContinuationResult> {
    const cancelUrl = resolveMsiPasswordChangeCancelUrl(response);
    if (!cancelUrl) {
      return { ok: false, detail: "password_change_cancel_url_missing" };
    }

    let continued: DecodedResponse;
    try {
      continued = await this.getPage(cancelUrl, { followRedirect: true });
    } catch (error) {
      return {
        ok: false,
        detail: "password_change_cancel_request_failed",
        cause: error
      };
    }

    if (looksLikePasswordChangeInterstitial(continued)) {
      return { ok: false, detail: "password_change_cancel_still_interstitial" };
    }
    if (!looksLoggedIn(continued)) {
      return { ok: false, detail: "password_change_cancel_not_logged_in" };
    }

    return { ok: true, response: continued };
  }

  async saveMainHtml(html: string): Promise<void> {
    await fs.mkdir(path.dirname(this.config.mainHtmlFile), { recursive: true });
    await fs.writeFile(this.config.mainHtmlFile, html, "utf8");
  }

  async saveMenuSnapshot(menuItems: MsiMenuItem[]): Promise<void> {
    await fs.mkdir(path.dirname(this.config.menuSnapshotFile), {
      recursive: true
    });
    await fs.writeFile(
      this.config.menuSnapshotFile,
      JSON.stringify(menuItems, null, 2),
      "utf8"
    );
  }

  private extractSsoForm(response: DecodedResponse): SsoForm {
    const $ = load(response.text);
    const action = $("#signin-form").attr("action")?.replace(/&amp;/g, "&");
    const cRt = $('input[name="c_r_t"]').attr("value");
    const publicKey = $("#public-key").attr("value");

    if (!action || !cRt || !publicKey) {
      throw new Error("MSI SSO 로그인 폼을 파싱하지 못했습니다.");
    }

    return {
      action,
      c_r_t: cRt,
      publicKey
    };
  }

  async login(userId: string, password: string): Promise<DecodedResponse> {
    // MSI/SSO 계열 서버가 stale 세션 또는 WAS 상태 꼬임으로 ECONNRESET을
    // 던지는 경우가 있다. 실패 시 완전히 새 HTTP state로 1회 재시도한다.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.loginOnce(userId, password);
      } catch (err) {
        lastErr = err;
        const code =
          (err as NodeJS.ErrnoException | undefined)?.code ??
          (err as { cause?: NodeJS.ErrnoException } | undefined)?.cause?.code;
        if (code === "ECONNRESET" && attempt === 0) {
          this.resetHttpState();
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  private async loginOnce(
    userId: string,
    password: string
  ): Promise<DecodedResponse> {
    let response = await withMsiStep("msi.login.initial_page_fetch_failed", () =>
      this.getPage(MSI_BASE, { followRedirect: true })
    );
    let $ = load(response.text);
    let csrf = $('input[name="_csrf"]').attr("value") ?? "";

    response = await withMsiStep(
      "msi.login.initial_login_security_post_failed",
      () =>
        this.postForm(
          MSI_LOGIN_SECURITY_URL,
          {
            code: "",
            _csrf: csrf
          },
          { followRedirect: false }
        )
    );

    const ssoEntryUrl =
      /location\.href\s*=\s*"([^"]+)"/.exec(response.text)?.[1] ??
      resolveRedirectUrl(response, MSI_BASE);
    if (!ssoEntryUrl) {
      throw msiDiagnosticError(
        "msi.login.sso_entry_url_missing",
        "MSI login bridge did not expose an SSO entry URL"
      );
    }

    const ssoPage = await withMsiStep("msi.login.sso_page_fetch_failed", () =>
      this.getPage(ssoEntryUrl, { followRedirect: true })
    );
    const ssoForm = await withMsiStep("msi.login.sso_form_parse_failed", async () =>
      this.extractSsoForm(ssoPage)
    );
    const { keyStr, key, iv } = genSsoKeyMaterial();
    const encsymka = encryptSessionKeyForSso(
      `${keyStr},${Date.now()}`,
      ssoForm.publicKey
    );
    const pwEnc = encryptPasswordForSso(password.trim(), key, iv);
    const loginUrl = new URL(ssoForm.action, ssoPage.url).toString();

    const ssoLoginResponse = await withMsiStep(
      "msi.login.sso_login_post_failed",
      () =>
        this.postForm(
          loginUrl,
          {
            user_id: userId,
            pw: "",
            user_id_enc: "",
            pw_enc: pwEnc,
            encsymka,
            c_r_t: ssoForm.c_r_t
          },
          { followRedirect: false }
        )
    );

    const callbackUrl = resolveMsiLoginContinuationUrl(ssoLoginResponse, loginUrl);
    if (!callbackUrl) {
      throw msiDiagnosticError(
        "msi.login.sso_callback_url_missing",
        "MSI SSO login did not return a callback URL"
      );
    }

    response = await withMsiStep("msi.login.callback_page_fetch_failed", () =>
      this.getPage(callbackUrl, { followRedirect: true })
    );
    $ = load(response.text);
    const code = $('input[name="code"]').attr("value") ?? "";
    csrf = $('input[name="_csrf"]').attr("value") ?? "";
    if (!code || !csrf) {
      throw msiDiagnosticError(
        "msi.login.callback_fields_missing",
        "MSI callback page did not include code/_csrf fields"
      );
    }

    response = await withMsiStep(
      "msi.login.callback_login_security_post_failed",
      () =>
        this.postForm(
          MSI_LOGIN_SECURITY_URL,
          {
            code,
            _csrf: csrf
          },
          { followRedirect: false }
        )
    );

    $ = load(response.text);
    const securityCsrf = $('input[name="_csrf"]').attr("value") ?? "";
    const normalizedUserId = $('input[name="user_id"]').attr("value") ?? userId;
    if (!securityCsrf) {
      throw msiDiagnosticError(
        "msi.login.security_check_csrf_missing",
        "MSI login_security confirmation page did not include _csrf"
      );
    }

    const securityCheckResponse = await withMsiStep(
      "msi.login.security_check_post_failed",
      () =>
        this.postForm(
          MSI_SECURITY_CHECK_URL,
          {
            user_id: normalizedUserId,
            _csrf: securityCsrf
          },
          { followRedirect: false }
        )
    );

    const postSecurityUrl =
      resolveRedirectUrl(securityCheckResponse, MSI_BASE) ?? MSI_MAIN_URL;
    const mainResponse = await withMsiStep("msi.login.main_page_fetch_failed", () =>
      this.getPage(postSecurityUrl, {
        followRedirect: true
      })
    );

    return mainResponse;
  }

  async ensureAuthenticated(
    userId: string,
    password: string,
    options: { preferSavedSession?: boolean } = {}
  ): Promise<{ mainResponse: DecodedResponse; usedSavedSession: boolean }> {
    if (options.preferSavedSession !== false && (await this.restoreSavedSession())) {
      try {
        const mainFromSavedSession = await this.fetchMainPage();
        if (looksLikePasswordChangeInterstitial(mainFromSavedSession)) {
          const continuation = await this.continuePastPasswordChangeInterstitial(
            mainFromSavedSession
          );
          if (continuation.ok) {
            await this.sessionStore.save(this.cookieJar);
            return {
              mainResponse: continuation.response,
              usedSavedSession: true
            };
          }
          console.warn(
            `[msi.saved_session.${continuation.detail}] saved session password-change continuation failed, clearing saved session and retrying fresh login`
          );
        }
        if (looksLoggedIn(mainFromSavedSession)) {
          return {
            mainResponse: mainFromSavedSession,
            usedSavedSession: true
          };
        }
      } catch (err) {
        // 저장된 세션으로 MSI를 때리는 순간 ECONNRESET/ETIMEDOUT이 나는 경우가 있다
        // (서버측 세션 invalidate + WAS 상태 꼬임). 세션 폐기 후 fresh login으로 진행.
        const code =
          (err as NodeJS.ErrnoException | undefined)?.code ??
          (err as { cause?: NodeJS.ErrnoException } | undefined)?.cause?.code;
        if (
          code !== "ECONNRESET" &&
          code !== "ETIMEDOUT" &&
          code !== "ECONNREFUSED" &&
          code !== "EPIPE"
        ) {
          throw err;
        }
        const safeCode = String(code ?? "unknown").replace(/[^a-zA-Z0-9_-]/gu, "_");
        console.warn(
          `[msi.saved_session.fetch_main_page_${safeCode}] saved session fetchMainPage failed, falling back to fresh login`
        );
      }

      await this.clearSavedSession();
      // 서버측 상태가 가라앉도록 짧은 지연을 둔다.
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    let mainResponse = await this.login(userId, password);
    if (looksLikePasswordChangeInterstitial(mainResponse)) {
      const continuation = await this.continuePastPasswordChangeInterstitial(mainResponse);
      if (continuation.ok) {
        mainResponse = continuation.response;
      } else {
        await this.clearSavedSession();
        throw msiDiagnosticError(
          `msi.login.${continuation.detail}`,
          "MSI login landed on a password-change interstitial and continuation failed",
          continuation.cause
        );
      }
    }
    if (looksLoggedIn(mainResponse)) {
      await this.sessionStore.save(this.cookieJar);
    } else {
      await this.clearSavedSession();
    }

    return {
      mainResponse,
      usedSavedSession: false
    };
  }
}
