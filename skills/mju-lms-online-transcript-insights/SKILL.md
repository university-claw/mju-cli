---
name: mju-lms-online-transcript-insights
version: 1.0.0
description: "LMS 온라인 강의의 제공 요약, 자막 원문, rule-based 중요 구간을 분리해서 가져오는 helper skill."
metadata:
  openclaw:
    category: "helper"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-shared", "mju-lms"]
---

# LMS Online Transcript Insights

모든 명령은 `--app-dir /data/users/<DISCORD_USER_ID> --format json` 플래그와 함께 실행합니다.
큰 출력이 부담될 때는 `summary` 또는 `insights`를 먼저 쓰고, 사용자가 전체 원문을 명시적으로 원할 때만 `transcript`를 호출합니다.

## 사전 확인
1. 강의 목록에서 대상 강의 확인: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms courses list`
2. 온라인 주차 목록 확인: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms online list --course COURSE_NAME`
3. 대상 주차 상세 확인: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms online get --course COURSE_NAME --lecture-weeks WEEK`

주차에 영상 항목이 여러 개면 `online get`의 `items`에서 `linkSeq`를 확인한 뒤 `--link-seq LINK_SEQ`를 붙입니다.
0-based 순서로 고를 때는 `--item-index INDEX`를 사용할 수 있지만, 안정적인 재호출에는 `--link-seq`가 더 낫습니다.

## LMS 제공 요약만 가져오기
```bash
mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms online summary --course COURSE_NAME --lecture-weeks WEEK --link-seq LINK_SEQ
```

기대 출력:
- `summary.title`: LMS 요약 영역 제목
- `summary.markdown`: LMS가 제공하는 요약문
- `selectedItem`: 선택된 영상 항목
- `resolvedBy`: `linkSeq`, `itemIndex`, `single-item` 중 선택 방식

## 자막 원문 plain text 가져오기
```bash
mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms online transcript --course COURSE_NAME --lecture-weeks WEEK --link-seq LINK_SEQ --language KO
```

기대 출력:
- `source.language`: 선택한 자막 언어
- `source.cueCount`: VTT cue 개수
- `text`: cue 텍스트만 합친 plain transcript

`--language` 기본값은 `KO`입니다. 가능한 다른 언어가 필요하면 `EN`, `CH`, `VI` 같은 LMS track 언어 코드를 지정합니다.

## 중요한 구간만 rule-based로 가져오기
```bash
mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms online insights --course COURSE_NAME --lecture-weeks WEEK --link-seq LINK_SEQ --language KO
```

기대 출력:
- `counts`: 유형별 하이라이트 개수
- `highlights.examCandidates`: 시험/개념 후보
- `highlights.assignments`: 과제/제출 후보
- `highlights.practice`: 실습 절차와 명령어 후보
- `highlights.important`: 강조 표현이 있는 중요 설명
- `summaryHighlights`: LMS 제공 요약문에서 잡힌 중요 후보

각 highlight는 `timeRange`, `keywords`, `reasons`, `evidence`를 포함합니다.
LLM 요약이 아니라 키워드와 cue window 기반 rule result이므로, 사용자에게는 "중요 후보" 또는 "검토할 구간"으로 안내합니다.

필요한 유형만 좁힐 수 있습니다.

```bash
mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms online insights --course COURSE_NAME --lecture-weeks WEEK --link-seq LINK_SEQ --types exam-candidate,assignment --max-items 3
```

`--show-score`는 디버깅용입니다. 일반 사용자 응답에는 점수를 노출하지 않습니다.
