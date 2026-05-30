import assert from "node:assert/strict";
import { test } from "node:test";

import {
  looksLikePasswordChangeInterstitial,
  looksLoggedIn
} from "../dist/msi/auth-heuristics.js";

test("MSI main page with password-change menu is logged in, not an interstitial", () => {
  const response = {
    url: "https://msi.mju.ac.kr/servlet/security/MySecurityStart",
    text: `
      <nav>
        <a href="/servlet/security/PasswordChange">\ube44\ubc00\ubc88\ud638\ubcc0\uacbd</a>
        <a href="/servlet/security/Sys01Svl03logout">\ub85c\uadf8\uc544\uc6c3</a>
      </nav>
      <div class="left-menu-list"></div>
    `
  };

  assert.equal(looksLoggedIn(response), true);
  assert.equal(looksLikePasswordChangeInterstitial(response), false);
});

test("SSO password-change page remains an interstitial", () => {
  assert.equal(
    looksLikePasswordChangeInterstitial({
      url: "https://sso.mju.ac.kr/sso/change/pw?cm_cg_id=CD43BE4D33B8D687C89EC2C5059A706C",
      text: `
        <form action="/sso/change/pw?cm_cg_id=CD43BE4D33B8D687C89EC2C5059A706C">
          <p>\ube44\ubc00\ubc88\ud638\ub97c \ubcc0\uacbd\ud574 \uc8fc\uc138\uc694.</p>
          <button type="button">\ucde8\uc18c</button>
        </form>
      `
    }),
    true
  );
});
