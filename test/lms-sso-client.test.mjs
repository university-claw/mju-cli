import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveSsoPasswordChangeCancelUrl,
  resolveSsoPasswordChangeContinuationUrl
} from "../dist/lms/sso-client.js";

test("resolveSsoPasswordChangeContinuationUrl uses cm_cg_id from change password URL", () => {
  assert.equal(
    resolveSsoPasswordChangeContinuationUrl({
      url: "https://sso.mju.ac.kr/sso/change/pw?cm_cg_id=ABC123",
      text: ""
    }),
    "https://sso.mju.ac.kr/sso/auth?cm_cg_id=ABC123"
  );
});

test("resolveSsoPasswordChangeContinuationUrl uses the cancel URL from change password HTML", () => {
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
    "https://sso.mju.ac.kr/sso/auth?cm_cg_id=FROM_SCRIPT"
  );
});

test("resolveSsoPasswordChangeCancelUrl prefers the explicit cancel URL", () => {
  assert.equal(
    resolveSsoPasswordChangeCancelUrl({
      url: "https://sso.mju.ac.kr/sso/change/pw",
      text: `
        <form action="/sso/change/pw?cm_cg_id=CHANGE_FORM" method="POST"></form>
        <button onclick="location.href='/sso/auth?cm_cg_id=BUTTON_CANCEL'">취소</button>
        <script>
          var cancleUrl = '/sso/auth'+'?cm_cg_id='+["SCRIPT_CANCEL"];
        </script>
      `
    }),
    "https://sso.mju.ac.kr/sso/auth?cm_cg_id=BUTTON_CANCEL"
  );
});

test("resolveSsoPasswordChangeCancelUrl follows misspelled cancleUrl scripts", () => {
  assert.equal(
    resolveSsoPasswordChangeCancelUrl({
      url: "https://sso.mju.ac.kr/sso/change/pw",
      text: `
        <form action="/sso/change/pw?cm_cg_id=CHANGE_FORM" method="POST"></form>
        <script>
          var cancleUrl = '/sso/auth'+'?cm_cg_id='+["SCRIPT_CANCEL"];
        </script>
      `
    }),
    "https://sso.mju.ac.kr/sso/auth?cm_cg_id=SCRIPT_CANCEL"
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
