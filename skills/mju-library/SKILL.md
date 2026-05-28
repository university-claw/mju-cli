---
name: mju-library
version: 1.0.0
description: "스터디룸, 열람실, 좌석 예약 흐름을 다루는 도서관 기본 skill."
metadata:
  openclaw:
    category: "service"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-shared"]
---

# MJU Library

모든 명령은 `--app-dir /data/users/<DISCORD_USER_ID> --format json` 플래그와 함께 실행됩니다.

## 자주 쓰는 명령
- 스터디룸 목록: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library study-rooms list --campus 자연`
- 스터디룸 상세: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library study-rooms get --room-id ROOM_ID --date YYYY-MM-DD`
- 스터디룸 예약 목록: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library study-rooms list-reservations`
- 스터디룸 예약 preview: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library study-rooms reserve-preview --room-id ROOM_ID --date YYYY-MM-DD --begin-time HH:mm --end-time HH:mm --use-section-id USE_SECTION_ID`
- 스터디룸 예약 생성: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library study-rooms reserve --room-id ROOM_ID --date YYYY-MM-DD --begin-time HH:mm --end-time HH:mm --use-section-id USE_SECTION_ID --confirm`
- 스터디룸 예약 수정 preview: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library study-rooms update-preview --reservation-id RESERVATION_ID --date YYYY-MM-DD --begin-time HH:mm --end-time HH:mm`
- 스터디룸 예약 수정: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library study-rooms update-reservation --reservation-id RESERVATION_ID --date YYYY-MM-DD --begin-time HH:mm --end-time HH:mm --confirm`
- 스터디룸 예약 취소 preview: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library study-rooms cancel-preview --reservation-id RESERVATION_ID`
- 스터디룸 예약 취소: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library study-rooms cancel-reservation --reservation-id RESERVATION_ID --confirm`
- 열람실 목록: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library reading-rooms list --campus 자연`
- 열람실 상세: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library reading-rooms get --room-id ROOM_ID`
- 좌석 예약 목록: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library seats list-reservations`

## helper
- 내 예약 통합 보기: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library +my-reservations`
- 좌석 위치 설명: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library +seat-position --room-id ROOM_ID --seat-code SEAT_CODE`
