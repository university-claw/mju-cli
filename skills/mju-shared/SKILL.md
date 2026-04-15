---
name: mju-shared
version: 1.0.0
description: "명지대학교 CLI 공통 인증, 출력, 안전 규칙을 설명하는 기본 skill."
metadata:
  openclaw:
    category: "shared"
    domain: "education"
    requires:
      bins: ["mju"]
---

# MJU Shared

`mju`를 사용할 때 공통으로 지켜야 할 규칙입니다.

## 전역 플래그
- `--app-dir /data/users/<DISCORD_USER_ID>`: 유저별 격리된 자격증명/세션 저장 위치. 모든 명령에 붙습니다.
- `--format json` (기본값): 에이전트가 파싱하는 기본 출력 형식. `table` 로 바꾸지 않습니다.

## 기본 원칙
1. 먼저 로그인 상태를 확인합니다: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json auth status`
2. 필요한 경우 로그인합니다: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json auth login --id YOUR_ID --password YOUR_PASSWORD`
3. 세션만 지우려면: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json auth logout`
4. 자격증명까지 전부 지우려면: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json auth forget`
5. 기본 출력은 JSON을 유지합니다.
6. 실제 변경이 있는 명령(library seats reserve/cancel, study-rooms reserve/update/cancel)은 preview를 먼저 보고 `--confirm`으로 실행합니다.

## 주요 표면
- LMS: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms ...`
- MSI: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json msi ...`
- UCheck: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json ucheck ...`
- Library: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json library ...`
- Skills catalog: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json skills list`
