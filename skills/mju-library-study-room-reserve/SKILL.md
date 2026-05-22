---
name: mju-library-study-room-reserve
version: 1.0.0
description: "스터디룸 예약 후보를 찾고 preview 후 실제 예약과 검증까지 안전하게 수행하는 helper skill."
metadata:
  openclaw:
    category: "helper"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-shared", "mju-library"]
---

# 스터디룸 자동 예약

모든 명령은 `--app-dir /data/users/<DISCORD_USER_ID> --format json` 플래그와 함께 실행됩니다.
실제 예약, 수정, 취소는 반드시 preview를 먼저 확인한 뒤 `--confirm` 플래그를 붙여 실행합니다.

## 입력값
- 필수: 날짜 `YYYY-MM-DD`, 시작 시각 `HH:mm`, 종료 시각 `HH:mm`
- 선택: 캠퍼스 `자연`/`인문`/`all`, 선호 `room-id`, 인원, 동행자, 이용목적, 장비, 추가정보
- 동행자 형식: `학번:이름,학번:이름` 또는 `이름:학번,이름:학번`
- 추가정보 형식: `key=value,key=value`

## 안전한 예약 흐름
1. 로그인 상태 확인: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json auth status`
2. 기존 예약 확인: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library study-rooms list-reservations`
3. 같은 날짜와 시간대에 중복 또는 충돌 예약이 있으면 예약 생성을 중단합니다.
4. 스터디룸 목록 확인: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library study-rooms list --campus CAMPUS --date YYYY-MM-DD`
5. 후보 상세 확인: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library study-rooms get --room-id ROOM_ID --date YYYY-MM-DD --begin-time HH:mm`
6. 예약 preview: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library study-rooms reserve-preview --room-id ROOM_ID --date YYYY-MM-DD --begin-time HH:mm --end-time HH:mm --use-section-id USE_SECTION_ID`
7. 실제 예약: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library study-rooms reserve --room-id ROOM_ID --date YYYY-MM-DD --begin-time HH:mm --end-time HH:mm --use-section-id USE_SECTION_ID --confirm`
8. 예약 검증: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library study-rooms list-reservations`

## 후보 선택 규칙
- 사용자가 `room-id`를 지정하면 그 방을 먼저 상세 조회하고 조건을 검증합니다.
- `room-id`가 없으면 목록 순서대로 상세 조회하며 캠퍼스, 날짜, 시간, 정원 조건을 만족하는 첫 후보를 선택합니다.
- 목록 응답의 `unableMessage`와 `isChargeable`은 참고 정보로만 사용하고, 상세 조회 결과를 최종 판단 기준으로 삼습니다.
- `reservableStartTimes`에 시작 시각이 없으면 제외합니다.
- `reservableEndTimes`가 제공되면 종료 시각이 포함된 후보만 선택합니다.
- 상세 조회 결과에서 예약 가능한 시작/종료 시각이 확인되지 않으면 후보에서 제외합니다.
- `minQuota`/`maxQuota`가 있으면 예약자 1명을 포함한 총 사용 인원이 범위 안에 있어야 합니다.
- `useCompanionRegistration=true`이면 동행자 명단 없이 동행자 수만 추측하지 않습니다.

## 이용목적 선택
- 사용자가 `use-section-id`, `use-section-code`, `use-section-name` 중 하나를 지정하면 그대로 사용합니다.
- 지정값이 없고 `useSections`가 하나뿐이면 그 항목을 사용합니다.
- 여러 항목이 있으면 `학습` 이름 또는 `STUDY` 코드와 정확히 맞는 항목만 자동 선택합니다.
- 여러 항목으로 해석되거나 확신할 수 없으면 예약을 중단하고 사용자에게 이용목적을 요청합니다.

## 옵션 조립
- 인원은 `--companion-count COUNT`로 전달합니다.
- 동행자는 `--companions "학번:이름,학번:이름"`으로 전달합니다.
- 장비는 `--equipment-ids "ID,ID"`로 전달합니다.
- 추가정보는 `--additional-info "key=value,key=value"`로 전달합니다.
- 이용목적은 가능하면 id를 우선 사용하고, id를 모르면 code 또는 name을 사용합니다.

## 금지 사항
- `reserve-preview`가 성공하기 전에는 `reserve --confirm`을 실행하지 않습니다.
- 동행자, 이용목적, 장비, 추가정보를 임의로 만들지 않습니다.
- 기존 예약과 겹치는 시간대에 새 예약을 만들지 않습니다.
- 예약 후 `list-reservations`에서 `reservationId`, 방, 날짜, 시간대를 확인하지 않은 채 완료 처리하지 않습니다.
