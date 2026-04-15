---
name: mju-library-seat-position
version: 1.0.0
description: "자연도서관 지원 열람실의 좌석 위치를 설명하는 helper skill."
metadata:
  openclaw:
    category: "helper"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-shared", "mju-library"]
---

# Library Seat Position

모든 명령은 `--app-dir /data/users/<DISCORD_USER_ID> --format json` 플래그와 함께 실행됩니다.

## 사용 방법
1. 열람실 상세 확인: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library reading-rooms get --room-id ROOM_ID`
2. 좌석 코드 기반 설명: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library +seat-position --room-id ROOM_ID --seat-code SEAT_CODE`
3. 좌석 ID 기반 설명: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library +seat-position --room-id ROOM_ID --seat-id SEAT_ID`
