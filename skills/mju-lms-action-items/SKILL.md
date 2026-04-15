---
name: mju-lms-action-items
version: 1.0.0
description: "LMS에서 지금 해야 할 일을 빠르게 추리는 helper skill."
metadata:
  openclaw:
    category: "helper"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-shared", "mju-lms"]
---

# LMS Action Items

모든 명령은 `--app-dir /data/users/<DISCORD_USER_ID> --format json` 플래그와 함께 실행됩니다.
집계 helper는 기본적으로 단일 강의만 보므로, 전체 강의를 훑고 싶다면 `--all-courses` 를 함께 붙입니다.

## 추천 흐름
1. 전체 강의 액션 보기: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms +action-items --all-courses`
2. 전체 강의 미제출 과제 보기: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms +unsubmitted --all-courses`
3. 특정 강의 digest 보기: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms +digest --course COURSE_NAME`
