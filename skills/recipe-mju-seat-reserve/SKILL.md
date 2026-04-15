---
name: recipe-mju-seat-reserve
version: 1.0.0
description: "열람실 좌석을 preview 후 예약하고 검증까지 마무리하는 recipe."
metadata:
  openclaw:
    category: "recipe"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-library-seat-reserve"]
---

# Reserve Library Seat

모든 명령은 `--app-dir /data/users/<DISCORD_USER_ID> --format json` 플래그와 함께 실행됩니다.

## Steps
1. 열람실 목록 확인: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library reading-rooms list --campus 자연`
2. 예약 preview: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library seats reserve-preview --room-id ROOM_ID --seat-id SEAT_ID`
3. 실제 예약: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library seats reserve --room-id ROOM_ID --seat-id SEAT_ID --confirm`
4. 예약 목록 확인: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library seats list-reservations`
5. 필요 시 취소: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library seats cancel --reservation-id RESERVATION_ID --confirm`
