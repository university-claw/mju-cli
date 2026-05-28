import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveMsiLoginContinuationUrl } from "../dist/msi/client.js";

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
