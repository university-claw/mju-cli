import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveUcheckLoginContinuationUrl } from "../dist/ucheck/client.js";

test("resolveUcheckLoginContinuationUrl resumes after SSO password-change notice", () => {
  assert.equal(
    resolveUcheckLoginContinuationUrl({
      url: "https://sso.mju.ac.kr/sso/change/pw?cm_cg_id=UCHECK123",
      text: ""
    }),
    "https://sso.mju.ac.kr/sso/auth?cm_cg_id=UCHECK123"
  );
});

test("resolveUcheckLoginContinuationUrl ignores normal UCheck callback responses", () => {
  assert.equal(
    resolveUcheckLoginContinuationUrl({
      url: "https://ucheck.mju.ac.kr/",
      text: '<html data-ng-app="ucheck"></html>'
    }),
    undefined
  );
});
