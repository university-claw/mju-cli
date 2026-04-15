---
name: mju-msi
version: 1.0.0
description: "시간표, 성적, 졸업요건을 조회하는 MSI 기본 skill."
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
- 현재 학기 성적: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json msi current-grades`
- 전체 성적 이력: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json msi grade-history`
- 졸업 요건: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json msi graduation`
