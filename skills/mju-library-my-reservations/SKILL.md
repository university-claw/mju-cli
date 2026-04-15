---
name: mju-library-my-reservations
version: 1.0.0
description: "스터디룸과 좌석 예약을 한 번에 확인하는 helper skill."
metadata:
  openclaw:
    category: "helper"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-shared", "mju-library"]
---

# Library My Reservations

모든 명령은 `--app-dir /data/users/<DISCORD_USER_ID> --format json` 플래그와 함께 실행됩니다.

`mju library +my-reservations`로 스터디룸과 열람실 예약을 한 번에 확인합니다.

## 사용 방법
- 통합 조회: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library +my-reservations`

## 관련 명령
- 스터디룸 예약만 보기: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library study-rooms list-reservations`
- 좌석 예약만 보기: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library seats list-reservations`
