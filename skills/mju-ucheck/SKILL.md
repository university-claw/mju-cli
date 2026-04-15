---
name: mju-ucheck
version: 1.0.0
description: "과목별 출석 현황을 확인하는 UCheck 기본 skill."
metadata:
  openclaw:
    category: "service"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-shared"]
---

# MJU UCheck

모든 명령은 `--app-dir /data/users/<DISCORD_USER_ID> --format json` 플래그와 함께 실행됩니다.

## 자주 쓰는 명령
- 계정 정보(기본 학년/학기 확인): `mju --app-dir /data/users/<DISCORD_USER_ID> --format json ucheck account`
- 강의 목록: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json ucheck lectures list`
  - 선택 옵션: `--year <연도> --term <학기>`
- 과목별 출석: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json ucheck attendance --course COURSE_NAME`
  - 대안: `--lecture-no <강의번호>` 로 직접 지정 가능
