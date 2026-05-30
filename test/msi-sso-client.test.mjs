import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveMsiLoginContinuationUrl,
  resolveMsiPasswordChangeCancelUrl
} from "../dist/msi/client.js";

test("resolveMsiLoginContinuationUrl follows normal MSI code redirect", () => {
  assert.equal(
    resolveMsiLoginContinuationUrl(
      {
        url: "https://sso.mju.ac.kr/sso/auth?client_id=msi",
        headers: {
          location: "https://msi.mju.ac.kr/index_Myiweb.jsp?code=CODE&state=STATE"
        },
        text: ""
      },
      "https://sso.mju.ac.kr/sso/auth?client_id=msi"
    ),
    "https://msi.mju.ac.kr/index_Myiweb.jsp?code=CODE&state=STATE"
  );
});

test("resolveMsiLoginContinuationUrl resumes after SSO password-change notice redirect", () => {
  assert.equal(
    resolveMsiLoginContinuationUrl(
      {
        url: "https://sso.mju.ac.kr/sso/auth?client_id=msi",
        headers: {
          location: "http://sso.mju.ac.kr/sso/change/pw?cm_cg_id=MSI123"
        },
        text: ""
      },
      "https://sso.mju.ac.kr/sso/auth?client_id=msi"
    ),
    "https://sso.mju.ac.kr/sso/auth?cm_cg_id=MSI123"
  );
});

test("resolveMsiLoginContinuationUrl resumes after password-change notice body", () => {
  assert.equal(
    resolveMsiLoginContinuationUrl(
      {
        url: "https://sso.mju.ac.kr/sso/change/pw",
        headers: {},
        text: '<form action="/sso/change/pw?cm_cg_id=FROM_BODY"></form>'
      },
      "https://sso.mju.ac.kr/sso/auth?client_id=msi"
    ),
    "https://sso.mju.ac.kr/sso/auth?cm_cg_id=FROM_BODY"
  );
});

test("resolveMsiPasswordChangeCancelUrl follows the explicit MSI cancel button", () => {
  assert.equal(
    resolveMsiPasswordChangeCancelUrl({
      url: "https://msi.mju.ac.kr/servlet/security/PasswordChange",
      text: `
        <p>비밀번호를 변경해주세요.</p>
        <input type="button" value="취소" onclick="location.href='/servlet/security/MySecurityStart'">
      `
    }),
    "https://msi.mju.ac.kr/servlet/security/MySecurityStart"
  );
});

test("resolveMsiPasswordChangeCancelUrl rejects password-change targets", () => {
  assert.equal(
    resolveMsiPasswordChangeCancelUrl({
      url: "https://msi.mju.ac.kr/servlet/security/PasswordChange",
      text: `
        <p>비밀번호를 변경해주세요.</p>
        <input type="button" value="취소" onclick="location.href='/servlet/security/password/change'">
      `
    }),
    undefined
  );
});
