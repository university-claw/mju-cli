---
name: mju-library-seat-reserve
version: 1.0.0
description: "열람실 좌석 예약 preview, 생성, 취소를 안전하게 수행하는 helper skill."
metadata:
  openclaw:
    category: "helper"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-shared", "mju-library"]
---

# Library Seat Reserve

모든 명령은 `--app-dir /data/users/<DISCORD_USER_ID> --format json` 플래그와 함께 실행됩니다.
실제 쓰기 작업(reserve, cancel)은 반드시 `--confirm` 플래그까지 함께 지정해야 합니다.

## 안전한 예약 흐름
1. preview: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library seats reserve-preview --room-id ROOM_ID --seat-id SEAT_ID`
2. 실제 예약: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library seats reserve --room-id ROOM_ID --seat-id SEAT_ID --confirm`
3. 예약 확인: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library seats list-reservations`
4. 취소 preview: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library seats cancel-preview --reservation-id RESERVATION_ID`
5. 실제 취소: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library seats cancel --reservation-id RESERVATION_ID --confirm`
