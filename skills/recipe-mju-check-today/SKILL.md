---
name: recipe-mju-check-today
version: 1.0.0
description: "오늘 처리할 LMS 액션과 도서관 예약 상황을 함께 확인하는 daily recipe."
metadata:
  openclaw:
    category: "recipe"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-lms-action-items", "mju-library-my-reservations"]
---

# Check Today

모든 명령은 `--app-dir /data/users/<DISCORD_USER_ID> --format json` 플래그와 함께 실행됩니다.

## Steps
1. LMS 전체 강의 액션 확인: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms +action-items --all-courses`
2. 도서관 예약 확인: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library +my-reservations`
3. 필요한 경우 특정 강의 digest 확인: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms +digest --course COURSE_NAME`
