import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveSsoPasswordChangeContinuationUrl } from "../dist/lms/sso-client.js";

test("resolveSsoPasswordChangeContinuationUrl uses cm_cg_id from change password URL", () => {
  assert.equal(
    resolveSsoPasswordChangeContinuationUrl({
      url: "https://sso.mju.ac.kr/sso/change/pw?cm_cg_id=ABC123",
      text: ""
    }),
    "https://sso.mju.ac.kr/sso/auth?cm_cg_id=ABC123"
  );
});

test("resolveSsoPasswordChangeContinuationUrl uses cm_cg_id from change password HTML", () => {
  assert.equal(
    resolveSsoPasswordChangeContinuationUrl({
      url: "https://sso.mju.ac.kr/sso/change/pw",
      text: `
        <form action="/sso/change/pw?cm_cg_id=FROM_ACTION" method="POST"></form>
        <script>
          var cancleUrl = '/sso/auth'+'?cm_cg_id='+["FROM_SCRIPT"];
        </script>
      `
    }),
    "https://sso.mju.ac.kr/sso/auth?cm_cg_id=FROM_ACTION"
  );
});

test("resolveSsoPasswordChangeContinuationUrl ignores normal SSO responses", () => {
  assert.equal(
    resolveSsoPasswordChangeContinuationUrl({
      url: "https://sso.mju.ac.kr/sso/auth?client_id=lms",
      text: "<html></html>"
    }),
    null
  );
});
