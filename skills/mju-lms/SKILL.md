---
name: mju-lms
version: 1.0.0
description: "명지 LMS의 강의, 공지, 자료, 과제, 온라인 학습 흐름을 다루는 기본 skill."
metadata:
  openclaw:
    category: "service"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-shared"]
---

# MJU LMS

모든 명령은 `--app-dir /data/users/<DISCORD_USER_ID> --format json` 플래그와 함께 실행됩니다.

## 자주 쓰는 명령
- 강의 목록: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms courses list`
- 공지 목록: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms notices list --course COURSE_NAME`
- 공지 상세: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms notices get --course COURSE_NAME --article-id ARTICLE_ID`
- 자료 목록: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms materials list --course COURSE_NAME`
- 자료 상세: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms materials get --course COURSE_NAME --article-id ARTICLE_ID`
- 과제 목록: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms assignments list --course COURSE_NAME`
- 과제 상세: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms assignments get --course COURSE_NAME --rt-seq RT_SEQ`
- 과제 제출 가능 여부 점검: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms assignments check-submission --course COURSE_NAME --rt-seq RT_SEQ --local-files /path/to/file.pdf`
- 과제 파일 제출: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms assignments submit --course COURSE_NAME --rt-seq RT_SEQ --local-files /path/to/file.pdf --content-source user-file`
- 과제 텍스트 제출: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms assignments submit --course COURSE_NAME --rt-seq RT_SEQ --text "제출 본문" --artifact-format md --content-source user-text`
  - `--artifact-format`은 `txt` 또는 `md`만 지원
  - 초안 정리본처럼 사용자가 작성한 내용을 다듬은 제출물은 `--content-source user-draft-transform` 사용
  - 에이전트가 정답을 직접 생성한 제출물은 받지 않음
- 온라인 학습 주차 목록: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms online list --course COURSE_NAME`
- 온라인 학습 주차 상세: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms online get --course COURSE_NAME --lecture-weeks WEEK`
- 온라인 강의 LMS 제공 요약: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms online summary --course COURSE_NAME --lecture-weeks WEEK --link-seq LINK_SEQ`
- 온라인 강의 자막 원문: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms online transcript --course COURSE_NAME --lecture-weeks WEEK --link-seq LINK_SEQ --language KO`
- 온라인 강의 중요 구간 후보: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms online insights --course COURSE_NAME --lecture-weeks WEEK --link-seq LINK_SEQ --language KO`

## helper (집계 명령)
- 액션 아이템 (전체 강의): `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms +action-items --all-courses`
- 미제출 과제 (전체 강의): `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms +unsubmitted --all-courses`
- 마감 임박 과제 (전체 강의): `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms +due-assignments --all-courses`
- 안 읽은 공지 (전체 강의): `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms +unread-notices --all-courses`
- 미완료 온라인 학습 (전체 강의): `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms +incomplete-online --all-courses`
- 강의 digest (단일 강의): `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms +digest --course COURSE_NAME`

## 과제 제출 대상 해석 규칙

사용자가 "캡스톤디자인: 최종 보고서(2차) 과제에 이거 제출해줘"처럼 과목명과 과제명을 함께 말하면, 그 전체 문장을 `--course` 값으로 사용하지 않습니다. 먼저 전체 과제 목록에서 실제 제출 대상을 찾고, 결과 JSON의 `kjkey`와 `rtSeq`를 최종 제출 명령에 사용합니다.

1. 첨부파일이 있는지 확인합니다. router가 전달한 `Discord 첨부파일` 컨텍스트의 `localPath`를 제출 파일 경로로 사용합니다.
2. 전체 미제출 과제를 조회합니다: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms +unsubmitted --all-courses`
3. 필요하면 마감 임박 과제도 조회합니다: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms +due-assignments --all-courses`
4. 사용자 문장에서 과목명 후보와 과제명 후보를 분리해 `courseTitle`, `title`, `rtSeq`, `kjkey`와 매칭합니다.
5. 대상이 하나로 확정되면 `--course`보다 `--kjkey`를 우선 사용합니다.
6. 제출 전 점검을 실행합니다: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms assignments check-submission --kjkey KJKEY --rt-seq RT_SEQ --local-files /path/to/file`
7. 점검이 통과하면 제출합니다: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms assignments submit --kjkey KJKEY --rt-seq RT_SEQ --local-files /path/to/file --content-source user-file`

접근 권한, 강의실 진입 실패, 과목 없음 오류가 나오면 바로 사용자에게 직접 확인하라고 답하지 않습니다. 먼저 아래 순서로 복구 점검을 실행합니다.

- 로그인 상태 확인: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json auth status`
- 현재 강의 목록 확인: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms courses list`
- 전체 미제출 과제 재조회: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms +unsubmitted --all-courses`

복구 점검 후에도 대상이 없거나 여러 개면 후보를 짧게 보여주고 사용자가 고르게 합니다. 대상이 하나로 확인되면 `kjkey`와 `rtSeq`로 다시 제출을 시도합니다.
