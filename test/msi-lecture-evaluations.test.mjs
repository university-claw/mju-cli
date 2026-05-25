import assert from "node:assert/strict";
import { test } from "node:test";

import {
  inferMsiLectureEvaluationSatisfaction,
  parseMsiLectureEvaluationPage
} from "../dist/msi/services.js";

const fixture = `
  <form action="/servlet/su/sug/Sug00Svl02submitDeptSatis" method="post">
    <div class="data-title">0000 Synthetic Seminar 강의평가</div>
    <input type="hidden" name="curiNum" value="0000" />
    <input type="hidden" name="_csrf" value="token" />
    <label><input type="radio" name="q1" value="5" /> 매우만족</label>
    <label><input type="radio" name="q1" value="4" /> 만족</label>
    <label><input type="radio" name="q1" value="3" /> 보통</label>
    <label><input type="radio" name="q1" value="2" /> 불만족</label>
    <label><input type="radio" name="q1" value="1" /> 매우불만족</label>
    <textarea name="comment" required></textarea>
  </form>
`;

test("inferMsiLectureEvaluationSatisfaction defaults no-signal instructions to neutral", () => {
  assert.deepEqual(inferMsiLectureEvaluationSatisfaction({ instruction: "ㄱㄱ" }), {
    satisfaction: "neutral",
    label: "보통",
    source: "default"
  });
});

test("inferMsiLectureEvaluationSatisfaction reads Korean satisfaction labels", () => {
  assert.deepEqual(inferMsiLectureEvaluationSatisfaction({ instruction: "보통으로 ㄱㄱ" }), {
    satisfaction: "neutral",
    label: "보통",
    source: "instruction"
  });
  assert.deepEqual(inferMsiLectureEvaluationSatisfaction({ satisfaction: "매우만족" }), {
    satisfaction: "very-satisfied",
    label: "매우만족",
    source: "explicit"
  });
});

test("parseMsiLectureEvaluationPage extracts targets and satisfaction choices", () => {
  const result = parseMsiLectureEvaluationPage(fixture, {
    menuName: "강의평가"
  });

  assert.equal(result.warnings.length, 0);
  assert.equal(result.targets.length, 1);
  assert.deepEqual(result.targets[0], {
    id: "0000",
    title: "0000 Synthetic Seminar 강의평가",
    variant: "regular",
    submitted: false,
    available: true,
    submitUrl: "https://msi.mju.ac.kr/servlet/su/sug/Sug00Svl02submitDeptSatis",
    questions: [
      {
        name: "q1",
        required: true,
        kind: "radio",
        choices: [
          { label: "매우만족", value: "5", satisfaction: "very-satisfied" },
          { label: "만족", value: "4", satisfaction: "satisfied" },
          { label: "보통", value: "3", satisfaction: "neutral" },
          { label: "불만족", value: "2", satisfaction: "dissatisfied" },
          { label: "매우불만족", value: "1", satisfaction: "very-dissatisfied" }
        ]
      },
      {
        name: "comment",
        required: true,
        kind: "textarea",
        choices: []
      }
    ],
    hiddenFields: {
      curiNum: "0000",
      _csrf: "token"
    }
  });
});
