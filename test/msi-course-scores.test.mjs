import assert from "node:assert/strict";
import { test } from "node:test";

import { createMsiCommand } from "../dist/commands/msi.js";
import {
  isMsiCourseScoresPage,
  parseMsiCourseScoresPage,
  submitMsiFormQuery
} from "../dist/msi/services.js";

// Synthetic fixture. Do not copy real student/course score data into tests.
const scoreFixture = `
  <form name="form1" id="command" action="/servlet/su/suh/Suh00Svl01initScoreView" method="post">
    <input type="text" name="year" value="2026" />
    <select name="smt">
      <option value="10" selected>Term A</option>
      <option value="20">Term B</option>
    </select>
    <input type="hidden" name="_csrf" value="token" />
  </form>
  <div class="card-item basic">
    <div class="data-title">0000 - Synthetic Security Lab</div>
    <table>
      <thead>
        <tr>
          <th>Assessment category</th>
          <th>Item</th>
          <th>Ratio</th>
          <th>Raw score</th>
          <th>Average</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Exam group</td>
          <td>Midterm</td>
          <td>40 / 40 %</td>
          <td>35 / 100 points</td>
          <td>31.5 points</td>
          <td>Graded</td>
        </tr>
        <tr>
          <td>Final group</td>
          <td>Final</td>
          <td>40 / 40 %</td>
          <td>Not entered</td>
          <td></td>
          <td>Pending</td>
        </tr>
      </tbody>
    </table>
  </div>
`;

const rowspanFixture = `
  <form name="form1" id="command" action="/servlet/su/suh/Suh00Svl01initScoreView" method="post">
    <input type="text" name="year" value="2026" />
    <select name="smt">
      <option value="10" selected>Term A</option>
    </select>
  </form>
  <div class="card-item basic">
    <div class="data-title">0001 - Synthetic Rowspan Course</div>
    <table>
      <thead>
        <tr>
          <th>Assessment category</th>
          <th>Item</th>
          <th>Ratio</th>
          <th>Raw score</th>
          <th>Average</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td rowspan="2">Exam group</td>
          <td>Midterm</td>
          <td>20 / 40 %</td>
          <td>10 / 100 points</td>
          <td>11 points</td>
          <td>Graded</td>
        </tr>
        <tr>
          <td>Quiz</td>
          <td>20 / 40 %</td>
          <td>15 / 100 points</td>
          <td>14 points</td>
          <td>Graded</td>
        </tr>
      </tbody>
    </table>
  </div>
`;

const timetableLikeFixture = `
  <form name="form1" id="command" action="/servlet/su/sug/Sug00Svl07getTimeTable" method="post">
    <input type="text" name="year" value="2026" />
    <select name="smt"><option value="10" selected>Term A</option></select>
  </form>
`;

test("parseMsiCourseScoresPage extracts course score rows", () => {
  const result = parseMsiCourseScoresPage(scoreFixture);

  assert.equal(result.year, 2026);
  assert.equal(result.termCode, "10");
  assert.equal(result.termLabel, "Term A");
  assert.deepEqual(
    result.termOptions.map((option) => ({
      code: option.code,
      label: option.label,
      selected: option.selected
    })),
    [
      { code: "10", label: "Term A", selected: true },
      { code: "20", label: "Term B", selected: false }
    ]
  );
  assert.equal(result.courses.length, 1);
  assert.deepEqual(result.courses[0], {
    title: "0000 - Synthetic Security Lab",
    courseCode: "0000",
    courseTitle: "Synthetic Security Lab",
    items: [
      {
        assessmentCategory: "Exam group",
        itemName: "Midterm",
        ratio: {
          rawValue: "40 / 40 %",
          earned: 40,
          total: 40
        },
        rawScore: {
          rawValue: "35 / 100 points",
          earned: 35,
          total: 100
        },
        averageScore: {
          rawValue: "31.5 points",
          value: 31.5
        },
        note: "Graded"
      },
      {
        assessmentCategory: "Final group",
        itemName: "Final",
        ratio: {
          rawValue: "40 / 40 %",
          earned: 40,
          total: 40
        },
        rawScore: {
          rawValue: "Not entered"
        },
        averageScore: {
          rawValue: ""
        },
        note: "Pending"
      }
    ]
  });
});

test("parseMsiCourseScoresPage preserves rowspan assessment category", () => {
  const result = parseMsiCourseScoresPage(rowspanFixture);

  assert.deepEqual(
    result.courses[0].items.map((item) => ({
      assessmentCategory: item.assessmentCategory,
      itemName: item.itemName,
      rawScore: item.rawScore.rawValue
    })),
    [
      {
        assessmentCategory: "Exam group",
        itemName: "Midterm",
        rawScore: "10 / 100 points"
      },
      {
        assessmentCategory: "Exam group",
        itemName: "Quiz",
        rawScore: "15 / 100 points"
      }
    ]
  );
});

test("isMsiCourseScoresPage rejects other MSI pages with year forms", () => {
  assert.equal(isMsiCourseScoresPage(scoreFixture), true);
  assert.equal(isMsiCourseScoresPage(timetableLikeFixture), false);
});

test("submitMsiFormQuery posts merged year and term fields", async () => {
  const calls = [];
  const client = {
    async postForm(url, form) {
      calls.push({ url, form });
      return {
        statusCode: 200,
        text: scoreFixture
      };
    }
  };

  const html = `
    <form name="form1" action="/servlet/su/suh/Suh00Svl01initScoreView" method="post">
      <input name="year" value="2026" />
      <select name="smt"><option value="10" selected>Term A</option></select>
      <input name="_csrf" value="token" />
    </form>
  `;

  const result = await submitMsiFormQuery(client, html, {
    year: 2025,
    termCode: "20",
    context: "MSI synthetic query",
    validatePage: (pageHtml) => {
      assert.equal(isMsiCourseScoresPage(pageHtml), true);
    }
  });

  assert.equal(result, scoreFixture);
  assert.deepEqual(calls, [
    {
      url: "https://msi.mju.ac.kr/servlet/su/suh/Suh00Svl01initScoreView",
      form: {
        year: "2025",
        smt: "20",
        _csrf: "token"
      }
    }
  ]);
});

test("submitMsiFormQuery rejects failed responses", async () => {
  const client = {
    async postForm() {
      return {
        statusCode: 500,
        text: "server error"
      };
    }
  };

  await assert.rejects(
    () =>
      submitMsiFormQuery(client, scoreFixture, {
        context: "MSI synthetic query"
      }),
    /HTTP 500/
  );
});

test("createMsiCommand exposes course-scores command", () => {
  const command = createMsiCommand(() => ({ format: "json" }));
  const courseScores = command.commands.find((child) => child.name() === "course-scores");

  assert.ok(courseScores);
  assert.deepEqual(
    courseScores.options.map((option) => option.long),
    ["--year", "--term-code"]
  );
});
