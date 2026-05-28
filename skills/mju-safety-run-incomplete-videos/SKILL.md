---
name: mju-safety-run-incomplete-videos
version: 1.0.0
description: "연구실안전교육 미완료 영상을 모두 대신 들어주어 모든 영상을 완료된 상태로 만들어주는 helper skill."
metadata:
  openclaw:
    category: "helper"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-shared"]
---

# Safety Run Incomplete Videos

모든 명령은 `--app-dir /data/users/<DISCORD_USER_ID> --format json` 플래그와 함께 실행합니다.

## 목적
미완료 연구실안전교육 영상이 있을 때 각 미완료 영상을 대신 들어주는 helper skill입니다. 최종적으로는 모든 영상이 완료된 상태로 만들어 줍니다.

## 실행
```bash
mju --app-dir /data/users/<DISCORD_USER_ID> --format json safety education run-incomplete-videos
```

## 기대 출력
최종 출력은 `check-completion`과 같은 수강 완료 상태입니다.

- `allCompleted`: 전체 완료 여부
- `schedule`: 대상 안전교육 과정
- `progressStatus`: 교육 진행 상태
- `counts`: 전체, 완료, 미완료 개수
- `courses`: 과목별 수강 상태
- `incompleteCourses`: 남아 있는 미완료 과목
- `finalUrl`: 최종 안전교육 페이지 URL
