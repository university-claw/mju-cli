import type { DecodedResponse } from "../lms/types.js";

const LOGIN_SUCCESS_MARKERS = [
  "/servlet/security/MySecurityStart",
  "btn-snb-item",
  "left-menu-list",
  "Sys01Svl03logout",
  "로그아웃"
];

function looksLikeLoginPage(url: string, text: string): boolean {
  const lowerText = text.toLowerCase();

  return (
    url.includes("login_security") ||
    url.includes("sso/auth") ||
    lowerText.includes("signin-form") ||
    text.includes("통합로그인") ||
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
