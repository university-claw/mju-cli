---
name: mju-msi
version: 1.0.0
description: "시간표, 성적, 졸업요건, 강의평가를 다루는 MSI 기본 skill."
metadata:
  openclaw:
    category: "service"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-shared"]
---

# MJU MSI

모든 명령은 `--app-dir /data/users/<DISCORD_USER_ID> --format json` 플래그와 함께 실행됩니다.

## 자주 쓰는 명령
- 시간표 조회: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json msi timetable`
  - 선택 옵션: `--year <연도> --term-code <학기코드>`
- 요일별 마지막 수업 종료 시각: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json msi +last-class-times`
  - 셔틀 알림처럼 하루 마지막 수업 이후 행동을 정할 때 사용합니다.
- 현재 학기 성적: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json msi current-grades`
- 학기 중 수강점수: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json msi course-scores`
  - 선택 옵션: `--year <연도> --term-code <학기코드>`
- 전체 성적 이력: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json msi grade-history`
- 졸업 요건: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json msi graduation`
- 강의평가 대상 조회: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json msi lecture-evaluations list`
- 강의평가 제출 미리보기: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json msi lecture-evaluations preview --instruction "보통으로 ㄱㄱ"`
  - 대상이 여러 개면 `--target <id-or-title>` 또는 `--all` 필요
- 강의평가 제출: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json msi lecture-evaluations submit --instruction "보통으로 ㄱㄱ" --target TARGET`
  - 만족도는 `--satisfaction 매우만족|만족|보통|불만족|매우불만족`로 명시 가능
