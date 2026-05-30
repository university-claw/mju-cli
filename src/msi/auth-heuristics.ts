import type { DecodedResponse } from "../lms/types.js";

const LOGIN_SUCCESS_MARKERS = [
  "/servlet/security/MySecurityStart",
  "btn-snb-item",
  "left-menu-list",
  "Sys01Svl03logout",
  "\ub85c\uadf8\uc544\uc6c3"
];

const PASSWORD_CHANGE_URL_MARKERS = [
  "password",
  "passwd",
  "pwd",
  "pwchange",
  "changepw",
  "change-pw"
];

function looksLikeLoginPage(url: string, text: string): boolean {
  const lowerText = text.toLowerCase();

  return (
    url.includes("login_security") ||
    url.includes("sso/auth") ||
    lowerText.includes("signin-form") ||
    text.includes("\ud1b5\ud569\ub85c\uadf8\uc778") ||
    lowerText.includes("integrated login")
  );
}

export function looksLoggedIn(
  response: Pick<DecodedResponse, "url" | "text">
): boolean {
  const url = response.url.toLowerCase();
  const text = response.text;
  const lowerText = text.toLowerCase();

  if (looksLikeLoginPage(url, text)) {
    return false;
  }

  return LOGIN_SUCCESS_MARKERS.some(
    (marker) =>
      url.includes(marker.toLowerCase()) || lowerText.includes(marker.toLowerCase())
  );
}

export function looksLikePasswordChangeInterstitial(
  response: Pick<DecodedResponse, "url" | "text">
): boolean {
  const url = response.url.toLowerCase();
  const text = response.text;
  const lowerText = text.toLowerCase();
  const hasPasswordMarker =
    lowerText.includes("password") ||
    lowerText.includes("passwd") ||
    lowerText.includes("pwd") ||
    text.includes("\ube44\ubc00\ubc88\ud638");
  const hasChangeMarker =
    lowerText.includes("change") ||
    lowerText.includes("update") ||
    text.includes("\ubcc0\uacbd") ||
    text.includes("\uc218\uc815");

  return (
    PASSWORD_CHANGE_URL_MARKERS.some((marker) => url.includes(marker)) ||
    (hasPasswordMarker && hasChangeMarker)
  );
}
