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

## 사용자 입력 요청
- 날짜, 시작 시각, 종료 시각이 없으면 예약을 진행하지 말고 먼저 사용자에게 물어봅니다.
- 캠퍼스가 없으면 사용자의 기본 캠퍼스를 우선 쓰되, 확실하지 않으면 `자연`/`인문` 중 선택을 요청합니다.
- 스터디룸은 최소 이용 인원이 있으므로 총 사용 인원과 동행자 이름/학번을 함께 확인합니다. 안내 예시는 실제 사용자 이름 대신 `홍길동 60000000`, `김명지 60000001` 같은 더미 값을 사용합니다.
- 사용자가 "12시쯤"처럼 모호하게 말하면 가능한 기본값을 제안합니다. 예: `12:00~14:00`으로 진행해도 될까요?
- preview가 성공하면 실제 예약 전 다음 형식으로 최종 확인합니다.

```text
아래 내용으로 스터디룸 예약을 진행할까요?
- 날짜/시간: YYYY-MM-DD HH:mm ~ HH:mm
- 장소: 캠퍼스 ROOM_NAME
- 이용목적: USE_SECTION_NAME
- 인원: 본인 포함 N명
- 동행자: 이름(학번), 이름(학번)

확인되면 실제 예약을 생성하겠습니다.
```

## 안전한 예약 흐름
1. 로그인 상태 확인: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json auth status`
2. 기존 예약 확인: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library study-rooms list-reservations`
3. 기존 예약과 요청 시간대의 충돌 여부를 사용자에게 요약하고, 중복 또는 충돌 예약이 있으면 예약 생성을 중단합니다.
4. 스터디룸 목록 확인: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library study-rooms list --campus CAMPUS --date YYYY-MM-DD`
5. 목록의 각 스터디룸을 상세 조회해 방별 예약 가능 시간과 상태를 요약합니다.
6. 후보 상세 확인: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library study-rooms get --room-id ROOM_ID --date YYYY-MM-DD --begin-time HH:mm`
7. 방별 상태 요약에서 선택한 후보의 가능 시간, 정원, 이용목적, 동행자 필요 여부를 다시 확인합니다.
8. 예약 preview: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library study-rooms reserve-preview --room-id ROOM_ID --date YYYY-MM-DD --begin-time HH:mm --end-time HH:mm --use-section-id USE_SECTION_ID`
9. 실제 예약: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library study-rooms reserve --room-id ROOM_ID --date YYYY-MM-DD --begin-time HH:mm --end-time HH:mm --use-section-id USE_SECTION_ID --confirm`
10. 예약 검증: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library study-rooms list-reservations`

## 상태 요약 제공
- 예약 전에는 기존 예약 목록과 요청 시간대 충돌 여부를 먼저 알려줍니다.
- 목록 조회 후에는 캠퍼스, 선택 날짜, 예약 가능 날짜, 방 이름, 층, 정원, 목록 기준 메시지를 요약합니다.
- 목록의 `unableMessage`가 있더라도 상세 조회 전에는 확정 불가로 말하지 말고 `목록 기준 메시지`로만 표시합니다.
- 상세 조회 후에는 해당 방의 실제 예약 가능 시작/종료 시각, 최소/최대 이용 시간, 정원, 동행자 등록 필요 여부, 이용목적 목록을 함께 알려줍니다.
- 캠퍼스가 하나로 정해져 있으면 목록에 나온 모든 스터디룸의 상세를 조회해 방별 상태를 제공합니다.
- 캠퍼스가 `all`이면 캠퍼스별 후보를 먼저 나누고, 각 캠퍼스에서 요청 인원 조건을 만족하는 방부터 상세 조회합니다.
- 방별 상태는 `예약 가능`, `시간 불가`, `정원 불가`, `동행자 정보 필요`, `상세 조회 실패` 중 하나로 분류합니다.
- 후보가 여러 개면 방별 상태 목록을 먼저 보여주고, 추천 후보는 3개 이하로 압축해 표시합니다.
- 예약 preview가 통과하면 최종 확인 문구에 현재 상태 요약을 함께 포함합니다.

```text
현재 스터디룸 상태를 확인했습니다.
- 기존 예약: 없음
- 조회 기준: 자연캠퍼스, YYYY-MM-DD
- 방별 상태
  - ROOM_NAME_A: 예약 가능, FLOOR, 정원 N~M명, 종료 후보 HH:mm~HH:mm, 동행자 등록 필요
  - ROOM_NAME_B: 시간 불가, FLOOR, 정원 N~M명, 가능한 시작 HH:mm, HH:mm
  - ROOM_NAME_C: 정원 불가, FLOOR, 정원 N~M명
- 추천 후보: ROOM_NAME_A
- 이용목적: 학습/STUDY

이 조건으로 예약 preview를 진행하겠습니다.
```

## 방별 상태 산정
- `reservableStartTimes`에 요청 시작 시각이 있고 `reservableEndTimes`에 요청 종료 시각이 있으면 `예약 가능`으로 표시합니다.
- 요청 시작 시각이나 종료 시각이 맞지 않으면 `시간 불가`로 표시하고, 가능한 시작 시각 또는 종료 후보를 함께 보여줍니다.
- 요청 인원이 `minQuota`/`maxQuota` 범위를 벗어나면 `정원 불가`로 표시합니다.
- `useCompanionRegistration=true`인데 동행자 이름/학번이 부족하면 `동행자 정보 필요`로 표시합니다.
- 상세 조회 명령이 실패하면 `상세 조회 실패`로 표시하고 오류 메시지를 짧게 덧붙입니다.
- 목록 기준 `unableMessage`는 방별 상태의 보조 메모로만 표시하고, 최종 가능 여부는 상세 조회 결과로 판단합니다.

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
